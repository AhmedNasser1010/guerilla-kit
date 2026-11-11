import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";

export interface PostResult {
  success: boolean;
  message: string;
}

// Per-post comment boxes must NEVER be treated as the group composer. Their
// accessible labels look like "Comment as …" (en) / "تعليق باسم …" (ar).
// Typing into one and pressing Enter (which happens for any newline in the
// text) posts a COMMENT on the first post in the feed instead of a group post.
const COMMENT_LABEL_RE = /تعليق|comment/i;

// Text of the composer trigger on the group page (Arabic + English layouts):
// "اكتب شيئًا...", "أنشئ منشورًا عامًا", "What's on your mind...",
// "Write something...", "Start a discussion", "Announce something", etc.
// The /i flag is REQUIRED: some groups render the trigger in English with a
// capital letter ("Write something...") which a case-sensitive pattern never
// matches — that was the actual cause of "Could not find the post composer"
// on such groups (e.g. groups/324050471991806) while Arabic-only triggers
// (caseless by nature) kept every other group working.
// NOTE: don't add the 'u' flag — Playwright fails to serialize 'u'-flagged
// regexes for locator.filter({ hasText }) / getByRole name ("Invalid flags
// supplied to RegExp constructor"). The 'i' flag serializes fine.
const TRIGGER_TEXT_RE =
  /what'?s on your mind|write something|create (?:a )?public post|start a discussion|announce something|اكتب شيئ|أنشئ منشور|انشئ منشور|اكتب منشور|إنشاء منشور|انشاء منشور|ابدأ مناقشة|ابدا مناقشة|أعلن شيئ|اعلن شيئ/i;

// Submit button of the composer dialog: "Post" (en) / "نشر" / "أنشر" (ar).
const POST_BUTTON_RE = /^(?:post|نشر|أنشر|انشر)$/i;

// The composer trigger is usually present right after navigation, but FB's
// hydration can lag or stall (slow feeds, background tabs). Playwright's
// isVisible() returns immediately (its timeout option is ignored), so one-shot
// checks fail hard in that case. These constants control a real polling wait.
const COMPOSER_WAIT_MS = Number.parseInt(
  process.env.FB_COMPOSER_WAIT_MS || "45000",
  10
);
// Hydration sometimes stalls indefinitely; one reload unsticks it.
const RELOAD_AFTER_MS = Number.parseInt(
  process.env.FB_RELOAD_AFTER_MS || "20000",
  10
);

/** Best-effort HTML dump for debugging (enabled with FB_DEBUG_HTML=1). */
async function dumpHtml(page: Page, tag: string): Promise<void> {
  if (!process.env.FB_DEBUG_HTML) return;
  try {
    const dir = path.join(process.cwd(), "debug");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${tag}.html`), await page.content());
  } catch {
    // Debug dump is best-effort only
  }
}

/** True when the element is a per-post comment box rather than a composer. */
function isCommentBox(loc: Locator): Promise<boolean> {
  // NOTE: fail-open on inspection errors. React swaps the composer textbox out
  // right after the dialog opens (element detached → evaluate throws); treating
  // that as "comment box" wrongly aborts real posts. Comment boxes are already
  // excluded at candidate-selection time, so this guard only acts on a
  // positively identified "تعليق باسم …"/"Comment as …" label.
  return loc
    .evaluate((el) => {
      const label = el.getAttribute("aria-label") || "";
      const placeholder = el.getAttribute("data-placeholder") || "";
      return COMMENT_LABEL_RE.test(label) || COMMENT_LABEL_RE.test(placeholder);
    })
    .catch(() => false);
}

interface ComposerTrigger {
  composer: Locator;
  isRawTextbox: boolean;
}

/**
 * Polls the trigger candidates until one is visible. isVisible() cannot wait
 * (its timeout option is ignored), so slow-loading groups need explicit
 * polling. Reloads once after RELOAD_AFTER_MS without a match: hydration on
 * some groups stalls for good and only a reload brings the composer up.
 */
async function findComposerTrigger(
  page: Page,
  candidates: Locator[]
): Promise<{ trigger: ComposerTrigger | null; reloaded: boolean }> {
  const deadline = Date.now() + COMPOSER_WAIT_MS;
  const reloadAt =
    RELOAD_AFTER_MS > 0 ? Date.now() + RELOAD_AFTER_MS : Infinity;
  let reloaded = false;
  while (Date.now() < deadline) {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;

      // Defense in depth: the raw-textbox fallback must not be a comment box
      // (e.g. an unlabeled comment input on some layouts).
      const isRawTextbox = i === candidates.length - 1;
      if (isRawTextbox && (await isCommentBox(candidate))) continue;

      return { trigger: { composer: candidate, isRawTextbox }, reloaded };
    }

    await page.waitForTimeout(500);

    if (!reloaded && Date.now() >= reloadAt && Date.now() < deadline) {
      reloaded = true;
      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 30000 })
        .catch(() => {});
    }
  }
  return { trigger: null, reloaded };
}

// ---------------------------------------------------------------------------
// Mentions
//
// A blue @mention in the composer is NOT text: it is an entity token FB only
// creates when an entry is picked from the autocomplete popup (opened by
// typing "@"). Pasting or typing "@Name" without picking a suggestion stays
// plain text forever. The popup renders as role="option" entries scoped to
// the composer dialog.
//
// The name after "@" is typed word by word; after every word we read the
// popup and click a suggestion matching what was typed so far. Matching:
//   - an option whose first line equals the typed name → strong match
//   - exactly one option whose first line contains the typed name → match
//     (only once the query is ≥ 4 chars so a short prefix can't misfire)
// If no popup / no match ever appears, the "@…" text simply stays plain
// text — exactly the pre-mention behavior — and the name is reported back
// in the result message.
// ---------------------------------------------------------------------------

/** The suggestions list debounces after keystrokes; wait before reading it. */
const MENTION_POPUP_WAIT_MS = Number.parseInt(
  process.env.FB_MENTION_POPUP_WAIT_MS || "350",
  10
);
// A mention query longer than this will never match — bail out.
const MENTION_MAX_QUERY_LEN = 64;

const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();

interface MentionTypingResult {
  /** Mentions successfully inserted via the autocomplete popup. */
  inserted: number;
  /** Names left as plain text (no matching suggestion was found). */
  failed: string[];
}

interface TextSegment {
  kind: "text" | "mention";
  value: string;
}

/**
 * Splits raw post text into plain-text and @mention segments. A mention
 * candidate starts at "@" and runs to the end of the line or the next "@";
 * an "@" with nothing usable after it is plain text. Unmatched candidates
 * harm the post not at all: their characters were already typed out and so
 * remain plain text.
 */
function parseMentionSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const re = /@([^\n@]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (m[1].trim()) {
      segments.push({ kind: "mention", value: m[1] });
    } else {
      segments.push({ kind: "text", value: m[0] });
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  return segments;
}

/** Visible role="option" entries of the mention popup, in display order. */
async function visibleMentionOptions(
  scope: Locator | Page
): Promise<Locator[]> {
  const all = scope.locator('[role="option"]');
  const count = await all.count().catch(() => 0);
  if (count === 0) return [];
  const visible: Locator[] = [];
  for (let i = 0; i < Math.min(count, 12); i++) {
    const opt = all.nth(i);
    if (await opt.isVisible().catch(() => false)) visible.push(opt);
  }
  return visible;
}

/**
 * Picks the suggestion matching the typed query: -1 when nothing matches
 * confidently yet. The option's first line is the entity name; the remaining
 * lines are subtitles ("Page", "Friend", "صديق", …).
 */
function pickMentionOption(optionTexts: string[], query: string): number {
  const nq = normalizeText(query);
  if (nq.length < 2) return -1;
  const firstLines = optionTexts.map((t) => normalizeText(t.split("\n")[0] || t));
  const exact = firstLines.findIndex((line) => line === nq);
  if (exact !== -1) return exact;
  const hits: number[] = [];
  firstLines.forEach((line, i) => {
    if (line.includes(nq)) hits.push(i);
  });
  if (hits.length === 1 && nq.length >= 4) return hits[0];
  return -1;
}

/** Types the not-yet-typed tail of a mention name as plain text. */
async function typeMentionRemainder(
  textbox: Locator,
  parts: string[],
  from: number,
  typeDelayMs: number
): Promise<void> {
  const rest = parts.slice(from).join("");
  if (rest) await textbox.pressSequentially(rest, { delay: typeDelayMs });
}

/**
 * Types one mention candidate (everything after its "@"), word by word,
 * clicking the autocomplete suggestion as soon as it matches confidently.
 * Returns true when a mention was inserted; false when the text stayed
 * plain (any untyped tail is typed out first so nothing is lost).
 */
async function typeMention(
  page: Page,
  scope: Locator | Page,
  textbox: Locator,
  name: string,
  typeDelayMs: number
): Promise<boolean> {
  const parts = name.split(/(\s+)/).filter((p) => p.length > 0);
  let query = "";
  let lastQ = "";

  for (let i = 0; i < parts.length; i++) {
    await textbox.pressSequentially(parts[i], { delay: typeDelayMs });
    query += parts[i];
    const q = normalizeText(query);
    if (!q || q === lastQ) continue; // whitespace-only progress: nothing new to match
    lastQ = q;

    await page.waitForTimeout(MENTION_POPUP_WAIT_MS);
    const options = await visibleMentionOptions(scope);
    if (options.length === 0) {
      // No suggestions at all: mentions are unavailable here, or the query
      // filtered the list to nothing. Keep the text as-is (plain).
      if (q.length >= 3) {
        await typeMentionRemainder(textbox, parts, i + 1, typeDelayMs);
        return false;
      }
      continue;
    }
    const texts = await Promise.all(
      options.map((opt) => opt.innerText().catch(() => ""))
    );
    const idx = pickMentionOption(texts, q);
    if (idx !== -1) {
      await options[idx].click();
      // Let the editor swap the typed "@query" for the mention token.
      await page.waitForTimeout(300);
      return true;
    }
    if (q.length > MENTION_MAX_QUERY_LEN) {
      await typeMentionRemainder(textbox, parts, i + 1, typeDelayMs);
      return false;
    }
  }
  // Fully typed without a confident match — plain text (nothing left to type).
  return false;
}

/** Ctrl+V one plain-text segment into the composer from the clipboard. */
async function pasteSegment(page: Page, segment: string): Promise<boolean> {
  const wrote = await page.evaluate(async (t) => {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      return false;
    }
  }, segment);
  if (!wrote) return false;
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+v" : "Control+v"
  );
  await page.waitForTimeout(300);
  return true;
}

/**
 * Types the whole post into the composer, turning "@Name" tokens into real
 * mentions via FB's autocomplete popup. Plain segments go on the clipboard
 * and are Ctrl+V'd in (fast, and pasted newlines insert as line breaks — no
 * Enter keypress is ever sent, which could submit); anything a paste didn't
 * deliver falls back to human-style typing (Shift+Enter for line breaks — a
 * plain Enter submits comment boxes).
 */
async function typeComposerText(
  page: Page,
  scope: Locator | Page,
  textbox: Locator,
  text: string,
  clipboardOk: boolean
): Promise<MentionTypingResult> {
  const result: MentionTypingResult = { inserted: 0, failed: [] };
  const typeDelayMs = Math.max(
    0,
    Number.parseInt(process.env.FB_TYPE_DELAY_MS || "80", 10) || 80
  );

  for (const segment of parseMentionSegments(text)) {
    if (segment.kind === "text") {
      if (!segment.value) continue;
      let pasted = false;
      if (clipboardOk) pasted = await pasteSegment(page, segment.value);
      if (pasted) {
        // Verify the editor actually received the segment.
        const editorText = await textbox
          .evaluate((el) => (el as HTMLElement).innerText)
          .catch(() => "");
        if (normalizeText(editorText).includes(normalizeText(segment.value))) {
          continue;
        }
      }
      const lines = segment.value.replace(/\r\n?/g, "\n").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) await textbox.press("Shift+Enter");
        if (lines[i]) {
          await textbox.pressSequentially(lines[i], { delay: typeDelayMs });
        }
      }
    } else {
      await textbox.pressSequentially("@", { delay: typeDelayMs });
      const ok = await typeMention(
        page,
        scope,
        textbox,
        segment.value,
        typeDelayMs
      );
      if (ok) {
        result.inserted++;
      } else {
        result.failed.push(normalizeText(segment.value).slice(0, 60));
      }
    }
  }
  return result;
}

export async function postToGroup(
  context: BrowserContext,
  groupUrl: string,
  text: string,
  imagePath?: string,
  expectedPageName?: string
): Promise<PostResult> {
  const page = await context.newPage();
  try {
    await page.goto(groupUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("login") || url.includes("checkpoint")) {
      return { success: false, message: "Not logged in to Facebook" };
    }
    await dumpHtml(page, "group-page");

    // The composer trigger can appear in several forms depending on FB layout:
    // - a button labeled "What's on your mind" / "اكتب شيئًا..." / ...
    // - a div with role="button" carrying the same text (common in groups)
    // - an inline composer textbox (no click needed) on some layouts.
    // The last candidate explicitly excludes the per-post comment boxes —
    // those are also div[contenteditable][role=textbox] but live inside the
    // feed with a "تعليق باسم …"/"Comment as …" label.
    const triggerCandidates: Locator[] = [
      page.getByRole("button", { name: TRIGGER_TEXT_RE }).first(),
      page
        .locator('[role="button"]')
        .filter({ hasText: TRIGGER_TEXT_RE })
        .first(),
      page
        .locator(
          'div[contenteditable="true"][role="textbox"]:not([aria-label*="تعليق"]):not([aria-label*="comment" i])'
        )
        .first(),
    ];

    // Poll for the trigger instead of checking once, so a lagging or stalled
    // page load can't fail the post instantly.
    const search = await findComposerTrigger(page, triggerCandidates);
    const composerEl: Locator | null = search.trigger?.composer ?? null;
    const inlineComposer = search.trigger?.isRawTextbox ?? false;

    if (!composerEl) {
      await dumpHtml(page, "composer-not-found");
      // A mid-wait reload can land on login/checkpoint if the session died.
      const url = page.url();
      if (url.includes("login") || url.includes("checkpoint")) {
        return { success: false, message: "Not logged in to Facebook" };
      }
      // Gather page hints to help diagnose why the composer wasn't found.
      // Deliberately match specific FB UI strings only — generic words like
      // "pending"/"blocked"/"turned off" appear in ordinary posts and made
      // these hints wildly misleading before.
      const bodyText = await page
        .locator("body")
        .textContent({ timeout: 3000 })
        .catch(() => "");
      const hints: string[] = [];
      if (
        /request to join|طلب الانضمام|قيد المراجعة|قيد الموافقة|انضمامك قيد/i.test(
          bodyText ?? ""
        )
      ) {
        hints.push("your membership may be pending approval");
      }
      if (
        /only admins can post|posting is turned off|المشرفون فقط|المشرفين فقط|إيقاف تشغيل النشر|إيقاف النشر/i.test(
          bodyText ?? ""
        )
      ) {
        hints.push("posting may be turned off for members");
      }
      if (
        /you'?,?ve been blocked|you are blocked|you'?,?re muted|تم حظرك|أنت محظور|تم كتمك/i.test(
          bodyText ?? ""
        )
      ) {
        hints.push("you may be muted or blocked from this group");
      }
      const hint = hints.length ? ` (${hints.join("; ")})` : "";
      const waited = ` after waiting ${Math.round(
        COMPOSER_WAIT_MS / 1000
      )}s${search.reloaded ? " (with one reload)" : ""}`;
      return {
        success: false,
        message: `Could not find the post composer${waited}${hint}. If none apply, Facebook's layout may have changed or you don't have permission to post in this group.`,
      };
    }

    if (!inlineComposer) {
      await composerEl.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    }

    const dialog = page.getByRole("dialog").first();
    // waitFor genuinely waits for the dialog to mount; isVisible's timeout
    // option is ignored by Playwright.
    let dialogVisible = await dialog
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!inlineComposer && !dialogVisible) {
      // The first click is sometimes swallowed while the feed is still
      // hydrating — retry once before giving up.
      await composerEl.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);
      dialogVisible = await dialog
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
    }

    let textbox;
    if (inlineComposer && !dialogVisible) {
      // Inline layout: type directly into the composer element
      textbox = composerEl!;
    } else {
      if (!dialogVisible) {
        await dumpHtml(page, "dialog-not-open");
        return {
          success: false,
          message: "Post composer dialog did not open",
        };
      }
      // Let the composer finish loading before resolving its textbox — while
      // the dialog shows a spinner, its first render (including the textbox)
      // is often replaced, which detaches the element mid-flow.
      await page.waitForTimeout(1500);
      textbox = dialog
        .locator('div[contenteditable="true"][role="textbox"]')
        .first();
    }

    const textboxVisible = await textbox
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!textboxVisible) {
      return {
        success: false,
        message: "Could not find the text input in the composer",
      };
    }

    // Defense in depth: whatever textbox we resolved, bail out if it is a
    // per-post comment box instead of the composer.
    if (await isCommentBox(textbox)) {
      await dumpHtml(page, "comment-box-instead-of-composer");
      return {
        success: false,
        message:
          "Refused to post: only a comment box was found, not the group composer.",
      };
    }

    if (expectedPageName) {
      const identityCheck = dialog
        .locator('[role="button"]')
        .filter({ hasText: new RegExp(expectedPageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
      const identityVisible = await identityCheck
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (!identityVisible) {
        await page.keyboard.press("Escape");
        return {
          success: false,
          message:
            "This group does not allow Page posting. The composer is profile-only. Try posting as your personal profile instead.",
        };
      }
    }

    await textbox.click();
    await textbox.fill("");

    // Clipboard permission is granted once up front: plain-text segments are
    // delivered by Ctrl+V (fast, and newlines insert as line breaks without
    // any Enter keypress that could submit).
    let clipboardOk = false;
    try {
      const origin = new URL(page.url()).origin;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin,
      });
      clipboardOk = true;
    } catch {
      clipboardOk = false;
    }

    // Type the post segment by segment so "@Name" tokens can be turned into
    // real mentions through FB's autocomplete popup. Pasting "@Name" only
    // ever produces plain text — see the Mentions block below.
    const mentionScope = dialogVisible ? dialog : page;
    const mention = await typeComposerText(
      page,
      mentionScope,
      textbox,
      text,
      clipboardOk
    );
    const mentionNote = mention.failed.length
      ? ` Note: ${mention.failed.length} @mention(s) had no matching suggestion and were published as plain text: ${mention.failed.join(" | ")}`
      : "";

    await page.waitForTimeout(1000);

    if (imagePath) {
      try {
        // FB keeps a hidden <input type="file"> inside the composer. Set the
        // file on it directly — clicking the "Photo/Video" button would open
        // the OS file explorer instead. setInputFiles works on hidden inputs.
        const fileInput = dialog
          .locator('input[type="file"][accept*="image"], input[type="file"]')
          .first();
        const inputAttached = await fileInput
          .waitFor({ state: "attached", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (inputAttached) {
          await fileInput.setInputFiles(imagePath);
          await page.waitForTimeout(3000);
        } else {
          // No pre-rendered input: click the Photo/Video button and intercept
          // the native file chooser that FB opens.
          const photoBtn = dialog
            .getByRole("button", { name: /photo|image|video|صور|فيديو/i })
            .first();

          const photoBtnVisible = await photoBtn
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (photoBtnVisible) {
            const [chooser] = await Promise.all([
              page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
              photoBtn.click(),
            ]);
            if (chooser) {
              await chooser.setFiles(imagePath);
              await page.waitForTimeout(3000);
            }
          }
        }
      } catch {
        // Image upload failed, continue without image
      }
    }

    const postBtn = dialog
      .getByRole("button", { name: POST_BUTTON_RE })
      .first();

    const postBtnVisible = await postBtn
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!postBtnVisible) {
      await dumpHtml(page, "post-button-not-found");
      return {
        success: false,
        message: "Could not find the Post button",
      };
    }

    const isDisabled = await postBtn.isDisabled();
    if (isDisabled) {
      return {
        success: false,
        message: "Post button is disabled. The content may not be valid.",
      };
    }

    await postBtn.click({ timeout: 5000 });

    // After clicking Post, FB often shows a transient status like
    // "جارٍ النشر…" (Posting in progress) instead of closing the dialog
    // right away — that is NOT an error. Poll for the actual outcome: any
    // status that isn't an error means FB is still processing → keep waiting.
    const errorRe = /error|failed|فشل|حاول مجددًا|حاول مرة أخرى|try again/i;

    const deadline = Date.now() + 20000;
    let lastStatus = "";
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500);

      // Fast non-blocking check is intended here — we poll on an interval.
      const dialogStillVisible = await dialog.isVisible().catch(() => false);
      if (!dialogStillVisible) {
        return {
          success: true,
          message: "Post published successfully" + mentionNote,
        };
      }

      const statusText = await dialog
        .locator('[role="alert"], [role="status"]')
        .first()
        .textContent({ timeout: 1000 })
        .catch(() => "");

      if (statusText) {
        lastStatus = statusText.trim();
        if (errorRe.test(lastStatus)) {
          return { success: false, message: `Post failed: ${lastStatus}` };
        }
        // progress status (e.g. "جارٍ النشر") → keep waiting
      }
    }

    // Timed out without a clear outcome — the post was submitted (FB may
    // still be processing, e.g. pending admin approval) but verify manually.
    await dumpHtml(page, "post-uncertain");
    return {
      success: true,
      message: `Post submitted (still processing on Facebook${
        lastStatus ? `: ${lastStatus}` : ""
      }) — verify on Facebook${mentionNote}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: `Post failed: ${message}` };
  } finally {
    await page.close();
  }
}

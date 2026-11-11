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

    // Fast path: put the text on the clipboard and Ctrl+V it into the
    // composer. Pasted newlines are inserted as line breaks in one input
    // event — fast, and no Enter keypress is ever sent (which could submit).
    // The clipboard API needs explicit permission in Chromium.
    let pasted = false;
    try {
      const origin = new URL(page.url()).origin;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin,
      });
      pasted = await page.evaluate(async (t) => {
        try {
          await navigator.clipboard.writeText(t);
          return true;
        } catch {
          return false;
        }
      }, text);
      if (pasted) {
        await page.keyboard.press(
          process.platform === "darwin" ? "Meta+v" : "Control+v"
        );
        await page.waitForTimeout(300);
      }
    } catch {
      pasted = false;
    }

    // Verify the editor actually received the text; otherwise fall back to
    // human-style typing (Shift+Enter for line breaks — a plain Enter
    // submits comment boxes).
    const editorText = await textbox
      .evaluate((el) => (el as HTMLElement).innerText)
      .catch(() => "");
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    if (normalize(editorText) !== normalize(text)) {
      const typeDelayMs = Math.max(
        0,
        Number.parseInt(process.env.FB_TYPE_DELAY_MS || "80", 10) || 80
      );
      const lines = text.replace(/\r\n?/g, "\n").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) await textbox.press("Shift+Enter");
        await textbox.pressSequentially(lines[i], { delay: typeDelayMs });
      }
    }

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
        return { success: true, message: "Post published successfully" };
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
      message: `Post submitted (still processing on Facebook${lastStatus ? `: ${lastStatus}` : ""}) — verify on Facebook`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: `Post failed: ${message}` };
  } finally {
    await page.close();
  }
}

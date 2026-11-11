import type { BrowserContext, Locator, Page } from "playwright";
import type { Group } from "../types";

/** Convert Arabic-Indic digits (٠-٩) and Arabic thousands/scale words to a
 * westernized, display-friendly count. */
function normalizeCount(raw: string): string {
  const digits = raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, "."); // Arabic decimal separator
  return digits
    // ألف / الف / آلف / آلاف / ألاف (and the plural ألفات) all mean "thousand".
    .replace(/\s*(?:أ|آ|ا)?ل(?:ا)?ف(?:ات)?\s*/g, "K")
    .replace(/\s*مليون\s*/g, "M")
    .replace(/\s+/g, " ")
    .trim();
}

// Privacy label as Facebook renders it on the hovercard, e.g.
// "مجموعة عامة" (public group), "مجموعة خاصة" (private group) or English.
const PRIVACY_RE = /مجموعة (?:عامة|خاصة)|\b(?:public|private) group\b/i;

// Member-count pattern accepting Latin AND Arabic-Indic digits/separators,
// e.g. "28.5K members", "٢٨٫٥ ألف عضو", "١٠ آلاف عضو", "1.2 مليون عضو".
// The thousand word comes in several spellings (ألف، الف، آلف، آلاف، ألاف).
// The capture must contain at least one digit so stray hidden fragments
// like ".member" or "group…members" don't match.
const MEMBER_RE =
  /([٠-٩\d.,٫]*[٠-٩\d][٠-٩\d.,٫]*(?:\s*[KkMmأ])?(?:\s*(?:(?:أ|آ|ا)?ل(?:ا)?ف(?:ات)?|مليون))?)\s*(?:members?|أعضاء|عضو)/i;

// Global variant used with matchAll() when a text holds several member
// counts and we need to compare them instead of trusting the leftmost one.
const MEMBER_RE_G = new RegExp(MEMBER_RE.source, "gi");

async function dismissDialogs(page: Page): Promise<void> {
  const selectors = [
    'div[role="dialog"] button[aria-label="Close"]',
    'div[role="dialog"] [aria-label="Close"]',
    'div[role="dialog"] button:has-text("Got it")',
    'div[role="dialog"] button:has-text("OK")',
    'div[role="dialog"] button:has-text("Join")',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {
      // ignore
    }
  }
  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  } catch {
    // ignore
  }
}

export interface ScrapeOptions {
  detail?: boolean;
  maxGroups?: number;
  signal?: AbortSignal;
  onProgress?: (update: {
    phase: string;
    current?: number;
    total?: number;
    log?: string;
  }) => void;
}

export async function scrapeGroups(
  context: BrowserContext,
  options: ScrapeOptions = {}
): Promise<Group[]> {
  const doDetail = options.detail === true;
  const onProgress = options.onProgress;
  const report = (phase: string, current?: number, total?: number, log?: string) => {
    if (log) onProgress?.({ phase, current, total, log });
    else onProgress?.({ phase, current, total });
  };
  const page = await context.newPage();

  // Hover-scan helpers. Everything here runs inside the browser page (where
  // Node module constants don't exist), so the regexes are duplicated
  // inline on purpose.
  //
  // Root-cause of the mixed-up member counts: stale hovercards from
  // previously hovered groups stay mounted in the DOM (merely hidden), so
  // scanning the whole document picks up the *previous* group's popup.
  // The fix has two halves:
  //   1. tagExistingTipContainers(): right BEFORE hovering, mark every
  //      element whose text carries group info with data-tip-scanned.
  //   2. readFreshTip(): after the hover, only accept UNTAGGED containers —
  //      i.e. nodes mounted after the hover — skipping hidden ones. This
  //      guarantees the captured text belongs to the group currently being
  //      hovered, never to a leftover popup.
  const tagExistingTipContainers = () =>
    page.evaluate(() => {
      const norm = (t: string | null) =>
        (t || "")
          .replace(/[\u200e\u200f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const win =
        /مجموعة (?:عامة|خاصة)|public group|private group|members|أعضاء|عضو/i;
      for (const el of document.querySelectorAll(
        "div,span,section,article,aside,li"
      )) {
        const t = norm(el.textContent);
        if (!t || !win.test(t)) continue;
        el.setAttribute("data-tip-scanned", "1");
      }
    });

  const readFreshTip = () =>
    page.evaluate(() => {
      const norm = (t: string | null) =>
        (t || "")
          .replace(/[\u200e\u200f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const win =
        /مجموعة (?:عامة|خاصة)|public group|private group|members|أعضاء|عضو/i;
      const out: string[] = [];
      for (const el of document.querySelectorAll(
        "div,span,section,article,aside,li"
      )) {
        const t = norm(el.textContent);
        if (!t || !win.test(t)) continue;
        // Content tagged pre-hover (stale popups, list cards) never counts.
        if (el.getAttribute("data-tip-scanned")) continue;
        // Skip anything not visible — hidden stale popups must never be
        // read as the "current" popup even if they slip through untagged.
        const vis = el as HTMLElement & { checkVisibility?: () => boolean };
        if (typeof vis.checkVisibility === "function" && !vis.checkVisibility())
          continue;
        let childHas = false;
        for (const c of el.children) {
          if (win.test(norm(c.textContent))) {
            childHas = true;
            break;
          }
        }
        if (childHas) continue;
        out.push(t);
        if (out.length >= 3) break;
      }
      return out.join(" | ");
    });
  try {
    // "Display all" (عرض الكل) page listing every group the account has joined.
    // The plain /groups/ URL only shows the feed and yields unrelated links.
    await page.goto("https://www.facebook.com/groups/joins/?nav_source=tab", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(3000);
    await dismissDialogs(page);

    const url = page.url();
    if (url.includes("login") || url.includes("checkpoint")) {
      throw new Error("Not logged in to Facebook");
    }

    // The joins page lazy-loads AND virtualizes group cards: off-screen cards
    // get unmounted, so a single DOM query at the end only sees the last
    // viewport (~9 cards). We therefore extract entries after every scroll
    // round and merge them by group id in Node.
    const collectRound = () =>
      page
        .locator('a[href*="/www.facebook.com/groups/"], a[href*="/groups/"]')
        .evaluateAll((els) => {
          // NOTE: this runs inside the browser page — no module-level
          // constants are available here, so regexes are inlined below.
          const FEED_LINK =
            /multi_permalinks|comment_id|reply_comment_id|\/posts\/|\/permalink\/|\/share\/|story_fbid|notif_id|notif_t/;
          const MEMBERSHIP_MARKER =
            /آخر زيارة|آخر نشاط|\bmembers?\b|أعضاء|عضو|last (?:visit|activity|active)/i;

          const results: {
            id: string;
            name: string;
            joinedText: string;
            logoUrl: string;
            href: string;
          }[] = [];
          const seen = new Set<string>();

          for (const el of els) {
            const href = el.getAttribute("href") || "";
            const match = href.match(
              /https?:\/\/[a-z.]*facebook\.com\/groups\/(\d+)/
            );
            if (!match) continue;

            const id = match[1];
            if (seen.has(id)) continue;

            // Skip feed-post links that merely point at a group.
            if (FEED_LINK.test(href)) continue;

            // Walk up until the containing card exposes a membership marker.
            // Joined-group cards carry "آخر زيارة لك" (your last visit),
            // "آخر نشاط" (last activity) or a member count; feed-post links
            // never do.
            let card = el as HTMLElement;
            for (let i = 0; i < 12; i++) {
              if (!card.parentElement) break;
              card = card.parentElement;
              const text = card.textContent || "";
              if (MEMBERSHIP_MARKER.test(text)) break;
            }

            const cardText = (card.textContent || "")
              .replace(/[\u200e\u200f]/g, "")
              .replace(/\s+/g, " ")
              .trim();
            // Require a real membership card, not a feed post.
            if (!MEMBERSHIP_MARKER.test(cardText)) continue;

            // Name extraction — three strategies:
            // 1. The anchor's aria-label (cleanest when present).
            // 2. The anchor's own text: "name + آخر نشاط منذ ..." on cards
            //    from the top section.
            // 3. Card text: on "all groups" cards the anchor is a cover-photo
            //    link with no text, but the card text looks like
            //    "... فرز<name>آخر زيارة لك منذ ..." — take what's between
            //    the "فرز" (sort) button and the last-visit/activity marker.
            let name = el.getAttribute("aria-label") || "";
            if (!name) {
              name = el.textContent || "";
            }
            name = name
              .replace(/\s+/g, " ")
              .replace(/آخر نشاط.*$/, "")
              .replace(/آخر زيارة.*$/, "")
              .replace(/last (?:activity|active|visit).*$/i, "")
              .trim();
            if (!name || name.length < 2) {
              let t = cardText;
              const sortIdx = t.indexOf("فرز");
              if (sortIdx !== -1 && sortIdx < 80) t = t.slice(sortIdx + 3);
              t = t.replace(/^عرض الكل/, "");
              // English cards leave "View group" / trailing "You" fragments
              // (e.g. "<name>You last visited a day ago View group"), so cut
              // at those markers too.
              t = t.split(
                /آخر زيارة|آخر نشاط|أعضاء|عضو|عرض المجموعة|view group|last (?:visit|activity|active)/i
              )[0];
              t = t.replace(/\s*(?:you|أنت)\s*$/i, "");
              name = t.trim();
            }
            // Feed notifications never look like real group names.
            if (/^غير مقروءة/.test(name)) continue;
            // Generic "View group" UI links are not real groups.
            if (/^(عرض المجموعة|view group)$/i.test(name)) name = "";
            // A name can't be recovered from the card — it will be filled in
            // from the group page <title> during the detail pass.
            if (name.length > 140) name = "";

            const joinedText = cardText;

            let logoUrl = "";
            const avatars = card.querySelectorAll("img");
            for (const img of avatars) {
              const src = img.getAttribute("src") || "";
              if (src.includes("fbcdn") || src.includes("facebook")) {
                logoUrl = src;
                break;
              }
            }
            if (!logoUrl) {
              const svgImg = card.querySelector("image");
              if (svgImg) {
                logoUrl =
                  svgImg.getAttribute("xlink:href") ||
                  svgImg.getAttribute("href") ||
                  "";
              }
            }

            seen.add(id);
            results.push({ id, name, joinedText, logoUrl, href });
          }

          return results;
        });

    type Entry = {
      id: string;
      name: string;
      joinedText: string;
      // Text captured from the hovercard popup of this exact card. Kept
      // separate from the card text: the popup is scoped to freshly-mounted
      // DOM nodes, while the card text can spill past the card boundary and
      // carry a neighboring group's member count.
      tip: string;
      logoUrl: string;
      href: string;
    };
    const entriesMap = new Map<string, Entry>();
    let lastTotal = -1;
    let stableRounds = 0;
    let capHit = false;
    const MAX_SCROLL_ROUNDS = 60;
    const maxGroups = options.maxGroups;
    for (let i = 0; i < MAX_SCROLL_ROUNDS && stableRounds < 3; i++) {
      if (options.signal?.aborted) throw new Error("Aborted");
      if (maxGroups && entriesMap.size >= maxGroups) break;
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight)
      );
      await page.waitForTimeout(1200);

      // Some FB layouts load content on wheel events rather than plain scroll
      // position changes — nudge with a wheel event as well.
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(400);

      // Merge whatever cards are currently mounted (virtualized DOM).
      const roundEntries = await collectRound();
      // Count how many cards still need the hovercard popup (member count or
      // privacy marker missing) so the hover pass can report real progress
      // ("3/12") instead of a meaningless running total.
      let hoverTotal = 0;
      for (const entry of roundEntries) {
        const known = entriesMap.get(entry.id);
        const knownText =
          [known?.joinedText, known?.tip].filter(Boolean).join(" ") ||
          entry.joinedText;
        if (!(MEMBER_RE.test(knownText) && PRIVACY_RE.test(knownText)))
          hoverTotal++;
      }
      let hoverDone = 0;
      for (const entry of roundEntries) {
        if (options.signal?.aborted) throw new Error("Aborted");
        // Privacy is never printed on the card itself and member counts only
        // sometimes are, so we need the hovercard popup ("مجموعة عامة · N عضو")
        // for every card that is still missing either marker. `knownText`
        // reuses what we already captured in a previous round so already
        // enriched groups don't get hovered again while scrolling.
        const known = entriesMap.get(entry.id);
        const knownText =
          [known?.joinedText, known?.tip].filter(Boolean).join(" ") ||
          entry.joinedText;
        let tip = "";
        if (!(MEMBER_RE.test(knownText) && PRIVACY_RE.test(knownText))) {
          if (options.signal?.aborted) throw new Error("Aborted");
          hoverDone++;
          report("hovering", hoverDone, hoverTotal);
          try {
            // A card offers several anchors for the same group; the first one
            // is often hidden (cover photo clone) and .hover() would waste its
            // whole timeout without moving the pointer. Try every anchor
            // (bounded) and skip the ones with no visible bounding box.
            //
            // `href*=` is SUBSTRING matching: a group id that is a prefix of
            // another id (e.g. 394… vs 3941…) would otherwise match the other
            // group's links and snapshot its card. Filter with a hard
            // boundary after the id.
            const idBoundary = new RegExp(`/groups/${entry.id}(?:[/?#]|$)`);
            const anchorEls = await page
              .locator(`a[href*="/groups/${entry.id}"]`)
              .all()
              .catch(() => [] as Locator[]);
            const anchors: Locator[] = [];
            for (const a of anchorEls.slice(0, 12)) {
              const href = await a.getAttribute("href").catch(() => null);
              if (href && idBoundary.test(href)) anchors.push(a);
            }

            // The popup ("Public group · N members" / "مجموعة عامة · N عضو")
            // lazy-loads after a short delay, so poll instead of reading once.
            // Ground truth from a DOM probe: its content lives in plain
            // <span>s and its root is NOT role=tooltip/dialog/hovercard, so we
            // scan any element — but only the freshly-mounted ones (see
            // tagExistingTipContainers/readFreshTip above), never the whole
            // <body>.
            // Tag everything that already carries group info BEFORE hovering;
            // the popup poll then only accepts text from nodes that mounted
            // after the hover, so a stale popup from a previously hovered
            // group can never be attributed to this group.
            await tagExistingTipContainers().catch(() => {});
            for (const a of anchors.slice(0, 4)) {
              if (tip) break;
              const box = await a.boundingBox().catch(() => null);
              if (!box || box.width < 8 || box.height < 8) continue; // hidden
              try {
                await a.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
                let lastTip = "";
                for (let tries = 0; tries < 10; tries++) {
                  if (tries === 0) await a.hover({ timeout: 1500 });
                  else await page.waitForTimeout(300);
                  const fresh = await readFreshTip().catch(() => "");
                  if (fresh) lastTip = fresh;
                  if (MEMBER_RE.test(fresh)) break; // count arrived
                }
                tip = lastTip;
              } catch {
                // Try the next anchor.
              }
            }
            // Only trust the capture when it carries the privacy label: the
            // hovercard always shows it, while freshly re-mounted list cards
            // can also expose a member count and must not be mistaken for
            // the popup.
            if (tip && !PRIVACY_RE.test(tip)) tip = "";
          } catch {
            // ignore
          } finally {
            // Dismiss the popup so it can't block the next hover.
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(150);
          }
        }

        const enriched: Entry = { ...entry, tip };
        const existing = entriesMap.get(entry.id);
        if (!existing) {
          entriesMap.set(entry.id, enriched);
        } else {
          // Prefer the richer variant: a real name beats an empty one.
          if (!existing.name && enriched.name) existing.name = enriched.name;
          if (!existing.logoUrl && enriched.logoUrl)
            existing.logoUrl = enriched.logoUrl;
          // Card text is only the fallback source for the member count, so
          // keep the longest capture. The popup text is kept verbatim —
          // appending it to the card text used to let whatever count came
          // first in the joined string win, i.e. a neighbor's count.
          if (existing.joinedText.length < enriched.joinedText.length)
            existing.joinedText = enriched.joinedText;
          if (!existing.tip && enriched.tip) existing.tip = enriched.tip;
        }
      }

      // Some listings hide everything past the first batch behind an
      // explicit expander instead of infinite scroll — click it if present.
      const seeMore = page
        .locator(
          '[role="button"]:has-text("عرض المزيد"), div[role="button"]:has-text("See more"), [role="button"]:has-text("عرض الكل")'
        )
        .first();
      if (await seeMore.isVisible().catch(() => false)) {
        await seeMore.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      if (maxGroups && entriesMap.size > maxGroups) {
        const keep = [...entriesMap.keys()].slice(0, maxGroups);
        const trimmed = new Map();
        for (const k of keep) trimmed.set(k, entriesMap.get(k));
        entriesMap.clear();
        for (const [k, v] of trimmed) entriesMap.set(k, v);
      }
      const total = entriesMap.size;
      const gained = lastTotal < 0 ? total : total - lastTotal;
      if (maxGroups && entriesMap.size >= maxGroups) {
        stableRounds = 3;
        capHit = true;
      } else if (total === lastTotal) {
        stableRounds++;
      } else {
        stableRounds = 0;
        lastTotal = total;
      }
      // Only log when something actually changed — a delta, or the stall
      // counter moving. Identical "nothing happened" lines are pure noise.
      if (gained !== 0 || stableRounds > 0) {
        const stableNote =
          stableRounds > 0 ? ` · no new groups ${stableRounds}/3` : "";
        report(
          "collecting",
          total,
          undefined,
          `Round ${i + 1}/${MAX_SCROLL_ROUNDS}: +${gained} new · ${total} total${stableNote}`
        );
      }
    }

    const entries = [...entriesMap.values()];
    // Say WHY collection stopped — otherwise a stall is indistinguishable
    // from a normal end-of-list.
    const exitReason = capHit
      ? `cap reached (${maxGroups} groups)`
      : stableRounds >= 3
        ? "no new groups in 3 rounds"
        : "max scroll rounds reached";
    report(
      "collecting",
      entries.length,
      undefined,
      `Collection finished: ${exitReason} — ${entries.length} groups${doDetail ? "" : " (detail pass off)"}`
    );


    const groups: Group[] = [];
    for (const entry of entries) {
      let privacy: Group["privacy"] = "unknown";
      let memberCount = "N/A";

      // The popup text is preferred for both markers: it comes exclusively
      // from the freshly-mounted hovercard of this very card, while the card
      // text can spill past the card boundary and carry a neighbor's count.
      const tipText = entry.tip || "";
      if (/(private group|مجموعة خاصة)/i.test(tipText)) privacy = "private";
      else if (/(public group|مجموعة عامة)/i.test(tipText)) privacy = "public";
      if (privacy === "unknown") {
        if (/(private group|مجموعة خاصة)/i.test(entry.joinedText))
          privacy = "private";
        else if (/(public group|مجموعة عامة)/i.test(entry.joinedText))
          privacy = "public";
      }

      const tipMatch = tipText.match(MEMBER_RE);
      if (tipMatch) {
        memberCount = normalizeCount(tipMatch[1]);
      } else {
        // Card-text fallback: only trust it when every count in the text
        // agrees. Two different counts means neighbors leaked in through the
        // card ancestor walk — leave N/A so the detail pass can resolve the
        // real count from the group page.
        const all = [
          ...entry.joinedText.matchAll(MEMBER_RE_G),
        ].map((m) => normalizeCount(m[1]));
        const uniq = [...new Set(all)];
        if (uniq.length === 1) memberCount = uniq[0];
      }

      groups.push({
        id: entry.id,
        name: entry.name,
        privacy,
        memberCount,
        logoUrl: entry.logoUrl,
        url: `https://www.facebook.com/groups/${entry.id}/`,
      });
    }

    if (doDetail) {
    const CONCURRENCY = Math.max(
      1,
      Number(process.env.DETAIL_CONCURRENCY || 5)
    );
    report(
      "enriching",
      0,
      groups.length,
      `Detail pass: ${groups.length} groups, ${CONCURRENCY} workers`
    );

    // Process detail fetches with bounded concurrency. Each worker reuses
    // its own page to avoid creating one page per group.
    const workers: Promise<void>[] = [];
    const queue = [...groups];
    const results: (Group | null)[] = new Array(groups.length).fill(null);
    const indexById = new Map(groups.map((g, idx) => [g.id, idx]));

    async function processOne(group: Group): Promise<Group | null> {
      if (options.signal?.aborted) return null;
      const p = await context.newPage();
      await p.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (type === "font" || type === "media") route.abort();
        else route.continue();
      }).catch(() => {});
      try {
        const response = await p.goto(group.url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        if (response && response.status() === 404) return null;

        await p.waitForTimeout(1500);
        await dismissDialogs(p);

        if (!group.name) {
          const title = await p.title().catch(() => "");
          const cleaned = title
            .replace(/[\u200e\u200f]/g, "")
            .replace(/\s*\|\s*Facebook\s*$/i, "")
            .trim();
          if (cleaned && cleaned.length >= 2 && cleaned.length <= 140) {
            group.name = cleaned;
          }
        }

        const bodyText = await p
          .evaluate(() =>
            (document.body?.textContent || "").replace(/[\u200e\u200f]/g, "")
          )
          .catch(() => "");

        if (group.memberCount === "N/A") {
          // Scoped to this group's own members link — on the group page it is
          // <a href="/groups/<id>/members/">٢٨٫٥ ألف عضو</a> — instead of the
          // leftmost "… عضو" anywhere in <body>, which a suggested-groups
          // module could satisfy with some other group's count.
          const fromAnchor = await p
            .evaluate((gid: string) => {
              const norm = (t: string | null) =>
                (t || "")
                  .replace(/[\u200e\u200f]/g, "")
                  .replace(/\s+/g, " ")
                  .trim();
              const memberRe =
                /([٠-٩\d.,٫]*[٠-٩\d][٠-٩\d.,٫]*(?:\s*[KkMmأ])?(?:\s*(?:(?:أ|آ|ا)?ل(?:ا)?ف(?:ات)?|مليون))?)\s*(?:members?|أعضاء|عضو)/i;
              const idRe = new RegExp(`/groups/${gid}(?:[/?#]|$)`);
              for (const a of document.querySelectorAll("a")) {
                const href = a.getAttribute("href") || "";
                if (!idRe.test(href)) continue;
                const m = norm(a.textContent).match(memberRe);
                if (m) return m[1];
              }
              return "";
            }, group.id)
            .catch(() => "");
          if (fromAnchor) group.memberCount = normalizeCount(fromAnchor);
        }

        if (group.memberCount === "N/A" && bodyText) {
          const match = bodyText.match(MEMBER_RE);
          if (match) group.memberCount = normalizeCount(match[1]);
        }

        if (group.privacy === "unknown" && bodyText) {
          if (/مجموعة خاصة|private group/i.test(bodyText))
            group.privacy = "private";
          else if (/مجموعة عامة|public group/i.test(bodyText))
            group.privacy = "public";
        }

        if (!group.logoUrl) {
          const logo = await p
            .locator(
              '[aria-label*="group profile" i] image, [aria-label*="group photo" i] image, [role="img"] image'
            )
            .first()
            .getAttribute("xlink:href", { timeout: 1500 })
            .catch(() => null);

          if (logo && logo.startsWith("http")) {
            group.logoUrl = logo;
          } else {
            const logoImg = await p
              .locator('img[src*="facebook.com"], img[src*="fbcdn.net"]')
              .nth(1)
              .getAttribute("src", { timeout: 1500 })
              .catch(() => null);
            if (logoImg) group.logoUrl = logoImg;
          }
        }
        return group;
      } catch {
        return group;
      } finally {
        await p.close().catch(() => {});
      }
    }

    // Run workers
    const workerCount = Math.min(CONCURRENCY, groups.length || 1);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++;
        const g = queue[idx];
        const res = await processOne(g);
        report("enriching", idx + 1, queue.length, `Enriched ${g.name || g.id}`);
        const origIdx = indexById.get(g.id);
        if (origIdx !== undefined) results[origIdx] = res;
      }
    }
    for (let w = 0; w < workerCount; w++) workers.push(worker());
    await Promise.all(workers);

    // Rebuild groups array dropping 404s
    const filtered: Group[] = [];
    for (const r of results) {
      if (r) filtered.push(r);
    }
    const dropped = results.length - filtered.length;
    groups.length = 0;
    groups.push(...filtered);
    report(
      "enriching",
      filtered.length,
      filtered.length,
      `Detail pass finished${dropped ? `: ${dropped} group${dropped === 1 ? "" : "s"} dropped` : ""}`
    );

    // skip original sequential block below by returning early via flag
    // (fall through to final filter)
    // We handle final filtering after this block.

    }
    // Drop anything we couldn't identify (no name after both passes).
    const identified = groups.filter((g) => g.name);
    return identified;
  } catch (err) {
    console.error("Failed to scrape groups:", err);
    throw err;
  } finally {
    await page.close();
  }
}

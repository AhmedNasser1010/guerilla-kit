import type { BrowserContext } from "playwright";
import type { Group } from "../types";

/** Convert Arabic-Indic digits (٠-٩) and Arabic thousands/scale words to a
 * westernized, display-friendly count. */
function normalizeCount(raw: string): string {
  const digits = raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, "."); // Arabic decimal separator
  return digits
    .replace(/\s*ألف\s*/g, "K")
    .replace(/\s*مليون\s*/g, "M")
    .replace(/\s+/g, " ")
    .trim();
}

// Member-count pattern accepting Latin AND Arabic-Indic digits/separators,
// e.g. "28.5K members", "٢٨٫٥ ألف عضو", "1.2 مليون عضو". The capture must
// contain at least one digit so stray hidden fragments like ".member" or
// "group…members" don't match.
const MEMBER_RE =
  /([٠-٩\d.,٫]*[٠-٩\d][٠-٩\d.,٫]*(?:\s*[KkMmأ])?(?:\s*(?:ألف|مليون))?)\s*(?:members?|أعضاء|عضو)/i;

async function dismissDialogs(page: any): Promise<void> {
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
            /آخر زيارة|آخر نشاط|\bmembers?\b|أعضاء|عضو|last (?:visit|activity)/i;

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
              t = t.split(/آخر زيارة|آخر نشاط|أعضاء|عضو|last (?:visit|activity)/i)[0];
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
      logoUrl: string;
      href: string;
    };
    const entriesMap = new Map<string, Entry>();
    let lastTotal = -1;
    let stableRounds = 0;
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
      for (const entry of await collectRound()) {
        if (options.signal?.aborted) throw new Error("Aborted");
        if (!MEMBER_RE.test(entry.joinedText)) {
          if (options.signal?.aborted) throw new Error("Aborted");
          report("hovering", entriesMap.size);
          try {
            const loc = page.locator(`a[href*="/groups/${entry.id}"]`).first();
            await loc.hover({ timeout: 800 });
            await page.waitForTimeout(250);
            const tip = await page
              .evaluate(() => {
                const sels = ['[role="tooltip"]', '[data-hovercard-target]', 'div[id^="hovercard"]'];
                const parts: string[] = [];
                for (const s of sels) {
                  for (const el of document.querySelectorAll(s)) {
                    const t = (el.textContent || "").trim();
                    if (t) parts.push(t);
                  }
                }
                return parts.join(" ").replace(/[\u200e\u200f]/g, "");
              })
              .catch(() => "");
            let finalTip = tip;
            if (!finalTip) {
              finalTip = await page
                .evaluate(() =>
                  (document.body?.textContent || "").replace(/[\\u200e\\u200f]/g, "")
                )
                .catch(() => "");
            }
            if (finalTip) entry.joinedText += " " + finalTip;
          } catch {
            // ignore
          }
        }

        const existing = entriesMap.get(entry.id);
        if (!existing) {
          entriesMap.set(entry.id, entry);
        } else {
          // Prefer the richer variant: a real name beats an empty one.
          if (!existing.name && entry.name) existing.name = entry.name;
          if (!existing.logoUrl && entry.logoUrl)
            existing.logoUrl = entry.logoUrl;
          if (existing.joinedText.length < entry.joinedText.length)
            existing.joinedText = entry.joinedText;
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
      report("collecting", total, undefined, `Collected ${total} groups so far`);
      if (maxGroups && entriesMap.size >= maxGroups) {
        stableRounds = 3;
      }
      if (total === lastTotal) {
        stableRounds++;
      } else {
        stableRounds = 0;
        lastTotal = total;
      }
    }

    const entries = [...entriesMap.values()];


    const groups: Group[] = [];
    for (const entry of entries) {
      let privacy: Group["privacy"] = "unknown";
      let memberCount = "N/A";

      if (/(private group|مجموعة خاصة)/i.test(entry.joinedText))
        privacy = "private";
      else if (/(public group|مجموعة عامة)/i.test(entry.joinedText))
        privacy = "public";

      const memberMatch = entry.joinedText.match(MEMBER_RE);
      if (memberMatch) memberCount = normalizeCount(memberMatch[1]);

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
            .replace(/[\\u200e\\u200f]/g, "")
            .replace(/\\s*\\|\\s*Facebook\\s*$/i, "")
            .trim();
          if (cleaned && cleaned.length >= 2 && cleaned.length <= 140) {
            group.name = cleaned;
          }
        }

        const bodyText = await p
          .evaluate(() =>
            (document.body?.textContent || "").replace(/[\\u200e\\u200f]/g, "")
          )
          .catch(() => "");

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
    groups.length = 0;
    groups.push(...filtered);

    // skip original sequential block below by returning early via flag
    // (fall through to final filter)
    // We handle final filtering after this block.
    // Mark by setting a flag variable
    var detailDone = true; void detailDone;

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

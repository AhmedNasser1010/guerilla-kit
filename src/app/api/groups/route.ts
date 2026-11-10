export const runtime = "nodejs";

import { readCache, updateCache, backupCache, writeCache } from "@/lib/cache";
import { EMPTY_CACHE } from "@/lib/types";
import { resetProgress, setProgress, addLog, finishProgress, getProgress } from "@/lib/progress";
import { getBrowserContext, isLoggedIn, logoutFromFacebook } from "@/lib/playwright";
import { scrapeGroups } from "@/lib/facebook/scraper";

let refreshLock: Promise<unknown> | null = null;

export async function GET() {
  const cache = await readCache();
  return Response.json(cache);
}

export async function POST(request: Request) {
  if (refreshLock) {
    return Response.json(
      { error: "A group refresh is already in progress." },
      { status: 409 }
    );
  }

  let resolveLock: () => void = () => {};
  refreshLock = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });

  try {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      return Response.json(
        { error: "Not logged in to Facebook. Please log in first." },
        { status: 401 }
      );
    }

    let backup = false;
    let detail = false;
    let erase = false;
    let maxGroups: number | undefined;
    let confirm = "";
    try {
      const body = (await request.json()) as {
        backup?: boolean;
        detail?: boolean;
        erase?: boolean;
        confirm?: string;
        maxGroups?: number;
      } | null;
      backup = body?.backup === true;
      if (body?.detail === false) detail = false;
      erase = body?.erase === true;
      confirm = body?.confirm ?? "";
      if (typeof body?.maxGroups === "number") maxGroups = body.maxGroups;
    } catch {
      // No or invalid JSON body
    }

    if (erase) {
      if (confirm !== "ERASE") {
        return Response.json(
          { error: "Confirmation required. Send confirm: 'ERASE'." },
          { status: 400 }
        );
      }
      // Final safety backup before wiping.
      try {
        await backupCache();
      } catch {
        // ignore
      }
      await writeCache({ ...EMPTY_CACHE });
      try {
        await logoutFromFacebook();
      } catch {
        // ignore
      }
      return Response.json({ ...EMPTY_CACHE });
    }

    resetProgress();
    setProgress("starting", 0, 0);
    addLog("Starting group refresh");

    const existingCache = await readCache();
    const manualGroups = existingCache.manualGroups;

    const context = await getBrowserContext();
    const groups = await scrapeGroups(context, {
      detail,
      maxGroups,
      signal: request.signal,
      onProgress: (u) => {
        setProgress(u.phase, u.current, u.total);
        if (u.log) addLog(u.log);
      },
    });

    if (backup) {
      await backupCache();
    }

    const scrapedIds = new Set(groups.map((g) => g.id));
    const preservedManualGroups = manualGroups.filter(
      (g) => !scrapedIds.has(g.id)
    );

    const updated = await updateCache({
      groups: groups.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      manualGroups: preservedManualGroups,
      lastUpdated: new Date().toISOString(),
    });

    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to refresh groups";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    finishProgress();
    refreshLock = null;
    resolveLock();
  }
}

export async function DELETE(request: Request) {
  // Convenience alias for erase.
  return POST(
    new Request(request.url, {
      method: "POST",
      body: JSON.stringify({ erase: true, confirm: "ERASE" }),
      headers: { "content-type": "application/json" },
    })
  );
}
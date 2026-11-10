import fs from "fs/promises";
import path from "path";
import type { CacheData } from "./types";
import { EMPTY_CACHE } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "groups.json");

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function readCache(): Promise<CacheData> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CacheData>;
    // Normalize so callers can rely on arrays always being present
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      manualGroups: Array.isArray(parsed.manualGroups)
        ? parsed.manualGroups
        : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      lastUpdated: parsed.lastUpdated ?? null,
      selectedPageId: parsed.selectedPageId ?? null,
    };
  } catch {
    return { ...EMPTY_CACHE };
  }
}

export async function writeCache(data: CacheData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function backupCache(): Promise<string | null> {
  try {
    await fs.access(CACHE_FILE);
  } catch {
    // No cache file yet — nothing to back up
    return null;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const backupFile = path.join(DATA_DIR, `groups.backup-${stamp}.json`);
  await fs.copyFile(CACHE_FILE, backupFile);
  return backupFile;
}

export async function updateCache(
  partial: Partial<CacheData>
): Promise<CacheData> {
  const current = await readCache();
  const updated = { ...current, ...partial };
  await writeCache(updated);
  return updated;
}

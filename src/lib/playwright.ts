import { chromium, type BrowserContext, type Page } from "playwright";
import path from "path";
import { writeSession } from "./session";

// The turbopackIgnore comment opts this call out of Turbopack's build-time
// path analysis: browser-data/ is a generated Playwright profile, not
// something the build should trace/bundle.
const BROWSER_DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "browser-data");

let contextInstance: BrowserContext | null = null;
let loginPage: Page | null = null;

export function isContextRunning(): boolean {
  return contextInstance !== null;
}

export async function getBrowserContext(): Promise<BrowserContext> {
  if (contextInstance) return contextInstance;

  contextInstance = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  // Navigate the launcher's blank page to facebook.com so the window is never
  // a useless white "about:blank" tab.
  try {
    const initial = contextInstance
      .pages()
      .find(
        (p) =>
          !p.isClosed() &&
          (p.url() === "about:blank" || p.url().length === 0)
      );
    if (initial) {
      await initial
        .goto("https://www.facebook.com/", {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        })
        .catch(() => {});
    }
  } catch {
    // Non-fatal: skip navigation if the profile is mid-startup
  }

  contextInstance.on("close", () => {
    contextInstance = null;
    loginPage = null;
  });

  return contextInstance;
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    try {
      await contextInstance.close();
    } catch {}
    contextInstance = null;
    loginPage = null;
  }
}

process.on("beforeExit", () => {
  if (contextInstance) {
    void contextInstance.close().catch(() => {});
  }
});

process.on("exit", () => {
  if (contextInstance) {
    void contextInstance.close().catch(() => {});
  }
});

for (const sig of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
  process.on(sig, () => {
    if (contextInstance) {
      void contextInstance
        .close()
        .catch(() => {})
        .finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  });
}

function facebookCookies(ctx: BrowserContext) {
  return ctx.cookies("https://www.facebook.com");
}

function hasValidSessionCookies(
  cookies: Awaited<ReturnType<typeof facebookCookies>>
) {
  const cUser = cookies.find((c) => c.name === "c_user")?.value;
  return Boolean(cUser && cUser.length > 0);
}

/**
 * Cheap login check based on cookies only. Requires a running context;
 * callers that must not spawn the browser should gate on isContextRunning().
 */
export async function isLoggedIn(): Promise<boolean> {
  try {
    const ctx = await getBrowserContext();
    const cookies = await facebookCookies(ctx);
    const valid = hasValidSessionCookies(cookies);
    await writeSession(valid);
    return valid;
  } catch {
    return false;
  }
}

/**
 * Logs out by clearing all Facebook cookies from the persistent profile,
 * marking the persisted session invalid, and closing the browser so the
 * login state is fully wiped.
 */
export async function logoutFromFacebook(): Promise<void> {
  if (contextInstance) {
    try {
      await contextInstance.clearCookies();
    } catch {}
  }
  await writeSession(false);
  await closeBrowser();
}

export async function getCurrentIdentity(): Promise<{
  userId: string | null;
  pageId: string | null;
  isActingAsPage: boolean;
}> {
  try {
    const ctx = await getBrowserContext();
    const cookies = await facebookCookies(ctx);
    const cUser = cookies.find((c) => c.name === "c_user")?.value || null;
    const iUser = cookies.find((c) => c.name === "i_user")?.value || null;

    return {
      userId: cUser,
      pageId: iUser,
      isActingAsPage: iUser !== null && iUser !== cUser,
    };
  } catch {
    return { userId: null, pageId: null, isActingAsPage: false };
  }
}

/**
 * Opens (or reuses) a single visible tab for manual login.
 * Re-uses the existing tab so we never stack up tabs.
 */
export async function openLoginWindow(): Promise<Page> {
  const ctx = await getBrowserContext();

  let page = loginPage && !loginPage.isClosed() ? loginPage : null;
  if (!page) {
    const existing = ctx.pages().find((p) => !p.isClosed());
    page = existing ?? (await ctx.newPage());
    loginPage = page;
    page.on("close", () => {
      if (loginPage === page) loginPage = null;
    });
  }

  try {
    await page.bringToFront();
  } catch {}

  if (page.url() !== "https://www.facebook.com/") {
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }

  return page;
}

/**
 * Poll-safe: called repeatedly by the UI to see if the user has logged in
 * on the visible tab. Only checks cookies, no new tabs, no navigation.
 */
export async function loginComplete(): Promise<boolean> {
  try {
    const ctx = await getBrowserContext();
    const cookies = await facebookCookies(ctx);
    const valid = hasValidSessionCookies(cookies);
    await writeSession(valid);
    return valid;
  } catch {
    return false;
  }
}
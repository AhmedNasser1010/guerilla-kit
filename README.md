# GuerillaKit

A Next.js web app that lets you post to multiple Facebook groups as your Page, using browser automation (Playwright) with your own logged-in Facebook session.

## Features

- **Landing page** — a marketing page at `/` introducing the tool, with the dashboard living at `/app`.
- **Facebook login via a real browser window** — log in manually once; the session is persisted and reused automatically, with a live connection indicator in the header.
- **Page management** — detect the Facebook Pages you manage and switch between them (or your personal profile) from a dropdown in the header.
- **Group discovery** — scrape the groups associated with your Pages, cached locally in `data/groups.json` (with an automatic timestamped backup before re-scraping).
- **Composer with image preview** — select a group, write your message, and attach an image with an inline preview before posting.
- **Per-group posting status** — each group card shows posting / posted / failed states, with toast notifications and inline error messages.
- **Group organization tools** — search, filter (all / posted / remaining), sort (name, followers), grid or list display, per-group notes, mark-as-posted checkboxes, and hide/unhide groups. Notes, posted marks, hidden groups, and view preferences are persisted in your browser's `localStorage`.
- **Excel export** — download the currently filtered view as a styled, color-coded `.xlsx` (colored privacy/posted/hidden cells, per-flag colors, hyperlinks, frozen header) via the **Export** button in the toolbar. Use the **Columns** dropdown next to it to pick which columns to include; your selection is remembered.
- **Dashboard stats bar** — at-a-glance cards for groups loaded, marked posted, remaining, and total member reach.
- **Dashboard UI** — built with React 19, Tailwind CSS 4, and shadcn/ui components, including dark mode support and skeleton loading states.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router, Node.js runtime for API routes)
- React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui + lucide-react
- [Playwright](https://playwright.dev) for browser automation
- [sonner](https://sonner.emilkowal.dev) for toast notifications

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

## Usage

1. **Log in** — from the dashboard (`/app`), trigger the login flow. A Playwright-driven browser window opens; log in to Facebook manually. The session is saved to `data/session.json`.
2. **Detect Pages** — the app scrapes the Pages you manage (`/api/pages`) and caches them. Pick which Page to post as from the header dropdown.
3. **Detect Groups** — fetch the groups for your Pages (`/api/groups`), cached in `data/groups.json`. Forcing a refresh backs up the existing cache before re-scraping.
4. **Post** — click **Post** on a group card to select it, write your message in the composer, optionally attach an image, and submit (`/api/post`). The app switches to the selected Page (if any) and posts to that group, showing a success/failure status on the card.
5. **Stay organized** — mark groups as posted, add notes, hide groups you don't care about, and filter by posted/remaining. Your progress is remembered locally between visits.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/route.ts    # GET status, POST open login window, DELETE logout
│   │   ├── pages/route.ts   # Detect managed Facebook Pages
│   │   ├── groups/route.ts  # Detect & cache groups (with cache backup)
│   │   └── post/route.ts    # Post to the selected group
│   ├── app/page.tsx         # Dashboard route
│   ├── layout.tsx
│   └── page.tsx             # Landing page
├── components/
│   ├── dashboard.tsx        # Main dashboard state & orchestration
│   ├── dashboard/
│   │   ├── header.tsx       # Header: search, page selector, login/logout, refresh
│   │   ├── stats-bar.tsx    # Stats cards (groups, posted, remaining, reach)
│   │   ├── composer.tsx     # Post composer with image preview
│   │   └── group-card.tsx   # Group card & list item (status, notes, hide)
│   ├── theme-toggle.tsx     # Dark mode toggle
│   └── ui/                  # shadcn/ui primitives
└── lib/
    ├── facebook/            # poster, pages, scraper (Playwright automation)
    ├── playwright.ts        # Browser context & session management
    ├── cache.ts             # Local cache (data/groups.json)
    ├── session.ts           # Persisted login state
    └── types.ts             # Shared TypeScript types
```

## Data Files

- `data/session.json` — persisted Facebook login session/cookies.
- `data/groups.json` — cached Pages and groups (`groups.backup-*.json` files are created when a forced refresh re-scrapes).
- `browser-data/` — Playwright persistent browser profile.

> ⚠️ These files contain sensitive session data. Do not commit or share them.

## Notes & Caveats

- This tool automates posting via a real browser using your own account. Use responsibly — excessive automated posting may violate Facebook's Terms of Service and could risk account restrictions.
- Facebook's UI changes frequently; scraping/posting selectors may need updating when that happens.


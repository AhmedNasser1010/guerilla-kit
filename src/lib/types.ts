export interface FacebookPage {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface Group {
  id: string;
  name: string;
  privacy: "public" | "private" | "unknown";
  memberCount: string;
  logoUrl: string;
  url: string;
}

export type GroupFlagId =
  | "no-reshare"
  | "accept-posts"
  | "long-pending"
  | "auto-reject"
  | "posts-deleted"
  | "check-again"
  | "posting-disabled"
  | "new-group"

export type GroupFlagAccount = "page" | "personal"

// Map of groupId -> active flags. Account-specific flags map to the list of
// accounts they apply to; global flags (meta.global) map to "global" and apply
// to the group regardless of which account is used
export type GroupFlagsMap = Partial<Record<GroupFlagId, GroupFlagAccount[] | "global">>

/**
 * A named collection of groups (e.g. "العياط") the user can post to in one
 * click. groupIds are ordered — posting to a collection follows this order.
 */
export interface Collection {
  id: string;
  name: string;
  groupIds: string[];
}

export type GroupDisplayStyle = "grid" | "list";

export type GroupSortOrder =
  | "default"
  | "followers-desc"
  | "followers-asc"
  | "name-asc";

export interface CacheData {
  groups: Group[];
  /**
   * Groups added manually by the user (not discovered by scraping).
   * These are preserved across cache refreshes/backups and are never
   * overwritten by the scraper.
   */
  manualGroups: Group[];
  /**
   * Named collections of groups (user-curated). Stored in the cache and
   * never touched by scraping, so memberships survive refreshes.
   */
  collections: Collection[];
  pages: FacebookPage[];
  lastUpdated: string | null;
  selectedPageId: string | null;
}

export interface PostStatus {
  groupId: string;
  status: "idle" | "loading" | "success" | "error";
  message?: string;
}

export const EMPTY_CACHE: CacheData = {
  groups: [],
  manualGroups: [],
  collections: [],
  pages: [],
  lastUpdated: null,
  selectedPageId: null,
};

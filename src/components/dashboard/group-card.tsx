"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Globe,
  Lock,
  RefreshCw,
  Send,
  Copy,
  ExternalLink,
  EyeOff,
  Eye,
  StickyNote,
  FolderPlus,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type {
  Collection,
  Group,
  GroupFlagAccount,
  GroupFlagId,
  GroupFlagsMap,
  PostStatus,
} from "@/lib/types"
import { Ban, Clock, Flag, Inbox, ThumbsDown, Monitor, Smartphone, X, Trash2, CircleOff, Sparkles } from "lucide-react"

export interface GroupFlagMeta {
  id: GroupFlagId
  label: string
  badgeClass: string
  icon: React.ComponentType<{ className?: string }>
  /** Global flags apply to the group itself, not to a specific account */
  global?: boolean
}

// Registry of group flags. Add new flags here — they will automatically
// appear in the flag dropdown and render as badges on group cards.
export const GROUP_FLAGS: GroupFlagMeta[] = [
  {
    id: "no-reshare",
    label: "No Reshare",
    badgeClass: "text-rose-600 border-rose-300 bg-rose-50 dark:bg-rose-950/40",
    icon: Ban,
    global: true,
  },
  {
    id: "accept-posts",
    label: "Accept Posts",
    badgeClass:
      "text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40",
    icon: Inbox,
  },
  {
    id: "long-pending",
    label: "Long Pending",
    badgeClass:
      "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40",
    icon: Clock,
  },
  {
    id: "auto-reject",
    label: "Auto Reject",
    badgeClass:
      "text-slate-600 border-slate-300 bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300",
    icon: ThumbsDown,
  },
  {
    id: "posts-deleted",
    label: "Posts Deleted",
    badgeClass:
      "text-violet-600 border-violet-300 bg-violet-50 dark:bg-violet-950/40",
    icon: Trash2,
  },
  {
    id: "check-again",
    label: "Check Again",
    badgeClass:
      "text-teal-600 border-teal-300 bg-teal-50 dark:bg-teal-950/40",
    icon: RefreshCw,
  },
  {
    id: "posting-disabled",
    label: "Posting Disabled",
    badgeClass:
      "text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/40",
    icon: CircleOff,
  },
  {
    id: "new-group",
    label: "New Group",
    badgeClass:
      "text-cyan-600 border-cyan-300 bg-cyan-50 dark:bg-cyan-950/40",
    icon: Sparkles,
    global: true,
  },
]

export function GroupFlagsBadges({
  flags,
  onRemove,
  className = "",
}: {
  flags: GroupFlagsMap
  onRemove: (flagId: GroupFlagId) => void
  className?: string
}) {
  if (!flags) return null
  // Global flags first, then Page Account flags, then Personal Account flags
  const entries = GROUP_FLAGS.filter((f) => flags[f.id]).sort((a, b) => {
    const rank = (id: GroupFlagId) => {
      const v = flags[id]
      if (v === "global") return 0
      return Array.isArray(v) && v.includes("page") ? 1 : 2
    }
    return rank(a.id) - rank(b.id)
  })
  if (entries.length === 0) return null
  return (
    <span className={"inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 " + className}>
      {entries.map((flag) => {
        const Icon = flag.icon
        const isGlobal = flag.global || flags[flag.id] === "global"
        const accounts = isGlobal ? [] : (flags[flag.id] as GroupFlagAccount[]) || []
        const accountLabel = isGlobal
          ? "All accounts"
          : accounts
              .map((a) => (a === "page" ? "Page Account" : "Personal Account"))
              .join(" + ")
        return (
          <Badge
            key={flag.id}
            variant="outline"
            render={
              <button
                type="button"
                title={`${flag.label} · ${accountLabel} — click to remove`}
                aria-label={`Remove flag ${flag.label}`}
                onClick={() => onRemove(flag.id)}
                className="cursor-pointer hover:bg-muted/80"
              />
            }
            className={"gap-1 " + flag.badgeClass}
          >
            {!isGlobal && accounts.includes("page") && (
              <Monitor className="size-3 opacity-70" aria-label="Page Account" />
            )}
            {!isGlobal && accounts.includes("personal") && (
              <Smartphone className="size-3 opacity-70" aria-label="Personal Account" />
            )}
            {flag.label}
            <X className="hidden size-3 group-hover/badge:block" aria-hidden />
            <Icon className="size-3 group-hover/badge:hidden" />
          </Badge>
        )
      })}
    </span>
  )
}

export function parseMemberCount(count: string): number {
  const match = count.replace(/,/g, "").match(/([\d.]+)\s*([KkMm])?/)
  if (!match) return 0
  const value = parseFloat(match[1])
  if (Number.isNaN(value)) return 0
  const suffix = match[2]?.toLowerCase()
  if (suffix === "k") return value * 1_000
  if (suffix === "m") return value * 1_000_000
  return value
}

function PrivacyBadge({ privacy }: { privacy: Group["privacy"] }) {
  if (privacy === "public") {
    return (
      <Badge variant="outline" className="gap-1 text-emerald-600">
        <Globe className="size-3" />
        Public
      </Badge>
    )
  }
  if (privacy === "private") {
    return (
      <Badge variant="outline" className="gap-1 text-amber-600">
        <Lock className="size-3" />
        Private
      </Badge>
    )
  }
  return <Badge variant="outline">Unknown</Badge>
}

function StatusIndicator({ status }: { status?: PostStatus }) {
  if (!status || status.status === "idle") return null
  if (status.status === "loading") {
    return (
      <Badge variant="secondary" className="gap-1">
        <RefreshCw className="animate-spin" />
        Posting…
      </Badge>
    )
  }
  if (status.status === "success") {
    return (
      <Badge className="gap-1 bg-emerald-600 text-white">
        <Check className="size-3" />
        Posted
      </Badge>
    )
  }
  return <Badge variant="destructive">Failed</Badge>
}

async function copyUrl(group: Group) {
  try {
    await navigator.clipboard.writeText(group.url)
    toast.success("Group URL copied")
  } catch {
    toast.error("Failed to copy URL")
  }
}
export function GroupFlagMenuButton({
  flags,
  onSetFlag,
}: {
  flags: GroupFlagsMap
  onSetFlag: (flagId: GroupFlagId, account: GroupFlagAccount) => void
}) {
  const hasFlags = flags && Object.keys(flags).length > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title="Manage flags"
            aria-label="Manage flags"
          />
        }
      >
        <Flag className={hasFlags ? "fill-sky-400 text-sky-500" : ""} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Flags</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {GROUP_FLAGS.map((flag) => {
            const Icon = flag.icon
            const active = flags?.[flag.id] || []
            if (flag.global) {
              // Global flags aren't account-specific — toggle directly.
              // The account argument is ignored by the handler for global flags.
              return (
                <DropdownMenuItem
                  key={flag.id}
                  onClick={() => onSetFlag(flag.id, "page")}
                >
                  <Icon className="size-4" />
                  {flag.label}
                  {active && active.length > 0 && " ✓"}
                </DropdownMenuItem>
              )
            }
            return (
              <DropdownMenuSub key={flag.id}>
                <DropdownMenuSubTrigger>
                  <Icon className="size-4" />
                  {flag.label}
                  {active.length > 0 && " ✓"}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => onSetFlag(flag.id, "page")}
                  >
                    <Monitor className="size-4" />
                    Page Account {active.includes("page") && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onSetFlag(flag.id, "personal")}
                  >
                    <Smartphone className="size-4" />
                    Personal Account {active.includes("personal") && "✓"}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GroupCollectionsMenuButton({
  group,
  collections,
  onToggleCollection,
}: {
  group: Group
  collections: Collection[]
  onToggleCollection: (collectionId: string) => void
}) {
  const memberOf = collections.filter((c) => c.groupIds.includes(group.id))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title="Manage collections"
            aria-label={`Manage collections for ${group.name}`}
          />
        }
      >
        <FolderPlus
          className={memberOf.length > 0 ? "fill-indigo-400 text-indigo-500" : ""}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Collections</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {collections.length === 0 ? (
            <DropdownMenuItem disabled>
              No collections yet — create one from the toolbar
            </DropdownMenuItem>
          ) : (
            collections.map((collection) => (
              <DropdownMenuCheckboxItem
                key={collection.id}
                checked={memberOf.some((c) => c.id === collection.id)}
                closeOnClick={false}
                onCheckedChange={() => onToggleCollection(collection.id)}
              >
                {collection.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GroupCard({
  group,
  index,
  posted,
  onTogglePosted,
  status,
  isSelected,
  disabled,
  onPost,
  note,
  onNoteChange,
  hidden,
  onToggleHidden,
  flags,
  onSetFlag,
  onRemoveFlag,
  onSelect,
  isManual,
  onRemove,
  collections,
  onToggleCollection,
  showSelection,
  selectionChecked,
  onToggleSelect,
}: {
  group: Group
  index: number
  posted: boolean
  onTogglePosted: () => void
  status?: PostStatus
  isSelected: boolean
  disabled: boolean
  onPost: () => void
  note: string
  onNoteChange: (value: string) => void
  hidden: boolean
  onToggleHidden: () => void
  flags: GroupFlagsMap
  onSetFlag: (flagId: GroupFlagId, account: GroupFlagAccount) => void
  onRemoveFlag: (flagId: GroupFlagId) => void
  onSelect?: () => void
  isManual?: boolean
  onRemove?: () => void
  collections?: Collection[]
  onToggleCollection?: (collectionId: string) => void
  showSelection?: boolean
  selectionChecked?: boolean
  onToggleSelect?: () => void
}) {
  const [noteOpen, setNoteOpen] = React.useState(false)
  const hasError = status?.status === "error"

  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSelect) return
    // Don't steal focus/selection from interactive controls inside the card
    const target = e.target as HTMLElement
    if (target.closest("button, textarea, input, label, a, [role='menu'], [role='menuitem'], [role='menuitemradio'], [data-radix-popper-content-wrapper]")) return
    onSelect()
  }

  return (
    <div
      onClick={handleCardClick}
      className={
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
        (isSelected ? "border-primary/60 ring-1 ring-primary/30 " : "") +
        (posted ? "border-emerald-600/40 " : "") +
        (hasError ? "border-destructive/40 " : "")
      }
    >
      {status?.status === "success" && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-emerald-500" />
      )}
      {hasError && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-destructive" />
      )}

      <div className="flex items-start gap-3">
        {showSelection && onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selectionChecked}
            onChange={onToggleSelect}
            className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
            aria-label={`Select ${group.name}`}
          />
        )}
        <Avatar className="size-10 shrink-0 ring-1 ring-border">
          <AvatarImage src={group.logoUrl} />
          <AvatarFallback>{group.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug" title={group.name}>
            {group.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <PrivacyBadge privacy={group.privacy} />
            <span className="text-xs text-muted-foreground">
              {group.memberCount} members
            </span>
            <GroupFlagsBadges flags={flags} onRemove={onRemoveFlag} />
          </div>
        </div>

        <label
          className="flex shrink-0 cursor-pointer items-center"
          title={posted ? "Mark as not posted" : "Mark as posted"}
        >
          <input
            type="checkbox"
            checked={posted}
            onChange={onTogglePosted}
            className="size-4 cursor-pointer accent-primary"
            aria-label={`Mark ${group.name} as posted`}
          />
        </label>
      </div>

      {status && status.status !== "idle" && (
        <div className="mt-3">
          <StatusIndicator status={status} />
          {hasError && status.message && (
            <p className="mt-1 line-clamp-2 text-xs text-destructive" title={status.message}>
              {status.message}
            </p>
          )}
        </div>
      )}

      {noteOpen && (
        <Textarea
          className="mt-3 min-h-16 text-xs"
          placeholder="Add note..."
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          aria-label={`Note for ${group.name}`}
          rows={3}
          autoFocus
        />
      )}

      <div className="mt-4 flex gap-1.5 border-t pt-3">
        <Button
          className="flex-1"
          size="sm"
          onClick={onPost}
          disabled={disabled || status?.status === "loading"}
        >
          {status?.status === "loading" ? (
            <RefreshCw className="animate-spin" />
          ) : (
            <Send />
          )}
          Post
        </Button>
        <GroupFlagMenuButton flags={flags} onSetFlag={onSetFlag} />
        {collections && onToggleCollection && (
          <GroupCollectionsMenuButton
            group={group}
            collections={collections}
            onToggleCollection={onToggleCollection}
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title={note || noteOpen ? "Edit note" : "Add note"}
          aria-label={`Toggle note for ${group.name}`}
          onClick={() => setNoteOpen((v) => !v)}
        >
          <StickyNote className={note ? "fill-amber-400 text-amber-500" : ""} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Copy direct group URL"
          aria-label={`Copy direct URL for ${group.name}`}
          onClick={() => copyUrl(group)}
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Open group in new tab"
          aria-label={`Open ${group.name} in a new tab`}
          onClick={() => window.open(group.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={hidden ? "Unhide group" : "Hide group"}
          aria-label={hidden ? `Unhide ${group.name}` : `Hide ${group.name}`}
          onClick={onToggleHidden}
        >
          {hidden ? <Eye /> : <EyeOff />}
        </Button>
        {isManual && onRemove && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Remove manually added group"
            aria-label={`Remove ${group.name} from manually added groups`}
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <span className="absolute right-3 top-3 text-[10px] tabular-nums text-muted-foreground/50">
        #{index}
      </span>
    </div>
  )
}

export function GroupListItem({
  group,
  index,
  posted,
  onTogglePosted,
  status,
  isSelected,
  disabled,
  onPost,
  note,
  onNoteChange,
  hidden,
  onToggleHidden,
  flags,
  onSetFlag,
  onRemoveFlag,
  onSelect,
  isManual,
  onRemove,
  collections,
  onToggleCollection,
  showSelection,
  selectionChecked,
  onToggleSelect,
}: {
  group: Group
  index: number
  posted: boolean
  onTogglePosted: () => void
  status?: PostStatus
  isSelected: boolean
  disabled: boolean
  onPost: () => void
  note: string
  onNoteChange: (value: string) => void
  hidden: boolean
  onToggleHidden: () => void
  flags: GroupFlagsMap
  onSetFlag: (flagId: GroupFlagId, account: GroupFlagAccount) => void
  onRemoveFlag: (flagId: GroupFlagId) => void
  onSelect?: () => void
  isManual?: boolean
  onRemove?: () => void
  collections?: Collection[]
  onToggleCollection?: (collectionId: string) => void
  showSelection?: boolean
  selectionChecked?: boolean
  onToggleSelect?: () => void
}) {
  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSelect) return
    const target = e.target as HTMLElement
    if (target.closest("button, textarea, input, label, a, [role='menu'], [role='menuitem'], [role='menuitemradio'], [data-radix-popper-content-wrapper]")) return
    onSelect()
  }
  return (
    <div
      onClick={handleCardClick}
      className={
        "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md " +
        (isSelected ? "border-primary/60 ring-1 ring-primary/30 " : "") +
        (status?.status === "success" ? "border-emerald-600/40 " : "")
      }
    >
      <span className="hidden w-8 shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
        #{index}
      </span>
      {showSelection && onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selectionChecked}
          onChange={onToggleSelect}
          className="shrink-0 cursor-pointer accent-primary"
          aria-label={`Select ${group.name}`}
        />
      )}
      <Avatar className="size-9 shrink-0 ring-1 ring-border">
        <AvatarImage src={group.logoUrl} />
        <AvatarFallback className="text-sm">
          {group.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={group.name}>
          {group.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <PrivacyBadge privacy={group.privacy} />
          <span className="text-xs text-muted-foreground">
            {group.memberCount} members
          </span>
          <GroupFlagsBadges flags={flags} onRemove={onRemoveFlag} />
          <StatusIndicator status={status} />
        </div>
        {status?.status === "error" && status.message && (
          <p className="mt-1 truncate text-xs text-destructive" title={status.message}>
            {status.message}
          </p>
        )}
      </div>

      <Textarea
        className={
          "hidden text-xs transition-all lg:block " +
          (note.trim()
            ? "w-40 min-h-16"
            : "w-24 min-h-8 opacity-60 hover:opacity-100 focus:w-40 focus:min-h-16 focus:opacity-100")
        }
        placeholder="Note..."
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        aria-label={`Note for ${group.name}`}
        rows={note.trim() ? 3 : 1}
      />

      <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={posted}
          onChange={onTogglePosted}
          className="size-4 cursor-pointer accent-primary"
          aria-label={`Mark ${group.name} as posted`}
        />
        <span className="hidden text-xs text-muted-foreground md:inline">Posted</span>
      </label>

      <Button
        size="sm"
        onClick={onPost}
        disabled={disabled || status?.status === "loading"}
        className="shrink-0"
      >
        {status?.status === "loading" ? (
          <RefreshCw className="animate-spin" />
        ) : (
          <Send />
        )}
        Post
      </Button>

      <GroupFlagMenuButton flags={flags} onSetFlag={onSetFlag} />

      {collections && onToggleCollection && (
        <GroupCollectionsMenuButton
          group={group}
          collections={collections}
          onToggleCollection={onToggleCollection}
        />
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        title="Copy direct group URL"
        aria-label={`Copy direct URL for ${group.name}`}
        onClick={() => copyUrl(group)}
        className="shrink-0"
      >
        <Copy />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Open group in new tab"
        aria-label={`Open ${group.name} in a new tab`}
        onClick={() => window.open(group.url, "_blank", "noopener,noreferrer")}
        className="shrink-0"
      >
        <ExternalLink />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        title={hidden ? "Unhide group" : "Hide group"}
        aria-label={hidden ? `Unhide ${group.name}` : `Hide ${group.name}`}
        onClick={onToggleHidden}
        className="shrink-0"
      >
        {hidden ? <Eye /> : <EyeOff />}
      </Button>

      {isManual && onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Remove manually added group"
          aria-label={`Remove ${group.name} from manually added groups`}
          onClick={onRemove}
          className="shrink-0 text-destructive hover:text-destructive"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  )
}

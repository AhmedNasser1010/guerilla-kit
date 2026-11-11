"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  LayoutGrid,
  List,
  ArrowUpDown,
  EyeOff,
  Eye,
  ChevronDown,
  Search,
  CheckCircle2,
  Circle,
  FolderOpen,
  LogIn,
  RefreshCw,
  Download,
  Columns3,
  X,
  StickyNote,
  Trash2,
  ListChecks,
  FolderPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { Header } from "@/components/dashboard/header"
import { StatsBar } from "@/components/dashboard/stats-bar"
import { Composer, type CollectionRunInfo } from "@/components/dashboard/composer"
import {
  GroupCard,
  GroupListItem,
  GROUP_FLAGS,
  parseMemberCount,
} from "@/components/dashboard/group-card"
import type {
  Group,
  FacebookPage,
  Collection,
  PostStatus,
  GroupDisplayStyle,
  GroupSortOrder,
  GroupFlagId,
  GroupFlagAccount,
  GroupFlagsMap,
} from "@/lib/types"
import type { ExportGroupRow } from "@/lib/excel"
import {
  EXPORT_COLUMNS,
  DEFAULT_EXPORT_COLUMNS,
  type ExportColumnKey,
} from "@/lib/export-columns"

type GroupFilter = "all" | "posted" | "remaining"

type CollectionDialogMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "manage"; collectionId: string | null }

export function Dashboard() {
  const [groups, setGroups] = React.useState<Group[]>([])
  const [manualGroups, setManualGroups] = React.useState<Group[]>([])
  const [addGroupOpen, setAddGroupOpen] = React.useState(false)
  const [addGroupUrl, setAddGroupUrl] = React.useState("")
  const [addGroupName, setAddGroupName] = React.useState("")
  const [addGroupMembers, setAddGroupMembers] = React.useState("")
  const [addGroupPrivacy, setAddGroupPrivacy] = React.useState<"public" | "private" | "unknown">("unknown")
  const [addingGroup, setAddingGroup] = React.useState(false)
  const [pages, setPages] = React.useState<FacebookPage[]>([])
  const [selectedPageId, setSelectedPageId] = React.useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)
  const [loginOpen, setLoginOpen] = React.useState(false)
  const [content, setContent] = React.useState("")
  const [imageFile, setImageFile] = React.useState<File | null>(null)
  const [postStatuses, setPostStatuses] = React.useState<Record<string, PostStatus>>({})
  const [collections, setCollections] = React.useState<Collection[]>([])
  const [activeCollectionId, setActiveCollectionId] = React.useState<string | null>(null)
  const [collectionRun, setCollectionRun] = React.useState<CollectionRunInfo | null>(null)
  const runStopRef = React.useRef(false)
  const [selectionMode, setSelectionMode] = React.useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [collectionDialog, setCollectionDialog] = React.useState<CollectionDialogMode>({ kind: "closed" })
  const [collectionNameInput, setCollectionNameInput] = React.useState("")
  const [renameCollectionId, setRenameCollectionId] = React.useState<string | null>(null)
  const [renameCollectionName, setRenameCollectionName] = React.useState("")
  const [loaded, setLoaded] = React.useState(false)
  const [loggedIn, setLoggedIn] = React.useState<boolean | null>(null)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)
  const [loginPending, setLoginPending] = React.useState(false)
  const [pageDetecting, setPageDetecting] = React.useState(false)
  const [displayStyle, setDisplayStyle] = React.useState<GroupDisplayStyle>("grid")
  const [sortOrder, setSortOrder] = React.useState<GroupSortOrder>("default")
  const [filter, setFilter] = React.useState<GroupFilter>("all")
  const [confirmRefreshOpen, setConfirmRefreshOpen] = React.useState(false)
  const [confirmEraseOpen, setConfirmEraseOpen] = React.useState(false)
  const [erasing, setErasing] = React.useState(false)
  const [progressOpen, setProgressOpen] = React.useState(false)
  const [progress, setProgress] = React.useState<{ phase: string; current: number; total: number; logs: string[]; running: boolean } | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const [confirmLogoutOpen, setConfirmLogoutOpen] = React.useState(false)
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [postedIds, setPostedIds] = React.useState<Record<string, boolean>>({})
  const [groupNotes, setGroupNotes] = React.useState<Record<string, string>>({})
  const [hiddenIds, setHiddenIds] = React.useState<Record<string, boolean>>({})
  const [groupFlags, setGroupFlags] = React.useState<Record<string, GroupFlagsMap>>({})
  const [exporting, setExporting] = React.useState(false)
  const [exportColumns, setExportColumns] = React.useState<ExportColumnKey[]>(
    DEFAULT_EXPORT_COLUMNS
  )

  function setNote(groupId: string, note: string) {
    setGroupNotes((prev) => {
      const next = { ...prev, [groupId]: note }
      try {
        window.localStorage.setItem("groupNotes", JSON.stringify(next))
      } catch {
        // localStorage unavailable — note just won't persist
      }
      return next
    })
  }

  function setGroupFlag(
    groupId: string,
    flagId: GroupFlagId,
    account: GroupFlagAccount
  ) {
    setGroupFlags((prev) => {
      const current = prev[groupId] || {}
      const accounts = current[flagId]
      let next: GroupFlagsMap
      if (GROUP_FLAGS.find((f) => f.id === flagId)?.global) {
        // global flags are not account-specific — clicking toggles them on/off
        next = { ...current }
        if (current[flagId]) {
          delete next[flagId]
        } else {
          next[flagId] = "global"
        }
      } else if (Array.isArray(accounts) && accounts.includes(account)) {
        // clicking the active account removes it from the flag
        const remaining = accounts.filter((a) => a !== account)
        next = { ...current }
        if (remaining.length > 0) {
          next[flagId] = remaining
        } else {
          delete next[flagId]
        }
      } else {
        // the same flag can be active for multiple accounts at once
        const list = Array.isArray(accounts) ? accounts : []
        next = { ...current, [flagId]: [...list, account] }
      }
      const updated = { ...prev, [groupId]: next }
      try {
        window.localStorage.setItem("groupFlags", JSON.stringify(updated))
      } catch {
        // localStorage unavailable — flags just won't persist
      }
      return updated
    })
  }

  function removeGroupFlag(groupId: string, flagId: GroupFlagId) {
    setGroupFlags((prev) => {
      const current = prev[groupId]
      if (!current || !(flagId in current)) return prev
      const next: GroupFlagsMap = { ...current }
      delete next[flagId]
      const updated = { ...prev, [groupId]: next }
      try {
        window.localStorage.setItem("groupFlags", JSON.stringify(updated))
      } catch {
        // localStorage unavailable — flags just won't persist
      }
      return updated
    })
  }

  function hideGroup(groupId: string) {
    setHiddenIds((prev) => {
      const next = { ...prev, [groupId]: true }
      try {
        window.localStorage.setItem("hiddenGroupIds", JSON.stringify(next))
      } catch {
        // localStorage unavailable — hide just won't persist
      }
      return next
    })
    if (selectedGroupId === groupId) setSelectedGroupId(null)
    toast.success("Group hidden")
  }

  function unhideGroup(groupId: string) {
    setHiddenIds((prev) => {
      const next = { ...prev, [groupId]: false }
      try {
        window.localStorage.setItem("hiddenGroupIds", JSON.stringify(next))
      } catch {
        // localStorage unavailable — unhide just won't persist
      }
      return next
    })
  }

  function togglePosted(groupId: string) {
    setPostedIds((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] }
      try {
        window.localStorage.setItem("postedGroupIds", JSON.stringify(next))
      } catch {
        // localStorage unavailable — checkbox just won't persist
      }
      return next
    })
  }

  function updateSortOrder(order: GroupSortOrder) {
    setSortOrder(order)
    try {
      window.localStorage.setItem("groupSortOrder", order)
    } catch {
      // localStorage unavailable — order just won't persist
    }
  }

  function updateDisplayStyle(style: GroupDisplayStyle) {
    setDisplayStyle(style)
    try {
      window.localStorage.setItem("groupDisplayStyle", style)
    } catch {
      // localStorage unavailable — style just won't persist
    }
  }

  function persistExportColumns(columns: ExportColumnKey[]) {
    try {
      window.localStorage.setItem("exportColumns", JSON.stringify(columns))
    } catch {
      // localStorage unavailable — column selection just won't persist
    }
  }

  function toggleExportColumn(key: ExportColumnKey) {
    setExportColumns((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : EXPORT_COLUMNS.filter((c) => prev.includes(c.key) || c.key === key).map(
            (c) => c.key
          )
      persistExportColumns(next)
      return next
    })
  }

  function resetExportColumns() {
    setExportColumns(DEFAULT_EXPORT_COLUMNS)
    persistExportColumns(DEFAULT_EXPORT_COLUMNS)
  }

  React.useEffect(() => {
    let cancelled = false
    async function init() {
      const [cacheRes, authRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/auth"),
      ])

      const cache = await cacheRes.json()
      const auth = await authRes.json()

      if (cancelled) return

      setGroups(cache.groups || [])
      setManualGroups(cache.manualGroups || [])
      setCollections(cache.collections || [])
      setPages(cache.pages || [])
      setSelectedPageId(cache.selectedPageId || null)
      setLastUpdated(cache.lastUpdated || null)
      setLoggedIn(auth.loggedIn)

      try {
        const savedStyle = window.localStorage.getItem("groupDisplayStyle")
        if (savedStyle === "grid" || savedStyle === "list") {
          setDisplayStyle(savedStyle)
        }
        const savedOrder = window.localStorage.getItem("groupSortOrder")
        if (
          savedOrder === "default" ||
          savedOrder === "followers-desc" ||
          savedOrder === "followers-asc" ||
          savedOrder === "name-asc"
        ) {
          setSortOrder(savedOrder)
        }
        const savedPosted = window.localStorage.getItem("postedGroupIds")
        if (savedPosted) {
          const parsed = JSON.parse(savedPosted)
          if (parsed && typeof parsed === "object") {
            setPostedIds(parsed as Record<string, boolean>)
          }
        }
        const savedNotes = window.localStorage.getItem("groupNotes")
        if (savedNotes) {
          const parsed = JSON.parse(savedNotes)
          if (parsed && typeof parsed === "object") {
            setGroupNotes(parsed as Record<string, string>)
          }
        }
        const savedHidden = window.localStorage.getItem("hiddenGroupIds")
        if (savedHidden) {
          const parsed = JSON.parse(savedHidden)
          if (parsed && typeof parsed === "object") {
            setHiddenIds(parsed as Record<string, boolean>)
          }
        }
        const savedExportColumns = window.localStorage.getItem("exportColumns")
        if (savedExportColumns) {
          const parsed = JSON.parse(savedExportColumns)
          if (Array.isArray(parsed)) {
            const valid = parsed.filter((k): k is ExportColumnKey =>
              EXPORT_COLUMNS.some((c) => c.key === k)
            )
            if (valid.length > 0) setExportColumns(valid)
          }
        }
        const savedFlags = window.localStorage.getItem("groupFlags")
        if (savedFlags) {
          const parsed = JSON.parse(savedFlags)
          if (parsed && typeof parsed === "object") {
            // migrate old formats to the multi-account map
            const migrated: Record<string, GroupFlagsMap> = {}
            for (const [gid, value] of Object.entries(parsed)) {
              if (Array.isArray(value)) {
                migrated[gid] = Object.fromEntries(
                  (value as string[]).map((id) => [id, ["personal"]])
                )
              } else if (value && typeof value === "object") {
                const flags: GroupFlagsMap = {}
                for (const [fid, acc] of Object.entries(
                  value as Record<string, unknown>
                )) {
                  if (Array.isArray(acc)) {
                    // global flags used to be stored per-account — migrate to "global"
                    flags[fid as GroupFlagId] = GROUP_FLAGS.find(
                      (f) => f.id === fid
                    )?.global
                      ? "global"
                      : (acc as GroupFlagAccount[])
                  } else if (acc === "page" || acc === "personal") {
                    // old single-account format
                    flags[fid as GroupFlagId] = [acc]
                  }
                }
                migrated[gid] = flags
              }
            }
            setGroupFlags(migrated)
          }
        }
      } catch {
        // localStorage unavailable — keep defaults
      }

      setLoaded(true)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  async function refreshGroups(backup: boolean) {
    setRefreshing(true)
    setProgressOpen(true)
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller
    const poll = setInterval(async () => {
      try {
        const r = await fetch("/api/groups/progress")
        if (r.ok) setProgress(await r.json())
      } catch {}
    }, 500)
    setConfirmRefreshOpen(false)
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup }),
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to refresh groups")
        return
      }

      setGroups(data.groups)
      setManualGroups(data.manualGroups || [])
      setCollections(data.collections || [])
      setPages(data.pages)
      setLastUpdated(data.lastUpdated)
      toast.success(
        `Loaded ${data.groups.length} groups${backup ? " (old cache backed up)" : ""}`
      )
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.info("Refresh aborted")
      } else {
        toast.error("Failed to refresh groups")
      }
    } finally {
      clearInterval(poll)
      abortRef.current = null
      setRefreshing(false)
      // Keep the dialog open so logs are not lost; user closes it manually.
    }
  }

  async function addManualGroup() {
    const url = addGroupUrl.trim()
    if (!url) {
      toast.error("Please enter a group URL")
      return
    }
    setAddingGroup(true)
    try {
      const res = await fetch("/api/groups/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          name: addGroupName.trim() || undefined,
          memberCount: addGroupMembers.trim() || undefined,
          privacy: addGroupPrivacy,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to add group")
        return
      }
      setGroups(data.groups || [])
      setManualGroups(data.manualGroups || [])
      setCollections(data.collections || [])
      setAddGroupOpen(false)
      setAddGroupUrl("")
      setAddGroupName("")
      setAddGroupMembers("")
      setAddGroupPrivacy("unknown")
      toast.success("Group added manually — it will be kept across refreshes")
    } catch {
      toast.error("Failed to add group")
    } finally {
      setAddingGroup(false)
    }
  }

  async function removeManualGroup(groupId: string) {
    try {
      const res = await fetch("/api/groups/manual", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to remove group")
        return
      }
      setManualGroups(data.manualGroups || [])
      setCollections(data.collections || [])
      if (selectedGroupId === groupId) setSelectedGroupId(null)
      toast.success("Manually added group removed")
    } catch {
      toast.error("Failed to remove group")
    }
  }

  async function logout() {
    setLoggingOut(true)
    setConfirmLogoutOpen(false)
    try {
      const res = await fetch("/api/auth", { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to log out")
        return
      }
      setLoggedIn(false)
      setSelectedPageId(null)
      toast.success("Logged out of Facebook")
    } catch {
      toast.error("Failed to log out")
    } finally {
      setLoggingOut(false)
    }
  }

  async function eraseAll(doLogout: boolean) {
    setErasing(true)
    try {
      const res = await fetch("/api/groups", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logout: doLogout }),
      })
      if (!res.ok) throw new Error("Failed to erase")
      toast.success(doLogout ? "All data erased and logged out" : "All data erased")
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to erase")
    } finally {
      setErasing(false)
      setConfirmEraseOpen(false)
    }
  }

  async function openLogin() {
    setLoginPending(true)
    setLoginOpen(true)
    try {
      const res = await fetch("/api/auth", { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to open login")
        setLoginOpen(false)
        return
      }

      toast.info(
        "A browser window opened. Please log in to Facebook in it.",
        { duration: 8000 }
      )

      const checkInterval = setInterval(async () => {
        const authRes = await fetch("/api/auth")
        const auth = await authRes.json()
        if (auth.loggedIn) {
          clearInterval(checkInterval)
          setLoggedIn(true)
          setLoginOpen(false)
          toast.success("Logged in to Facebook!")
          setLoginPending(false)
        }
      }, 5000)

      setTimeout(() => {
        clearInterval(checkInterval)
        setLoginPending(false)
      }, 300000)
    } catch {
      toast.error("Failed to open login browser")
      setLoginOpen(false)
      setLoginPending(false)
    }
  }

  async function detectPages() {
    setPageDetecting(true)
    try {
      const res = await fetch("/api/pages", { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to detect pages")
        return
      }

      setPages(data.pages)

      if (data.pages.length === 0) {
        const note = data.diagnostics?.note
        toast.info(
          note
            ? `Page detection failed: ${note}`
            : "No Pages found. You will post as your personal profile.",
          { duration: 8000 }
        )
      } else {
        toast.success(`Found ${data.pages.length} Pages`)
      }
    } catch {
      toast.error("Failed to detect pages")
    } finally {
      setPageDetecting(false)
    }
  }

  async function selectPage(pageId: string | null) {
    setSelectedPageId(pageId)
    try {
      await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", pageId }),
      })
      toast.success(pageId ? "Page selected" : "Posting as personal profile")
    } catch {
      toast.error("Failed to save page preference")
    }
  }

  // Scraped groups + manually added groups (scraped wins on id collision)
  const allGroups = React.useMemo(() => {
    const ids = new Set(groups.map((g) => g.id))
    return [...groups, ...manualGroups.filter((g) => !ids.has(g.id))]
  }, [groups, manualGroups])

  async function doPost(group: Group): Promise<boolean> {
    setPostStatuses((prev) => ({
      ...prev,
      [group.id]: { groupId: group.id, status: "loading" },
    }))

    try {
      const formData = new FormData()
      formData.append("groupUrl", group.url)
      formData.append("text", content)
      if (imageFile) {
        formData.append("image", imageFile)
      }

      const res = await fetch("/api/post", {
        method: "POST",
        body: formData,
      })

      const result = await res.json()

      if (!res.ok) {
        setPostStatuses((prev) => ({
          ...prev,
          [group.id]: {
            groupId: group.id,
            status: "error",
            message: result.error || "Failed to post",
          },
        }))
        toast.error(result.error || "Failed to post")
        return false
      }

      if (result.success) {
        setPostStatuses((prev) => ({
          ...prev,
          [group.id]: {
            groupId: group.id,
            status: "success",
            message: result.message,
          },
        }))
        toast.success("Post published to " + group.name)
        return true
      } else {
        setPostStatuses((prev) => ({
          ...prev,
          [group.id]: {
            groupId: group.id,
            status: "error",
            message: result.message,
          },
        }))
        toast.error(result.message || "Failed to post")
        return false
      }
    } catch {
      setPostStatuses((prev) => ({
        ...prev,
        [group.id]: { groupId: group.id, status: "error", message: "Network error" },
      }))
      toast.error("Network error while posting")
      return false
    }
  }

  async function postToGroup(group: Group) {
    const existingStatus = postStatuses[group.id]
    if (existingStatus?.status === "loading") return

    setSelectedGroupId(group.id)
    await doPost(group)
  }

  // --- Collections ---

  async function collectionAction(
    body: Record<string, unknown>,
    successMsg?: string
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to update collections")
        return false
      }
      setCollections(data.collections || [])
      if (successMsg) toast.success(successMsg)
      return true
    } catch {
      toast.error("Failed to update collections")
      return false
    }
  }

  function toggleCollectionMember(groupId: string, collectionId: string) {
    const collection = collections.find((c) => c.id === collectionId)
    if (!collection) return
    const isMember = collection.groupIds.includes(groupId)
    return collectionAction({
      action: isMember ? "removeGroups" : "addGroups",
      id: collectionId,
      groupIds: [groupId],
    })
  }

  function toggleGroupSelection(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedGroupIds(new Set())
  }

  async function addSelectedToCollection(collectionId: string) {
    const ids = [...selectedGroupIds]
    if (ids.length === 0) {
      toast.error("No groups selected")
      return
    }
    const ok = await collectionAction(
      { action: "addGroups", id: collectionId, groupIds: ids },
      `Added ${ids.length} groups to the collection`
    )
    if (ok) exitSelectionMode()
  }

  async function createCollection() {
    const name = collectionNameInput.trim()
    if (!name) {
      toast.error("Please enter a collection name")
      return
    }
    const ok = await collectionAction({ action: "create", name })
    if (ok) {
      setCollectionNameInput("")
      if (collectionDialog.kind === "create") setCollectionDialog({ kind: "closed" })
    }
  }

  async function renameCollection(collectionId: string) {
    const name = renameCollectionName.trim()
    if (!name) {
      toast.error("Please enter a collection name")
      return
    }
    const ok = await collectionAction({ action: "rename", id: collectionId, name })
    if (ok) setRenameCollectionId(null)
  }

  function deleteCollection(collectionId: string) {
    const collection = collections.find((c) => c.id === collectionId)
    if (!collection) return
    if (!window.confirm(`Delete collection "${collection.name}"? Groups themselves are not removed.`)) return
    if (activeCollectionId === collectionId) setActiveCollectionId(null)
    return collectionAction({ action: "delete", id: collectionId }, "Collection deleted")
  }

  function stopCollectionRun() {
    runStopRef.current = true
  }

  async function postToCollection(collectionId: string, skipPosted: boolean) {
    if (collectionRun) return
    if (!content.trim()) {
      toast.error("Write your post content first")
      return
    }

    const collection = collections.find((c) => c.id === collectionId)
    if (!collection) {
      toast.error("Collection not found")
      return
    }

    const members = collection.groupIds
      .map((id) => allGroups.find((g) => g.id === id))
      .filter((g): g is Group => !!g && !hiddenIds[g.id])
    if (members.length === 0) {
      toast.error("This collection has no groups in your list")
      return
    }

    const targets: Group[] = []
    let skipped = 0
    if (skipPosted) {
      members.forEach((g) => {
        if (postedIds[g.id]) skipped++
        else targets.push(g)
      })
    } else {
      targets.push(...members)
    }

    if (targets.length === 0) {
      toast.info(
        `All ${members.length} groups in "${collection.name}" are already marked as posted`
      )
      return
    }

    runStopRef.current = false
    const run: CollectionRunInfo = {
      collectionId: collection.id,
      name: collection.name,
      current: 0,
      total: targets.length,
      success: 0,
      failed: 0,
      skipped,
    }
    setCollectionRun(run)

    let success = 0
    let failed = 0
    let stopped = false
    for (let i = 0; i < targets.length; i++) {
      if (runStopRef.current) {
        stopped = true
        break
      }
      setCollectionRun((prev) => (prev ? { ...prev, current: i + 1 } : prev))
      const ok = await doPost(targets[i])
      if (ok) success++
      else failed++
      setCollectionRun((prev) =>
        prev ? { ...prev, success, failed, skipped } : prev
      )
    }

    setCollectionRun(null)

    const summary = `Collection "${collection.name}": ${success} posted, ${failed} failed${
      skipped ? `, ${skipped} skipped (already posted)` : ""
    }`
    if (stopped) toast.info(summary + " — stopped early")
    else if (failed === 0) toast.success(summary)
    else toast.error(summary)
  }

  const visibleGroups = allGroups.filter((g) => !hiddenIds[g.id])
  const hiddenGroups = allGroups.filter((g) => hiddenIds[g.id])
  const manualIds = React.useMemo(
    () => new Set(manualGroups.map((g) => g.id)),
    [manualGroups]
  )

  const activeCollection =
    collections.find((c) => c.id === activeCollectionId) || null
  const activeCollectionMemberIds = React.useMemo(
    () => new Set(activeCollection?.groupIds || []),
    [activeCollection]
  )

  const filteredGroups = sortGroups(
    visibleGroups.filter((g) => {
      if (
        activeCollection &&
        !activeCollectionMemberIds.has(g.id)
      )
        return false
      const matchesSearch = g.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false
      if (filter === "posted") return !!postedIds[g.id]
      if (filter === "remaining") return !postedIds[g.id]
      return true
    }),
    sortOrder
  )

  const hiddenDisplayGroups = sortGroups(
    hiddenGroups.filter((g) =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    sortOrder
  )

  const selectedGroup = allGroups.find((g) => g.id === selectedGroupId) || null
  const posting =
    !!selectedGroup && postStatuses[selectedGroup.id]?.status === "loading"
  const postedCount = Object.values(postedIds).filter(Boolean).length
  const totalReach = visibleGroups.reduce(
    (sum, g) => sum + parseMemberCount(g.memberCount),
    0
  )

  function buildExportRows(): ExportGroupRow[] {
    return filteredGroups.map((group, index) => {
      const flags = groupFlags[group.id] || {}
      const flagEntries = GROUP_FLAGS.filter((f) => flags[f.id]).map((f) => {
        const value = flags[f.id]
        let accountLabel: string
        if (f.global || value === "global") {
          accountLabel = "All"
        } else {
          const accounts = (value as GroupFlagAccount[]) || []
          accountLabel = accounts
            .map((a) => (a === "page" ? "Page" : "Personal"))
            .join(" + ")
        }
        return { id: f.id, label: f.label, accountLabel }
      })
      return {
        index: index + 1,
        name: group.name,
        privacy: group.privacy,
        memberCount: group.memberCount,
        posted: !!postedIds[group.id],
        hidden: !!hiddenIds[group.id],
        manual: manualIds.has(group.id),
        flags: flagEntries,
        note: groupNotes[group.id] || "",
        url: group.url,
      }
    })
  }

  async function exportGroups() {
    const rows = buildExportRows()
    if (rows.length === 0) {
      toast.error("No groups to export")
      return
    }
    if (exportColumns.length === 0) {
      toast.error("Select at least one column to export")
      return
    }
    setExporting(true)
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, columns: exportColumns }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to export groups")
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `fb-groups-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${rows.length} groups to Excel`)
    } catch {
      toast.error("Failed to export groups")
    } finally {
      setExporting(false)
    }
  }

  const filterOptions: { value: GroupFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "all", label: "All", icon: List },
    { value: "posted", label: "Posted", icon: CheckCircle2 },
    { value: "remaining", label: "Remaining", icon: Circle },
  ]

  return (
    <div className="relative min-h-screen">
      {/* decorative hero background */}
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-72"
      />

      <Header
        loggedIn={loggedIn}
        loginOpen={loginOpen}
        loginPending={loginPending}
        loggingOut={loggingOut}
        refreshing={refreshing}
        pages={pages}
        selectedPageId={selectedPageId}
        onLogin={openLogin}
        onLogoutRequest={() => setConfirmLogoutOpen(true)}
        onSelectPage={selectPage}
        onDetectPages={detectPages}
        pageDetecting={pageDetecting}
        onRefresh={() => setConfirmRefreshOpen(true)}
        onAddGroup={() => setAddGroupOpen(true)}
        onEraseAll={() => setConfirmEraseOpen(true)}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      <main className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {!loaded ? (
          <LoadingState />
        ) : (
          <>
            <StatsBar
              loading={false}
              totalGroups={visibleGroups.length}
              postedCount={postedCount}
              errors={0}
              totalMembers={totalReach}
            />

            <Composer
              content={content}
              setContent={setContent}
              imageFile={imageFile}
              setImageFile={setImageFile}
              selectedGroup={selectedGroup}
              posting={posting}
              postStatus={
                selectedGroup ? postStatuses[selectedGroup.id] : undefined
              }
              onPost={() => selectedGroup && postToGroup(selectedGroup)}
              disabled={!loggedIn || (!!selectedGroupId && !selectedGroup)}
              groupId={selectedGroupId}
              onClearSelection={() => setSelectedGroupId(null)}
              collections={collections}
              onPostToCollection={postToCollection}
              collectionRun={collectionRun}
              onStopRun={stopCollectionRun}
            />

            <Separator className="my-8" />

            {/* toolbar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative md:hidden">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search groups..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-40 pl-8"
                  />
                </div>

                <div
                  className="flex items-center rounded-full border bg-card p-0.5"
                  role="group"
                  aria-label="Filter groups"
                >
                  {filterOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                      className={
                        "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors " +
                        (filter === value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      <Icon className="size-3" />
                      {label}
                    </button>
                  ))}
                </div>

                {activeCollection && (
                  <button
                    onClick={() => setActiveCollectionId(null)}
                    title="Clear collection filter"
                    className="flex h-7 items-center gap-1.5 rounded-full border bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <FolderOpen className="size-3" />
                    <span className="max-w-32 truncate">{activeCollection.name}</span>
                    <X className="size-3" />
                  </button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" />}
                  >
                    <ArrowUpDown />
                    Sort
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => updateSortOrder("default")}>
                        Default {sortOrder === "default" && "✓"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateSortOrder("followers-desc")}
                      >
                        Followers (high → low) {sortOrder === "followers-desc" && "✓"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateSortOrder("followers-asc")}
                      >
                        Followers (low → high) {sortOrder === "followers-asc" && "✓"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSortOrder("name-asc")}>
                        Name (A → Z) {sortOrder === "name-asc" && "✓"}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting || filteredGroups.length === 0}
                  onClick={exportGroups}
                  title="Export the current groups to a styled Excel file"
                >
                  <Download />
                  {exporting ? "Exporting…" : "Export"}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" />}
                    title="Choose which columns to include in the export"
                  >
                    <Columns3 />
                    Columns
                    <Badge
                      variant="secondary"
                      className="ml-0.5 h-4 px-1 text-[10px] tabular-nums"
                    >
                      {exportColumns.length}/{EXPORT_COLUMNS.length}
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Export columns</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {EXPORT_COLUMNS.map((col) => (
                        <DropdownMenuCheckboxItem
                          key={col.key}
                          checked={exportColumns.includes(col.key)}
                          closeOnClick={false}
                          onCheckedChange={() => toggleExportColumn(col.key)}
                        >
                          {col.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={resetExportColumns}>
                      Reset to default
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" />}
                  >
                    <FolderOpen />
                    Collections
                    <Badge
                      variant="secondary"
                      className="ml-0.5 h-4 px-1 text-[10px] tabular-nums"
                    >
                      {collections.length}
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Filter by collection</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {collections.length === 0 ? (
                        <DropdownMenuItem disabled>
                          No collections yet
                        </DropdownMenuItem>
                      ) : (
                        collections.map((collection) => (
                          <DropdownMenuItem
                            key={collection.id}
                            onClick={() =>
                              setActiveCollectionId(
                                activeCollectionId === collection.id
                                  ? null
                                  : collection.id
                              )
                            }
                          >
                            {activeCollectionId === collection.id && "✓ "}
                            {collection.name}
                            <span className="ml-auto text-xs text-muted-foreground">
                              {collection.groupIds.length}
                            </span>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setCollectionNameInput("")
                        setCollectionDialog({ kind: "create" })
                      }}
                    >
                      New collection…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameCollectionId(null)
                        setCollectionDialog({
                          kind: "manage",
                          collectionId: activeCollectionId,
                        })
                      }}
                      disabled={collections.length === 0}
                    >
                      Manage collections
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div
                  className="flex items-center rounded-full border bg-card p-0.5"
                  role="group"
                  aria-label="Group display style"
                >
                  <Button
                    variant={displayStyle === "grid" ? "secondary" : "ghost"}
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="Grid view"
                    aria-pressed={displayStyle === "grid"}
                    onClick={() => updateDisplayStyle("grid")}
                  >
                    <LayoutGrid />
                  </Button>
                  <Button
                    variant={displayStyle === "list" ? "secondary" : "ghost"}
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="List view"
                    aria-pressed={displayStyle === "list"}
                    onClick={() => updateDisplayStyle("list")}
                  >
                    <List />
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={selectionMode}
                  onClick={() => {
                    if (selectionMode) exitSelectionMode()
                    else setSelectionMode(true)
                  }}
                  title="Select multiple groups, then add them all to a collection at once"
                >
                  <ListChecks />
                  Select
                </Button>

                {selectionMode && (
                  <>
                    <Badge
                      variant="secondary"
                      className="tabular-nums"
                      title="Selected groups"
                    >
                      {selectedGroupIds.size} selected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filteredGroups.length === 0}
                      onClick={() =>
                        setSelectedGroupIds(
                          new Set(filteredGroups.map((g) => g.id))
                        )
                      }
                      title="Select every group matching the current search/filter"
                    >
                      <CheckCircle2 />
                      Select all ({filteredGroups.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedGroupIds.size === 0}
                      onClick={() => setSelectedGroupIds(new Set())}
                    >
                      Clear
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="sm"
                            disabled={
                              selectedGroupIds.size === 0 ||
                              collections.length === 0
                            }
                            title={
                              collections.length === 0
                                ? "Create a collection first from the Collections menu"
                                : "Add the selected groups to a collection"
                            }
                          />
                        }
                      >
                        <FolderPlus />
                        Add to collection
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-56">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>
                            Add {selectedGroupIds.size} group
                            {selectedGroupIds.size === 1 ? "" : "s"} to…
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {collections.map((collection) => (
                            <DropdownMenuItem
                              key={collection.id}
                              onClick={() =>
                                addSelectedToCollection(collection.id)
                              }
                            >
                              {collection.name}
                              <span className="ml-auto text-xs text-muted-foreground">
                                {collection.groupIds.length}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
                      Done
                    </Button>
                  </>
                )}
              </div>

              {lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Updated {formatDate(lastUpdated)}
                </span>
              )}
            </div>

            {!loggedIn && (
              <Card className="mb-6 border-dashed shadow-none">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <LogIn className="size-5" />
                  </div>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Connect your Facebook session to start posting to your
                    groups. A browser window will open for a one-time login.
                  </p>
                  <Button onClick={openLogin} disabled={loginPending} className="shadow-md shadow-primary/20">
                    <LogIn />
                    {loginPending ? "Opening browser..." : "Login with Facebook"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {groups.length === 0 && loggedIn ? (
              <Card className="mb-6 border-dashed shadow-none">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">
                    No groups cached yet. Click &quot;Refresh List&quot; to
                    fetch your joined groups.
                  </p>
                  <Button onClick={() => refreshGroups(false)} disabled={refreshing}>
                    <RefreshCw className={refreshing ? "animate-spin" : ""} />
                    Fetch Groups
                  </Button>
                </CardContent>
              </Card>
            ) : displayStyle === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredGroups.map((group, index) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    index={index + 1}
                    posted={!!postedIds[group.id]}
                    onTogglePosted={() => togglePosted(group.id)}
                    status={postStatuses[group.id]}
                    isSelected={selectedGroupId === group.id}
                    disabled={!loggedIn || refreshing}
                    onPost={() => postToGroup(group)}
                    note={groupNotes[group.id] || ""}
                    onNoteChange={(v) => setNote(group.id, v)}
                    hidden={false}
                    onToggleHidden={() => hideGroup(group.id)}
                    flags={groupFlags[group.id] || {}}
                    onSetFlag={(f, a) => setGroupFlag(group.id, f, a)}
                    onRemoveFlag={(f) => removeGroupFlag(group.id, f)}
                              onSelect={() =>
                                 selectionMode
                                   ? toggleGroupSelection(group.id)
                                   : setSelectedGroupId(group.id)
                               }
                              isManual={manualIds.has(group.id)}
                              onRemove={() => removeManualGroup(group.id)}
                               collections={collections}
                               onToggleCollection={(cid) =>
                                 toggleCollectionMember(group.id, cid)
                               }
                               showSelection={selectionMode}
                               selectionChecked={selectedGroupIds.has(group.id)}
                               onToggleSelect={() =>
                                 toggleGroupSelection(group.id)
                               }
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredGroups.map((group, index) => (
                  <GroupListItem
                    key={group.id}
                    group={group}
                    index={index + 1}
                    posted={!!postedIds[group.id]}
                    onTogglePosted={() => togglePosted(group.id)}
                    status={postStatuses[group.id]}
                    isSelected={selectedGroupId === group.id}
                    disabled={!loggedIn || refreshing}
                    onPost={() => postToGroup(group)}
                    note={groupNotes[group.id] || ""}
                    onNoteChange={(v) => setNote(group.id, v)}
                    hidden={false}
                    onToggleHidden={() => hideGroup(group.id)}
                    flags={groupFlags[group.id] || {}}
                    onSetFlag={(f, a) => setGroupFlag(group.id, f, a)}
                    onRemoveFlag={(f) => removeGroupFlag(group.id, f)}
                              onSelect={() =>
                                 selectionMode
                                   ? toggleGroupSelection(group.id)
                                   : setSelectedGroupId(group.id)
                               }
                              isManual={manualIds.has(group.id)}
                              onRemove={() => removeManualGroup(group.id)}
                               collections={collections}
                               onToggleCollection={(cid) =>
                                 toggleCollectionMember(group.id, cid)
                               }
                               showSelection={selectionMode}
                               selectionChecked={selectedGroupIds.has(group.id)}
                               onToggleSelect={() =>
                                 toggleGroupSelection(group.id)
                               }
                  />
                ))}
              </div>
            )}

            {filteredGroups.length === 0 && allGroups.length > 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No groups match your search or filter.
              </p>
            )}

            {hiddenGroups.length > 0 && (
              <>
                <Separator className="my-8" />
                <Accordion defaultValue={["hidden"]} keepMounted>
                  <AccordionItem value="hidden">
                    <AccordionTrigger>
                      <span className="flex min-w-0 items-center gap-2">
                        <EyeOff className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-semibold">Hidden groups</span>
                        <Badge variant="secondary">{hiddenGroups.length}</Badge>
                      </span>
                      <ChevronDown className="size-4 shrink-0 transition-transform group-data-panel-open/accordion-item:rotate-180" />
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="mb-2 flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            hiddenGroups.forEach((g) => unhideGroup(g.id))
                          }
                        >
                          <Eye />
                          Unhide all
                        </Button>
                      </div>
                      {hiddenDisplayGroups.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No hidden groups match &quot;{searchQuery}&quot;
                        </p>
                      ) : displayStyle === "grid" ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {hiddenDisplayGroups.map((group, index) => (
                            <GroupCard
                              key={group.id}
                              group={group}
                              index={index + 1}
                              posted={!!postedIds[group.id]}
                              onTogglePosted={() => togglePosted(group.id)}
                              status={postStatuses[group.id]}
                              isSelected={selectedGroupId === group.id}
                              disabled={!loggedIn || refreshing}
                              onPost={() => postToGroup(group)}
                              note={groupNotes[group.id] || ""}
                              onNoteChange={(v) => setNote(group.id, v)}
                              hidden={true}
                              onToggleHidden={() => unhideGroup(group.id)}
                              flags={groupFlags[group.id] || {}}
                              onSetFlag={(f, a) => setGroupFlag(group.id, f, a)}
                              onRemoveFlag={(f) => removeGroupFlag(group.id, f)}
                              onSelect={() =>
                                 selectionMode
                                   ? toggleGroupSelection(group.id)
                                   : setSelectedGroupId(group.id)
                               }
                              isManual={manualIds.has(group.id)}
                              onRemove={() => removeManualGroup(group.id)}
                               collections={collections}
                               onToggleCollection={(cid) =>
                                 toggleCollectionMember(group.id, cid)
                               }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {hiddenDisplayGroups.map((group, index) => (
                            <GroupListItem
                              key={group.id}
                              group={group}
                              index={index + 1}
                              posted={!!postedIds[group.id]}
                              onTogglePosted={() => togglePosted(group.id)}
                              status={postStatuses[group.id]}
                              isSelected={selectedGroupId === group.id}
                              disabled={!loggedIn || refreshing}
                              onPost={() => postToGroup(group)}
                              note={groupNotes[group.id] || ""}
                              onNoteChange={(v) => setNote(group.id, v)}
                              hidden={true}
                              onToggleHidden={() => unhideGroup(group.id)}
                              flags={groupFlags[group.id] || {}}
                              onSetFlag={(f, a) => setGroupFlag(group.id, f, a)}
                              onRemoveFlag={(f) => removeGroupFlag(group.id, f)}
                              onSelect={() =>
                                 selectionMode
                                   ? toggleGroupSelection(group.id)
                                   : setSelectedGroupId(group.id)
                               }
                              isManual={manualIds.has(group.id)}
                              onRemove={() => removeManualGroup(group.id)}
                               collections={collections}
                               onToggleCollection={(cid) =>
                                 toggleCollectionMember(group.id, cid)
                               }
                            />
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
          </>
        )}
      </main>

      {/* add group manually dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a group manually</DialogTitle>
            <DialogDescription>
              Paste a Facebook group URL (and optionally a name). Manually
              added groups are kept even when you refresh the scraped group
              cache.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="https://www.facebook.com/groups/your-group"
              value={addGroupUrl}
              onChange={(e) => setAddGroupUrl(e.target.value)}
              aria-label="Group URL"
            />
            <Input
              placeholder="Group name (optional)"
              value={addGroupName}
              onChange={(e) => setAddGroupName(e.target.value)}
              aria-label="Group name"
            />
            <div className="flex gap-3">
              <Input
                placeholder="Members (e.g. 12.5K)"
                value={addGroupMembers}
                onChange={(e) => setAddGroupMembers(e.target.value)}
                aria-label="Member count"
                className="flex-1"
              />
              <select
                value={addGroupPrivacy}
                onChange={(e) =>
                  setAddGroupPrivacy(
                    e.target.value as "public" | "private" | "unknown"
                  )
                }
                aria-label="Privacy"
                className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="unknown">Privacy: unknown</option>
                <option value="public">Privacy: public</option>
                <option value="private">Privacy: private</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddGroupOpen(false)}
              disabled={addingGroup}
            >
              Cancel
            </Button>
            <Button onClick={addManualGroup} disabled={addingGroup}>
              {addingGroup ? "Adding..." : "Add group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* create collection dialog */}
      <Dialog
        open={collectionDialog.kind === "create"}
        onOpenChange={(open) => {
          if (!open) setCollectionDialog({ kind: "closed" })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              A collection bundles groups together (e.g. &quot;العياط&quot;,
              &quot;برنشت&quot;) so you can post to all of them with one
              click. Add groups to it afterwards from each group&apos;s
              collections menu.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Collection name"
            value={collectionNameInput}
            onChange={(e) => setCollectionNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createCollection()
            }}
            aria-label="Collection name"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCollectionDialog({ kind: "closed" })}
            >
              Cancel
            </Button>
            <Button onClick={createCollection} disabled={!collectionNameInput.trim()}>
              Create collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* manage collections dialog */}
      <Dialog
        open={collectionDialog.kind === "manage"}
        onOpenChange={(open) => {
          if (!open) {
            setRenameCollectionId(null)
            setCollectionDialog({ kind: "closed" })
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage collections</DialogTitle>
            <DialogDescription>
              Create, rename or delete collections, and pick which groups
              belong to them. Click a collection to edit its members.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* create row */}
            <div className="flex gap-2">
              <Input
                placeholder="New collection name"
                value={collectionNameInput}
                onChange={(e) => setCollectionNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createCollection()
                }}
                aria-label="New collection name"
              />
              <Button
                onClick={createCollection}
                disabled={!collectionNameInput.trim()}
              >
                Create
              </Button>
            </div>

            {/* collections list */}
            <div className="max-h-40 space-y-1 overflow-auto rounded border p-2">
              {collections.length === 0 && (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No collections yet.
                </p>
              )}
              {collections.map((collection) => {
                const isSelected =
                  collectionDialog.kind === "manage" &&
                  collectionDialog.collectionId === collection.id
                if (renameCollectionId === collection.id) {
                  return (
                    <div key={collection.id} className="flex items-center gap-2 py-1">
                      <Input
                        value={renameCollectionName}
                        onChange={(e) => setRenameCollectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameCollection(collection.id)
                        }}
                        aria-label={`New name for ${collection.name}`}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => renameCollection(collection.id)}>
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRenameCollectionId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )
                }
                return (
                  <div
                    key={collection.id}
                    className={
                      "flex items-center gap-2 rounded px-2 py-1 " +
                      (isSelected ? "bg-primary/10" : "hover:bg-muted/60")
                    }
                  >
                    <button
                      className="min-w-0 flex-1 truncate text-left text-sm"
                      title={collection.name}
                      onClick={() => {
                        if (collectionDialog.kind === "manage") {
                          setCollectionDialog({
                            kind: "manage",
                            collectionId: isSelected ? null : collection.id,
                          })
                        }
                      }}
                    >
                      {collection.name}
                    </button>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {collection.groupIds.length}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Rename collection"
                      aria-label={`Rename ${collection.name}`}
                      onClick={() => {
                        setRenameCollectionId(collection.id)
                        setRenameCollectionName(collection.name)
                      }}
                    >
                      <StickyNote />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete collection"
                      aria-label={`Delete ${collection.name}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteCollection(collection.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
            </div>

            {/* members editor for the selected collection */}
            {collectionDialog.kind === "manage" &&
              collectionDialog.collectionId && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Members of{" "}
                    {collections.find(
                      (c) => c.id === collectionDialog.collectionId
                    )?.name || ""}
                  </p>
                  <div className="max-h-64 overflow-auto rounded border p-2">
                    {allGroups.map((group) => {
                      const collection = collections.find(
                        (c) => c.id === collectionDialog.collectionId
                      )
                      const isMember = !!collection?.groupIds.includes(group.id)
                      return (
                        <label
                          key={group.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() =>
                              toggleCollectionMember(
                                group.id,
                                collectionDialog.collectionId!
                              )
                            }
                            className="size-3.5 cursor-pointer accent-primary"
                            aria-label={`Toggle ${group.name} in collection`}
                          />
                          <span className="truncate">{group.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameCollectionId(null)
                setCollectionDialog({ kind: "closed" })
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirm refresh dialog */}
      <Dialog open={confirmRefreshOpen} onOpenChange={setConfirmRefreshOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refresh group list?</DialogTitle>
            <DialogDescription>
              This re-scrapes your groups with the browser. It can take a
              while, and Facebook may temporarily restrict heavy scraping.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRefreshOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => refreshGroups(true)} disabled={refreshing}>
              Refresh with backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirm erase dialog */}
      <Dialog open={confirmEraseOpen} onOpenChange={setConfirmEraseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Erase all data?</DialogTitle>
            <DialogDescription>
              This deletes all cached groups, manual groups, and pages. Do you
              also want to log out of Facebook? A backup file is created first.
              This cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEraseOpen(false)} disabled={erasing} className="sm:mr-auto">
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={erasing}
              onClick={() => eraseAll(false)}
            >
              {erasing ? "Erasing..." : "Erase data only"}
            </Button>
            <Button
              variant="destructive"
              disabled={erasing}
              onClick={() => eraseAll(true)}
            >
              {erasing ? "Erasing..." : "Erase & log out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* progress dialog */}
      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fetching groups…</DialogTitle>
            <DialogDescription>
              {progress
                ? progress.total
                  ? `${progress.phase} — ${progress.current}/${progress.total}`
                  : progress.phase === "collecting" || progress.phase === "hovering"
                  ? `${progress.phase} — ${progress.current} groups`
                  : `${progress.phase} — ${progress.current}`
                : "Starting…"}
            </DialogDescription>
          </DialogHeader>
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: progress && progress.total ? `${Math.min(100, (progress.current / progress.total) * 100)}%` : "0%",
              }}
            />
          </div>
          <div className="max-h-48 overflow-auto rounded border bg-muted/30 p-2 text-xs font-mono">
            {(progress?.logs || []).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" onClick={() => abortRef.current?.abort()}>
              Abort
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* confirm logout dialog */}
      <Dialog open={confirmLogoutOpen} onOpenChange={setConfirmLogoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out of Facebook?</DialogTitle>
            <DialogDescription>
              Your saved session will be cleared. You will need to log in
              again to post.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLogoutOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={logout} disabled={loggingOut}>
              {loggingOut ? "Logging out..." : "Log out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function sortGroups(groups: Group[], order: GroupSortOrder): Group[] {
  const sorted = [...groups]
  switch (order) {
    case "followers-desc":
      return sorted.sort(
        (a, b) => parseMemberCount(b.memberCount) - parseMemberCount(a.memberCount)
      )
    case "followers-asc":
      return sorted.sort(
        (a, b) => parseMemberCount(a.memberCount) - parseMemberCount(b.memberCount)
      )
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    default:
      return sorted
  }
}

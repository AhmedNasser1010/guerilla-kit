"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Send,
  LogIn,
  LogOut,
  RefreshCw,
  Users,
  ChevronDown,
  Search,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/theme-toggle"
import type { FacebookPage } from "@/lib/types"

export function Header({
  loggedIn,
  loginOpen,
  loginPending,
  loggingOut,
  refreshing,
  pages,
  selectedPageId,
  onLogin,
  onLogoutRequest,
  onSelectPage,
  onDetectPages,
  pageDetecting,
  onRefresh,
  onAddGroup,
  onEraseAll,
  searchQuery,
  onSearch,
}: {
  loggedIn: boolean | null
  loginOpen: boolean
  loginPending: boolean
  loggingOut: boolean
  refreshing: boolean
  pages: FacebookPage[]
  selectedPageId: string | null
  onLogin: () => void
  onLogoutRequest: () => void
  onSelectPage: (pageId: string | null) => void
  onDetectPages: () => void
  pageDetecting: boolean
  onRefresh: () => void
  onAddGroup: () => void
  onEraseAll: () => void
  searchQuery: string
  onSearch: (value: string) => void
}) {
  const selectedPage = pages.find((p) => p.id === selectedPageId) || null

  return (
    <header className="glass sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-chart-2 text-primary-foreground shadow-sm">
            <Send className="size-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              Group Poster
            </h1>
            <StatusLine loggedIn={loggedIn} />
          </div>
        </div>

        {/* Search */}
        <div className="relative mx-auto hidden w-full max-w-sm md:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="h-9 rounded-full pl-9"
          />
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <PageSelector
            pages={pages}
            selectedPage={selectedPage}
            onSelect={onSelectPage}
            onDetect={onDetectPages}
            detecting={pageDetecting}
            disabled={!loggedIn}
          />

          {pages.length > 0 && (
            <Badge variant="secondary" className="hidden gap-1.5 lg:inline-flex">
              <Users className="size-3" />
              {selectedPage ? selectedPage.name : "Personal profile"}
            </Badge>
          )}

          {!loggedIn && !loginOpen && (
            <Button size="sm" disabled={loginPending} onClick={onLogin} className="shadow-sm">
              <LogIn />
              {loginPending ? "Opening..." : "Login"}
            </Button>
          )}
          {loggedIn && (
            <Button
              size="icon"
              variant="outline"
              disabled={loggingOut}
              title="Log out of Facebook"
              aria-label="Log out"
              onClick={onLogoutRequest}
            >
              <LogOut />
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            title="Add a group manually"
            aria-label="Add a group manually"
            onClick={onAddGroup}
          >
            <Plus />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={refreshing || !loggedIn}
            title="Refresh groups"
            aria-label="Refresh groups"
            onClick={onRefresh}
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            title="Erase all data"
            aria-label="Erase all data"
            onClick={onEraseAll}
          >
            <Trash2 />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function StatusLine({ loggedIn }: { loggedIn: boolean | null }) {
  if (loggedIn === null) {
    return <p className="text-xs text-muted-foreground">Checking session…</p>
  }
  if (loggedIn) {
    return (
      <p className="flex items-center gap-1 text-xs text-emerald-600">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Connected to Facebook
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1 text-xs text-destructive">
      <span className="size-1.5 rounded-full bg-destructive" />
      Not logged in
    </p>
  )
}
function PageSelector({
  pages,
  selectedPage,
  onSelect,
  onDetect,
  detecting,
  disabled,
}: {
  pages: FacebookPage[]
  selectedPage: FacebookPage | null
  onSelect: (pageId: string | null) => void
  onDetect: () => void
  detecting: boolean
  disabled: boolean
}) {
  if (pages.length === 0 && !detecting) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onDetect}
        disabled={disabled}
        className="hidden sm:inline-flex"
      >
        Detect Pages
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || detecting}
            className="hidden gap-2 sm:inline-flex"
          />
        }
      >
        {selectedPage && (
          <Avatar className="size-5">
            <AvatarImage src={selectedPage.avatarUrl} />
            <AvatarFallback className="text-[10px]">
              {selectedPage.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        <span className="max-w-32 truncate">
          {detecting ? "Detecting…" : selectedPage?.name || "Personal profile"}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Post as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onSelect(null)}>
            Personal profile {selectedPage === null && "✓"}
          </DropdownMenuItem>
          {pages.map((page) => (
            <DropdownMenuItem key={page.id} onClick={() => onSelect(page.id)}>
              <Avatar className="size-5">
                <AvatarImage src={page.avatarUrl} />
                <AvatarFallback className="text-[10px]">
                  {page.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{page.name}</span>
              {selectedPage?.id === page.id && " ✓"}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            onDetect()
            toast.info("Detecting your Pages…")
          }}
        >
          <RefreshCw className={detecting ? "animate-spin" : ""} />
          Re-detect Pages
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

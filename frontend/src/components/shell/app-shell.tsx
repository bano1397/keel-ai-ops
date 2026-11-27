"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { KeelLogo } from "@/components/shell/logo";
import { navFor } from "@/components/shell/nav";
import { MOCK, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <nav className="flex flex-1 flex-col gap-6 px-3" aria-label="Main">
      {navFor(user?.role).map((group) => (
        <div key={group.title}>
          <div className="text-muted-foreground mb-1.5 px-3 text-[11px] font-medium tracking-wider uppercase">{group.title}</div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === "/inbox" && pathname.startsWith("/conversations"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-8 py-5">
      <div className="px-6">
        <KeelLogo />
      </div>
      <SidebarNav onNavigate={onNavigate} />
      <div className="mx-3 rounded-xl border bg-muted/40 p-3">
        <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">Tenant</div>
        <div className="mt-1 text-sm font-medium">Hearth &amp; Field</div>
        <div className="text-muted-foreground text-xs">UK homeware · Leeds</div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}

function TopBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur md:px-8">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="bg-sidebar w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1" />
      {MOCK && (
        <Badge variant="outline" className="hidden sm:inline-flex">
          Mock data
        </Badge>
      )}
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hover:bg-muted flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors" data-testid="user-menu">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials(user?.name ?? "?")}</AvatarFallback>
            </Avatar>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-muted-foreground text-xs">{user?.email}</div>
            </div>
            <Badge variant={user?.role === "admin" ? "default" : "secondary"} className="capitalize" data-testid="user-role">
              {user?.role}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm">{user?.name}</div>
            <div className="text-muted-foreground text-xs font-normal">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !getToken()) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, router, pathname]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar sticky top-0 hidden h-screen w-64 shrink-0 border-r md:block">
        <SidebarBody />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}

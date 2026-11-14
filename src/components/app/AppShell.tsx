import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Plane, UserCircle2 } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV, navItemFor } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { useApplyAccessibility } from "@/lib/accessibility";

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1 py-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
        <Plane className="size-4 -rotate-45" />
      </span>
      <span className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
        <span className="text-[15px] font-bold tracking-tight">
          TEACH<span className="text-primary">X</span>
        </span>
        <span className="mt-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Flight Training Systems
        </span>
      </span>
    </Link>
  );
}

const NAV_OPEN_KEY = "teachx-nav-open";

function NavMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, isMobile, state } = useSidebar();
  const resolved = navItemFor(pathname);
  const activeGroup = NAV.find((g) => g.items.some((i) => i.to === resolved?.to))?.label;
  // Only the current section (and Overview) start expanded; the user's choices are remembered.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAV_OPEN_KEY);
      if (raw) setManual(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);
  const isOpen = (label: string) =>
    state === "collapsed" || label === activeGroup || (manual[label] ?? label === "Overview");
  const toggle = (label: string) => {
    const next = { ...manual, [label]: !isOpen(label) };
    setManual(next);
    try {
      window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      {NAV.map((group) => {
        const open = isOpen(group.label);
        return (
          <SidebarGroup key={group.label} className="py-0.5">
            <SidebarGroupLabel asChild className="text-[10px] tracking-[0.16em] uppercase">
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={open}
                className="flex w-full items-center justify-between hover:text-sidebar-foreground"
              >
                {group.label}
                <ChevronDown
                  className={
                    open ? "size-3 transition-transform" : "size-3 -rotate-90 transition-transform"
                  }
                />
              </button>
            </SidebarGroupLabel>
            {open ? (
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.to) || resolved?.to === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link
                            to={item.to}
                            onClick={() => {
                              if (isMobile) setOpenMobile(false);
                            }}
                            className={
                              active
                                ? "relative before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded before:bg-primary"
                                : ""
                            }
                          >
                            <item.icon className={active ? "text-primary" : ""} />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            ) : null}
          </SidebarGroup>
        );
      })}
    </>
  );
}

function ProfileChip() {
  const profile = useStore((s) => s.profile);
  if (!profile) {
    return (
      <Link
        to="/onboarding"
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
      >
        <UserCircle2 className="size-4" /> Create pilot profile
      </Link>
    );
  }
  return (
    <Link to="/settings" className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
      <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {profile.name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <span className="hidden flex-col leading-tight sm:flex">
        <span className="text-xs font-semibold">{profile.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{profile.callsign}</span>
      </span>
    </Link>
  );
}

function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = navItemFor(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger className="-ml-1" />
      <div className="h-5 w-px bg-border" />
      <div className="flex min-w-0 items-center gap-2">
        {item ? <item.icon className="size-4 shrink-0 text-primary" /> : null}
        <span className="truncate text-sm font-semibold">{item?.label ?? "TeachX"}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <ProfileChip />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useApplyAccessibility();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="border-b border-sidebar-border">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="gap-0 py-1">
          <NavMenu />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <p className="px-2 text-[10px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">
            Training simulator — not for real-world flight or navigation.
          </p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <TopBar />
        <div className="min-w-0 flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, UserCircle2 } from "lucide-react";

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
import { Logo } from "@/components/brand/Logo";
import { CommandMenu } from "@/components/app/CommandMenu";
import { NAV, navItemFor } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { useApplyAccessibility } from "@/lib/accessibility";
import { cn } from "@/lib/utils";

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

function Brand() {
  return (
    <Link
      to="/"
      aria-label="TeachX home"
      className="flex items-center rounded-lg px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:px-0"
    >
      <Logo size={34} className="group-data-[collapsible=icon]:[&_svg]:size-8" />
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
                className="flex w-full items-center justify-between transition-colors hover:text-sidebar-foreground"
              >
                <span className="flex items-center gap-2">
                  {group.label}
                  {!open && group.label === activeGroup ? (
                    <span className="size-1 rounded-full bg-primary" />
                  ) : null}
                </span>
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-300 ease-[var(--ease-out-expo)]",
                    !open && "-rotate-90",
                  )}
                />
              </button>
            </SidebarGroupLabel>
            {/* Animated collapse: the grid row eases between 0fr and 1fr. Closed groups are inert. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out-expo)]",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
              inert={!open}
            >
              <div className="min-h-0 overflow-hidden">
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.to) || resolved?.to === item.to;
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                            className={cn(
                              "h-9 rounded-lg transition-[background-color,color,padding] duration-200 [&>svg]:transition-transform [&>svg]:duration-300 [&>svg]:ease-[var(--ease-spring)] hover:[&>svg]:scale-110",
                              active &&
                                "relative bg-[linear-gradient(90deg,color-mix(in_oklch,var(--primary)_18%,transparent),color-mix(in_oklch,var(--primary)_4%,transparent))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_22%,transparent)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:shadow-[0_0_12px_var(--primary)] data-[active=true]:bg-transparent group-data-[collapsible=icon]:before:hidden",
                            )}
                          >
                            <Link
                              to={item.to}
                              onClick={() => {
                                if (isMobile) setOpenMobile(false);
                              }}
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
              </div>
            </div>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ProfileChip() {
  const profile = useStore((s) => s.profile);
  const onOnboarding = useRouterState({ select: (s) => s.location.pathname === "/onboarding" });
  if (!profile) {
    if (onOnboarding) return null;
    return (
      <Link
        to="/onboarding"
        className="btn-glow inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
      >
        <UserCircle2 className="size-4" />
        <span className="hidden sm:inline">Create pilot profile</span>
        <span className="sm:hidden">Start</span>
      </Link>
    );
  }
  return (
    <Link
      to="/settings"
      className="group flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-accent/60"
    >
      <span className="relative grid size-8 place-items-center rounded-full bg-[conic-gradient(from_180deg,var(--brand-1),var(--brand-2),var(--brand-3),var(--brand-1))] p-[1.5px] transition-transform duration-300 group-hover:scale-105">
        <span className="grid size-full place-items-center rounded-full bg-background text-[11px] font-bold text-primary">
          {initials(profile.name)}
        </span>
      </span>
      <span className="hidden flex-col leading-tight sm:flex">
        <span className="text-xs font-semibold">{profile.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{profile.callsign}</span>
      </span>
    </Link>
  );
}

/** Thin brand-colored bar under the top bar while a route is loading. */
function RouteProgress() {
  const loading = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  useEffect(() => {
    if (loading) {
      setPhase("loading");
      return;
    }
    setPhase((p) => (p === "loading" ? "done" : p));
    const t = window.setTimeout(() => setPhase("idle"), 450);
    return () => window.clearTimeout(t);
  }, [loading]);
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 -bottom-px h-[2px] origin-left bg-[linear-gradient(90deg,var(--brand-1),var(--brand-2),var(--brand-3))] shadow-[0_0_10px_var(--brand-2)]",
        phase === "idle" && "scale-x-0 opacity-0",
        phase === "loading" && "animate-[route-progress_2.4s_var(--ease-out-expo)_forwards]",
        phase === "done" && "scale-x-100 opacity-0 transition-opacity duration-500",
      )}
    />
  );
}

function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = navItemFor(pathname);
  const group = NAV.find((g) => g.items.some((i) => i.to === item?.to))?.label;
  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-3 sm:px-4">
      <SidebarTrigger className="-ml-1 size-8 rounded-lg" />
      <div className="h-5 w-px bg-border" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {group && group !== "Overview" ? (
          <>
            <span className="hidden text-muted-foreground sm:inline">{group}</span>
            <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/50 sm:inline" />
          </>
        ) : null}
        <span key={pathname} className="animate-fade-in-up flex min-w-0 items-center gap-2">
          {item ? <item.icon className="size-4 shrink-0 text-primary" /> : null}
          <span className="truncate font-semibold">
            {item?.label ?? (pathname === "/onboarding" ? "Pilot profile" : "TeachX")}
          </span>
        </span>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <CommandMenu />
        <ProfileChip />
      </div>
      <RouteProgress />
    </header>
  );
}

/** One document-level listener feeds the cursor position to every `.spotlight` element. */
function useSpotlightPointer() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const el = target?.closest?.(".spotlight") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  useApplyAccessibility();
  useSpotlightPointer();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="gap-0 py-2">
          <NavMenu />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <p className="flex gap-2 px-2 text-[10px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary/70" />
            Training simulator — not for real-world flight or navigation.
          </p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="isolate min-w-0">
        <div aria-hidden className="tx-ambient">
          <div className="tx-ambient-a" />
          <div className="tx-ambient-b" />
        </div>
        <TopBar />
        <div className="min-w-0 flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

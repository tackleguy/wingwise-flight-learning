/**
 * Command palette — press ⌘K / Ctrl+K anywhere (or the search button in the top bar) to jump to any
 * page or start a common flight. Built on cmdk (`@/components/ui/command`).
 */
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  CornerDownLeft,
  FileCheck2,
  Globe2,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Search,
  type LucideIcon,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buildHref } from "@/components/app/xlink";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  hint: string;
  icon: LucideIcon;
  path: string;
  search?: Record<string, string>;
}

const ACTIONS: Action[] = [
  {
    label: "Free flight",
    hint: "Any aircraft, airport & weather",
    icon: Plane,
    path: "/simulator",
    search: { scenario: "free-flight" },
  },
  {
    label: "Fly the traffic pattern",
    hint: "VFR takeoff, pattern & landing",
    icon: PlaneTakeoff,
    path: "/simulator",
    search: { scenario: "vfr-pattern" },
  },
  {
    label: "Fly an ILS approach",
    hint: "IFR approach in cloud",
    icon: PlaneLanding,
    path: "/simulator",
    search: { scenario: "ifr-ils" },
  },
  {
    label: "Fly anywhere in the world",
    hint: "Real terrain & weather",
    icon: Globe2,
    path: "/flightgear",
  },
  { label: "Practise radio calls", hint: "ATC scenarios", icon: Radio, path: "/atc" },
  {
    label: "Take a practice exam",
    hint: "Graded, with explanations",
    icon: FileCheck2,
    path: "/practice-tests",
  },
];

function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

const itemCls =
  "group gap-3 rounded-lg px-2.5 py-2 data-[selected=true]:bg-primary/12 data-[selected=true]:text-foreground";

function ItemIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/50 text-muted-foreground transition-colors group-data-[selected=true]:border-primary/40 group-data-[selected=true]:bg-primary/15 group-data-[selected=true]:text-primary">
      <Icon className="size-4" />
    </span>
  );
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const mac = useIsMac();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string, search?: Record<string, string>) => {
    setOpen(false);
    void router.navigate({ href: buildHref(path, search ?? {}) });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group hidden h-9 w-60 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.03)] transition-all duration-300 hover:border-primary/40 hover:bg-muted/60 hover:text-foreground md:flex lg:w-72"
      >
        <Search className="size-4 transition-transform duration-300 group-hover:scale-110" />
        <span>Search or jump to…</span>
        <kbd className="ml-auto rounded border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {mac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
      >
        <Search className="size-[18px]" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl border-border/80 bg-popover/95 p-0 shadow-[0_30px_80px_-20px_oklch(0_0_0/0.9),0_0_0_1px_oklch(1_0_0/0.04)] backdrop-blur-xl sm:max-w-xl [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Search TeachX</DialogTitle>
          <DialogDescription className="sr-only">
            Jump to any page or start a common flight.
          </DialogDescription>
          <Command className="bg-transparent [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]_svg]:size-[18px] [&_[cmdk-input-wrapper]_svg]:text-primary [&_[cmdk-input-wrapper]_svg]:opacity-100 [&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-[15px]">
            <CommandInput placeholder="Where do you want to go?" />
            <CommandList className="max-h-[min(60vh,440px)] pb-2">
              <CommandEmpty>
                <span className="text-muted-foreground">No matching page.</span>
              </CommandEmpty>
              <CommandGroup heading="Start">
                {ACTIONS.map((a) => (
                  <CommandItem
                    key={a.label}
                    value={`${a.label} ${a.hint}`}
                    onSelect={() => go(a.path, a.search)}
                    className={itemCls}
                  >
                    <ItemIcon icon={a.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.hint}</span>
                    </span>
                    <ArrowRight className="size-4 -translate-x-1 text-primary opacity-0 transition-all duration-300 group-data-[selected=true]:translate-x-0 group-data-[selected=true]:opacity-100" />
                  </CommandItem>
                ))}
              </CommandGroup>
              {NAV.map((g) => (
                <CommandGroup key={g.label} heading={g.label}>
                  {g.items.map((i) => (
                    <CommandItem
                      key={i.to}
                      value={`${g.label} ${i.label} ${i.description}`}
                      onSelect={() => go(i.to)}
                      className={itemCls}
                    >
                      <ItemIcon icon={i.icon} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {i.description}
                        </span>
                      </span>
                      <ArrowRight className="size-4 -translate-x-1 text-primary opacity-0 transition-all duration-300 group-data-[selected=true]:translate-x-0 group-data-[selected=true]:opacity-100" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            <div
              className={cn(
                "flex items-center gap-4 border-t px-4 py-2.5 text-[11px] text-muted-foreground",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded border bg-muted/60 px-1 font-mono">↑↓</kbd> navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="grid h-4 place-items-center rounded border bg-muted/60 px-1">
                  <CornerDownLeft className="size-2.5" />
                </kbd>
                open
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <kbd className="rounded border bg-muted/60 px-1 font-mono">esc</kbd> close
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

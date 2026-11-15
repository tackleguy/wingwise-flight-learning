import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/app/AppShell";
import { LogoMark } from "@/components/brand/Logo";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

/** Radar scope behind the 404 / error messages. */
function RadarBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid place-items-center">
      <div className="relative size-[min(80vw,520px)]">
        {[1, 0.75, 0.5, 0.25].map((s) => (
          <div
            key={s}
            className="absolute rounded-full border border-primary/15"
            style={{ inset: `${(1 - s) * 50}%` }}
          />
        ))}
        <div className="absolute inset-x-0 top-1/2 h-px bg-primary/10" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-primary/10" />
        <div className="animate-radar absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_300deg,color-mix(in_oklch,var(--primary)_35%,transparent)_360deg)] [mask-image:radial-gradient(circle,#000_68%,transparent_70%)]" />
        <span className="animate-pulse-dot absolute top-[28%] left-[64%] size-2 rounded-full bg-caution shadow-[0_0_12px_var(--caution)]" />
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="relative isolate flex min-h-[calc(100dvh-3.5rem)] items-center justify-center overflow-hidden px-4 py-16">
      <RadarBackdrop />
      <div className="animate-rise max-w-md text-center">
        <LogoMark size={56} className="mx-auto mb-6" />
        <p className="label-caps text-caution">Squawk 7600 · lost comms</p>
        <h1 className="mt-3 text-5xl font-bold tracking-tight sm:text-6xl">Off course.</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This page isn&apos;t on any chart we have. It may have moved, or the link may be wrong.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Link
            to="/"
            className="btn-glow inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold"
          >
            Return to base
          </Link>
          <Link
            to="/simulator"
            search={{ scenario: "free-flight" }}
            className="btn-ghost-glass inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold"
          >
            Go fly instead
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <RadarBackdrop />
      <div className="animate-rise max-w-md text-center">
        <LogoMark size={56} className="mx-auto mb-6" />
        <p className="label-caps text-warning">Master caution</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
          This page didn&apos;t load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-glow inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold"
          >
            Try again
          </button>
          <a
            href="/"
            className="btn-ghost-glass inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold text-foreground"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Site-wide defaults. Each content route, / included, must still set its own head(). Never add
    // og:image or twitter:image here: every page without its own would inherit the root's preview image.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SkyReady — Flight Simulator & Pilot Training Platform" },
      {
        name: "description",
        content:
          "Get sky-ready before you leave the ground: flight simulator, avionics lab, AI ATC practice, ground school, practice exams and mock checkrides in one training platform.",
      },
      { name: "theme-color", content: "#0c1424" },
      { name: "application-name", content: "SkyReady" },
      { name: "apple-mobile-web-app-title", content: "SkyReady" },
      { name: "author", content: "SkyReady" },

      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "SkyReady" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_OUT") queryClient.removeQueries({ queryKey: ["account"] });
      else queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </AppShell>
      <Toaster theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}

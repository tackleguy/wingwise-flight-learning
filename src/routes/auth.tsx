import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Page } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/Logo";
import { accountQuery } from "@/lib/account";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SkyReady" },
      { name: "description", content: "Sign in or create your SkyReady pilot account to save your ratings, hours and training plan." },
      { property: "og:title", content: "Sign in — SkyReady" },
      { property: "og:description", content: "Create your SkyReady pilot account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const GoogleG = () => (
  <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
);

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const afterSignIn = async () => {
    const acc = await qc.fetchQuery({ ...accountQuery, staleTime: 0 });
    navigate({ to: acc.profile?.onboarded ? "/" : "/setup", replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/setup`, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) await afterSignIn();
        else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await afterSignIn();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google sign-in didn't work. Try again.");
      return;
    }
    if (result.redirected) return;
    await afterSignIn();
  };

  return (
    <Page className="max-w-md">
      <div className="glass rounded-2xl border border-border p-6 sm:p-8">
        <LogoMark size={44} className="mb-4" />
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "in" ? "Welcome back, pilot" : "Create your pilot account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your ratings, hours and training plan follow you on any device.
        </p>

        {sent ? (
          <p className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
            Check <b>{email}</b> for a confirmation link. After you confirm, you'll set up your
            ratings, endorsements and hours.
          </p>
        ) : (
          <>
            <Button
              type="button"
              onClick={google}
              className="mt-6 h-11 w-full gap-2.5 border border-[#747775] bg-[#FFFFFF] text-[#1F1F1F] hover:bg-[#F2F2F2]"
            >
              <GoogleG />
              Continue with Google
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === "up" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={busy} className="btn-glow h-11 w-full">
                {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </div>
    </Page>
  );
}

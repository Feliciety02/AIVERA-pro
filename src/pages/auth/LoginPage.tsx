import * as React from "react";
import { useNavigate, useLocation } from "react-router";
import { ChevronRight, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService, IS_API } from "@/services";
import { toast } from "sonner";
import { useDataStore } from "@/stores/dataStore";
import { useSessionStore } from "@/stores/sessionStore";
import { BrandMark } from "@/components/layout/Brand";
import { Avatar } from "@/components/ui/misc";
import { ROLE_META } from "@/lib/constants";
import { initials } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks";

/** API mode: real sign-in against the backend (bcrypt-hashed passwords, httpOnly session cookie). */
function ApiLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authService.signIn(email.trim(), password);
      setPassword("");
      navigate(from === "/login" ? "/dashboard" : from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <main className="w-full max-w-[450px] rounded-xl border border-border bg-card px-6 py-9 sm:px-10">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="size-10" />
          <h1 className="mt-4 text-2xl font-normal">Sign in</h1>
          <p className="mt-2 text-base text-foreground/80">to continue to AEGIS AI</p>
        </div>
        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={busy || !email || !password} className="min-w-24">
              {busy && <Loader2 className="animate-spin" />} Sign in
            </Button>
          </div>
        </form>
        <div className="mt-6 flex gap-3 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>Seeded accounts (e.g. jordan.kim@aegis-demo.example) use the password set as <code>SEED_DEMO_PASSWORD</code> in <code>server/.env</code>. Change it for any shared deployment.</p>
        </div>
      </main>
      <footer className="mt-6 flex w-full max-w-[450px] justify-between px-2 text-xs text-muted-foreground">
        <span>AEGIS AI</span>
        <span>Only assess systems you are authorized to test</span>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  useDocumentTitle("Sign in");
  return IS_API ? <ApiLogin /> : <DemoLogin />;
}

/** Account chooser in the style of Google's sign-in page. Demo personas only — no credentials. */
function DemoLogin() {
  const allUsers = useDataStore((s) => s.users);
  const users = allUsers.filter((u) => u.status === "active");
  const log = useDataStore((s) => s.log);
  const signIn = useSessionStore((s) => s.signIn);
  const current = useSessionStore((s) => s.userId);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const enter = (id: string, name: string) => {
    signIn(id);
    log("demo_login", "user", id, name, "Entered the demo application as this persona (no credentials, not real authentication)");
    toast.success(`Signed in to demo as ${name}`);
    navigate(from === "/login" ? "/dashboard" : from, { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <main className="w-full max-w-[450px] rounded-xl border border-border bg-card px-6 py-9 sm:px-10">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="size-10" />
          <h1 className="mt-4 text-2xl font-normal">Choose an account</h1>
          <p className="mt-2 text-base text-foreground/80">to continue to AEGIS AI</p>
        </div>

        <ul className="mt-8 divide-y divide-border border-y border-border">
          {users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => enter(u.id, u.name)}
                className="flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Avatar initials={initials(u.name)} seed={u.name.length} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {ROLE_META[u.role].label} · {u.email}
                  </span>
                </span>
                {current === u.id ? <span className="text-xs text-muted-foreground">Signed in</span> : <ChevronRight className="size-4 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-3 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            These are demo personas. No password is checked and nothing is sent to a server, so this is not real authentication. Each role shows different navigation and actions.
          </p>
        </div>
      </main>
      <footer className="mt-6 flex w-full max-w-[450px] justify-between px-2 text-xs text-muted-foreground">
        <span>AEGIS AI · Frontend demo</span>
        <span>Only assess systems you are authorized to test</span>
      </footer>
    </div>
  );
}

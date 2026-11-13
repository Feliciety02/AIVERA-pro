import * as React from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { ArrowLeft, ChevronDown, ChevronRight, Eye, EyeOff, Info } from "lucide-react";
import { AuthCard, FloatingField } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { authService, IS_API } from "@/services";
import { toast } from "sonner";
import { useDataStore } from "@/stores/dataStore";
import { useSessionStore } from "@/stores/sessionStore";
import { Avatar } from "@/components/ui/misc";
import { ROLE_META } from "@/lib/constants";
import { initials } from "@/lib/utils";
import { seedUsers } from "@/data/seed";
import { useDocumentTitle } from "@/hooks";

const LAST_EMAIL_KEY = "aivera-last-email";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readLastEmail = () => {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveLastEmail = (email: string) => {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    /* storage unavailable, nothing to remember */
  }
};

/* -------------------------------- API sign-in ------------------------------- */

/** API mode: two-step sign-in (email, then password) against the AIVERA server. */
function ApiLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [step, setStep] = React.useState<"email" | "password">("email");
  const [email, setEmail] = React.useState(readLastEmail);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [capsLock, setCapsLock] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (step === "email" ? emailRef : passwordRef).current?.focus();
  }, [step]);

  const toPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return setEmailError("Enter an email");
    if (!EMAIL_RE.test(v)) return setEmailError("Enter a valid email address");
    setEmail(v);
    setEmailError(null);
    setPasswordError(null);
    setStep("password");
  };

  const back = () => {
    setPassword("");
    setShowPassword(false);
    setPasswordError(null);
    setStep("email");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setPasswordError("Enter a password");
    setBusy(true);
    setPasswordError(null);
    try {
      await authService.signIn(email, password);
      saveLastEmail(email);
      setPassword("");
      navigate(from === "/login" ? "/dashboard" : from, { replace: true });
    } catch (err) {
      setPasswordError((err as Error).message);
      setBusy(false);
      requestAnimationFrame(() => passwordRef.current?.select());
    }
  };

  const trackCaps = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  if (step === "email")
    return (
      <AuthCard title="Sign in" subtitle="Use your AIVERA account" busy={busy}>
        <form onSubmit={toPassword} noValidate>
          <FloatingField
            ref={emailRef}
            id="email"
            type="email"
            label="Email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            value={email}
            error={emailError}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
          />
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">Or choose one of the AIVERA accounts</p>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {seedUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setEmailError(null);
                      setPasswordError(null);
                      setStep("password");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <Avatar initials={initials(u.name)} seed={u.name.length} className="size-8 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ROLE_META[u.role].label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              You'll still need the password. It's the <span className="font-mono">SEED_DEMO_PASSWORD</span> value in <span className="font-mono">server/.env</span>.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-end gap-2">
            <Button asChild variant="ghost" className="rounded-full px-3 text-primary hover:text-primary">
              <Link to="/signup">Create account</Link>
            </Button>
            <Button type="submit" className="min-w-24 rounded-full">
              Next
            </Button>
          </div>
        </form>
      </AuthCard>
    );

  return (
    <AuthCard
      title="Welcome"
      busy={busy}
      subtitle={
        <button
          type="button"
          onClick={back}
          className="mt-1 inline-flex max-w-full items-center gap-2 rounded-full border border-border py-1 pr-2.5 pl-1 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`${email}, use a different account`}
        >
          <Avatar initials={initials(email.split("@")[0]!.replace(/[._-]/g, " "))} seed={email.length} className="size-6 text-[10px]" />
          <span className="truncate">{email}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      }
    >
      <form onSubmit={submit} noValidate>
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <FloatingField
          ref={passwordRef}
          id="password"
          type={showPassword ? "text" : "password"}
          label="Enter your password"
          autoComplete="current-password"
          value={password}
          error={passwordError}
          hint={capsLock ? <><Info className="mt-px size-4 shrink-0" aria-hidden /> Caps Lock is on</> : undefined}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError(null);
          }}
          trailing={
            <button
              type="button"
              onClick={() => {
                setShowPassword((s) => !s);
                passwordRef.current?.focus();
              }}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              aria-controls="password"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        />
        <label className="mt-4 flex w-fit cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
          Show password
        </label>
        <button type="button" onClick={() => setHelpOpen((o) => !o)} className="mt-6 text-sm font-medium text-primary hover:underline" aria-expanded={helpOpen}>
          Forgot password?
        </button>
        {helpOpen && <AccountHelp forgot />}
        <div className="mt-10 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" className="rounded-full px-3 text-primary hover:text-primary" onClick={back}>
            <ArrowLeft /> Back
          </Button>
          <Button type="submit" className="min-w-24 rounded-full">
            Next
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}

/** Honest help: there is no self-service reset, so say exactly where passwords come from. */
function AccountHelp({ forgot }: { forgot?: boolean }) {
  return (
    <div className="mt-3 flex gap-3 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-foreground/80">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p>
          AIVERA has one account per role: <span className="font-mono">admin@aivera.local</span> (administrator), <span className="font-mono">lead@aivera.local</span> (security lead),{" "}
          <span className="font-mono">assessor@aivera.local</span> (security assessor), <span className="font-mono">developer@aivera.local</span> (fixes issues) and{" "}
          <span className="font-mono">viewer@aivera.local</span> (view only).
        </p>
        <p>
          {forgot ? "There is no email reset. " : ""}The password is the <span className="font-mono">SEED_DEMO_PASSWORD</span> value in <span className="font-mono">server/.env</span> on the computer running the AIVERA server.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  useDocumentTitle("Sign in");
  return IS_API ? <ApiLogin /> : <DemoLogin />;
}

/* ------------------------------ Demo (no server) ----------------------------- */

/** Google-style account chooser. Demo mode has no server, so no password is checked. */
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
    toast.success(`Signed in as ${name}`);
    navigate(from === "/login" ? "/dashboard" : from, { replace: true });
  };

  return (
    <AuthCard title="Choose an account" subtitle="to continue to AIVERA">
      <ul className="-mx-2 divide-y divide-border border-y border-border">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => enter(u.id, u.name)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <Avatar initials={initials(u.name)} seed={u.name.length} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{current === u.id ? "Signed in" : ROLE_META[u.role].label}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex gap-3 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-foreground/80">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p>Demo mode runs without the AIVERA server, so no password is checked and nothing leaves this browser. Each role shows different menus and actions. Run the full app to sign in with a password.</p>
      </div>
    </AuthCard>
  );
}

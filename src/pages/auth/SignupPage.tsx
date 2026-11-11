import * as React from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Check, CircleCheck, Eye, EyeOff, Hourglass, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthCard, FloatingField } from "@/components/auth/AuthLayout";
import { ApiError } from "@/services/api/http";
import { authService, IS_API } from "@/services";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Step = "name" | "email" | "password" | "done";
const STEPS: Step[] = ["name", "email", "password"];

/** Google-style, step-by-step account creation. New accounts wait for administrator approval. */
export default function SignupPage() {
  useDocumentTitle("Create account");
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>("name");
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<"first" | "email" | "password" | "confirm", string>>>({});
  const firstRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    ({ name: firstRef, email: emailRef, password: passwordRef, done: null })[step]?.current?.focus();
  }, [step]);

  const rules = [
    { ok: password.length >= 10, label: "At least 10 characters" },
    { ok: /[A-Za-z]/.test(password), label: "Contains a letter" },
    { ok: /\d/.test(password), label: "Contains a number" },
    { ok: !!confirm && confirm === password, label: "Both passwords match" },
  ];

  const next = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "name") {
      if (first.trim().length < 2) return setErrors({ first: "Enter your first name" });
      setErrors({});
      return setStep("email");
    }
    if (step === "email") {
      const v = email.trim().toLowerCase();
      if (!v) return setErrors({ email: "Enter an email" });
      if (!EMAIL_RE.test(v)) return setErrors({ email: "Enter a valid email address" });
      setEmail(v);
      setErrors({});
      return setStep("password");
    }
    if (step === "password") {
      if (!rules[0]!.ok || !rules[1]!.ok || !rules[2]!.ok) return setErrors({ password: "Use 10 or more characters with a mix of letters and numbers" });
      if (confirm !== password) return setErrors({ confirm: "Those passwords didn't match. Try again." });
      setErrors({});
      setBusy(true);
      try {
        await authService.signUp({ name: `${first.trim()} ${last.trim()}`.trim(), email, password });
        setPassword("");
        setConfirm("");
        setStep("done");
      } catch (err) {
        const message = (err as Error).message;
        if (err instanceof ApiError && err.status === 409) {
          setErrors({ email: message });
          setStep("email");
        } else setErrors({ password: message });
      } finally {
        setBusy(false);
      }
    }
  };

  const back = () => {
    setErrors({});
    if (step === "email") setStep("name");
    else if (step === "password") setStep("email");
    else navigate("/login");
  };

  if (!IS_API)
    return (
      <AuthCard title="Create an AIVERA account" subtitle="Needs the AIVERA server">
        <div className="flex gap-3 rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            Demo mode runs only in this browser, so accounts can't be created here. Run the full app with <span className="font-mono">npm run dev:full</span> to sign up, or choose one of
            the demo accounts.
          </p>
        </div>
        <div className="mt-8 flex justify-end">
          <Button asChild className="rounded-full">
            <Link to="/login">Choose an account</Link>
          </Button>
        </div>
      </AuthCard>
    );

  if (step === "done")
    return (
      <AuthCard title="Account created" subtitle={<span className="font-medium text-foreground">{email}</span>}>
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CircleCheck className="size-7" aria-hidden />
          </span>
          <div className="mt-6 flex gap-3 rounded-lg bg-muted px-4 py-3 text-left text-sm leading-relaxed text-foreground/80">
            <Hourglass className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p>
              <span className="font-medium text-foreground">Waiting for approval.</span> An administrator has been notified and must activate your account on the Users page before you can sign
              in. New accounts start as viewers.
            </p>
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <Button asChild className="rounded-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );

  const index = STEPS.indexOf(step);
  const titles: Record<Exclude<Step, "done">, [string, string]> = {
    name: ["Create an AIVERA account", "Enter your name"],
    email: ["Choose your email", "You'll use it to sign in to AIVERA"],
    password: ["Create a strong password", "Use a password you don't use anywhere else"],
  };
  const [title, subtitle] = titles[step];

  return (
    <AuthCard title={title} subtitle={subtitle} busy={busy}>
      <div className="mb-6 flex gap-1" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      <form onSubmit={next} noValidate className="space-y-4">
        {step === "name" && (
          <>
            <FloatingField ref={firstRef} id="first" label="First name" autoComplete="given-name" value={first} error={errors.first} onChange={(e) => setFirst(e.target.value)} />
            <FloatingField id="last" label="Last name (optional)" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
          </>
        )}
        {step === "email" && (
          <FloatingField
            ref={emailRef}
            id="email"
            type="email"
            label="Email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        {step === "password" && (
          <>
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <FloatingField
              ref={passwordRef}
              id="new-password"
              type={show ? "text" : "password"}
              label="Password"
              autoComplete="new-password"
              value={password}
              error={errors.password}
              onChange={(e) => setPassword(e.target.value)}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              }
            />
            <FloatingField id="confirm" type={show ? "text" : "password"} label="Confirm" autoComplete="new-password" value={confirm} error={errors.confirm} onChange={(e) => setConfirm(e.target.value)} />
            <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
              Show password
            </label>
            <ul className="grid gap-1.5 pt-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
              {rules.map((r) => (
                <li key={r.label} className={cn("flex items-center gap-1.5", r.ok ? "text-success" : "text-muted-foreground")}>
                  {r.ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                  {r.label}
                  <span className="sr-only">{r.ok ? "(done)" : "(not yet)"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-8">
          {step === "name" ? (
            <Button asChild variant="ghost" className="rounded-full px-3 text-primary hover:text-primary">
              <Link to="/login">Sign in instead</Link>
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="rounded-full px-3 text-primary hover:text-primary" onClick={back}>
              <ArrowLeft /> Back
            </Button>
          )}
          <Button type="submit" className="min-w-24 rounded-full">
            {step === "password" ? "Create account" : "Next"}
          </Button>
        </div>
      </form>
      {step === "name" && (
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">New accounts can only view until an administrator approves them. Only approved assessors can run tests, and only on websites with confirmed permission.</p>
      )}
    </AuthCard>
  );
}

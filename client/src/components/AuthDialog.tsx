import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

type AuthContext = { mode: string; title: string; characters: number };
type AuthDialogProps = {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  reason?: "transform" | "history";
  context?: AuthContext;
};

function getSafeAuthError(error: unknown) {
  if (error instanceof TRPCClientError) {
    if (error.data?.code === "UNAUTHORIZED") return "The email or password is incorrect. Try again.";
    if (error.data?.code === "TOO_MANY_REQUESTS") return "Too many attempts. Wait a moment before trying again.";
    if (error.data?.code === "CONFLICT") return "This account could not be created. Try signing in or use another email address.";
    if (error.data?.code === "BAD_REQUEST") return "Check your email and password, then try again.";
    return "Sign-in is temporarily unavailable. Your current source text is preserved.";
  }
  return "We could not reach the sign-in service. Your current source text is preserved. Check your connection and try again.";
}

export function AuthDialog({ trigger, open, onOpenChange, reason = "transform", context }: AuthDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const utils = trpc.useUtils();
  const providerStatus = trpc.system.providerStatus.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const signIn = trpc.auth.signIn.useMutation();
  const signUp = trpc.auth.signUp.useMutation();
  const isPending = signIn.isPending || signUp.isPending;
  const isOpen = open ?? internalOpen;

  const changeOpen = (nextOpen: boolean) => {
    if (isPending && !nextOpen) return;
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) setFormError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (!email.trim()) {
      setFormError("Enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setFormError("Enter your password.");
      return;
    }
    if (password.length < 8) {
      setFormError("Use at least 8 characters for your password.");
      return;
    }
    try {
      if (isSigningUp) {
        await signUp.mutateAsync({ email, password, name });
      } else {
        await signIn.mutateAsync({ email, password });
      }
      await utils.auth.me.invalidate();
      await utils.history.list.reset();
      await utils.metrics.snapshot.reset();
      changeOpen(false);
      setPassword("");
      toast.success("Workspace unlocked. Your source text is preserved.");
    } catch (error) {
      setFormError(getSafeAuthError(error));
    }
  };

  const switchMode = (nextSignup: boolean) => {
    setIsSigningUp(nextSignup);
    setFormError("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={false}
        aria-describedby="auth-dialog-description"
        className="max-h-[calc(100dvh-2rem)] max-w-[460px] gap-0 overflow-y-auto rounded-[16px] border border-white/15 bg-[rgba(13,17,24,.94)] p-0 text-[#f3f7fa] shadow-[0_28px_90px_rgba(0,0,0,.62),inset_0_1px_0_rgba(255,255,255,.12)] backdrop-blur-2xl sm:max-w-[460px] max-[740px]:max-h-[calc(100dvh-1.5rem)] max-[740px]:max-w-[calc(100vw-1.5rem)]"
        onEscapeKeyDown={event => { if (isPending) event.preventDefault(); }}
        onPointerDownOutside={event => { if (isPending) event.preventDefault(); }}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.025] px-4">
          <div className="flex items-center gap-2.5" aria-hidden="true">
            <span className="size-[10px] rounded-full bg-[#ff6258] shadow-[inset_0_0_0_1px_rgba(80,0,0,.18)]" />
            <span className="size-[10px] rounded-full bg-[#ffc044] shadow-[inset_0_0_0_1px_rgba(80,40,0,.18)]" />
            <span className="size-[10px] rounded-full bg-[#39c94f] shadow-[inset_0_0_0_1px_rgba(0,70,10,.18)]" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-xs font-medium text-white/65">Grammatical MacWrite</span>
          <button type="button" onClick={() => changeOpen(false)} disabled={isPending} aria-label="Close sign-in window" className="grid size-9 place-items-center rounded-md text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74b7ff] disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5 max-[740px]:px-4 max-[740px]:pb-5">
          <DialogHeader className="mb-5 text-left">
            <div className="mb-3 flex size-10 items-center justify-center rounded-[11px] border border-[#74e6a1]/20 bg-[#74e6a1]/10 text-[#74e6a1]">
              {isSigningUp ? <LockKeyhole size={19} /> : <ShieldCheck size={19} />}
            </div>
            <DialogTitle className="text-[23px] font-semibold leading-tight text-[#f3f7fa]">
              {isSigningUp ? "Create your workspace" : "Sign in to Grammatical"}
            </DialogTitle>
            <DialogDescription id="auth-dialog-description" className="max-w-[390px] text-[13px] leading-relaxed text-[#aab5c6]">
              {isSigningUp
                ? "Create an account to save and search transformation history."
                : reason === "history"
                  ? "Sign in to save and search your transformation history."
                  : "Continue to your semantic workspace and saved transformation history."}
            </DialogDescription>
          </DialogHeader>

          {context && reason === "transform" && (
            <div className="mb-4 rounded-lg border border-[#74b7ff]/20 bg-[#74b7ff]/[0.07] px-3.5 py-3" aria-label="Pending transformation context">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#74b7ff]">Ready to transform</div>
              <div className="font-mono text-[11px] leading-relaxed text-[#e0e8f2]">
                {context.mode} <span className="text-white/35">·</span> {context.title || "Untitled document"} <span className="text-white/35">·</span> {context.characters.toLocaleString()} characters preserved
              </div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 rounded-lg border border-white/10 bg-black/15 p-1" role="group" aria-label="Account action">
            <button type="button" onClick={() => switchMode(false)} aria-pressed={!isSigningUp} className={`min-h-10 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74b7ff] max-[380px]:px-1 max-[380px]:text-[11px] ${!isSigningUp ? "bg-white/10 text-white shadow-sm" : "text-[#aab5c6] hover:bg-white/[0.06] hover:text-white"}`}>Sign in</button>
            <button type="button" onClick={() => switchMode(true)} aria-pressed={isSigningUp} className={`min-h-10 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74b7ff] max-[380px]:px-1 max-[380px]:text-[11px] ${isSigningUp ? "bg-white/10 text-white shadow-sm" : "text-[#aab5c6] hover:bg-white/[0.06] hover:text-white"}`}>Create account</button>
          </div>

          <form onSubmit={submit} className="space-y-3.5" noValidate>
            {isSigningUp && (
              <label className="block space-y-1.5 text-[12px] font-semibold text-[#dce5ef]" htmlFor="auth-name">
                Name <span className="font-normal text-[#8290a3]">(optional)</span>
                <Input id="auth-name" autoComplete="name" maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" disabled={isPending} className="mt-1 min-h-11 rounded-lg border-white/15 bg-[#1a2230] text-[14px] text-white placeholder:text-[#718096] focus-visible:border-[#74b7ff] focus-visible:ring-[#74b7ff]/35" />
              </label>
            )}
            <label className="block space-y-1.5 text-[12px] font-semibold text-[#dce5ef]" htmlFor="auth-email">
              Email
              <span className="relative mt-1 block">
                <Mail size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8290a3]" />
                <Input id="auth-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={event => { setEmail(event.target.value); setFormError(""); }} placeholder="name@example.com" disabled={isPending} aria-invalid={Boolean(formError)} aria-describedby={formError ? "auth-error" : undefined} className="min-h-11 rounded-lg border-white/15 bg-[#1a2230] pl-10 text-[14px] text-white placeholder:text-[#718096] focus-visible:border-[#74b7ff] focus-visible:ring-[#74b7ff]/35" />
              </span>
            </label>
            <label className="block space-y-1.5 text-[12px] font-semibold text-[#dce5ef]" htmlFor="auth-password">
              Password
              <span className="relative mt-1 block">
                <LockKeyhole size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8290a3]" />
                <Input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={isSigningUp ? "new-password" : "current-password"} required minLength={8} maxLength={128} value={password} onChange={event => { setPassword(event.target.value); setFormError(""); }} placeholder={isSigningUp ? "At least 8 characters" : "Your password"} disabled={isPending} aria-invalid={Boolean(formError)} aria-describedby={isSigningUp ? "password-guidance" : formError ? "auth-error" : undefined} className="min-h-11 rounded-lg border-white/15 bg-[#1a2230] pl-10 pr-12 text-[14px] text-white placeholder:text-[#718096] focus-visible:border-[#74b7ff] focus-visible:ring-[#74b7ff]/35" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={isPending} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-[#aab5c6] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74b7ff] disabled:opacity-40">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {isSigningUp && <p id="password-guidance" className="-mt-1 text-[11px] leading-relaxed text-[#aab5c6]">Use at least 8 characters. A password manager can help you choose a unique password.</p>}
            <div className="min-h-[38px] pt-0.5" aria-live="polite">
              {formError ? <p id="auth-error" role="alert" className="text-[12px] leading-relaxed text-[#ff9ca8]">{formError}</p> : null}
              {isPending ? <p className="flex items-center gap-2 text-[12px] text-[#f6cf73]"><LoaderCircle size={14} className="animate-spin" />{isSigningUp ? "Creating your workspace…" : "Signing in…"}</p> : null}
            </div>

            <Button type="submit" className="min-h-11 w-full rounded-lg bg-[#74e6a1] text-[14px] font-semibold text-[#102019] transition-colors hover:bg-[#91f0b4] focus-visible:ring-2 focus-visible:ring-[#74b7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1118] active:scale-[0.98] disabled:bg-[#74e6a1]/50" disabled={isPending || !email.trim() || password.length < 8}>
              {isPending ? <LoaderCircle className="animate-spin" size={16} /> : <LockKeyhole size={16} />}
              {isPending ? (isSigningUp ? "Creating account…" : "Signing in…") : (isSigningUp ? "Create account" : "Sign in")}
            </Button>
          </form>

          <p className="mt-4 text-center text-[12px] text-[#aab5c6]">
            {isSigningUp ? "Already have an account?" : "New to Grammatical?"}{" "}
            <button type="button" onClick={() => switchMode(!isSigningUp)} className="min-h-10 px-1 font-medium text-[#74b7ff] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74b7ff]">
              {isSigningUp ? "Sign in" : "Create an account"}
            </button>
          </p>

          <details className="mt-2 rounded-lg border border-white/10 bg-white/[0.025] open:bg-white/[0.04]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-[12px] font-medium text-[#dce5ef] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#74b7ff]">
              <ShieldCheck size={15} className="shrink-0 text-[#74e6a1]" />
              How Grammatical handles your text
              <span className="ml-auto text-[#8290a3]">▸</span>
            </summary>
            <div className="space-y-2 px-3 pb-3 text-[11px] leading-relaxed text-[#aab5c6]">
              <p>Your source stays in the workspace while a transformation runs. Failed or rejected requests keep the original text available.</p>
              <p>Transformations use a server-configured external provider. Accepted results and their source may be saved to your account history.</p>
              <p>Operational metrics record timing and outcomes, not the text you submit.</p>
              <p className="flex items-center gap-2 text-[#dce5ef]">
                <span className={`size-2 rounded-full ${providerStatus.data?.configured ? "bg-[#74e6a1]" : "bg-[#f6cf73]"}`} />
                Provider setup: {providerStatus.isLoading ? "checking" : providerStatus.data?.configured ? "configured" : "not configured"}
                {providerStatus.data?.fallbackConfigured ? " · fallback configured" : ""}
              </p>
            </div>
          </details>

        </div>
      </DialogContent>
    </Dialog>
  );
}

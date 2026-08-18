"use client";

import { motion } from "motion/react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { isAllowed } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/auth/browser";
import { entrance } from "@/lib/motion";

type State = "idle" | "sending" | "sent" | "error";

/**
 * Sign in with a magic link.
 *
 * No passwords: there is no password to leak, reuse, or reset, and for two
 * people a mailbox is already the strongest factor either of them has.
 *
 * The allowlist check here is a COURTESY, so a typo fails immediately instead
 * of sending a link that will be rejected later. The real gate is the callback,
 * because anyone can request a link for any address.
 */
export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();

    if (!isAllowed(address)) {
      setState("error");
      setMessage("That address does not have access to GV OS.");
      return;
    }

    setState("sending");

    const supabase = createClient();
    const redirect = new URL("/auth/callback", window.location.origin);
    if (next) redirect.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirect.toString() },
    });

    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }

    setState("sent");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={entrance}
      className="bg-card elev-card relative w-full max-w-sm rounded-xl border p-6"
    >
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg text-sm font-bold">
          GV
        </span>
        <span className="font-semibold tracking-tight">Global Ventures</span>
      </div>

      {state === "sent" ? (
        <div className="space-y-3">
          <span className="dot-brand inline-flex size-8 items-center justify-center rounded-full">
            <Check className="text-primary-foreground size-4" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Check your email</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A sign-in link is on its way to{" "}
            <span className="text-foreground">{email}</span>. It is single use and
            expires shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
            <p className="text-muted-foreground text-sm">
              We will email you a link. No password to remember.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-muted-foreground block text-xs">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "error") setState("idle");
              }}
              placeholder="you@globalventures.app"
              aria-invalid={state === "error"}
              aria-describedby={state === "error" ? "login-error" : undefined}
              className="border-input bg-background placeholder:text-faint focus:border-brand h-10 w-full rounded-lg border px-3 text-sm transition-colors outline-none"
            />
          </div>

          {state === "error" && (
            <p id="login-error" role="alert" className="text-destructive text-sm">
              {message}
            </p>
          )}

          <Button
            type="submit"
            disabled={state === "sending"}
            className="press w-full gap-2"
          >
            {state === "sending" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending
              </>
            ) : (
              <>
                Send sign-in link <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      )}
    </motion.div>
  );
}

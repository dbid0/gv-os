import Link from "next/link";

import { Button } from "@/components/ui/button";

const REASONS: Record<string, { title: string; detail: string }> = {
  "not-allowed": {
    title: "That address is not on the list",
    detail:
      "GV OS is an internal tool, not a product with signups. Access is granted per address.",
  },
  "no-code": {
    title: "That link is incomplete",
    detail: "Request a fresh sign-in link and try again.",
  },
  "exchange-failed": {
    title: "That link has expired",
    detail: "Sign-in links are single use and short lived. Request a new one.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const copy = REASONS[reason ?? ""] ?? {
    title: "Something went wrong signing in",
    detail: "Request a fresh sign-in link and try again.",
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="grid-noise pointer-events-none absolute inset-0" aria-hidden />
      <div className="bg-card elev-card relative w-full max-w-sm space-y-4 rounded-xl border p-6 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{copy.detail}</p>
        <Button render={<Link href="/login" />} className="press w-full">
          Back to sign in
        </Button>
      </div>
    </main>
  );
}

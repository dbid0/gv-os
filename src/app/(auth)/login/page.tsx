import { LoginForm } from "@/components/auth/login-form";

export const metadata = {
  title: "Sign in - GV OS",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="grid-noise pointer-events-none absolute inset-0" aria-hidden />
      <LoginForm next={next} />
    </main>
  );
}

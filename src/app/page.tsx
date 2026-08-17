import { redirect } from "next/navigation";

export default function Home() {
  // The app has one entry point. When auth lands, an unauthenticated visitor is
  // redirected to /login from the middleware instead.
  redirect("/dashboard");
}

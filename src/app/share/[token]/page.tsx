import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SharePageView } from "@/components/workspace/share-page-view";
import { getShareView } from "@/lib/workspace/shares";

/**
 * The PUBLIC, view-only share route — OUTSIDE the (app) group, so it inherits
 * none of the app's shell or auth. Reachable without a login because `/share`
 * is a public path in the middleware; the token in the URL is the entire
 * capability. It renders ONLY the shared page and, when the share includes
 * children, its descendants — the descendant check runs server-side in
 * `getShareView` on every `?p=` param, so nothing outside the shared subtree is
 * ever exposed.
 */

export const dynamic = "force-dynamic";

type Params = { token: string };
type Search = Record<string, string | string[] | undefined>;

function childParam(sp: Search): string | undefined {
  const p = sp.p;
  return typeof p === "string" ? p : undefined;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const view = await getShareView(token, childParam(sp));
  const title = view ? view.page.title || "Untitled" : "Shared page";
  return {
    title: `${title} — Shared via Global Ventures`,
    // A public share should never be indexed or leak into search.
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const view = await getShareView(token, childParam(sp));
  if (!view) notFound();

  return <SharePageView view={view} token={token} />;
}

import { redirect } from "next/navigation";

/**
 * The Marketing tab was Kit twice — Email owns Kit now, and marketing
 * channels (Ads, YouTube via UTM links) get their own tabs when they exist.
 * Old links land on Email instead of a dead page.
 */
export default async function WorkspaceMarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/w/${slug}/email`);
}

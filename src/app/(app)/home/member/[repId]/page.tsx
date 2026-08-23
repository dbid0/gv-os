import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { RepMomentumDetail } from "@/components/gamification/rep-momentum-detail";
import { getRepGamification } from "@/lib/gamification/queries";

export const metadata = { title: "Rep momentum - GV OS" };
export const dynamic = "force-dynamic";

/**
 * One rep's momentum page: their streak, personal bests, and activity heatmap,
 * all derived from real rows. Reached from the momentum board on the member
 * home.
 */
export default async function RepMomentumPage(props: {
  params: Promise<{ repId: string }>;
}) {
  const { repId } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(repId)) notFound();
  const view = await getRepGamification(repId);
  if (!view) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        href="/home/member"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-3.5" /> Team home
      </Link>
      <RepMomentumDetail view={view} />
    </div>
  );
}

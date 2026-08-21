import { EodSubmitForm } from "@/components/sales/eod-submit-form";
import { listEodReps, listEodTemplates } from "@/lib/sales/queries";

export const metadata = { title: "Submit EOD - GV OS" };
export const dynamic = "force-dynamic";

export default async function SubmitEodPage() {
  const [reps, templates] = await Promise.all([listEodReps(), listEodTemplates()]);
  return <EodSubmitForm reps={reps} templates={templates} />;
}

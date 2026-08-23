import { redirect } from "next/navigation";

/** Teams moved to the Sales landing. Kept so old links still resolve. */
export default function SalesTeamsRedirect() {
  redirect("/sales");
}

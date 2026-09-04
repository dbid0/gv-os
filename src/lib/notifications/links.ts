/**
 * Where a notification takes you when clicked (Daniel's ask: every alert is a
 * link to the spot that fixes it). Pure so it can be unit-checked and reused
 * by both the bell preview and the full panel.
 */
export function notificationHref(kind: string, clientSlug: string | null): string {
  switch (kind) {
    case "sync_failure":
    case "integration_stale":
      return "/settings/integrations";
    case "sheet_drift":
      return "/accounting";
    case "agreement_signed":
      return clientSlug ? `/w/${clientSlug}` : "/clients";
    case "bod_digest":
      return clientSlug ? `/w/${clientSlug}` : "/dashboard";
    case "call_review":
      return "/sales/call-reviews";
    case "rep_wellbeing":
    case "eod_missing":
    case "bod_missing":
      return "/sales/eod";
    default:
      return "/notifications";
  }
}

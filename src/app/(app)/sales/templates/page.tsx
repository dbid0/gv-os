import { EodTemplateForm } from "@/components/sales/eod-template-form";
import { GenerateTemplatesButton } from "@/components/sales/generate-templates-button";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { listEodReps, listEodTemplates, listTeams } from "@/lib/sales/queries";
import { CADENCE_LABEL, ROLE_LABEL, baseFieldLabel } from "@/lib/sales/eod-fields";

export const metadata = { title: "EOD Templates - GV OS" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, teams, eodReps] = await Promise.all([
    listEodTemplates(),
    listTeams(),
    listEodReps(),
  ]);

  // Coverage: every team-role that has a rep should have a daily template so
  // submitted/pulled EOD data always lands somewhere. Count the missing ones.
  const haveEod = new Set(
    templates.filter((t) => t.cadence === "eod").map((t) => `${t.clientId}:${t.role}`),
  );
  const neededRoles = new Set(eodReps.map((r) => `${r.clientId}:${r.role}`));
  const missing = [...neededRoles].filter((key) => !haveEod.has(key)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">EOD Templates</h2>
          <p className="text-muted-foreground text-xs">
            One template per team and role defines the daily report — and, through it,
            the leaderboard columns and dashboard tiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GenerateTemplatesButton missing={missing} />
          <EodTemplateForm teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
        </div>
      </div>

      {neededRoles.size > 0 && (
        <div
          className={
            missing > 0
              ? "border-warning/30 bg-warning/5 rounded-xl border p-4 text-sm"
              : "card-grad rounded-xl border p-4 text-sm"
          }
        >
          {missing > 0 ? (
            <p>
              <span className="font-medium">
                {neededRoles.size - missing} of {neededRoles.size} team-roles
              </span>{" "}
              have a daily template.{" "}
              <span className="text-muted-foreground">
                {missing} {missing === 1 ? "role has" : "roles have"} reps but no
                template — hit <span className="font-medium">Generate defaults</span> so
                their EOD data has somewhere to land.
              </span>
            </p>
          ) : (
            <p>
              <span className="font-medium">Every team-role has a daily template.</span>{" "}
              <span className="text-muted-foreground">
                Submitted and pulled EOD data lands on the right form automatically.
              </span>
            </p>
          )}
        </div>
      )}

      {templates.length === 0 ? (
        <Panel title="No templates yet">
          <p className="text-muted-foreground text-sm">
            Create a template to define what a rep of a given role fills out each day.
            Base fields are standard activity counts; custom fields are team-specific;
            calculated metrics are rates built from the two.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <Panel
              key={t.id}
              title={t.name}
              aside={
                <StatusPill tone={t.isActive ? "live" : "muted"}>
                  {t.isActive ? "Active" : "Inactive"}
                </StatusPill>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="bg-secondary rounded-full border px-2.5 py-0.5">
                    {ROLE_LABEL[t.role] ?? t.role}
                  </span>
                  <span className="bg-secondary rounded-full border px-2.5 py-0.5">
                    {CADENCE_LABEL[t.cadence] ?? t.cadence}
                  </span>
                  {t.teamName && <span className="text-faint">{t.teamName}</span>}
                </div>

                <div>
                  <p className="text-faint mb-1.5 text-[11px] font-medium tracking-wider uppercase">
                    Base fields
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.baseFields.length === 0 && (
                      <span className="text-faint text-xs">None</span>
                    )}
                    {t.baseFields.map((f) => (
                      <span
                        key={f}
                        className="border-brand/30 bg-brand-soft/40 text-brand rounded-md border px-2 py-0.5 text-xs"
                      >
                        {baseFieldLabel(f)}
                      </span>
                    ))}
                  </div>
                </div>

                {t.customFields.length > 0 && (
                  <div>
                    <p className="text-faint mb-1.5 text-[11px] font-medium tracking-wider uppercase">
                      Custom fields
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.customFields.map((f) => (
                        <span
                          key={f.key}
                          className="bg-secondary rounded-md border px-2 py-0.5 text-xs"
                        >
                          {f.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {t.calcFields.length > 0 && (
                  <div>
                    <p className="text-faint mb-1.5 text-[11px] font-medium tracking-wider uppercase">
                      Calculated
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.calcFields.map((f) => (
                        <span
                          key={f.key}
                          className="text-muted-foreground rounded-md border border-dashed px-2 py-0.5 text-xs"
                        >
                          {f.label} = {baseFieldLabel(f.numerator)} ÷{" "}
                          {baseFieldLabel(f.denominator)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

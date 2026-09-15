import {
  countOf,
  NumberSection,
  NumberTile,
  pctOf,
} from "@/components/tracking/number-tiles";
import type { ApplicationNumbersData } from "@/lib/tracking/application-numbers-loader";

/**
 * Applications — the top of the funnel in the window: how many came in, from
 * how many people, how many carried a UTM tag, how many went on to book, who
 * booked without applying, and how fast the floor dialled them.
 */
export function ApplicationsSection({ data }: { data: ApplicationNumbersData }) {
  const a = data.numbers;
  const lede =
    a.source === "sheet"
      ? "From the tracking sheet's Applications tab (the form isn't synced for this offer)."
      : "From the synced application form.";

  if (a.source === null) {
    return (
      <NumberSection title="Applications" lede="Applications and speed to lead.">
        <p className="text-faint col-span-full text-xs">
          No applications yet: sync the application form under Integrations, or a
          tracking sheet with an Applications tab.
        </p>
      </NumberSection>
    );
  }

  const s = a.speed;
  return (
    <div className="space-y-3">
      <NumberSection
        title="Applications"
        lede={lede}
        footnote={[
          "Booked = applicants in the window with a call that wasn't cancelled; booked with no application = people with a call in the window who never applied.",
          data.dialsConnected
            ? `Speed to lead = application to the first outbound dial after it, over the window's applications (the ${s.slaMinutes}-minute standard).`
            : "Speed to lead needs Close connected, so its tiles stay blank.",
          a.undated > 0
            ? `${countOf(a.undated)} application${a.undated === 1 ? " has" : "s have"} no date and can't be placed in a window.`
            : "",
          data.capped
            ? "This offer has more rows than one page reads; the newest were read."
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <NumberTile label="Applications" value={countOf(a.submitted)} sub="submitted" />
        <NumberTile
          label="Applicants"
          value={countOf(a.people)}
          sub="distinct people"
        />
        <NumberTile
          label="UTM-tagged"
          value={
            a.tagged === null
              ? "—"
              : pctOf(a.submitted ? (a.tagged / a.submitted) * 100 : null)
          }
          sub={
            a.tagged === null
              ? "sheet rows carry no UTMs"
              : `${countOf(a.tagged)} of ${countOf(a.submitted)} applications`
          }
          tone={a.tagged === 0 && a.submitted > 0 ? "warning" : "default"}
        />
        <NumberTile
          label="Applied → booked"
          value={pctOf(a.bookRate)}
          sub={`${countOf(a.bookedPeople)} of ${countOf(a.people)} applicants`}
          tone="brand"
        />
        <NumberTile
          label="Booked, no application"
          value={countOf(a.bookedNoApplication)}
          sub="people with a call"
        />
        <NumberTile
          label="Speed to lead"
          value={
            data.dialsConnected && s.medianMinutes !== null
              ? `${s.medianMinutes}m`
              : "—"
          }
          sub={`median over ${countOf(s.matched)} dialled`}
        />
        <NumberTile
          label={`Dialled within ${s.slaMinutes} min`}
          value={data.dialsConnected ? pctOf(s.withinSlaPct) : "—"}
          sub={`of ${countOf(s.matched)} dialled`}
          tone={
            data.dialsConnected && s.withinSlaPct !== null && s.withinSlaPct < 80
              ? "warning"
              : "success"
          }
        />
        <NumberTile
          label="Never dialled after applying"
          value={data.dialsConnected ? countOf(s.neverDialled) : "—"}
          sub={`of ${countOf(s.dialable)} with an email or phone`}
          tone={data.dialsConnected && s.neverDialled > 0 ? "warning" : "default"}
        />
      </NumberSection>

      {a.byForm.length > 1 && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {a.byForm.map((f) => (
            <li key={f.form}>
              {f.form}{" "}
              <span className="text-foreground tabular-nums">{countOf(f.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

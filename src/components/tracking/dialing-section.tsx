import {
  countOf,
  NumberSection,
  NumberTile,
  pctOf,
} from "@/components/tracking/number-tiles";
import type { DialingData } from "@/lib/crm/dialing-loader";
import {
  ATTEMPT_GAP_MS,
  PICKUP_SECONDS,
  QUALITY_SECONDS,
  type DialingRow,
  type Grain,
} from "@/lib/crm/dialing-detail";
import { cn } from "@/lib/utils";

const talk = (seconds: number): string => {
  if (seconds === 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const grainSub = (g: Grain, unit: string) =>
  `${countOf(g.pickedUp)} of ${countOf(g.n)} ${unit}`;

function RepRow({ r, total = false }: { r: DialingRow; total?: boolean }) {
  return (
    <tr className={cn(total && "bg-secondary/40 font-medium")}>
      <th
        scope="row"
        className={cn(
          "px-4 py-2 text-left font-normal",
          total ? "font-medium" : r.unattributed && "text-muted-foreground italic",
        )}
      >
        {r.rep}
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{countOf(r.dial.n)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{countOf(r.attempt.n)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{countOf(r.person.n)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{countOf(r.dial.pickedUp)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pctOf(r.dial.pickupRate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{countOf(r.dial.quality)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{countOf(r.dial.noAnswer)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{talk(r.talkSeconds)}</td>
    </tr>
  );
}

/**
 * Dialing — the dialler's own record at three grains (dial, attempt, person)
 * with the per-rep re-cut. Read-only, from Close's synced calls.
 */
export function DialingSection({ data }: { data: DialingData }) {
  const { total, byRep, undated } = data.detail;
  const lede = `From Close's recorded calls. An attempt is the same rep dialling the same person with no more than ${ATTEMPT_GAP_MS / 60_000} minutes between dials; a person is one lead on one day.`;

  if (!data.connected && total.dial.n === 0) {
    return (
      <NumberSection title="Dialing" lede={lede}>
        <p className="text-faint col-span-full text-xs">
          Close isn&apos;t connected for this offer, so there are no recorded dials. The
          reps&apos; self-reported dials stay on the CRM page.
        </p>
      </NumberSection>
    );
  }

  return (
    <div className="space-y-3">
      <NumberSection
        title="Dialing"
        lede={lede}
        footnote={`Picked up = Close marked it answered, or it ran ${PICKUP_SECONDS}s or more when Close gave no disposition. Quality conversation = picked up and ${QUALITY_SECONDS / 60} minutes or more. No answer = no answer, busy, voicemail or blocked (or 0 seconds with no disposition). ${total.unmeasured === 1 ? "1 short dial has no disposition and counts only as a dial." : `${countOf(total.unmeasured)} short dials have no disposition and count only as dials.`}${undated > 0 ? ` ${countOf(undated)} undated ${undated === 1 ? "dial sits" : "dials sit"} outside the per-person count.` : ""}${data.capped ? " This window holds more calls than one page reads; the newest are shown." : ""}`}
      >
        <NumberTile label="Dials" value={countOf(total.dial.n)} sub="outbound calls" />
        <NumberTile
          label="Attempts"
          value={countOf(total.attempt.n)}
          sub="double-dials folded"
        />
        <NumberTile
          label="People dialled"
          value={countOf(total.person.n)}
          sub="lead-days"
        />
        <NumberTile
          label="Pickup rate · dials"
          value={pctOf(total.dial.pickupRate)}
          sub={grainSub(total.dial, "dials")}
          tone="success"
        />
        <NumberTile
          label="Pickup rate · attempts"
          value={pctOf(total.attempt.pickupRate)}
          sub={grainSub(total.attempt, "attempts")}
        />
        <NumberTile
          label="Reached · people"
          value={pctOf(total.person.pickupRate)}
          sub={grainSub(total.person, "lead-days")}
        />
        <NumberTile
          label="Quality conversations"
          value={countOf(total.dial.quality)}
          sub={`${pctOf(total.dial.qualityRate)} of ${countOf(total.dial.pickedUp)} pickups`}
          tone="brand"
        />
        <NumberTile
          label="No answer"
          value={countOf(total.dial.noAnswer)}
          sub={`of ${countOf(total.dial.n)} dials`}
        />
        <NumberTile
          label="No answer · people"
          value={countOf(total.person.noAnswer)}
          sub={`of ${countOf(total.person.n)} lead-days`}
        />
        <NumberTile label="Talk time" value={talk(total.talkSeconds)} sub="all dials" />
      </NumberSection>

      {byRep.length > 0 && (
        <section aria-label="Dialing by rep" className="bg-card rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-faint border-b text-[11px] tracking-wider whitespace-nowrap uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Rep
                  </th>
                  {[
                    "Dials",
                    "Attempts",
                    "People",
                    "Pickups",
                    "Pickup rate",
                    "Quality",
                    "No answer",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Talk time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byRep.map((r) => (
                  <RepRow key={r.rep} r={r} />
                ))}
              </tbody>
              <tfoot className="border-t">
                <RepRow r={total} total />
              </tfoot>
            </table>
          </div>
          <p className="text-faint border-t px-4 py-2 text-[11px]">
            Dials, attempts and talk time add up to the total. People counts a lead once
            per day in the total even when two reps reached them, so rep rows can sum
            past it.
          </p>
        </section>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { logAgencyDeal } from "@/app/(app)/accounting/log-deal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// The methods the sheet's fee formula knows (sheet-mirror SHEET_FEE_RATES_BPS).
const METHODS = ["Stripe", "Fanbasis", "Whop", "Wire", "PayPal", "Cash", "Other"];
const PAYOUT = ["", "Pending", "Paid"];
const AGREEMENT = ["", "Signed", "Sent", "None"];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-faint block text-[11px]">{hint}</span>}
    </label>
  );
}

export function AgencyDealForm({ clients }: { clients: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // Set when the sheet already holds this exact deal; cleared on a success.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const today = "";
  const [dateClosed, setDateClosed] = useState(today);
  const [client, setClient] = useState("");
  const [dealType, setDealType] = useState("Rev Share");
  const [offer, setOffer] = useState("");
  const [revenue, setRevenue] = useState("");
  const [cash, setCash] = useState("");
  const [method, setMethod] = useState("Stripe");
  const [pct, setPct] = useState("");
  const [fee, setFee] = useState("");
  const [agreement, setAgreement] = useState("");
  const [notes, setNotes] = useState("");
  const [payout, setPayout] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!client.trim() || !dateClosed) {
      toast({ tone: "error", title: "Client and date closed are required." });
      return;
    }
    start(async () => {
      try {
        const res = await logAgencyDeal(
          {
            dateClosed,
            client,
            dealType,
            offer,
            revenueDollars: Number(revenue) || 0,
            cashDollars: Number(cash) || 0,
            method,
            pctEntered: pct === "" ? null : Number(pct),
            feeOverrideDollars: fee === "" ? null : Number(fee),
            agreement,
            notes,
            payoutStatus: payout,
          },
          allowDuplicate,
        );

        // An identical deal is already on the sheet. Say which row, and make
        // the second attempt a deliberate act rather than a repeated reflex —
        // the same client really can pay the same amount twice in a day.
        if (!res.ok && res.duplicate) {
          setDuplicate(res.message);
          toast({
            tone: "error",
            title: "That deal is already on the sheet",
            detail: res.message,
          });
          return;
        }

        setDuplicate(null);
        setAllowDuplicate(false);
        toast({
          tone: "success",
          title: `${client.trim()} logged to the finance sheet`,
        });
        router.push("/accounting");
      } catch (err) {
        toast({
          tone: "error",
          title: "Couldn't log the deal",
          detail: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <Panel title="Log a deal — agency">
      <p className="text-muted-foreground mb-4 text-sm">
        This writes a new row into the finance sheet&apos;s Raw Data (the same place the
        Google new-sale form lands) and syncs it back into GV OS. For agency-wide deals
        — a rep logs their own from Sales.
      </p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date closed">
          <Input
            type="date"
            value={dateClosed}
            onChange={(e) => setDateClosed(e.target.value)}
          />
        </Field>
        <Field label="Client">
          <Input
            list="agency-clients"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Client / brand"
          />
          <datalist id="agency-clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Deal type">
          <select
            className={selectClass}
            value={dealType}
            onChange={(e) => setDealType(e.target.value)}
          >
            {["Rev Share", "Client Handoff", "Setup Fee", "One-off", "Other"].map(
              (t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Offer">
          <Input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Offer (optional)"
          />
        </Field>
        <Field label="Revenue ($)">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Cash collected ($)">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Payment method">
          <select
            className={selectClass}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Daniel %" hint="Blank = sheet formula applies">
          <Input
            type="number"
            step="1"
            min="0"
            max="100"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="—"
          />
        </Field>
        <Field label="Fee override ($)" hint="Blank = sheet formula applies">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="—"
          />
        </Field>
        <Field label="Agreement">
          <select
            className={selectClass}
            value={agreement}
            onChange={(e) => setAgreement(e.target.value)}
          >
            {AGREEMENT.map((a) => (
              <option key={a} value={a}>
                {a || "—"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payout status">
          <select
            className={selectClass}
            value={payout}
            onChange={(e) => setPayout(e.target.value)}
          >
            {PAYOUT.map((p) => (
              <option key={p} value={p}>
                {p || "—"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          {duplicate && (
            <label className="text-warning flex max-w-xl items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={(e) => setAllowDuplicate(e.target.checked)}
                className="mt-0.5"
              />
              <span>{duplicate} Tick to log it anyway.</span>
            </label>
          )}
          <Button
            type="submit"
            disabled={pending || (duplicate !== null && !allowDuplicate)}
            className="gap-2"
          >
            <Plus className="size-3.5" />
            {pending ? "Logging…" : "Log to finance sheet"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

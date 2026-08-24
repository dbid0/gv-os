/**
 * New-deal-form → backlog mapper (the second feed). Each offer's `🤝 New Deals`
 * sheet tab is the sales-rep-validated record of a closed deal — closer/setter
 * split, cash vs. revenue, AR. This turns one row into the transaction it
 * should append. Pure and fully gated: this is money.
 *
 * Idempotency: a deal's identity is its offer sheet + its row's timestamp
 * (the sheet's own immutable stamp), so replaying an import never doubles a
 * deal, and it never collides with a processor event
 * (`processor:…` vs `offer-deal:…`).
 */

/** One `🤝 New Deals` row, already keyed by column header. */
export interface NewDealRow {
  timestamp: string;
  dealDate: string;
  clientName: string;
  closerName: string;
  setterName: string;
  typeOfSale: string;
  programSold: string;
  status: string;
  cashCollected: string;
  revenueGenerated: string;
  balanceDue: string;
  ar: string;
  processor: string;
  processorFeePct: string;
}

export interface NewDealMapped {
  occurredOn: string;
  direction: "in";
  layer: "client";
  clientId: string;
  dealType: string;
  offer: string | null;
  description: string | null;
  paymentMethod: string | null;
  revenueCents: number;
  cashCents: number;
  processorFeeCents: number;
  leadEmail: null;
  source: "sheet";
  idempotencyKey: string;
  /** Carried for the deal/commission record, not the money row. */
  meta: {
    closerName: string | null;
    setterName: string | null;
    balanceCents: number;
    isAr: boolean;
    status: string;
  };
}

export type NewDealMapping =
  { ok: true; row: NewDealMapped } | { ok: false; reason: string };

export function newDealIdempotencyKey(sheetId: string, timestamp: string): string {
  return `offer-deal:${sheetId}:${timestamp}`;
}

// Sheet header → NewDealRow field. Matched case-insensitively, trimmed.
const HEADER_MAP: Record<string, keyof NewDealRow> = {
  timestamp: "timestamp",
  "deal date": "dealDate",
  "client name": "clientName",
  "closer name": "closerName",
  "setter name": "setterName",
  "type of sale": "typeOfSale",
  "program sold": "programSold",
  status: "status",
  "cash collected": "cashCollected",
  "revenue generated": "revenueGenerated",
  "balance due": "balanceDue",
  "ar?": "ar",
  processor: "processor",
  "processor fee %": "processorFeePct",
};

const emptyRow = (): NewDealRow => ({
  timestamp: "",
  dealDate: "",
  clientName: "",
  closerName: "",
  setterName: "",
  typeOfSale: "",
  programSold: "",
  status: "",
  cashCollected: "",
  revenueGenerated: "",
  balanceDue: "",
  ar: "",
  processor: "",
  processorFeePct: "",
});

/**
 * Parse a `🤝 New Deals` tab (header row + data rows) into keyed rows. Columns
 * are matched by header name, so a reordered or extra column can't shift the
 * data. Rows with no timestamp (blank trailing rows) are dropped.
 */
export function parseNewDealsSheet(values: string[][]): NewDealRow[] {
  if (values.length < 2) return [];
  const header = values[0].map((h) => h.trim().toLowerCase());
  const cols = header
    .map((h, i) => ({ field: HEADER_MAP[h], i }))
    .filter((c): c is { field: keyof NewDealRow; i: number } => Boolean(c.field));

  return values
    .slice(1)
    .map((raw) => {
      const row = emptyRow();
      for (const { field, i } of cols) row[field] = (raw[i] ?? "").trim();
      return row;
    })
    .filter((r) => r.timestamp !== "");
}

/** "$5,000.00" | "5000" | "" → integer cents. Blank = 0. */
export function parseMoneyCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** "12.5" | "12.5%" | "" → basis points, or null if unparseable. */
function parsePctBps(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, "").trim();
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

const AR_TRUE = new Set(["yes", "y", "true", "ar", "1"]);

/**
 * Map one new-deal row to the transaction it appends. Anything that would
 * corrupt money — a non-numeric amount, a fee over the cash — refuses with a
 * reason and stays out of the ledger until a human fixes it at the source.
 */
export function newDealToTransaction(
  row: NewDealRow,
  opts: { clientId: string; sheetId: string; offer: string | null },
): NewDealMapping {
  const cashCents = parseMoneyCents(row.cashCollected);
  if (cashCents === null) {
    return { ok: false, reason: `Unreadable cash collected "${row.cashCollected}".` };
  }
  const revenueCents = parseMoneyCents(row.revenueGenerated);
  if (revenueCents === null) {
    return {
      ok: false,
      reason: `Unreadable revenue generated "${row.revenueGenerated}".`,
    };
  }
  if (cashCents < 0 || revenueCents < 0) {
    return { ok: false, reason: "Negative amounts are not deals — check the row." };
  }
  const balanceCents = parseMoneyCents(row.balanceDue) ?? 0;
  const feeBps = parsePctBps(row.processorFeePct);
  if (feeBps === null) {
    return { ok: false, reason: `Unreadable processor fee "${row.processorFeePct}".` };
  }
  const processorFeeCents = Math.round((cashCents * feeBps) / 10_000);
  if (processorFeeCents > cashCents) {
    return { ok: false, reason: "Processor fee exceeds cash collected." };
  }
  if (!row.timestamp.trim()) {
    return { ok: false, reason: "Row has no timestamp — cannot key it safely." };
  }
  if (!row.dealDate.trim()) {
    return { ok: false, reason: "Row has no deal date." };
  }

  return {
    ok: true,
    row: {
      occurredOn: row.dealDate.trim(),
      direction: "in",
      layer: "client",
      clientId: opts.clientId,
      dealType: row.typeOfSale.trim() || "New Deal",
      offer: opts.offer,
      description:
        [row.clientName.trim(), row.programSold.trim()].filter(Boolean).join(" — ") ||
        null,
      paymentMethod: row.processor.trim() || null,
      revenueCents,
      cashCents,
      processorFeeCents,
      leadEmail: null,
      source: "sheet",
      idempotencyKey: newDealIdempotencyKey(opts.sheetId, row.timestamp.trim()),
      meta: {
        closerName: row.closerName.trim() || null,
        setterName: row.setterName.trim() || null,
        balanceCents,
        isAr: AR_TRUE.has(row.ar.trim().toLowerCase()),
        status: row.status.trim() || "closed",
      },
    },
  };
}

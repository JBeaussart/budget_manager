import { z } from "zod";

export const NormalizedTx = z.object({
  occurred_at: z.string(), // ISO date YYYY-MM-DD
  amount: z.number(),
  currency: z.string().default("EUR"),
  description: z.string().optional(),
  counterparty: z.string().optional(),
  category: z.string().optional(),
  budget_category: z.string().optional(),
  raw: z.any(),
});

export type NormalizedTx = z.infer<typeof NormalizedTx>;

function toIsoDate(input: unknown): string {
  const v = String(input ?? "").trim();
  // dd/mm/yyyy
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [_, d, mth, y] = m;
    const dd = d.padStart(2, "0");
    const mm = mth.padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  // Try Date parsing fallback
  const d2 = new Date(v);
  if (!isNaN(d2.getTime())) {
    return d2.toISOString().slice(0, 10);
  }
  throw new Error(`Invalid date: ${v}`);
}

function parseAmount(input: unknown): number {
  if (input === null || input === undefined) return NaN;
  let s = String(input).trim();
  // Remove currency symbol and spaces
  s = s.replace(/[€\s]/g, "");
  // Replace thousand separators and normalize decimal comma to dot
  // Heuristic: if both "," and "." exist, assume "." is thousands and "," is decimal (FR style)
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "");
  }
  s = s.replace(/,/g, ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeRow(
  row: any,
  map: Record<string, string>,
): NormalizedTx {
  // Date
  const rawDate = map.date ? row[map.date] : undefined;
  const occurred_at = toIsoDate(rawDate);

  // Amount
  let amount = NaN;
  if (map.amount) {
    amount = parseAmount(row[map.amount]);
  }

  if (!Number.isFinite(amount)) {
    // Optional pair debit/credit from source (not present in map but present in row)
    const debitKey = Object.keys(row).find(
      (k) =>
        k.toLowerCase().includes("débit") || k.toLowerCase().includes("debit"),
    );
    const creditKey = Object.keys(row).find(
      (k) =>
        k.toLowerCase().includes("crédit") ||
        k.toLowerCase().includes("credit"),
    );
    if (debitKey || creditKey) {
      const d = parseAmount(debitKey ? row[debitKey] : undefined);
      const c = parseAmount(creditKey ? row[creditKey] : undefined);
      if (Number.isFinite(c) && c !== 0) amount = c;
      else if (Number.isFinite(d) && d !== 0) amount = -Math.abs(d);
    }
  }

  // Adjust sign by transaction type keywords if available
  if (map.type) {
    const typeVal = String(row[map.type] ?? "").toLowerCase();
    if (
      /(debit|déb|sortie|retrait|prél|prelev|paiement|cb|carte)/.test(typeVal)
    ) {
      amount = -Math.abs(amount);
    } else if (/(credit|créd|entrée|virement reçu|recu|reçu)/.test(typeVal)) {
      amount = Math.abs(amount);
    }
  }

  if (!Number.isFinite(amount)) {
    const sourceColumn = map.amount || "(montant non défini)";
    const rawValue = map.amount ? row[map.amount] : undefined;
    throw new Error(
      `Montant invalide (colonne "${sourceColumn}", valeur "${String(rawValue ?? "")}")`,
    );
  }

  const description = map.description
    ? String(row[map.description] ?? "").trim() || undefined
    : undefined;
  const counterparty = map.counterparty
    ? String(row[map.counterparty] ?? "").trim() || undefined
    : undefined;
  const category = map["category"]
    ? String(row[map["category"]] ?? "").trim() || undefined
    : undefined;
  const budgetCategory = map["budget_category"]
    ? String(row[map["budget_category"]] ?? "").trim() || undefined
    : undefined;

  const parsed = {
    occurred_at,
    amount,
    currency: "EUR",
    description,
    counterparty,
    category,
    budget_category: budgetCategory,
    raw: row,
  };
  return NormalizedTx.parse(parsed);
}

export function normalizeRows(
  rows: any[],
  map: Record<string, string>,
): NormalizedTx[] {
  return rows.map((row, index) => {
    try {
      return normalizeRow(row, map);
    } catch (error) {
      if (error instanceof Error) {
        error.message = `[ligne ${index + 1}] ${error.message}`;
      }
      throw error;
    }
  });
}

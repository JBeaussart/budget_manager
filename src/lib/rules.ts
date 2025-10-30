import { supabase } from "./supabase";

export type Rule = {
  id: string;
  pattern: string;
  field?: never;
  category?: string | null;
  budget_category?: string | null;
  enabled: boolean;
};

type Categorizable = {
  description?: string | null;
  counterparty?: string | null;
};

export async function fetchRules(): Promise<Rule[]> {
  const baseQuery = supabase
    .from("rules")
    .select<Rule>("id, pattern, category, budget_category, enabled")
    .order("created_at", { ascending: true });
  const { data, error } = await baseQuery;
  if (!error) return data ?? [];

  const missingColumn =
    typeof error.message === "string" &&
    /budget_category/i.test(error.message || "");
  if (!missingColumn) {
    throw error;
  }

  const fallback = await supabase
    .from("rules")
    .select("id, pattern, category, enabled")
    .order("created_at", { ascending: true });
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((row: any) => ({
    ...row,
    budget_category: null,
  }));
}

const patternCache = new Map<string, { raw: string; normalized: string }>();

export function clearRulePatternCache() {
  patternCache.clear();
}

function normalizedPattern(rule: Rule): string {
  const cached = patternCache.get(rule.id);
  if (cached && cached.raw === rule.pattern) {
    return cached.normalized;
  }
  const normalized = normalize(rule.pattern);
  patternCache.set(rule.id, { raw: rule.pattern, normalized });
  return normalized;
}

function applyRuleField<Row extends Categorizable>(
  row: Row,
  rules: Rule[],
  field: "category" | "budget_category",
): string | "" {
  if (!rules.length) return "";
  const normalizedFields: Record<keyof Categorizable, string> = {
    description: normalize(row.description),
    counterparty: normalize(row.counterparty),
  };
  const fieldValues = Object.values(normalizedFields);
  for (const rule of rules) {
    const value = (rule as Record<string, unknown>)[field];
    if (!value || typeof value !== "string") continue;
    const pattern = normalizedPattern(rule);
    if (!pattern) continue;
    const matched = fieldValues.some((fieldValue) =>
      fieldValue.includes(pattern),
    );
    if (matched) {
      return value;
    }
  }
  return "";
}

export function applyRuleCategory<Row extends Categorizable>(
  row: Row,
  rules: Rule[],
): string | "" {
  return applyRuleField(row, rules, "category");
}

export function applyRuleBudgetCategory<Row extends Categorizable>(
  row: Row,
  rules: Rule[],
): string | "" {
  return applyRuleField(row, rules, "budget_category");
}

export function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

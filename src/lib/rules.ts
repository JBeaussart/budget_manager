import { supabase } from "./supabase";

export type Rule = {
  id: string;
  pattern: string;
  field?: never;
  category: string;
  enabled: boolean;
};

type Categorizable = {
  description?: string | null;
  counterparty?: string | null;
};

export async function fetchRules(): Promise<Rule[]> {
  const { data, error } = await supabase
    .from("rules")
    .select<Rule>("id, pattern, category, enabled")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
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

export function applyRuleCategory<Row extends Categorizable>(
  row: Row,
  rules: Rule[]
): string | "" {
  if (!rules.length) return "";
  const normalizedFields: Record<keyof Categorizable, string> = {
    description: normalize(row.description),
    counterparty: normalize(row.counterparty),
  };
  const fieldValues = Object.values(normalizedFields);
  for (const rule of rules) {
    const pattern = normalizedPattern(rule);
    if (!pattern) continue;
    const matched = fieldValues.some((value) => value.includes(pattern));
    if (matched) {
      return rule.category;
    }
  }
  return "";
}

export function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

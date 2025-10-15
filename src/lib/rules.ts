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

export function applyRuleCategory<Row extends Categorizable>(
  row: Row,
  rules: Rule[]
): string | "" {
  for (const rule of rules) {
    const pattern = normalize(rule.pattern);
    if (!pattern) continue;
    const fields: Array<"description" | "counterparty"> = [
      "description",
      "counterparty",
    ];
    const matched = fields.some((field) =>
      normalize((row as any)[field]).includes(pattern)
    );
    if (matched) {
      return rule.category;
    }
  }
  return "";
}

export function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

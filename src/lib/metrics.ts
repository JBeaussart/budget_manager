import type { NormalizedTx } from './normalizer'

export function sumIncome(rows: NormalizedTx[]): number {
  return rows.reduce((acc, r) => (r.amount > 0 ? acc + r.amount : acc), 0)
}

export function sumExpenses(rows: NormalizedTx[]): number {
  return rows.reduce((acc, r) => (r.amount < 0 ? acc + Math.abs(r.amount) : acc), 0)
}

export function saving(rows: NormalizedTx[]): number {
  return sumIncome(rows) - sumExpenses(rows)
}

export function groupByMonth(rows: NormalizedTx[]): Record<string, NormalizedTx[]> {
  return rows.reduce<Record<string, NormalizedTx[]>>((acc, r) => {
    const k = (r.occurred_at ?? '').slice(0, 7)
    if (!acc[k]) acc[k] = []
    acc[k].push(r)
    return acc
  }, {})
}

export function topCategories(rows: NormalizedTx[], n = 5): Array<{ category: string; total: number; count: number }> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    if (r.amount >= 0) continue
    const key = r.category ?? ''
    const entry = sums.get(key) ?? { total: 0, count: 0 }
    entry.total += Math.abs(r.amount)
    entry.count += 1
    sums.set(key, entry)
  }
  return Array.from(sums.entries())
    .map(([category, v]) => ({ category, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n)
}


import { supabase } from '/src/lib/supabaseClient'
import { sumIncome, sumExpenses, saving, groupByMonth, topCategories } from '/src/lib/metrics'

type Tx = {
  occurred_at: string
  amount: number
  category?: string
  description?: string
  counterparty?: string
}

const cardIncome = document.getElementById('card-income') as HTMLElement | null
const cardExpenses = document.getElementById('card-expenses') as HTMLElement | null
const cardSaving = document.getElementById('card-saving') as HTMLElement | null
const cardIncomeAvg = document.getElementById('card-income-avg') as HTMLElement | null
const cardExpensesAvg = document.getElementById('card-expenses-avg') as HTMLElement | null
const pieMonthLabel = document.getElementById('pie-month-label') as HTMLElement | null
const barRangeLabel = document.getElementById('bar-range-label') as HTMLElement | null
const feedback = document.getElementById('dash-feedback') as HTMLElement | null

const filterYear = document.getElementById('filter-year') as HTMLSelectElement | null
const filterMonth = document.getElementById('filter-month') as HTMLSelectElement | null

let pieChart: any = null
let barChart: any = null

const monthsFull = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1, // 1..12
  allMonths: false,
  rows: [] as Tx[],
  byMonth: {} as Record<string, Tx[]>,
}

function fmt(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}${abs.toFixed(2)} €`
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function setFeedback(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  if (!feedback) return
  const color = type === 'error' ? 'text-rose-600' : type === 'success' ? 'text-emerald-600' : 'text-slate-600'
  feedback.textContent = msg
  feedback.className = `mt-6 min-h-[1.25rem] text-sm ${color}`
}

function populateYearMonthSelectors() {
  if (!filterYear || !filterMonth) return
  const nowY = new Date().getFullYear()
  const years = []
  for (let y = nowY; y >= nowY - 5; y--) years.push(y)
  filterYear.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('')
  filterYear.value = String(state.year)
  const monthOptions = [`<option value="all">Année complète</option>`]
  monthOptions.push(...monthsFull.map((m, i) => `<option value="${i + 1}">${m}</option>`))
  filterMonth.innerHTML = monthOptions.join('')
  filterMonth.value = String(state.month)
}

async function fetchYear(year: number): Promise<Tx[]> {
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  const { data, error } = await supabase
    .from('transactions')
    .select('occurred_at, amount, category, description, counterparty')
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .order('occurred_at', { ascending: true })
    .limit(20000)
  if (error) throw error
  return (data || []) as Tx[]
}

function updateCardsAndPie() {
  const key = monthKey(state.year, state.month)
  const curRows = state.allMonths ? state.rows : (state.byMonth[key] || [])
  const rules = loadLocalRules()
  const rowsWithRules = rules.length ? curRows.map((r) => ({ ...r, category: applyRuleCategory(r, rules) || r.category })) : curRows
  const inc = sumIncome(curRows as any)
  const exp = sumExpenses(curRows as any)
  const sav = saving(curRows as any)
  if (cardIncome) cardIncome.textContent = fmt(inc)
  if (cardExpenses) cardExpenses.textContent = fmt(exp)
  if (cardSaving) cardSaving.textContent = fmt(sav)
  if (state.allMonths) {
    if (cardIncomeAvg) cardIncomeAvg.textContent = `Moyenne mensuelle: ${fmt(inc / 12)}`
    if (cardExpensesAvg) cardExpensesAvg.textContent = `Moyenne mensuelle: ${fmt(exp / 12)}`
  } else {
    if (cardIncomeAvg) cardIncomeAvg.textContent = ''
    if (cardExpensesAvg) cardExpensesAvg.textContent = ''
  }
  if (pieMonthLabel) pieMonthLabel.textContent = state.allMonths ? `Année ${state.year}` : `${monthsFull[state.month - 1]} ${state.year}`

  const top = topCategories(rowsWithRules as any, 8)
  const sumTop = top.reduce((a, b) => a + b.total, 0)
  // Compute total expenses for the pie on the same dataset as categories to avoid drift
  const totalExpForPie = sumExpenses(rowsWithRules as any)
  let others = totalExpForPie - sumTop
  // Ignore tiny floating errors (< 1 cent)
  if (Math.abs(others) < 0.01) others = 0
  const labels = top.map((t) => t.category || 'Non catégorisé')
  const data = top.map((t) => t.total)
  if (others > 0) {
    labels.push('Autres')
    data.push(others)
  }
  const colors = categoryColors(labels.length)

  const pieCanvas = document.getElementById('chart-categories') as HTMLCanvasElement | null
  // @ts-ignore
  const ChartLib = (window as any).Chart
  if (pieCanvas && ChartLib) {
    if (!pieChart) {
      pieChart = new ChartLib(pieCanvas.getContext('2d'), {
        type: 'pie',
        data: { labels, datasets: [{ data, backgroundColor: colors }] },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const label = ctx.label ? String(ctx.label) : ''
                  const value = typeof ctx.parsed === 'number' ? ctx.parsed : Number(ctx.parsed)
                  return `${label}: ${fmt(value)}`
                },
              },
            },
          },
        },
      })
    } else {
      pieChart.data.labels = labels
      pieChart.data.datasets[0].data = data
      pieChart.data.datasets[0].backgroundColor = colors
      pieChart.update()
    }
  }
}

function updateBar() {
  const labels = monthsFull.slice()
  const keys = Array.from({ length: 12 }, (_, i) => monthKey(state.year, i + 1))
  const barIncome = keys.map((k) => sumIncome((state.byMonth[k] || []) as any))
  const barExpense = keys.map((k) => sumExpenses((state.byMonth[k] || []) as any))
  if (barRangeLabel) barRangeLabel.textContent = String(state.year)

  const barCanvas = document.getElementById('chart-months') as HTMLCanvasElement | null
  // @ts-ignore
  const ChartLib = (window as any).Chart
  if (barCanvas && ChartLib) {
    if (!barChart) {
      barChart = new ChartLib(barCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Revenus', data: barIncome, backgroundColor: '#34d399' },
            { label: 'Dépenses', data: barExpense, backgroundColor: '#fb7185' },
          ],
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } },
      })
    } else {
      barChart.data.labels = labels
      barChart.data.datasets[0].data = barIncome
      barChart.data.datasets[1].data = barExpense
      barChart.update()
    }
  }
}

function categoryColors(n: number): string[] {
  const palette = ['#34d399','#60a5fa','#f472b6','#fbbf24','#fb7185','#a78bfa','#f59e0b','#4ade80','#22d3ee','#c084fc']
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(palette[i % palette.length])
  return out
}

async function loadYear(year: number) {
  setFeedback('Chargement de l\'année...', 'info')
  state.rows = await fetchYear(year)
  state.byMonth = groupByMonth(state.rows as any)
  setFeedback('')
  updateBar()
  updateCardsAndPie()
}

function bindFilters() {
  if (!filterYear || !filterMonth) return
  filterYear.addEventListener('change', async () => {
    state.year = Number(filterYear.value)
    await loadYear(state.year)
  })
  filterMonth.addEventListener('change', () => {
    const v = filterMonth.value
    if (v === 'all') {
      state.allMonths = true
    } else {
      state.allMonths = false
      state.month = Number(v)
    }
    updateCardsAndPie()
  })
}

async function init() {
  try {
    populateYearMonthSelectors()
    await loadYear(state.year)
    bindFilters()
  } catch (err) {
    console.error(err)
    setFeedback(err instanceof Error ? err.message : 'Erreur lors du chargement.', 'error')
  }
}

init()

export {}

// ----- Local rules helpers (shared behavior with transactions table) -----
type LocalRule = { pattern: string; field?: 'description' | 'counterparty'; category: string; enabled: boolean }

function loadLocalRules(): LocalRule[] {
  try {
    const raw = localStorage.getItem('bm_rules_v1')
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return (arr as any[]).filter((r) => r && r.enabled && r.pattern && r.category)
  } catch {
    return []
  }
}

function norm(v: unknown) {
  return String(v ?? '').toLowerCase()
}

function applyRuleCategory(row: Tx, rules: LocalRule[]): string | '' {
  for (const r of rules) {
    const pat = norm(r.pattern)
    if (!pat) continue
    const fields: Array<'description' | 'counterparty'> = r.field ? [r.field] : ['description', 'counterparty']
    if (fields.some((f) => norm((row as any)[f]).includes(pat))) return r.category
  }
  return ''
}

import { supabase } from '/src/lib/supabaseClient'

type Tx = {
  id: string
  occurred_at: string
  amount: number
  currency?: string
  description?: string
  counterparty?: string
  category?: string
}

const monthInput = document.getElementById('tx-filter-month') as HTMLInputElement | null
const catSelect = document.getElementById('tx-filter-category') as HTMLSelectElement | null
const searchInput = document.getElementById('tx-filter-search') as HTMLInputElement | null
const applyBtn = document.getElementById('tx-apply') as HTMLButtonElement | null
const resetBtn = document.getElementById('tx-reset') as HTMLButtonElement | null
const moreBtn = document.getElementById('tx-more') as HTMLButtonElement | null
const deleteAllBtn = document.getElementById('tx-delete-all') as HTMLButtonElement | null
const tbody = document.getElementById('tx-body') as HTMLElement | null
const stats = document.getElementById('tx-stats') as HTMLElement | null
const feedback = document.getElementById('tx-feedback') as HTMLElement | null
const applyRulesToggle = document.getElementById('tx-apply-rules') as HTMLInputElement | null

const PAGE_SIZE = 40
let page = 0
let total = 0

function setFeedback(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  if (!feedback) return
  const color = type === 'error' ? 'text-rose-600' : type === 'success' ? 'text-emerald-600' : 'text-slate-600'
  feedback.textContent = msg
  feedback.className = `mt-4 min-h-[1.25rem] text-sm ${color}`
}

function setStats(loaded: number) {
  if (!stats) return
  stats.textContent = total > 0 ? `${loaded} / ${total} lignes` : loaded > 0 ? `${loaded} lignes` : 'Aucune donnée.'
}

function formatAmount(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}${abs.toFixed(2)} €`
}

function formatDate(d: string) {
  // Expect YYYY-MM-DD, display DD/MM/YYYY
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return d
  return `${m[3]}/${m[2]}/${m[1]}`
}

function monthStartEnd(month: string | null) {
  if (!month) return [null, null] as const
  const [yStr, mStr] = month.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!y || !m) return [null, null] as const
  const start = `${yStr}-${mStr.padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${yStr}-${mStr.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return [start, end] as const
}

async function fetchPage(opts: { append?: boolean } = {}) {
  if (!tbody || !moreBtn) return
  const month = monthInput?.value || null
  const category = (catSelect?.value || '').trim()
  const search = (searchInput?.value || '').trim()

  const [start, end] = monthStartEnd(month)
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  setFeedback('Chargement...')
  moreBtn.disabled = true

  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false })

  if (start && end) {
    query = query.gte('occurred_at', start).lte('occurred_at', end)
  }
  if (category) {
    query = query.eq('category', category)
  }
  if (search) {
    const esc = search.replace(/%/g, '\\%').replace(/_/g, '\\_')
    query = query.or(`description.ilike.%${esc}%,counterparty.ilike.%${esc}%`)
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    console.error(error)
    setFeedback(error.message || 'Erreur de chargement', 'error')
    moreBtn.disabled = false
    return
  }

  total = count ?? 0
  if (!opts.append) {
    tbody.innerHTML = ''
  }

  const loadedBefore = tbody.querySelectorAll('tr').length
  const loadedAfter = loadedBefore + (data?.length || 0)

  // Load local rules if toggle is enabled
  const rules = applyRulesToggle?.checked ? loadLocalRules() : []

  // Known categories from filter select, current page, and local rules
  const categoriesSet = new Set<string>()
  if (catSelect) {
    for (let i = 0; i < catSelect.options.length; i++) {
      const v = catSelect.options[i].value
      if (v) categoriesSet.add(v)
    }
  }
  for (const r of (data || []) as Tx[]) {
    if (r.category) categoriesSet.add(r.category)
  }
  // Also include categories declared by local rules so users can pick them
  try {
    const ruleDefs = loadLocalRules()
    for (const rule of ruleDefs) {
      if (rule.category) categoriesSet.add(rule.category)
    }
  } catch {}

  for (const row of (data || []) as Tx[]) {
    const tr = document.createElement('tr')
    const amountClass = row.amount < 0 ? 'text-rose-600' : 'text-emerald-600'
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">${formatDate(row.occurred_at)}</td>
      <td class="px-3 py-2 text-slate-700">${row.description ?? ''}</td>
      <td class="px-3 py-2 text-slate-700">${row.counterparty ?? ''}</td>
      <td class="px-3 py-2 text-slate-700"></td>
      <td class="px-3 py-2 text-right font-medium ${amountClass}">${formatAmount(row.amount)}</td>
      <td class="px-3 py-2 text-right"></td>
    `
    const catTd = tr.children[3] as HTMLTableCellElement
    const actionsTd = tr.children[5] as HTMLTableCellElement

    // If a local rule applies, show the rule category and do not render the select
    const overlay = rules.length ? applyRuleCategory(row, rules) : ''
    if (overlay) {
      catTd.textContent = overlay
    } else {
      // Build select for category (persisted DB value) when no rule applies
      const select = document.createElement('select')
      select.className = 'max-w-56 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900'
      const opts: Array<{ value: string; label: string }> = [{ value: '', label: 'Non catégorisé' }]
      const sorted = Array.from(categoriesSet).sort((a, b) => a.localeCompare(b))
      for (const c of sorted) opts.push({ value: c, label: c })
      if (row.category && !categoriesSet.has(row.category)) {
        opts.push({ value: row.category, label: row.category })
      }
      for (const o of opts) {
        const opt = document.createElement('option')
        opt.value = o.value
        opt.textContent = o.label
        select.appendChild(opt)
      }
      select.value = row.category || ''

      // Persist update on change
      select.addEventListener('change', async () => {
        const prev = row.category || ''
        const next = select.value
        if (prev === next) return
        try {
          setFeedback('Mise à jour de la catégorie...')
          select.disabled = true
          const payload: any = { category: next || null }
          const { error: upErr } = await supabase.from('transactions').update(payload).eq('id', row.id)
          if (upErr) throw upErr
          row.category = next || ''
          setFeedback('Catégorie mise à jour.', 'success')
          // Ensure filter category list includes the new value
          if (catSelect && next && !Array.from(catSelect.options).some((o) => o.value === next)) {
            const o = document.createElement('option')
            o.value = next
            o.textContent = next
            catSelect.appendChild(o)
          }
        } catch (err: any) {
          console.error(err)
          setFeedback(err?.message || 'Impossible de mettre à jour la catégorie.', 'error')
          select.value = prev
        } finally {
          select.disabled = false
        }
      })

      catTd.appendChild(select)
    }

    // Delete button in actions column
    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50'
    delBtn.title = 'Supprimer'
    delBtn.setAttribute('aria-label', 'Supprimer')
    delBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="h-4 w-4">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M6 7h12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6m4-6v6" />
      </svg>`
    delBtn.addEventListener('click', async () => {
      const ok = window.confirm('Supprimer cette transaction ?')
      if (!ok) return
      try {
        setFeedback('Suppression...')
        delBtn.disabled = true
        const { error: delErr } = await supabase.from('transactions').delete().eq('id', row.id)
        if (delErr) throw delErr
        await fetchPage({ append: false })
        setFeedback('Transaction supprimée.', 'success')
      } catch (err: any) {
        console.error(err)
        setFeedback(err?.message || 'Suppression impossible.', 'error')
        delBtn.disabled = false
      }
    })
    actionsTd.appendChild(delBtn)

    tbody.appendChild(tr)
  }

  // Populate categories from the current loaded set if select has only default
  if (catSelect && catSelect.options.length <= 1) {
    const cats = new Set<string>()
    const { data: allCats } = await supabase
      .from('transactions')
      .select('category')
      .not('category', 'is', null)
      .neq('category', '')
      .limit(1000)
    for (const r of (allCats || []) as { category: string }[]) {
      cats.add(r.category)
    }
    const sorted = Array.from(cats).sort((a, b) => a.localeCompare(b))
    for (const c of sorted) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      catSelect.appendChild(o)
    }
  }

  setFeedback('')
  setStats(loadedAfter)
  moreBtn.disabled = loadedAfter >= (total || 0)
}

function applyFilters(resetPage = true) {
  if (resetPage) page = 0
  fetchPage({ append: false })
}

applyBtn?.addEventListener('click', () => applyFilters(true))
resetBtn?.addEventListener('click', () => {
  if (monthInput) {
    monthInput.value = ''
  }
  if (catSelect) catSelect.value = ''
  if (searchInput) searchInput.value = ''
  applyFilters(true)
})

moreBtn?.addEventListener('click', () => {
  page += 1
  fetchPage({ append: true })
})

applyRulesToggle?.addEventListener('change', () => {
  // Re-render current page to reflect rule overlay
  fetchPage({ append: false })
})

// Initial load: show latest 40 across all months (no month filter)
applyFilters(true)

// Re-render if rules change in another tab/page
window.addEventListener('storage', (e) => {
  if (e.key === 'bm_rules_v1' && applyRulesToggle?.checked) {
    fetchPage({ append: false })
  }
})

// Delete all transactions (current user)
deleteAllBtn?.addEventListener('click', async () => {
  const ok = window.confirm('Supprimer TOUTES vos transactions ? Cette action est irréversible.')
  if (!ok) return
  try {
    setFeedback('Suppression de toutes les transactions...')
    deleteAllBtn.disabled = true
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes?.user) throw userErr || new Error('Utilisateur introuvable')
    const userId = userRes.user.id
    const { error: delErr } = await supabase.from('transactions').delete().eq('user_id', userId)
    if (delErr) throw delErr
    page = 0
    if (catSelect) catSelect.value = ''
    await fetchPage({ append: false })
    setFeedback('Toutes vos transactions ont été supprimées.', 'success')
  } catch (err: any) {
    console.error(err)
    setFeedback(err?.message || 'Suppression impossible.', 'error')
  } finally {
    deleteAllBtn.disabled = false
  }
})

export {}

// ----- Local rules helpers -----
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

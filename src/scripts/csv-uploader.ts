import Papa from 'papaparse'
import { normalizeRows } from '/src/lib/normalizer'
import { supabase } from '/src/lib/supabaseClient'

const fileInput = document.getElementById('csv-file') as HTMLInputElement | null

const fileInfo = document.getElementById('csv-file-info') as HTMLElement | null
const btnPreview = document.getElementById('btn-preview') as HTMLButtonElement | null
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null
const btnImport = document.getElementById('btn-import') as HTMLButtonElement | null
const mappingEl = document.getElementById('mapping') as HTMLElement | null
const delimiterInfo = document.getElementById('delimiter-info') as HTMLElement | null
const previewEl = document.getElementById('preview') as HTMLElement | null
const previewBody = document.getElementById('preview-body') as HTMLElement | null
const feedback = document.getElementById('uploader-feedback') as HTMLElement | null

const targets = ['date', 'amount', 'description', 'counterparty', 'type'] as const

const state: any = {
  file: null as File | null,
  rows: [] as any[],
  fields: [] as string[],
  delimiter: ',',
  map: Object.fromEntries(targets.map((t) => [t, ''] as const)) as Record<string, string>,
}

function setFeedback(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  if (!feedback) return
  const color = type === 'error' ? 'text-rose-600' : type === 'success' ? 'text-emerald-600' : 'text-slate-600'
  feedback.textContent = msg
  feedback.className = `mt-4 min-h-[1.25rem] text-sm ${color}`
}

function resetAll() {
  state.file = null
  state.rows = []
  state.fields = []
  state.delimiter = ','
  state.map = Object.fromEntries(targets.map((t) => [t, '']))

  if (fileInput) fileInput.value = ''
  if (fileInfo) fileInfo.textContent = 'Aucun fichier sélectionné.'

  Array.from(document.querySelectorAll('[data-map-target]')).forEach((el) => {
    if (el instanceof HTMLSelectElement) {
      el.innerHTML = ''
    }
  })

  mappingEl?.classList.add('hidden')
  previewEl?.classList.add('hidden')
  if (btnPreview) btnPreview.disabled = true
  if (btnReset) btnReset.disabled = true
  if (btnImport) btnImport.disabled = true
  setFeedback('')
}

function guessMapping(fields: string[]) {
  const lower = fields.map((f) => ({ raw: f, l: f.toLowerCase() }))

  const findAny = (...candidates: string[]) => {
    const idx = lower.findIndex(({ l }) => candidates.some((c) => l.includes(c)))
    return idx >= 0 ? lower[idx].raw : ''
  }

  const findFirst = (preds: Array<(o: { l: string }) => boolean>) => {
    for (const pred of preds) {
      const hit = lower.find(pred)
      if (hit) return hit.raw
    }
    return ''
  }

  const date =
    findFirst([
      ({ l }) => l.includes('date') && (l.includes('opér') || l.includes('oper')),
      ({ l }) => l.includes('date') && !(l.includes('valeur') || l.includes('comptab')),
      ({ l }) => l.includes('date'),
    ]) || ''

  const amountPreferred = findAny('montant', 'amount', 'prix', 'value', 'sum')
  // If no generic amount column, leave amount blank and rely on Debit/Credit pair fallback in preview and normalization
  const amount = amountPreferred || ''

  const description =
    findFirst([
      ({ l }) => l.includes('libell') && (l.includes('opér') || l.includes('oper')),
      ({ l }) => l.includes('description'),
      ({ l }) => l.includes('libell'),
      ({ l }) => l.includes('informations compl') || l.includes('info compl'),
    ]) || ''

  const counterparty =
    findFirst([
      ({ l }) => l.includes('libell') && l.includes('simpl'),
      ({ l }) => l.includes('payee') || l.includes('bénéfic') || l.includes('benefic'),
      ({ l }) => l.includes('merchant') || l.includes('fournisseur'),
    ]) || ''

  const type = findAny('type operation', "type d'opération", 'type', 'sens', 'debit/credit', 'dr/cr', 'nature')

  return { date, amount, description, counterparty, type }
}

function populateMapping(fields: string[]) {
  const selects = Array.from(document.querySelectorAll('[data-map-target]'))
  const options = ['— (ignorer)', ...fields]
  const guessed = guessMapping(fields)
  targets.forEach((t) => (state.map[t] = ''))

  for (const el of selects) {
    if (!(el instanceof HTMLSelectElement)) continue
    const target = el.getAttribute('data-map-target') as string | null
    el.innerHTML = ''
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt === '— (ignorer)' ? '' : opt
      o.textContent = opt
      el.appendChild(o)
    }
    if (target && (guessed as any)[target]) {
      el.value = (guessed as any)[target]
      state.map[target] = (guessed as any)[target]
    } else {
      el.value = ''
    }
    el.addEventListener('change', () => {
      const key = el.getAttribute('data-map-target') || ''
      state.map[key] = el.value
      enforceUniqueForDescriptionAndCounterparty(key)
    })
  }
  enforceUniqueForDescriptionAndCounterparty()
}

function enforceUniqueForDescriptionAndCounterparty(changedKey = '') {
  const descKey = 'description'
  const cpKey = 'counterparty'
  const desc = state.map[descKey]
  const cp = state.map[cpKey]
  if (desc && cp && desc === cp) {
    const toClear = changedKey === descKey ? cpKey : descKey
    state.map[toClear] = ''
    const el = document.querySelector(`select[data-map-target="${toClear}"]`)
    if (el instanceof HTMLSelectElement) el.value = ''
    setFeedback('Le même champ ne peut pas être utilisé pour description et contrepartie. Un des deux a été réinitialisé.')
  }
}

function findField(includes: string | string[]) {
  const incs = Array.isArray(includes) ? includes : [includes]
  const lowered = state.fields.map((f: string) => ({ raw: f, l: String(f).toLowerCase() }))
  const hit = lowered.find(({ l }: { l: string }) => incs.some((s) => l.includes(s)))
  return hit?.raw || ''
}

function parseDecimal(v: unknown) {
  if (v === undefined || v === null) return NaN
  const s = String(v).replace(/\s+/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

function renderPreview() {
  if (!previewBody) return
  previewBody.innerHTML = ''
  const rows = state.rows.slice(0, 20)

  const debitField = findField(['débit', 'debit'])
  const creditField = findField(['crédit', 'credit'])

  for (const row of rows) {
    const tr = document.createElement('tr')
    let amountCell = ''
    if (debitField && creditField) {
      const d = parseDecimal(row[debitField])
      const c = parseDecimal(row[creditField])
      if (Number.isFinite(c) && c !== 0) amountCell = String(c)
      else if (Number.isFinite(d) && d !== 0) amountCell = String(-Math.abs(d))
    } else if (state.map.amount) {
      amountCell = row[state.map.amount] ?? ''
    }

    const cols = [
      state.map.date ? row[state.map.date] ?? '' : '',
      amountCell,
      state.map.description ? row[state.map.description] ?? '' : '',
      state.map.counterparty ? row[state.map.counterparty] ?? '' : '',
      'EUR',
      state.map.type ? row[state.map.type] ?? '' : ''
    ]
    for (const c of cols) {
      const td = document.createElement('td')
      td.className = 'px-3 py-2 text-slate-700'
      td.textContent = String(c ?? '')
      tr.appendChild(td)
    }
    previewBody.appendChild(tr)
  }
}

async function parseFile(file: File) {
  return new Promise<any>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimiter: '', // auto-detect
      complete: (res) => resolve(res),
      error: (err) => reject(err),
    })
  })
}

fileInput?.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) {
    resetAll()
    return
  }
  try {
    setFeedback('Analyse du fichier...')
    state.file = file
    if (fileInfo) fileInfo.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} Ko`

    const result = await parseFile(file)
    const { data = [], meta = {} } = result || {}
    const fields = Array.isArray((meta as any)?.fields) ? (meta as any).fields : Object.keys(data[0] || {})
    state.rows = Array.isArray(data) ? data : []
    state.fields = fields
    state.delimiter = (meta as any)?.delimiter || ','

    populateMapping(fields)
    if (delimiterInfo) delimiterInfo.textContent = `Séparateur détecté: "${state.delimiter}" • Colonnes: ${fields.length}`
    mappingEl?.classList.remove('hidden')
    if (btnPreview) btnPreview.disabled = state.rows.length === 0
    if (btnImport) btnImport.disabled = state.rows.length === 0
    if (btnReset) btnReset.disabled = false
    setFeedback(`Fichier chargé (${state.rows.length} lignes).`, 'success')
  } catch (err) {
    console.error(err)
    setFeedback("Impossible d'analyser le fichier. Vérifiez le format CSV.", 'error')
    mappingEl?.classList.add('hidden')
    previewEl?.classList.add('hidden')
    if (btnPreview) btnPreview.disabled = true
    if (btnReset) btnReset.disabled = false
  }
})

btnPreview?.addEventListener('click', () => {
  renderPreview()
  previewEl?.classList.remove('hidden')
})

btnReset?.addEventListener('click', () => resetAll())

async function doImport() {
  try {
    if (!state.rows.length) {
      setFeedback('Aucune ligne à importer.', 'error')
      return
    }
    if (!state.map.date) {
      setFeedback('Sélectionnez la colonne date avant d\'importer.', 'error')
      return
    }

    setFeedback('Normalisation des données...', 'info')
    const map = { date: state.map.date, amount: state.map.amount, description: state.map.description, counterparty: state.map.counterparty, type: state.map.type }
    const normalized = normalizeRows(state.rows, map)

    setFeedback('Récupération de la session...', 'info')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setFeedback('Session introuvable. Connectez-vous avant d\'importer.', 'error')
      return
    }

    setFeedback(`Import en cours (${normalized.length} lignes)...`, 'info')
    if (btnImport) btnImport.disabled = true
    if (btnPreview) btnPreview.disabled = true
    if (btnReset) btnReset.disabled = true

    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ rows: normalized }),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new Error(detail || `Echec import (HTTP ${res.status})`)
    }

    setFeedback(`Import terminé: ${normalized.length} ligne(s) envoyée(s).`, 'success')
  } catch (err) {
    console.error(err)
    const msg = err instanceof Error ? err.message : 'Erreur pendant l\'import.'
    setFeedback(msg, 'error')
  } finally {
    if (btnImport) btnImport.disabled = !state.rows.length
    if (btnPreview) btnPreview.disabled = !state.rows.length
    if (btnReset) btnReset.disabled = false
  }
}

btnImport?.addEventListener('click', () => doImport())

// Init
resetAll()

import { applyRuleCategory, fetchRules, type Rule } from "../lib/rules";
import { supabase } from "../lib/supabase";

type Tx = {
  id: string;
  occurred_at: string;
  amount: number;
  currency?: string;
  description?: string;
  counterparty?: string;
  category?: string;
};

const startInput = document.getElementById(
  "tx-filter-start"
) as HTMLInputElement | null;
const endInput = document.getElementById(
  "tx-filter-end"
) as HTMLInputElement | null;
const catSelect = document.getElementById(
  "tx-filter-category"
) as HTMLSelectElement | null;
const searchInput = document.getElementById(
  "tx-filter-search"
) as HTMLInputElement | null;
const applyBtn = document.getElementById(
  "tx-apply"
) as HTMLButtonElement | null;
const resetBtn = document.getElementById(
  "tx-reset"
) as HTMLButtonElement | null;
const pagination = document.getElementById(
  "tx-pagination"
) as HTMLElement | null;
const deleteAllBtn = document.getElementById(
  "tx-delete-all"
) as HTMLButtonElement | null;
const tbody = document.getElementById("tx-body") as HTMLElement | null;
const stats = document.getElementById("tx-stats") as HTMLElement | null;
const feedback = document.getElementById("tx-feedback") as HTMLElement | null;
const listTop = document.getElementById("tx-list-top") as HTMLElement | null;

const PAGE_SIZE = 40;
let page = 0;
let total = 0;
let rulesLoaded = false;
let rules: Rule[] = [];

async function refreshRules() {
  try {
    const fetched = await fetchRules();
    rules = fetched;
    rulesLoaded = true;
  } catch (err) {
    console.error(err);
  }
}

async function ensureRules() {
  if (!rulesLoaded) {
    await refreshRules();
  }
}

function setFeedback(msg: string, type: "info" | "success" | "error" = "info") {
  if (!feedback) return;
  const color =
    type === "error"
      ? "text-rose-600"
      : type === "success"
      ? "text-emerald-600"
      : "text-slate-600";
  feedback.textContent = msg;
  feedback.className = `mt-4 min-h-[1.25rem] text-sm ${color}`;
}

function setStats(loaded: number) {
  if (!stats) return;
  stats.textContent =
    total > 0
      ? `${loaded} / ${total} lignes`
      : loaded > 0
      ? `${loaded} lignes`
      : "Aucune donnée.";
}

function scrollToListTop() {
  if (listTop) {
    listTop.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function formatAmount(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(2)} €`;
}

function formatDate(d: string) {
  // Expect YYYY-MM-DD, display DD/MM/YYYY
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function rangeStartEnd() {
  const start = (startInput?.value || "").trim() || null;
  const end = (endInput?.value || "").trim() || null;
  return [start, end] as const;
}

async function fetchPage(opts: { append?: boolean } = {}) {
  if (!tbody) return;
  await ensureRules();
  const [start, end] = rangeStartEnd();
  const category = (catSelect?.value || "").trim();
  const search = (searchInput?.value || "").trim();

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  setFeedback("Chargement...");

  let query = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false });

  if (start) query = query.gte("occurred_at", start);
  if (end) query = query.lte("occurred_at", end);
  if (category) {
    query = query.eq("category", category);
  }
  if (search) {
    const esc = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(`description.ilike.%${esc}%,counterparty.ilike.%${esc}%`);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error(error);
    setFeedback(error.message || "Erreur de chargement", "error");
    return;
  }

  total = count ?? 0;
  // If current page is out of bounds (after deletion), clamp and refetch once
  const pageCount = Math.max(0, Math.ceil((total || 0) / PAGE_SIZE));
  if ((data?.length || 0) === 0 && total > 0 && page > 0 && page >= pageCount) {
    page = Math.max(0, pageCount - 1);
    await fetchPage({ append: false });
    return;
  }
  if (!opts.append) {
    tbody.innerHTML = "";
  }

  const loadedBefore = tbody.querySelectorAll("tr").length;
  const loadedAfter = loadedBefore + (data?.length || 0);

  const activeRules = rules.filter(
    (rule) => rule.enabled && rule.pattern && rule.category
  );

  // Known categories from filter select, current page, and rules
  const categoriesSet = new Set<string>();
  if (catSelect) {
    for (let i = 0; i < catSelect.options.length; i++) {
      const v = catSelect.options[i].value;
      if (v) categoriesSet.add(v);
    }
  }
  for (const r of (data || []) as Tx[]) {
    if (r.category) categoriesSet.add(r.category);
  }
  for (const rule of activeRules) {
    categoriesSet.add(rule.category);
  }

  for (const row of (data || []) as Tx[]) {
    const tr = document.createElement("tr");
    const amountClass = row.amount < 0 ? "text-rose-600" : "text-emerald-600";
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">${formatDate(row.occurred_at)}</td>
      <td class="px-3 py-2 text-slate-700">${row.description ?? ""}</td>
      <td class="px-3 py-2 text-slate-700">${row.counterparty ?? ""}</td>
      <td class="px-3 py-2 text-slate-700"></td>
      <td class="px-3 py-2 text-right font-medium ${amountClass}">${formatAmount(
      row.amount
    )}</td>
      <td class="px-3 py-2 text-right"></td>
    `;
    const catTd = tr.children[3] as HTMLTableCellElement;
    const actionsTd = tr.children[5] as HTMLTableCellElement;

    const overlay =
      activeRules.length > 0 ? applyRuleCategory(row, activeRules) : "";
    if (overlay) {
      catTd.textContent = overlay;
    } else {
      // Build select for category (persisted DB value)
      const select = document.createElement("select");
      select.className =
        "max-w-56 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900";
      const opts: Array<{ value: string; label: string }> = [
        { value: "", label: "Non catégorisé" },
      ];
      const sorted = Array.from(categoriesSet).sort((a, b) =>
        a.localeCompare(b)
      );
      for (const c of sorted) opts.push({ value: c, label: c });
      if (row.category && !categoriesSet.has(row.category)) {
        opts.push({ value: row.category, label: row.category });
      }
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        select.appendChild(opt);
      }
      select.value = row.category || "";

      // Persist update on change
      select.addEventListener("change", async () => {
        const prev = row.category || "";
        const next = select.value;
        if (prev === next) return;
        try {
          setFeedback("Mise à jour de la catégorie...");
          select.disabled = true;
          const payload: any = { category: next || null };
          const { error: upErr } = await supabase
            .from("transactions")
            .update(payload)
            .eq("id", row.id);
          if (upErr) throw upErr;
          row.category = next || "";
          setFeedback("Catégorie mise à jour.", "success");
          // Ensure filter category list includes the new value
          if (
            catSelect &&
            next &&
            !Array.from(catSelect.options).some((o) => o.value === next)
          ) {
            const o = document.createElement("option");
            o.value = next;
            o.textContent = next;
            catSelect.appendChild(o);
          }
        } catch (err: any) {
          console.error(err);
          setFeedback(
            err?.message || "Impossible de mettre à jour la catégorie.",
            "error"
          );
          select.value = prev;
        } finally {
          select.disabled = false;
        }
      });

      catTd.appendChild(select);
    }

    // Delete button in actions column
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className =
      "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50";
    delBtn.title = "Supprimer";
    delBtn.setAttribute("aria-label", "Supprimer");
    delBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="h-4 w-4">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M6 7h12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6m4-6v6" />
      </svg>`;
    delBtn.addEventListener("click", async () => {
      const ok = window.confirm("Supprimer cette transaction ?");
      if (!ok) return;
      try {
        setFeedback("Suppression...");
        delBtn.disabled = true;
        const { error: delErr } = await supabase
          .from("transactions")
          .delete()
          .eq("id", row.id);
        if (delErr) throw delErr;
        await fetchPage({ append: false });
        setFeedback("Transaction supprimée.", "success");
      } catch (err: any) {
        console.error(err);
        setFeedback(err?.message || "Suppression impossible.", "error");
        delBtn.disabled = false;
      }
    });
    actionsTd.appendChild(delBtn);

    tbody.appendChild(tr);
  }

  // Populate categories from the current loaded set if select has only default
  if (catSelect && catSelect.options.length <= 1) {
    const cats = new Set<string>();
    const { data: allCats } = await supabase
      .from("transactions")
      .select("category")
      .not("category", "is", null)
      .neq("category", "")
      .limit(1000);
    for (const r of (allCats || []) as { category: string }[]) {
      cats.add(r.category);
    }
    const sorted = Array.from(cats).sort((a, b) => a.localeCompare(b));
    for (const c of sorted) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      catSelect.appendChild(o);
    }
  }

  setFeedback("");
  setStats(loadedAfter);
  renderPagination();
}

function applyFilters(resetPage = true) {
  if (resetPage) page = 0;
  fetchPage({ append: false });
}

applyBtn?.addEventListener("click", () => applyFilters(true));
resetBtn?.addEventListener("click", () => {
  if (startInput) startInput.value = "";
  if (endInput) endInput.value = "";
  if (catSelect) catSelect.value = "";
  if (searchInput) searchInput.value = "";
  applyFilters(true);
});

// Pagination UI
function renderPagination() {
  if (!pagination) return;
  pagination.innerHTML = "";
  const pageCount = Math.max(0, Math.ceil((total || 0) / PAGE_SIZE));
  if (pageCount <= 1) return;

  const mkBtn = (
    label: string,
    opts: { disabled?: boolean; active?: boolean; onClick?: () => void } = {}
  ) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const base =
      "rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50";
    const normal = "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
    const active =
      "border-slate-900 bg-slate-900 text-white hover:bg-slate-800";
    btn.className = `${base} ${opts.active ? active : normal}`;
    btn.textContent = label;
    if (opts.disabled) btn.disabled = true;
    if (opts.onClick) btn.addEventListener("click", opts.onClick);
    return btn;
  };

  const addEllipsis = () => {
    const span = document.createElement("span");
    span.className = "px-1 text-slate-400";
    span.textContent = "…";
    pagination.appendChild(span);
  };

  // Prev
  pagination.appendChild(
    mkBtn("Précédent", {
      disabled: page <= 0,
      onClick: () => {
        if (page <= 0) return;
        page -= 1;
        scrollToListTop();
        fetchPage({ append: false });
      },
    })
  );

  // Numeric buttons with windowing
  const window = 2;
  const lastIndex = pageCount - 1;
  const start = Math.max(0, page - window);
  const end = Math.min(lastIndex, page + window);
  // Always include first and last
  const include = new Set<number>([0, lastIndex]);
  for (let i = start; i <= end; i++) include.add(i);
  const sorted = Array.from(include.values()).sort((a, b) => a - b);

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    if (prev !== null && p - (prev as number) > 1) addEllipsis();
    pagination.appendChild(
      mkBtn(String(p + 1), {
        active: p === page,
        onClick: () => {
          if (p === page) return;
          page = p;
          scrollToListTop();
          fetchPage({ append: false });
        },
      })
    );
  }

  // Next
  pagination.appendChild(
    mkBtn("Suivant", {
      disabled: page >= pageCount - 1,
      onClick: () => {
        if (page >= pageCount - 1) return;
        page += 1;
        scrollToListTop();
        fetchPage({ append: false });
      },
    })
  );
}

// Initial load: show latest 40 across all months (no month filter)
applyFilters(true);

window.addEventListener("rules:updated", () => {
  rulesLoaded = false;
  fetchPage({ append: false });
});

// Delete all transactions (current user)
deleteAllBtn?.addEventListener("click", async () => {
  const ok = window.confirm(
    "Supprimer TOUTES vos transactions ? Cette action est irréversible."
  );
  if (!ok) return;
  try {
    setFeedback("Suppression de toutes les transactions...");
    deleteAllBtn.disabled = true;
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user)
      throw userErr || new Error("Utilisateur introuvable");
    const userId = userRes.user.id;
    const { error: delErr } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId);
    if (delErr) throw delErr;
    page = 0;
    if (catSelect) catSelect.value = "";
    await fetchPage({ append: false });
    setFeedback("Toutes vos transactions ont été supprimées.", "success");
  } catch (err: any) {
    console.error(err);
    setFeedback(err?.message || "Suppression impossible.", "error");
  } finally {
    deleteAllBtn.disabled = false;
  }
});

export {};

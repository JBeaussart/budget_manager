import { supabase } from "../lib/supabase";

type Rule = {
  id: string;
  pattern: string;
  // optional: if omitted, applies to description or counterparty
  field?: "description" | "counterparty";
  category: string;
  enabled: boolean;
};

type Tx = {
  id: string;
  occurred_at: string;
  description?: string;
  counterparty?: string;
  category?: string;
};

const LS_KEY = "bm_rules_v1";

const form = document.getElementById("rule-form") as HTMLFormElement | null;
const inputPattern = document.getElementById(
  "rule-pattern"
) as HTMLInputElement | null;
const inputCategory = document.getElementById(
  "rule-category"
) as HTMLInputElement | null;
const inputEnabled = document.getElementById(
  "rule-enabled"
) as HTMLInputElement | null;
const rulesBody = document.getElementById("rules-body") as HTMLElement | null;
const rulesExport = document.getElementById(
  "rules-export"
) as HTMLButtonElement | null;
const rulesImport = document.getElementById(
  "rules-import"
) as HTMLButtonElement | null;

const monthInput = document.getElementById(
  "rc-month"
) as HTMLInputElement | null;
const applyBtn = document.getElementById(
  "rules-apply"
) as HTMLButtonElement | null;
const commitBtn = document.getElementById(
  "rules-commit"
) as HTMLButtonElement | null;
const allCheckbox = document.getElementById(
  "rc-all"
) as HTMLInputElement | null;
const feedback = document.getElementById(
  "rules-feedback"
) as HTMLElement | null;
const preview = document.getElementById("rules-preview") as HTMLElement | null;
const previewBody = document.getElementById(
  "rules-preview-body"
) as HTMLElement | null;
const previewSummary = document.getElementById(
  "rules-summary"
) as HTMLElement | null;
const exportChangesBtn = document.getElementById(
  "rules-export-changes"
) as HTMLButtonElement | null;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as Rule[];
  } catch {
    return [];
  }
}

function saveRules(rules: Rule[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rules));
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
  feedback.className = `min-h-[1.25rem] text-sm ${color}`;
}

function renderRules() {
  const rules = loadRules();
  if (!rulesBody) return;
  rulesBody.innerHTML = "";
  for (const r of rules) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">
        <input type="checkbox" data-action="toggle" data-id="${r.id}" ${
      r.enabled ? "checked" : ""
    } class="h-4 w-4 rounded border-slate-300 text-emerald-600" />
      </td>
      <td class="px-3 py-2 text-slate-700">${r.pattern}</td>
      <td class="px-3 py-2 text-slate-700">${r.category}</td>
      <td class="px-3 py-2 text-right">
        <div class="inline-flex gap-2">
          <button data-action="up" data-id="${
            r.id
          }" class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">↑</button>
          <button data-action="down" data-id="${
            r.id
          }" class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">↓</button>
          <button data-action="delete" data-id="${
            r.id
          }" class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Supprimer</button>
        </div>
      </td>
    `;
    rulesBody.appendChild(tr);
  }
}

function addRule(rule: Rule) {
  const rules = loadRules();
  rules.push(rule);
  saveRules(rules);
  renderRules();
}

function deleteRule(id: string) {
  const rules = loadRules().filter((r) => r.id !== id);
  saveRules(rules);
  renderRules();
}

function toggleRule(id: string, enabled: boolean) {
  const rules = loadRules().map((r) => (r.id === id ? { ...r, enabled } : r));
  saveRules(rules);
}

function moveRule(id: string, dir: "up" | "down") {
  const rules = loadRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= rules.length) return;
  const tmp = rules[idx];
  rules[idx] = rules[swapWith];
  rules[swapWith] = tmp;
  saveRules(rules);
  renderRules();
}

function norm(s: unknown) {
  return String(s ?? "").toLowerCase();
}

function applyRulesLocally(rows: Tx[], rules: Rule[]) {
  const active = rules.filter((r) => r.enabled && r.pattern && r.category);
  const changes: Array<{
    id: string;
    occurred_at: string;
    description: string;
    counterparty: string;
    oldCategory: string;
    newCategory: string;
  }> = [];

  for (const row of rows) {
    let newCat = row.category || "";
    for (const rule of active) {
      const pat = norm(rule.pattern);
      if (!pat) continue;
      const fieldsToCheck: Array<"description" | "counterparty"> = rule.field
        ? [rule.field]
        : ["description", "counterparty"];
      const matched = fieldsToCheck.some((f) =>
        norm((row as any)[f]).includes(pat)
      );
      if (matched) {
        newCat = rule.category;
        // First matching rule wins; break to keep deterministic order
        break;
      }
    }
    if (newCat && newCat !== (row.category || "")) {
      changes.push({
        id: row.id,
        occurred_at: row.occurred_at,
        description: row.description || "",
        counterparty: row.counterparty || "",
        oldCategory: row.category || "",
        newCategory: newCat,
      });
    }
  }
  return changes;
}

async function fetchScope(month: string | null, all: boolean): Promise<Tx[]> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  if (!all) {
    const ym = month || `${y}-${m}`;
    const [yy, mm] = ym.split("-");
    const start = `${yy}-${mm}-01`;
    const last = new Date(Number(yy), Number(mm), 0).getDate();
    const end = `${yy}-${mm}-${String(last).padStart(2, "0")}`;
    const { data, error } = await supabase
      .from("transactions")
      .select("id, occurred_at, description, counterparty, category")
      .gte("occurred_at", start)
      .lte("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data || []) as Tx[];
  }
  const { data, error } = await supabase
    .from("transactions")
    .select("id, occurred_at, description, counterparty, category")
    .order("occurred_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  return (data || []) as Tx[];
}

function renderPreview(changes: ReturnType<typeof applyRulesLocally>) {
  if (!preview || !previewBody || !previewSummary) return;
  if (!changes.length) {
    preview.classList.add("hidden");
    previewBody.innerHTML = "";
    previewSummary.textContent = "";
    return;
  }
  preview.classList.remove("hidden");
  previewBody.innerHTML = "";
  previewSummary.textContent = `${changes.length} transaction(s) auraient une nouvelle catégorie.`;

  for (const c of changes.slice(0, 50)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">${c.occurred_at}</td>
      <td class="px-3 py-2 text-slate-700">${c.description}</td>
      <td class="px-3 py-2 text-slate-700">${c.counterparty}</td>
      <td class="px-3 py-2 text-slate-700">${c.oldCategory}</td>
      <td class="px-3 py-2 text-slate-700">${c.newCategory}</td>
    `;
    previewBody.appendChild(tr);
  }
}

function exportChangesCSV(changes: ReturnType<typeof applyRulesLocally>) {
  const headers = ["id", "new_category"];
  const rows = changes.map((c) => [c.id, c.newCategory]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "category-updates.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Event wiring
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const pattern = (inputPattern?.value || "").trim();
  const category = (inputCategory?.value || "").trim();
  const enabled = !!inputEnabled?.checked;
  if (!pattern || !category) {
    setFeedback("Renseignez un mot-clé et une catégorie.", "error");
    return;
  }
  // Field is not required; rule will match description OR counterparty
  addRule({ id: uid(), pattern, category, enabled });
  inputPattern!.value = "";
  inputCategory!.value = "";
  setFeedback("Règle ajoutée.", "success");
});

rulesBody?.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const action = t.getAttribute("data-action");
  const id = t.getAttribute("data-id");
  if (!action || !id) return;
  if (action === "delete") {
    deleteRule(id);
    setFeedback("Règle supprimée.", "success");
  } else if (action === "up" || action === "down") {
    moveRule(id, action as "up" | "down");
  }
});

rulesBody?.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  const action = t.getAttribute("data-action");
  const id = t.getAttribute("data-id");
  if (action === "toggle" && id) {
    toggleRule(id, t.checked);
  }
});

rulesExport?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(loadRules(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rules.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

rulesImport?.addEventListener("click", async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("Invalid JSON rules");
      saveRules(arr);
      renderRules();
      setFeedback("Règles importées.", "success");
    } catch (err) {
      console.error(err);
      setFeedback("Fichier de règles invalide.", "error");
    }
  };
  input.click();
});

applyBtn?.addEventListener("click", async () => {
  try {
    setFeedback("Chargement des transactions...");
    const rows = await fetchScope(
      monthInput?.value || null,
      !!allCheckbox?.checked
    );
    const changes = applyRulesLocally(rows, loadRules());
    renderPreview(changes);
    setFeedback(
      changes.length ? "Prévisualisation prête." : "Aucun changement proposé.",
      changes.length ? "success" : "info"
    );
    exportChangesBtn!.onclick = () => exportChangesCSV(changes);
    if (commitBtn) commitBtn.onclick = () => doCommit(changes);
  } catch (err) {
    console.error(err);
    setFeedback(
      err instanceof Error
        ? err.message
        : "Erreur lors de la prévisualisation.",
      "error"
    );
  }
});

async function doCommit(changes: ReturnType<typeof applyRulesLocally>) {
  try {
    if (!changes.length) {
      setFeedback("Aucun changement à appliquer.", "info");
      return;
    }
    setFeedback("Mise à jour des catégories...", "info");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setFeedback("Session introuvable. Connectez-vous.", "error");
      return;
    }
    const updates = changes.map((c) => ({ id: c.id, category: c.newCategory }));
    const res = await fetch("/api/transactions/update-categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ updates }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || `HTTP ${res.status}`);
    }
    const payload = await res.json();
    setFeedback(
      `Catégories mises à jour: ${payload.updated}/${updates.length}.`,
      "success"
    );
    preview?.classList.add("hidden");
  } catch (err) {
    console.error(err);
    setFeedback(
      err instanceof Error ? err.message : "Erreur lors de l'application.",
      "error"
    );
  }
}

// Init
(function init() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  if (monthInput) monthInput.value = `${y}-${m}`;
  renderRules();
})();

export {};

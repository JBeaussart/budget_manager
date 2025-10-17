import { applyRuleCategory, type Rule } from "../lib/rules";
import { supabase } from "../lib/supabase";
import { rulesStore } from "./stores/rules-store";
import { createFeedbackController } from "./utils/feedback";
import { requireSession, requireUser } from "./utils/auth";

type Tx = {
  id: string;
  occurred_at: string;
  description?: string | null;
  counterparty?: string | null;
  category?: string | null;
};

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
const feedback = document.getElementById("rules-feedback") as HTMLElement | null;
const monthInput = document.getElementById(
  "rc-month"
) as HTMLInputElement | null;
const allCheckbox = document.getElementById(
  "rc-all"
) as HTMLInputElement | null;
const applyBtn = document.getElementById(
  "rules-apply"
) as HTMLButtonElement | null;
const commitBtn = document.getElementById(
  "rules-commit"
) as HTMLButtonElement | null;
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

let currentRules: Rule[] = [];

const feedbackCtrl = createFeedbackController(feedback, {
  baseClass: "min-h-[1.25rem] text-sm",
});
feedbackCtrl.clear();
const setFeedback = (msg: string, type: "info" | "success" | "error" = "info") =>
  feedbackCtrl.set(msg, type);

rulesStore.subscribe((rules) => {
  currentRules = rules;
  renderRules();
});

async function loadRules(force = false) {
  try {
    await rulesStore.ensure(force);
  } catch (err) {
    console.error(err);
    setFeedback(
      err instanceof Error ? err.message : "Impossible de charger les règles.",
      "error"
    );
  }
}

function renderRules() {
  if (!rulesBody) return;
  if (!currentRules.length) {
    rulesBody.innerHTML = `
      <tr>
        <td colspan="4" class="px-3 py-4 text-center text-sm text-slate-500">
          Aucune règle enregistrée.
        </td>
      </tr>
    `;
    return;
  }
  rulesBody.innerHTML = "";
  for (const rule of currentRules) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">
        <input type="checkbox" data-action="toggle" data-id="${rule.id}" ${
      rule.enabled ? "checked" : ""
    } class="h-4 w-4 rounded border-slate-300 text-emerald-600" />
      </td>
      <td class="px-3 py-2 text-slate-700">${rule.pattern}</td>
      <td class="px-3 py-2 text-slate-700">${rule.category}</td>
      <td class="px-3 py-2 text-right">
        <button data-action="delete" data-id="${
          rule.id
        }" class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Supprimer</button>
      </td>
    `;
    rulesBody.appendChild(tr);
  }
}

async function addRule(rule: {
  pattern: string;
  category: string;
  enabled: boolean;
}) {
  const user = await requireUser();
  const { error } = await supabase.from("rules").insert({
    user_id: user.id,
    pattern: rule.pattern,
    category: rule.category,
    enabled: rule.enabled,
  });
  if (error) throw error;
  await rulesStore.refresh();
}

async function toggleRule(id: string, enabled: boolean) {
  const { error } = await supabase
    .from("rules")
    .update({ enabled })
    .eq("id", id);
  if (error) throw error;
  await rulesStore.refresh();
}

async function deleteRule(id: string) {
  const { error } = await supabase.from("rules").delete().eq("id", id);
  if (error) throw error;
  await rulesStore.refresh();
}

function applyRulesLocally(rows: Tx[], rules: Rule[]) {
  const active = rules.filter(
    (rule) => rule.enabled && rule.pattern && rule.category
  );
  const changes: Array<{
    id: string;
    occurred_at: string;
    description: string;
    counterparty: string;
    oldCategory: string;
    newCategory: string;
  }> = [];
  if (!active.length) return changes;
  for (const row of rows) {
    const newCat = applyRuleCategory(row, active);
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
  for (const change of changes.slice(0, 50)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">${change.occurred_at}</td>
      <td class="px-3 py-2 text-slate-700">${change.description}</td>
      <td class="px-3 py-2 text-slate-700">${change.counterparty}</td>
      <td class="px-3 py-2 text-slate-700">${change.oldCategory}</td>
      <td class="px-3 py-2 text-slate-700">${change.newCategory}</td>
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
      r.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
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

async function doCommit(changes: ReturnType<typeof applyRulesLocally>) {
  try {
    if (!changes.length) {
      setFeedback("Aucun changement à appliquer.", "info");
      return;
    }
    setFeedback("Mise à jour des catégories...", "info");
    const session = await requireSession();
    const token = session.access_token;
    const updates = changes.map((change) => ({
      id: change.id,
      category: change.newCategory,
    }));
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
    notifyRulesUpdated();
  } catch (err) {
    console.error(err);
    setFeedback(
      err instanceof Error ? err.message : "Erreur lors de l'application.",
      "error"
    );
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pattern = (inputPattern?.value || "").trim();
  const category = (inputCategory?.value || "").trim();
  const enabled = !!inputEnabled?.checked;
  if (!pattern || !category) {
    setFeedback("Renseignez un mot-clé et une catégorie.", "error");
    return;
  }
  try {
    setFeedback("Création de la règle...", "info");
    await addRule({ pattern, category, enabled });
    if (inputPattern) inputPattern.value = "";
    if (inputCategory) inputCategory.value = "";
    if (inputEnabled) inputEnabled.checked = true;
    setFeedback("Règle enregistrée.", "success");
  } catch (err) {
    console.error(err);
    setFeedback(
      err instanceof Error ? err.message : "Impossible d'enregistrer la règle.",
      "error"
    );
  }
});

rulesBody?.addEventListener("change", async (event) => {
  const target = event.target as HTMLInputElement;
  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (action === "toggle" && id) {
    try {
      await toggleRule(id, target.checked);
      setFeedback("Règle mise à jour.", "success");
    } catch (err) {
      console.error(err);
      setFeedback(
        err instanceof Error ? err.message : "Échec de la mise à jour.",
        "error"
      );
    }
  }
});

rulesBody?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (action === "delete" && id) {
    const confirmDelete = window.confirm("Supprimer cette règle ?");
    if (!confirmDelete) return;
    try {
      await deleteRule(id);
      setFeedback("Règle supprimée.", "success");
    } catch (err) {
      console.error(err);
      setFeedback(
        err instanceof Error ? err.message : "Suppression impossible.",
        "error"
      );
    }
  }
});

applyBtn?.addEventListener("click", async () => {
  try {
    setFeedback("Chargement des transactions...");
    const rows = await fetchScope(
      monthInput?.value || null,
      !!allCheckbox?.checked
    );
    const changes = applyRulesLocally(rows, currentRules);
    renderPreview(changes);
    setFeedback(
      changes.length ? "Prévisualisation prête." : "Aucun changement proposé.",
      changes.length ? "success" : "info"
    );
    if (exportChangesBtn)
      exportChangesBtn.onclick = () => exportChangesCSV(changes);
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

(function init() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  if (monthInput) monthInput.value = `${y}-${m}`;
  loadRules();
})();

export {};

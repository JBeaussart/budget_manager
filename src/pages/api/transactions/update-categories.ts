import type { APIRoute } from "astro";
import { requireUserFromRequest } from "../../../lib/server/supabase-client";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requireUserFromRequest(request);
    if ("error" in auth) return auth.error;

    const { supabase } = auth;

    const body = await request.json().catch(() => null);
    const updates = Array.isArray(body?.updates) ? body.updates : null;
    if (!updates || !updates.length) {
      return new Response("Bad Request", { status: 400 });
    }

    type UpdatePayload = {
      id: string;
      payload: Record<string, string | null>;
    };

    const normalized: UpdatePayload[] = [];
    for (const u of updates) {
      const id = typeof u?.id === "string" ? u.id : null;
      if (!id) continue;
      const hasCategory = Object.prototype.hasOwnProperty.call(u, "category");
      const hasBudget = Object.prototype.hasOwnProperty.call(
        u,
        "budget_category",
      );
      if (!hasCategory && !hasBudget) continue;

      const entries: Array<[string, string | null]> = [];
      if (hasCategory) {
        const raw = typeof u.category === "string" ? u.category.trim() : "";
        entries.push(["category", raw ? raw : null]);
      }
      if (hasBudget) {
        const raw =
          typeof u.budget_category === "string" ? u.budget_category.trim() : "";
        entries.push(["budget_category", raw ? raw : null]);
      }
      if (!entries.length) continue;
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      const payload = Object.fromEntries(entries);
      normalized.push({ id, payload });
    }

    if (!normalized.length) {
      return new Response(JSON.stringify({ updated: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const grouped = new Map<
      string,
      { ids: string[]; payload: Record<string, string | null> }
    >();
    for (const update of normalized) {
      const key = JSON.stringify(update.payload);
      if (!grouped.has(key)) {
        grouped.set(key, { ids: [], payload: update.payload });
      }
      grouped.get(key)!.ids.push(update.id);
    }

    let updated = 0;
    try {
      const results = await Promise.all(
        Array.from(grouped.values()).map(async ({ ids, payload }) => {
          const { data, error } = await supabase
            .from("transactions")
            .update(payload)
            .in("id", ids)
            .select("id");
          if (error) throw error;
          return data?.length ?? 0;
        }),
      );
      updated = results.reduce((acc, count) => acc + count, 0);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update classifications";
      return new Response(message, { status: 400 });
    }

    return new Response(JSON.stringify({ updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(msg, { status: 500 });
  }
};

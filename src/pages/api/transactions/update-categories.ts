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

    const grouped = new Map<
      string,
      { ids: string[]; category: string | null }
    >();
    for (const u of updates) {
      const id = typeof u?.id === "string" ? u.id : null;
      const categoryValue =
        typeof u?.category === "string" ? u.category : null;
      if (!id) continue;
      const key = categoryValue ?? "__NULL__";
      if (!grouped.has(key)) {
        grouped.set(key, { ids: [], category: categoryValue });
      }
      grouped.get(key)!.ids.push(id);
    }

    if (!grouped.size) {
      return new Response(JSON.stringify({ updated: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    try {
      const results = await Promise.all(
        Array.from(grouped.values()).map(async ({ ids, category }) => {
          const { data, error } = await supabase
            .from("transactions")
            .update({ category })
            .in("id", ids)
            .select("id");
          if (error) throw error;
          return data?.length ?? 0;
        })
      );
      updated = results.reduce((acc, count) => acc + count, 0);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update categories";
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

import type { APIRoute } from "astro";
import { requireUserFromRequest } from "../../lib/server/supabase-client";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requireUserFromRequest(request);
    if ("error" in auth) return auth.error;

    const { supabase, user } = auth;

    const body = await request.json().catch(() => null);
    const rows = body?.rows;
    if (!Array.isArray(rows)) return new Response("Bad Request", { status: 400 });

    const payload = rows.map((r: any) => ({ ...r, user_id: user.id }));

    const { error } = await supabase.from("transactions").insert(payload);
    if (error) return new Response(error.message, { status: 400 });

    return new Response(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(msg, { status: 500 });
  }
};

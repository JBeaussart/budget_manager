import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type ClientOptions = {
  token?: string;
};

export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export function createSupabaseServerClient(
  options: ClientOptions = {}
): SupabaseClient {
  const client = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL!,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
    options.token
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${options.token}`,
            },
          },
        }
      : undefined
  );
  return client;
}

export async function requireUserFromRequest(
  request: Request
): Promise<
  | { supabase: SupabaseClient; user: User; token: string }
  | { error: Response }
> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: new Response("Unauthorized", { status: 401 }) };
  }

  const supabase = createSupabaseServerClient({ token });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: new Response("Unauthorized", { status: 401 }) };
  }

  return { supabase, user, token };
}

import type { APIRoute } from 'astro'
import { createClient } from '@supabase/supabase-js'

export const prerender = false

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const token = bearerToken(request.headers.get('authorization'))
    if (!token) return new Response('Unauthorized', { status: 401 })

    const supabase = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL!,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response('Unauthorized', { status: 401 })

    const body = await request.json().catch(() => null)
    const rows = body?.rows
    if (!Array.isArray(rows)) return new Response('Bad Request', { status: 400 })

    const payload = rows.map((r: any) => ({ ...r, user_id: user.id }))

    const { error } = await supabase.from('transactions').insert(payload)
    if (error) return new Response(error.message, { status: 400 })

    return new Response(null, { status: 204 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return new Response(msg, { status: 500 })
  }
}

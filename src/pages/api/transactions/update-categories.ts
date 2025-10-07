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
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response('Unauthorized', { status: 401 })

    const body = await request.json().catch(() => null)
    const updates = Array.isArray(body?.updates) ? body.updates : null
    if (!updates || !updates.length) {
      return new Response('Bad Request', { status: 400 })
    }

    let updated = 0
    for (const u of updates) {
      const id = typeof u?.id === 'string' ? u.id : null
      const category = typeof u?.category === 'string' ? u.category : null
      if (!id || category === null) continue
      const { error } = await supabase
        .from('transactions')
        .update({ category })
        .eq('id', id)
      if (!error) updated += 1
    }

    return new Response(JSON.stringify({ updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return new Response(msg, { status: 500 })
  }
}


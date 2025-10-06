import type { APIRoute } from 'astro'

const isProd = import.meta.env.PROD

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const raw = await request.text()

    let body: any
    try {
      body = raw ? JSON.parse(raw) : null
    } catch (error) {
      return new Response('Invalid JSON', { status: 400 })
    }

    const accessToken = body?.access_token
    const refreshToken = body?.refresh_token
    const expiresIn = typeof body?.expires_in === 'number' ? body.expires_in : 3600

    if (!accessToken) {
      return new Response('Missing access token', { status: 400 })
    }

    cookies.set('sb-access-token', accessToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: Math.max(expiresIn, 60),
    })

    if (refreshToken) {
      cookies.set('sb-refresh-token', refreshToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 60 * 60 * 24 * 365,
      })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    return new Response('Invalid payload', { status: 400 })
  }
}

export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete('sb-access-token', { path: '/' })
  cookies.delete('sb-refresh-token', { path: '/' })
  return new Response(null, { status: 204 })
}

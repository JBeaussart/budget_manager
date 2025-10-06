import type { MiddlewareHandler } from 'astro'

const PROTECTED_PREFIX = '/app'

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const url = new URL(ctx.request.url)

  if (!url.pathname.startsWith(PROTECTED_PREFIX)) {
    return next()
  }

  const accessToken = ctx.cookies.get('sb-access-token')?.value
  const refreshToken = ctx.cookies.get('sb-refresh-token')?.value

  if (!accessToken && !refreshToken) {
    const params = new URLSearchParams({ redirectTo: url.pathname + url.search })
    return ctx.redirect(`/login?${params.toString()}`)
  }

  return next()
}

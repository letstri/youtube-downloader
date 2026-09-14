import { timingSafeEqual } from 'node:crypto'

/**
 * The service is publicly reachable once deployed and it burns CPU, disk and
 * bandwidth per request, so gate it. If AUTH_TOKEN is unset the service is
 * open — fine for local dev, not for a public Railway URL.
 */
export function checkAuth(request: Request): Response | null {
  const expected = process.env.AUTH_TOKEN
  if (!expected) return null

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  const ok = a.length === b.length && timingSafeEqual(a, b)

  return ok ? null : json({ error: 'unauthorized' }, 401)
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function authRequired(): boolean {
  return Boolean(process.env.AUTH_TOKEN)
}

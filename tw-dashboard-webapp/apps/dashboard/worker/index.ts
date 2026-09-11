import { authenticate, type AuthEnv } from './auth.ts';
import { createApi } from './app.ts';
import { connect } from '../../../packages/db/src/index.ts';
type Env = AuthEnv & {
  HYPERDRIVE: { connectionString: string };
  ASSETS: { fetch: (r: Request) => Promise<Response> };
};
export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    let owner: string;
    try {
      owner = await authenticate(request, env);
    } catch {
      return Response.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Private dashboard. Sign in through the configured hostname.',
          },
        },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!new URL(request.url).pathname.startsWith('/api/')) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'same-origin');
      headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
      );
      return new Response(response.body, { status: response.status, headers });
    }
    if (!env.HYPERDRIVE?.connectionString)
      return Response.json(
        { error: { code: 'SETUP', message: 'Database is not configured' } },
        { status: 503 },
      );
    const db = connect(env.HYPERDRIVE.connectionString);
    try {
      return await createApi(() => db, owner).fetch(request);
    } finally {
      ctx.waitUntil(db.end());
    }
  },
};

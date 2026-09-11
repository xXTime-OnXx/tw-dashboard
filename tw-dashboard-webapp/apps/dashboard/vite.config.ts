import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createApi } from './worker/app.ts';
import { connect } from '../../packages/db/src/index.ts';
// Local-only adapter is not imported by the production Worker. No authentication bypass ships.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-api',
        configureServer(server) {
          const url =
            process.env.LOCAL_DATABASE_URL ??
            env.LOCAL_DATABASE_URL ??
            process.env.DATABASE_URL ??
            env.DATABASE_URL;
          let db: ReturnType<typeof connect> | undefined;
          server.middlewares.use('/api', async (req, res) => {
            if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: {
                    code: 'SETUP',
                    message:
                      'Start local PostgreSQL and set LOCAL_DATABASE_URL in .env. The local adapter refuses remote databases.',
                  },
                }),
              );
              return;
            }
            try {
              db ??= connect(url);
              const body: Buffer[] = [];
              for await (const c of req) body.push(Buffer.from(c));
              const origin = `http://${req.headers.host}`;
              const response = await createApi(() => db!, 'local@localhost').fetch(
                new Request(origin + '/api' + req.url, {
                  method: req.method,
                  headers: req.headers as Record<string, string>,
                  body: ['GET', 'HEAD'].includes(req.method ?? 'GET')
                    ? undefined
                    : Buffer.concat(body),
                }),
              );
              res.writeHead(response.status, Object.fromEntries(response.headers));
              res.end(Buffer.from(await response.arrayBuffer()));
            } catch {
              res.writeHead(503);
              res.end('Local database unavailable');
            }
          });
          server.httpServer?.once('close', () => void db?.end());
        },
      },
    ],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { chunkSizeWarningLimit: 1600 },
  };
});

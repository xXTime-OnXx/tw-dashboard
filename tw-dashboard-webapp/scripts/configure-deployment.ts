import { loadEnvFile } from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
try {
  loadEnvFile('.deploy.env');
} catch {}
const values = z
  .object({
    OWNER_EMAIL: z.email(),
    APP_ORIGIN: z
      .url()
      .refine(
        (v) => /^https:\/\/[a-z0-9.-]+$/.test(v),
        'HTTPS origin without trailing slash required',
      ),
    ACCESS_ISSUER: z.string().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
    ACCESS_AUD: z.string().min(10),
    HYPERDRIVE_ID: z.string().regex(/^[a-f0-9]{32}$/),
    CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .parse(process.env);
const configSource = await readFile('apps/dashboard/wrangler.jsonc', 'utf8');
const config = JSON.parse(configSource.replace(/,\s*([}\]])/g, '$1'));
const hostname = new URL(values.APP_ORIGIN).hostname;
const workersDev = hostname.endsWith('.workers.dev');

if (workersDev && !hostname.startsWith(`${config.name}.`)) {
  throw Error(
    `workers.dev origin must use the Worker name: https://${config.name}.<account>.workers.dev`,
  );
}

Object.assign(config, {
  account_id: values.CLOUDFLARE_ACCOUNT_ID,
  workers_dev: workersDev,
  hyperdrive: [{ binding: 'HYPERDRIVE', id: values.HYPERDRIVE_ID }],
  vars: {
    ACCESS_ISSUER: values.ACCESS_ISSUER,
    ACCESS_AUD: values.ACCESS_AUD,
    OWNER_EMAIL: values.OWNER_EMAIL,
    APP_ORIGIN: values.APP_ORIGIN,
  },
});
if (workersDev) delete config.routes;
else config.routes = [{ pattern: hostname, custom_domain: true }];
await writeFile('apps/dashboard/wrangler.production.json', JSON.stringify(config, null, 2) + '\n', {
  mode: 0o600,
});
console.log('Created ignored apps/dashboard/wrangler.production.json. No deployment performed.');

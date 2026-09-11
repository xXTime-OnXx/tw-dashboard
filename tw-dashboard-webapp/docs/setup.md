# Linked project

The `tw-dashboard-webapp` workspace is linked to the existing Neon project `tw-data` (`fancy-cherry-84839351`), branch `production`. The CLI stores the link in ignored `.neon` and connection values in ignored `.env.local` inside this folder. Never paste or commit these values. `neon.ts` intentionally declares no additional Neon services; Cloudflare still hosts and authenticates the dashboard.

Set LOCAL_DATABASE_URL to your loopback Docker database for local preview. The Vite development adapter rejects remote databases, even if Neon has pulled a production DATABASE_URL. Production schema migrations and importer/runtime roles remain a separate explicit setup step below.

# Configure your private deployment

This setup keeps the dashboard on your Cloudflare account and stores history in Neon. There is no need to share passwords in chat. The local preview works independently of these production settings.

## 1. Choose a hostname

You do not need to own a domain. For a personal first release, use the Cloudflare-provided address **tw-dashboard.YOUR-ACCOUNT-SUBDOMAIN.workers.dev**. Find the account subdomain under **Workers & Pages**. Cloudflare describes `workers.dev` as suitable for personal or hobby applications, and Cloudflare Access can protect it.

If you later add a domain managed by Cloudflare, you can instead use a custom hostname such as **tw.your-domain.com**. The deployment generator detects `*.workers.dev`; it enables that route without creating a custom domain. For any other hostname it creates a Worker custom-domain route.

Keep the exact HTTPS origin, without a trailing slash, for APP_ORIGIN.

## 2. Configure the existing Neon database

Open project `tw-data` in the [Neon console](https://console.neon.tech) and select its `production` branch. Do not create or rename a Neon project for this dashboard.

The examples below use `tw_dashboard` as the local database name. For production, use the database named by the linked branch's connection string; the Neon project name and PostgreSQL database name are separate settings.

- Start with the smallest suitable compute. Retain scale-to-zero if available; occasional cold-start latency is acceptable for personal use.
- Configure recovery retention before treating it as production. Choose at least 7 days if your plan supports it.

Use the **Connect** dialog to copy a **direct/non-pooled** SSL connection string for the initial migration owner. Put it in an ignored local `.env` as DATABASE_URL, then run:

```sh
node --env-file=.env --import=tsx packages/db/src/migrate.ts
```

This command changes the database named by DATABASE_URL. Verify it is your new production database before running it. Do not leave the production URL in your normal local development `.env` afterward; use a separately secured deployment environment.

Create two additional LOGIN roles in Neon's SQL editor: `tw_importer` and `tw_runtime`, each with its own randomly generated password. The migration owner remains separate. For example, execute these statements after replacing the password placeholders in the console:

```sql
CREATE ROLE tw_importer LOGIN PASSWORD 'REPLACE_WITH_A_RANDOM_PASSWORD';
CREATE ROLE tw_runtime LOGIN PASSWORD 'REPLACE_WITH_A_DIFFERENT_RANDOM_PASSWORD';
DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO tw_importer, tw_runtime',
    current_database()
  );
END
$$;
GRANT USAGE ON SCHEMA public TO tw_importer, tw_runtime;
GRANT CREATE ON SCHEMA public TO tw_importer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO tw_importer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tw_importer;
GRANT tw_importer TO neondb_owner;
ALTER TABLE player_history OWNER TO tw_importer;
ALTER TABLE village_history OWNER TO tw_importer;
ALTER TABLE tribe_history OWNER TO tw_importer;
REVOKE tw_importer FROM neondb_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tw_runtime;
GRANT INSERT, UPDATE ON annotations, preferences TO tw_runtime;
```

PostgreSQL 18 requires temporary `SET ROLE` authority before transferring table ownership. The grant above is only for that transfer and is revoked immediately. Then connect as `tw_importer` and configure the defaults for partitions it will create:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO tw_runtime;
```

Apply these grants after later migrations create additional tables as well. The runtime role must not inherit the importer or migration role. Do not use the default database-owner connection in the Worker.

Copy a direct SSL connection string for **tw_importer** into the GitHub secret described below. Use **tw_runtime** for Hyperdrive. Neon recommends direct connections for migrations; Hyperdrive supplies pooling for the Worker. [Neon connection guidance](https://neon.com/docs/connect/connection-pooling)

## 3. Configure Cloudflare Hyperdrive

In the Cloudflare dashboard, open **Storage & databases → Hyperdrive** (or search for Hyperdrive), then create a configuration:

- Name: `tw-dashboard-db`.
- Database type: PostgreSQL.
- Connection: Neon direct connection for **tw_runtime**, with SSL.
- **Query caching: disabled.** This app needs immediate annotation updates and coherent published observations.

Copy its configuration ID into HYPERDRIVE_ID. If using Wrangler instead, use the `--caching-disabled` option; avoid putting connection passwords into shell history. [Hyperdrive setup](https://developers.cloudflare.com/hyperdrive/get-started/), [caching options](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)

## 4. Configure owner-only Cloudflare Access

Open **Cloudflare Zero Trust / Cloudflare One**:

1. Choose a team name if this is your first setup. Its domain is `YOUR-TEAM.cloudflareaccess.com`; save `https://YOUR-TEAM.cloudflareaccess.com` as ACCESS_ISSUER.
2. Under login methods / identity providers, enable **One-time PIN** (email OTP).
3. For a `workers.dev` deployment, protect the Worker itself: **Workers & Pages → tw-dashboard → Access → Protect this Worker behind Access**, select production traffic, and create the policy below. Worker-level protection covers its production URL and avoids an unprotected alternate route. If the Worker has not been deployed yet, make one fail-closed bootstrap deployment using a placeholder audience such as `bootstrap-deny-all`, then configure Access and replace the placeholder immediately.
4. For a custom domain, open **Access → Applications → Add application → Self-hosted** and protect the exact hostname from step 1, including `/api/*`.
5. Name: `Tribal Wars dashboard`.
6. Session duration: **24 hours** is a reasonable starting value.
7. Login method: **One-time PIN**.
8. Add an **Allow** policy called `Owner only`, using **Include → Emails → your exact email address**. Do not choose Everyone or an entire email domain. Do not add a Bypass policy.
9. Save and copy the application's **Audience (AUD) tag** into ACCESS_AUD. For Worker-level Access, open the generated Access application if the Worker page does not show the tag.

Set OWNER_EMAIL to exactly the same email as the policy. This is the email that receives login codes. [Self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [AUD token field](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)

## 5. Generate the Worker configuration

From `tw-dashboard-webapp/`, copy `.deploy.env.example` to `.deploy.env` and fill all six values. The Cloudflare account ID is available in the account dashboard. None of these values is a database password; the owner email remains in ignored files.

```sh
pnpm deploy:configure
pnpm build
pnpm --filter @tw/dashboard exec wrangler login
pnpm --filter @tw/dashboard exec wrangler deploy --config wrangler.production.json
```

The generator writes ignored `apps/dashboard/wrangler.production.json` with the selected hostname mode, Hyperdrive binding and Worker variables. Preview URLs stay disabled. Generation does not deploy. A `workers.dev` bootstrap deployment remains fail-closed because the API and assets reject every request until Access supplies a valid JWT with the configured audience and exact owner email.

Alternatively, the four identity/origin values are plain Worker variables under **Workers & Pages → tw-dashboard → Settings → Variables and Secrets**. Keep generated configuration aligned with dashboard changes so a later deployment does not overwrite them.

No Neon password goes into Worker variables; the Hyperdrive binding supplies the runtime connection.

## 6. Configure GitHub imports

In this repository on GitHub, open **Settings → Environments → New environment**, name it **production-data**, and add these environment secrets:

| Secret               | Value                                      |
| -------------------- | ------------------------------------------ |
| IMPORT_DATABASE_URL  | Direct Neon SSL connection for tw_importer |
| R2_ENDPOINT_URL      | Existing collector R2 endpoint             |
| R2_ACCESS_KEY_ID     | R2 credential allowed to read the archive  |
| R2_SECRET_ACCESS_KEY | Corresponding R2 secret                    |
| R2_BUCKET            | Existing archive bucket name               |

Repository-level R2 secrets already used by the collector remain available; duplicating them in the environment is optional. Prefer a separate read-only R2 credential for the importer. Keep the collector's existing write credential unchanged.

Restrict environment deployment branches to your default branch. If you require manual environment approval, scheduled imports will wait for it; for unattended collection, permit the trusted default-branch workflow to run without per-run approval.

Commit/push the implementation when ready. In **Actions → Import collected data → Run workflow**, select `incremental` and `de259`. For historical loading, run `backfill` with YYYY-MM-DD bounds. Subsequent successful collection workflows trigger imports; reconciliation runs daily and scans the full archive on Sundays. No automatic production schema migrations or app deployments are enabled.

## 7. Verify access and data

- Open the hostname and sign in using your allowed email's OTP.
- Verify the map/table and private-note save/reload.
- In a separate private browser, verify a different email cannot access the app.
- Verify `/api/v1/worlds` is also protected. Worker-level Access protects all domains attached to that Worker; hostname-based Access requires separately disabling or protecting alternate routes.
- Check Data status after a collection/import cycle.
- Complete and record the backup/restore rehearsal in `docs/operations.md`.

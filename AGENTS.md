# Repository guidance

This repository contains two sibling projects. Keep their tooling, dependencies, secrets, and local runtime files within their respective folders.

## Dashboard work

- Read `tw-dashboard-webapp/AGENTS.md` and `tw-dashboard-webapp/docs/dashboard-plan.md` first.
- Run pnpm, Docker Compose, Neon, database, test, and deployment commands from `tw-dashboard-webapp/`.
- The linked Neon project is `tw-data`; its project link and environment files belong inside `tw-dashboard-webapp/`.

## Collector work

- Read `tw-data-service/README.md` before ingestion or data-contract changes.
- Preserve the existing Python collector unless the requested work specifically changes collection behavior.

## Shared repository work

- GitHub Actions workflow files must remain in `.github/workflows/`; set their working directory to the project they operate on.
- Preserve unrelated work and follow more specific AGENTS.md files when present.

# Tribal Wars Data Service

This directory contains the data-ingestion component for the Tribal Wars
project. It downloads public world data from die-staemme.de and stores
historical events and snapshots in a Cloudflare R2 bucket through its
S3-compatible API.

The service currently targets **de259** in the scheduled workflows, while every
CLI command accepts a different world identifier.

## Current state

The implemented collectors are:

- **Incremental conquests** — runs every five minutes, keeps a durable cursor,
  requests a two-minute overlap, and deduplicates events using stable SHA-256
  identifiers.
- **Hourly world snapshots** — stores players, villages, tribes, and player and
  tribe kill rankings as compressed, timestamped snapshots.
- **World configuration** — manually collects the world, unit, and building
  configuration when a new world starts.

Collection is implemented and covered by unit tests. Deployment uses GitHub
Actions and requires the R2 repository secrets described below. This component
does not yet provide a database, query API, transformations, retention policy,
or dashboard frontend.

## Repository layout

~~~text
src/tw_data/
  cli.py          Command-line entry point and collection orchestration
  client.py       Retrying HTTP client for public Tribal Wars endpoints
  conquests.py    Conquest parsing and deterministic event identifiers
  snapshots.py    Snapshot endpoint definitions and compression
  storage.py      Cloudflare R2 persistence and state manifests
tests/            Unit tests
pyproject.toml    Package metadata and dependencies
~~~

The GitHub Actions workflows live in the repository-level
**.github/workflows/** directory:

- **collect-conquests.yml** — scheduled every five minutes
- **collect-hourly.yml** — scheduled hourly at minute 17
- **collect-world-config.yml** — manual dispatch with a world input

## Storage layout

Conquests are stored individually:

~~~text
events/<world>/conquests/date=YYYY-MM-DD/hour=HH/<event-id>.json
state/<world>/conquest-cursor.json
~~~

Hourly and configuration payloads are gzip-compressed:

~~~text
snapshots/<world>/<dataset>/date=YYYY-MM-DD/hour=HH/<timestamp>.gz
state/<world>/snapshots/latest.json
state/<world>/world-config/latest.json
~~~

The latest manifests are written only after every payload in a collection has
been stored successfully.

## Local setup

Python 3.11 or newer is required.

~~~bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
~~~

Create a local **.env** file with:

~~~dotenv
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET=tribal-wars-data
~~~

The local **.env** file is ignored by Git and must never be committed. Load it
before invoking a collector:

~~~bash
set -a
source .env
set +a
~~~

Available commands:

~~~bash
tw-data collect-conquests --world de259
tw-data collect-hourly --world de259
tw-data collect-world-config --world de259
~~~

These commands write to the configured R2 bucket. Use test credentials or a
separate bucket when experimenting.

## GitHub Actions configuration

The repository must define these Actions secrets:

- **R2_ENDPOINT_URL**
- **R2_ACCESS_KEY_ID**
- **R2_SECRET_ACCESS_KEY**
- **R2_BUCKET**

The R2 credentials need Object Read & Write access and should be restricted to
the target bucket.

The configuration workflow is intentionally manual because these values are
mostly static. Run it once for each newly supported world. The other workflows
run on their schedules and can also be started manually from the GitHub Actions
page.

## Tests

Run the complete suite with:

~~~bash
pytest
~~~

The tests cover conquest parsing and deduplication, snapshot compression and
endpoint grouping, cursor persistence, R2 key construction, and separation of
hourly and configuration manifests.

## Dashboard integration

The TypeScript workspace in `../tw-dashboard-webapp` provides the query
database, importer and dashboard. It reads this archive without changing
existing keys.
Successful conquest runs also persist query-coverage records under
`state/<world>/conquest-checks/date=YYYY-MM-DD/<until>.json` after events are
stored and before the cursor advances. Records contain `world`, `queried_from`,
`queried_until` (Unix seconds), and `event_count`. These allow the dashboard to
distinguish a covered quiet interval from missing collection history. Legacy
archives without these records remain usable but cannot prove quiet intervals.

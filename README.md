# Tribal Wars data and dashboard

This repository contains two independent projects:

- [`tw-data-service`](tw-data-service/README.md) collects public Tribal Wars world data and archives it in R2.
- [`tw-dashboard-webapp`](tw-dashboard-webapp/README.md) imports that archive into PostgreSQL and serves the private Watchtower dashboard.

Run collector commands from `tw-data-service/` and dashboard commands from `tw-dashboard-webapp/`. GitHub workflows remain in the repository-level `.github/workflows/` directory because GitHub only discovers workflows there.

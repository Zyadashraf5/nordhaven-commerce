# Troubleshooting

- **Startup exits before listening**: inspect the safe `startup_failed` category.
  `configuration_invalid` names only invalid keys, `dependency_unavailable` identifies PostgreSQL,
  and `port_unavailable` identifies the non-secret port conflict. Confirm PostgreSQL with
  `pnpm db:wait`. Diagnostics intentionally omit supplied values, URLs, and exception messages.
- **Readiness is 503 after startup**: PostgreSQL became unavailable or a fresh bounded probe failed.
  Liveness should remain 200. Restore PostgreSQL and retry readiness; no restart is required.
- **Migration status fails**: stop and inspect committed migration history and the target database.
  Do not use reset or `db push` as a shortcut.
- **OpenAPI drift**: run `pnpm openapi:generate`, review the complete diff, then rerun
  `pnpm openapi:check`.
- **Docker commands fail**: ensure Docker Desktop/Engine is running with Linux containers and Compose
  v2. `docker compose config --quiet` does not prove that the daemon is running.
- **PostgreSQL 18 data does not appear persistent**: verify `docker compose config` mounts the
  `nordhaven-postgres` named volume at `/var/lib/postgresql`. Do not change it to
  `/var/lib/postgresql/data`, delete the volume, or reset the database while diagnosing the issue.
- **Windows path issue**: use PowerShell 7 and run scripts from the repository root. Hosted Windows
  CI is a portability check, not Windows 10 acceptance evidence.

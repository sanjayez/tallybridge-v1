# TallyBridge Progress

## Last Verified

- Verification command: `npm test`
- Latest checkpoint report: `runlogs/checkpoints/latest.json`
- Latest checkpoint folder: `runlogs/checkpoints/2026-04-26T09-54-03-882Z`
- Result: syntax check passed, web config check passed, database migration check passed, Next.js production build passed, checkpoint passed
- Blank-slate cleanup run: `runlogs/blank-slate-cleanup.20260426-022847.json`
- Post-cleanup smoke check: `npm run syntax:check` and `npm run web:config-check`

## What Works Now

- Control plane runs from `src/control-plane.js` and persists connections, commands, events, and heartbeats in SQLite.
- `POST /v1/connections` is idempotent when `tenantId + externalCustomerId` is provided, so repeated create/repair calls reuse one connection instead of creating duplicates.
- `GET /install/:pairingCode` serves the one-line PowerShell bootstrap used by `irm ... | iex`.
- No-admin install is the default path: files go under `%LOCALAPPDATA%\TallyBridge`, a current-user Startup shortcut is planned/created, and the bridge starts hidden after setup.
- The local agent pairs with the control plane, sends heartbeat health, watches Tally reachability, accepts loopback events, polls commands, and executes Tally XML operations.
- Health now separates bridge and Tally state:
  - green/active when bridge and Tally are online
  - orange/inactive when bridge is online but Tally is offline
  - red/unreachable when the bridge stops heartbeating
- Developer API read/write paths work for companies, ledgers, and create-ledger.
- Next.js Web UI exists under `apps/web` with TanStack Query for connection refresh, health polling, setup command display, company/ledger reads, ledger creation, and recent command status.
- Web UI now hydrates correctly at `http://127.0.0.1:3000` by allowing the `127.0.0.1` dev origin.
- Web UI dev server now binds to `127.0.0.1` only with `next dev apps/web -H 127.0.0.1 -p 3000` to avoid Windows Firewall private/public network prompts during local testing.
- `Create or repair` now updates the TanStack connection cache immediately and shows the freshly returned one-line setup command without a page reload.
- The Web UI now uses a local Windows profile key (`local-profile:{machine}:{username}`), hides historical demo rows, and shows one profile connection by default.
- `Create or repair` can adopt an existing active local profile connection, so old no-identifier demo rows do not force a second install for the same Windows profile.
- Hosted demo bootstrap is available: `/install/:pairingCode` downloads an allowlisted bridge bundle from `/download/bridge-manifest.json` and `/download/bridge-file`.
- Railway deployment commands are defined: `start:api`, `build:web`, and `start:web`.
- Hosted smoke test is available: `npm run hosted:smoke -- https://YOUR-API-DOMAIN`.
- Hosted install commands are now guarded against internal bind addresses such as `0.0.0.0`; the API page shows the configured public base URL and `hosted:smoke` fails if the generated one-liner is not public.

## Local Demo Runbook

1. Start the control plane: `npm run server`
2. Start the Web UI: `npm run web`
3. Open `http://127.0.0.1:3000`
4. Click `Create or repair` using a stable customer reference.
5. Run the displayed one-line setup command.
6. Start TallyPrime.
7. Use the Web UI to verify health, read companies, read ledgers, and create a test ledger.

## Checkpoint Coverage

- Starts an isolated control plane on port `8123`.
- Creates a connection, then creates it again with the same external customer reference to verify repair/idempotency.
- Fetches `/install/:pairingCode?dryRun=1` and verifies the bootstrap script renders correctly.
- Verifies Next dev-origin/config assumptions with `scripts/web-config-check.js`.
- Verifies old SQLite databases migrate cleanly with `scripts/db-migration-check.js`.
- Verifies active profile adoption with `scripts/profile-adoption-check.js`, including case-insensitive Windows machine-name matching.
- Verifies hosted bootstrap/config assumptions with `scripts/web-config-check.js`.
- Runs the installer dry-run and records planned no-admin actions.
- Starts mock Tally on port `9123`.
- Starts the agent with isolated state.
- Verifies pairing and health heartbeat.
- Posts a loopback event to the agent listener.
- Executes queued commands for:
  - `tally.list_companies`
  - `tally.list_ledgers`
  - `tally.create_ledger`
- Executes synchronous API calls for:
  - `GET /v1/connections/:id/companies`
  - `POST /v1/connections/:id/ledgers`
- Writes durable checkpoint artifacts to `runlogs/checkpoints/latest.json` and `runlogs/checkpoints/history.jsonl`.

## Remaining Product Gaps

- Agent transport is still HTTP polling; production target is outbound WSS with long-poll fallback.
- The agent is still Node-based in this environment; production target is a signed single binary.
- TDL/TCP bridge is represented by the current TDL file and loopback event contract, but the full Tally event-hook implementation still needs real Tally validation.
- Installer is a local-development bootstrap; production needs hosted bootstrap URLs, signed binary download, signature verification, and update channels.
- API auth, tenant API keys, webhooks, voucher/report endpoints, sandbox API keys, and OpenAPI docs are not complete yet.
- Startup shortcut path is implemented for no-admin installs, but broader validation is still needed across Windows/Tally installation variants.

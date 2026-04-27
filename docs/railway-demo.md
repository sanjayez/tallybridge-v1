# Railway Hosted Demo Runbook

This runbook hosts the TallyBridge demo with Railway while keeping the current SQLite control-plane database.

## Architecture

- `tallybridge-api`: Node control plane, install bootstrap, hosted bridge bundle, SQLite volume.
- `tallybridge-web`: Next.js Web UI, proxied to the API through `CONTROL_PLANE_URL`.
- Customer Windows machine: one-line PowerShell command downloads the bridge bundle, installs under `%LOCALAPPDATA%\TallyBridge`, and starts the local agent.

## Railway Services

Create two Railway services from the same GitHub repo.

### API Service

Use these commands:

```txt
Start command: npm run start:api
```

Attach a Railway volume to the API service:

```txt
Mount path: /app/data
```

Set variables:

```txt
NODE_ENV=production
BRIDGE_HOST=0.0.0.0
TALLYBRIDGE_DB_PATH=/app/data/tallybridge.db
TALLYBRIDGE_PUBLIC_BASE_URL=https://YOUR-API-DOMAIN
```

Railway provides `PORT`, so the API reads that automatically.

Generate a Railway public domain for this service. Use that domain for `TALLYBRIDGE_PUBLIC_BASE_URL`.

### Web Service

Use these commands:

```txt
Build command: npm run build:web
Start command: npm run start:web
```

Set variables:

```txt
NODE_ENV=production
CONTROL_PLANE_URL=https://YOUR-API-DOMAIN
```

Generate a Railway public domain for this service.

## What To Send Back To Codex

```txt
API Railway URL:
Web Railway URL:
Volume mount path:
API build/deploy logs if failing:
Web build/deploy logs if failing:
```

## Hosted Smoke Test

After the API deploys:

```powershell
npm run hosted:smoke -- https://YOUR-API-DOMAIN
```

This verifies:

- `POST /v1/connections`
- `GET /install/:pairingCode`
- `GET /download/bridge-manifest.json`
- required hosted bundle files

## Demo Flow

1. Open the hosted Web URL.
2. Click `Create or repair`.
3. Copy the generated one-line command.
4. Run it on the Windows machine with Tally installed.
5. Start Tally.
6. Watch the hosted UI move through:
   - pending/no bridge
   - bridge online but Tally closed
   - active when Tally XML is reachable
7. Run Companies, Ledgers, and Create ledger from the Web UI.

## Current Demo Limitation

The hosted demo bundle still runs the Node-based local agent. The bootstrap checks for `node` on the customer machine and fails clearly if Node is missing.

Production should replace this with a signed single binary and keep the same backend bootstrap/pairing flow.

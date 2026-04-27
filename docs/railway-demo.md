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
TALLYBRIDGE_WEB_URL=https://YOUR-WEB-DOMAIN
```

Railway provides `PORT`, so the API reads that automatically.

Generate a Railway public domain for this service. Use that domain for `TALLYBRIDGE_PUBLIC_BASE_URL`.

If you open the API domain in a browser, seeing the text `TallyBridge Control Plane` page is expected. That is not the dashboard.
The API page should show `Public base URL: https://YOUR-API-DOMAIN`. If it shows `0.0.0.0`, `127.0.0.1`, or `localhost`, fix `TALLYBRIDGE_PUBLIC_BASE_URL` before copying any setup command.

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

Open this Web service domain to see the dashboard.

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
2. Enter a stable customer reference, for example `sanforge-demo`.
3. Click `Create or repair`.
4. Copy the generated one-line command.
5. Run it on the Windows machine with Tally installed.
6. Start Tally.
7. Watch the hosted UI move through:
   - pending/no bridge
   - bridge online but Tally closed
   - active when Tally XML is reachable
8. Run Companies, Ledgers, and Create ledger from the Web UI.

In hosted mode, the dashboard cannot know the customer's Windows profile before the local bridge runs. The customer reference identifies the connection first; after pairing, the local bridge reports the actual Windows machine name through heartbeats.

The install output should include `Agent process started: <pid>` and an `Agent log:` folder. If it does not, run the diagnostic script on the Windows machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\TallyBridge\bundle\installer\windows\diagnose-bridge.ps1"
```

## Troubleshooting

If the setup command contains this shape, it is wrong for a remote Windows machine:

```powershell
irm 'http://0.0.0.0:8080/install/PAIRING-CODE' | iex
```

`0.0.0.0` is only the address the container listens on internally. Set this variable on the API Railway service, redeploy the API service, then click `Create or repair` again:

```txt
TALLYBRIDGE_PUBLIC_BASE_URL=https://YOUR-API-DOMAIN
```

The command copied from the Web UI should instead start with:

```powershell
irm 'https://YOUR-API-DOMAIN/install/PAIRING-CODE' | iex
```

## Current Demo Limitation

The hosted demo bundle still runs the Node-based local agent. The bootstrap checks for `node` on the customer machine and fails clearly if Node is missing.

Production should replace this with a signed single binary and keep the same backend bootstrap/pairing flow.

# Tally Connector MVP

This repo is now structured as a demoable MVP for a hosted Tally bridge:

- a Node.js control plane that tracks connectors and queues commands
- a TDL bridge loaded by Tally that polls for commands and executes them inside Tally
- a Windows PowerShell bootstrapper that installs the bridge and patches `tally.ini`

For the demo, the installer deploys `tdl/BR_Bridge.tdl` because that is the artifact available in this repo today. In production, the same install flow can swap that file for a compiled `.tcp`.

## MVP flow

1. Start the control plane with `npm run server`
2. Create a connection with `npm run demo -- create-connection`
3. Bootstrap the current-user bridge with `powershell -ExecutionPolicy Bypass -File .\installer\windows\install-bridge.ps1 -ServerUrl http://127.0.0.1:8000 -PairingCode <PAIRING_CODE>`
4. The bootstrapper writes current-user files, registers current-user startup, and starts the hidden bridge process
5. Queue demo commands from the CLI:
   - `npm run demo -- connectors`
   - `npm run demo -- health <connectionId>`
   - `npm run demo -- companies <connectionId>`
   - `npm run demo -- ledgers <connectionId>`
   - `npm run demo -- show-message <connectorId> "Hello from SaaS"`
   - `npm run demo -- create-ledger <connectorId> "Demo Customer 1"`
6. Run `npm run checkpoint` to boot the full dry-run stack and write a saved verification report

The setup model is no-admin by default. Each Windows user profile can have its own bridge. An admin path can be added later for machine-wide installs, but the MVP assumes current-user setup.

## Control plane endpoints

- `POST /tally/bridge`
  Used by the TDL bridge to heartbeat and fetch one queued command.
- `POST /tally/bridge/result`
  Reserved callback endpoint for bridge command results as the demo evolves.
- `GET /api/connectors`
  Lists discovered connector installations and heartbeat metadata.
- `GET /api/commands`
  Lists queued, delivered, and completed commands.
- `POST /api/connectors/:id/commands/show-message`
  Queues a `show_message` command.
- `POST /api/connectors/:id/commands/create-ledger`
  Queues a ledger import by wrapping XML in a Tally import envelope.
- `POST /v1/connections`
  Creates a new connection and pairing code.
- `GET /v1/connections/:id/health`
  Returns the latest connection and heartbeat state.
- `GET /v1/connections/:id/companies`
  Synchronously resolves the company list through the agent command bus.
- `GET /v1/connections/:id/ledgers`
  Synchronously resolves the ledger list through the agent command bus.
- `POST /v1/connections/:id/ledgers`
  Synchronously creates a ledger through the agent command bus.

## Demo positioning

This is intentionally a narrow design-partner MVP. It demonstrates:

- one-command style bootstrap on Windows
- per-install connector identity and token
- server-side connector discovery and command queueing
- remote-triggered imports into Tally through the bridge

It does not yet try to be a complete universal Tally API.

## Migration roadmap

The repo now also includes the first pass of the production bridge plan:

- target repo layout under `apps/`, `agent/`, `installer/`, and `protocol/`
- versioned protocol schemas for agent, control plane, and installer payloads
- implementation roadmap and interface notes in `docs/roadmap.md` and `docs/api-contracts.md`

The current MVP remains the working baseline while the production bridge is built alongside it.

## Verification

- `npm run syntax:check`
  Syntax-checks all repo JavaScript outside excluded generated folders.
- `npm run checkpoint`
  Boots the control plane, mock Tally server, local agent, installer dry-run, and an end-to-end command flow.
- `npm test`
  Runs syntax checks and the checkpoint flow together.

Checkpoint reports are written to `runlogs/checkpoints/`, with the latest saved at `runlogs/checkpoints/latest.json`.

## Health states

- `active / green`: bridge heartbeat is fresh and Tally is reachable.
- `inactive / orange`: bridge heartbeat is fresh and Tally is not reachable.
- `unreachable / red`: bridge heartbeat is stale or missing.
- `pending / gray`: connection exists but no bridge has paired yet.

## Notes on install

The bootstrap script looks for `tally.ini` in common TallyPrime and Tally.ERP9 locations. If your installation is in a custom location, update the script or patch `tally.ini` manually.

The installer writes:

- bridge artifact to `%LOCALAPPDATA%\TallyBridgeMVP\bridge`
- install metadata to `%LOCALAPPDATA%\TallyBridgeMVP\install-manifest.json`

## Progress tracking

Implementation status lives in `docs/progress.md`, and each verification run appends a new checkpoint summary to `runlogs/checkpoints/history.jsonl`.

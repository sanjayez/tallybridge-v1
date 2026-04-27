# TallyBridge Roadmap

## Current baseline

The current repo already proves three useful things:

- a local Tally-side bridge can call back to a hosted control plane
- a Windows bootstrapper can patch `tally.ini` and personalize a bridge artifact
- Tally XML imports can be wrapped behind a remote command flow

That baseline lives in:

- `src/control-plane.js`
- `src/tally-xml.js`
- `scripts/install-bridge.ps1`
- `tdl/BR_Bridge.tdl`

This is the right starting point, but it is still a demo architecture. The production bridge should move product logic into a local agent and shrink the TDL layer into an event and heartbeat emitter.

## Target architecture

### Layer 1: Tally integration

- Thin TDL or TCP plugin
- Emits `voucher.saved`, `ledger.saved`, `company.loaded`, and heartbeat signals to `127.0.0.1`
- Does not own cloud connectivity or business logic

### Layer 2: Local bridge

- Lightweight background process launched by the one-command bootstrap
- Owns Tally discovery, XML HTTP, loopback listener, local queue, cloud session, diagnostics, and update flow
- Supports both `xml_only` and `event_bridge` operation modes

### Layer 3: Cloud control plane

- Pairing flow and connection registry
- Agent session routing over WSS
- Command queue, idempotency, webhook dispatch, and health state

### Layer 4: Developer API

- Stable REST and webhook surface
- Tenant isolation, API keys, consistent errors, and eventually sandbox mode

## Target repo layout

```text
tally-connector/
  apps/
    control-plane/
      src/
        server/
        routes/
        services/
        store/
        protocol-adapters/
  agent/
    cmd/tallybridge-agent/
    internal/
      config/
      discovery/
      tallyhttp/
      loopback/
      cloud/
      queue/
      runtime/
      diagnostics/
  installer/
    windows/
      templates/
  protocol/
  docs/
```

## Component responsibilities

### Control plane

- Maintain durable `connections`, `commands`, `agent_sessions`, and `webhooks`
- Accept developer API requests
- Route commands to the correct connected agent
- Track health and degraded states

### Bridge process

- Discover Tally process, installation path, `tally.ini`, and XML port
- Execute XML reads and writes
- Listen on loopback for TDL events and heartbeats
- Buffer commands and results in SQLite
- Expose `active`, `inactive`, and `unreachable` health states through server heartbeats

### Bootstrapper

- Default to no-admin current-user mode
- Install bridge runtime and event bridge to `%LOCALAPPDATA%\TallyBridge`
- Register current-user startup
- Start the background bridge immediately
- Patch `tally.ini` when direct placement is not available
- Register watcher mode and write an uninstallable manifest

For multiple Windows users, each user can run the one-line setup and get an isolated current-user bridge. A later admin path can install machine-wide behavior, but it is not required for MVP.

### TDL or TCP bridge

- Only emit local events and heartbeats
- Optionally expose minimal status inside Tally
- Never own the cloud protocol

## Delivery phases

### Phase 1: Contracts and scaffolding

- Add target folder layout
- Define versioned protocol payloads
- Document migration path

### Phase 2: Control-plane hardening

- Split the current Node server into modules
- Replace file-backed state with a real store
- Add connection lifecycle and health endpoints

### Phase 3: Agent skeleton

- Create Windows agent runtime
- Add config, logging, install manifest support, and `--wait-for-tally`
- Implement Tally process and port discovery

### Phase 4: XML read path

- `Ping`
- `ListCompanies`
- `ListLedgers`
- `GetLedger`
- `ListVouchers`
- `TrialBalance`

### Phase 5: Installer upgrade

- No-admin current-user bootstrap
- Startup registration
- Uninstall path and repair path

### Phase 6: Write path

- `CreateLedger`
- `CreateVoucher`
- Import result parsing
- Idempotency keys and retry policy

### Phase 7: Event bridge

- Convert the existing TDL from manual polling into loopback event emission
- Add agent loopback `/event` and `/heartbeat`
- Feed webhook dispatch from agent-side event collection

### Phase 8: Production hardening

- Signed updates
- Webhook retries
- Diagnostics and telemetry
- Sandbox mode
- Decommission and uninstall commands

## Initial ticket backlog

### TB-001: Create versioned protocol contracts

- Check in schemas for command, result, event, heartbeat, connection, and install manifest payloads
- Make these the source of truth for future agent and control-plane code

### TB-002: Scaffold the production repo layout

- Add `apps/control-plane`, `agent`, `installer/windows`, and `protocol`
- Keep the current MVP entrypoints working during migration

### TB-003: Refactor the current Node control plane into modules

- Move the behavior in `src/control-plane.js` into `server`, `routes`, `services`, `store`, and `protocol-adapters`
- Preserve current demo endpoints during the refactor

### TB-004: Add a durable connection and command store

- Replace `data/demo-state.json`
- Track connections, commands, heartbeats, and webhook registrations

### TB-005: Add connection lifecycle endpoints

- `POST /v1/connections`
- `GET /v1/connections`
- `GET /v1/connections/:id`
- `GET /v1/connections/:id/health`

### TB-006: Scaffold the Go agent

- Add CLI entrypoint
- Add config loading and structured logging
- Add loopback HTTP server shell

### TB-007: Implement Tally discovery

- Discover Tally PID
- Discover XML port
- Discover install path and `tally.ini`
- Confirm XML connectivity

### TB-008: Implement XML read operations

- Move the XML envelope work out of the TDL layer and into the agent
- Normalize XML responses into JSON payloads used by the control plane

### TB-009: Upgrade the installer

- Add admin detection
- Add admin and user-space install paths
- Add manifest writing and uninstall support

### TB-010: Convert the TDL into an event bridge

- Replace manual `Alt+B` command polling
- Emit local events to the agent
- Support heartbeat and degraded-mode detection

## Recommended execution order

1. TB-001
2. TB-002
3. TB-003
4. TB-004
5. TB-005
6. TB-006
7. TB-007
8. TB-008
9. TB-009
10. TB-010

## Guardrails

- Do not break the current demo while adding the new production path
- Keep the TDL layer thin
- Ship XML-only mode before blocking on TCP compilation
- Treat degraded mode as a first-class state, not an error
- Treat no-admin current-user setup as the default product path
- Version every cross-process payload from the start

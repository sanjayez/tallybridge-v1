# TallyBridge API and Protocol Contracts

## Purpose

This document defines the first stable boundaries between:

- developer API and control plane
- control plane and local agent
- local TDL or TCP bridge and local agent
- installer and local runtime

The JSON schemas under `protocol/` are the source of truth for these payloads.

## Developer API surface

### Connections

- `POST /v1/connections`
- `GET /v1/connections`
- `GET /v1/connections/:id`
- `GET /v1/connections/:id/health`
- `DELETE /v1/connections/:id`

### Data

- `GET /v1/connections/:id/companies`
- `GET /v1/connections/:id/ledgers`
- `GET /v1/connections/:id/ledgers/:name`
- `GET /v1/connections/:id/vouchers`
- `POST /v1/connections/:id/ledgers`
- `POST /v1/connections/:id/vouchers`

### Reports

- `GET /v1/connections/:id/reports/trial-balance`

### Webhooks

- `POST /v1/webhooks`
- `GET /v1/webhooks`
- `DELETE /v1/webhooks/:id`

## Control plane to agent

Commands are durable and idempotent.

Required fields:

- `schema_version`
- `command_id`
- `connection_id`
- `type`
- `requested_at`
- `payload`

Recommended command types for v1:

- `connection.pair`
- `agent.decommission`
- `tally.list_companies`
- `tally.list_ledgers`
- `tally.get_ledger`
- `tally.list_vouchers`
- `tally.create_ledger`
- `tally.create_voucher`
- `tally.get_report`

## Agent to control plane

Results must include:

- `schema_version`
- `command_id`
- `connection_id`
- `status`
- `completed_at`

Result states:

- `completed`
- `failed`
- `retryable_failure`

Health heartbeats must include:

- `schema_version`
- `connection_id`
- `agent_id`
- `status`
- `mode`
- `sent_at`

## TDL or TCP bridge to local agent

The bridge is local only and never talks directly to the cloud in the target design.

Loopback endpoints:

- `POST /event`
- `POST /heartbeat`

Event payloads should carry enough identity to support delta fetches:

- `type`
- `company`
- `object_type`
- `master_id`
- `alter_id`
- `ts`

Heartbeat payloads should confirm:

- running Tally version
- loaded company
- event bridge mode

## Installer to runtime

The installer writes an install manifest that the agent and uninstall flow can both trust.

Required fields:

- `schema_version`
- `install_id`
- `install_mode`
- `installed_at`
- `agent_path`
- `watcher_mode`

Optional fields:

- `tcp_path`
- `tally_ini_path`
- `tally_install_path`
- `connection_seed`

## Status model

Connection and heartbeat states should use the same vocabulary:

- `pending`
- `waiting_for_tally`
- `active`
- `active_degraded`
- `offline`
- `error`
- `decommissioned`

## Error model

Agent and API should normalize low-level failures into a shared set of codes:

- `TALLY_UNREACHABLE`
- `TALLY_PORT_NOT_FOUND`
- `TALLY_NOT_RUNNING`
- `COMPANY_NOT_LOADED`
- `XML_PARSE_ERROR`
- `IMPORT_REJECTED`
- `AUTH_EXPIRED`
- `CLOUD_DISCONNECTED`
- `UNSUPPORTED_OPERATION`

# Queue Package

Owns local buffering for commands, results, event batches, and idempotency records.

The agent uses `node:sqlite` when available. Hosted Windows demo installs can also run on Node 20, so the queue automatically falls back to JSONL files when `node:sqlite` is unavailable.

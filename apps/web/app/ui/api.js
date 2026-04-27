"use client";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`/control${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

export function formatRelative(value) {
  if (!value) {
    return "Never";
  }

  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) {
    return value;
  }

  if (ms < 5000) {
    return "Just now";
  }

  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s ago`;
  }

  if (ms < 3600000) {
    return `${Math.round(ms / 60000)}m ago`;
  }

  return `${Math.round(ms / 3600000)}h ago`;
}

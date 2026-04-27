"use strict";

async function requestJson(url, { method = "GET", token = null, body = null, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(parsed.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function createControlPlaneClient({ controlPlaneUrl }) {
  return {
    async pairAgent(payload) {
      return requestJson(`${controlPlaneUrl}/v1/agent/pair`, {
        method: "POST",
        body: payload,
      });
    },

    async poll(token, heartbeat) {
      return requestJson(`${controlPlaneUrl}/v1/agent/poll`, {
        method: "POST",
        token,
        body: heartbeat,
      });
    },

    async submitResult(token, result) {
      return requestJson(`${controlPlaneUrl}/v1/agent/results`, {
        method: "POST",
        token,
        body: result,
      });
    },

    async submitEvents(token, events) {
      return requestJson(`${controlPlaneUrl}/v1/agent/events`, {
        method: "POST",
        token,
        body: { events },
      });
    },
  };
}

module.exports = {
  createControlPlaneClient,
};

"use client";

import {
  Activity,
  Building2,
  CheckCircle2,
  CircleAlert,
  Clipboard,
  Database,
  ListRestart,
  Plus,
  RefreshCcw,
  Router,
  Send,
  Server,
  TerminalSquare,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, formatRelative } from "./api";

const colorClass = {
  green: "statusGreen",
  orange: "statusOrange",
  red: "statusRed",
  gray: "statusGray",
};

function buildInstallCommand(pairingCode) {
  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm 'http://127.0.0.1:8000/install/${pairingCode}' | iex"`;
}

function statusLabel(value) {
  const labels = {
    active: "Active",
    active_degraded: "Active (XML fallback)",
    inactive: "Tally closed",
    pending: "Pending setup",
    unreachable: "Bridge unreachable",
    waiting_for_tally: "Waiting for Tally",
  };
  return labels[value] || value || "Unknown";
}

function StatusPill({ color = "gray", children }) {
  return <span className={`statusPill ${colorClass[color] || colorClass.gray}`}>{children}</span>;
}

function IconButton({ icon: Icon, children, onClick, disabled = false, type = "button" }) {
  return (
    <button className="iconButton" type={type} onClick={onClick} disabled={disabled}>
      <Icon size={16} />
      <span>{children}</span>
    </button>
  );
}

function SectionTitle({ icon: Icon, title, action }) {
  return (
    <div className="sectionTitle">
      <div>
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [customerRef, setCustomerRef] = useState("demo-customer");
  const [ledgerName, setLedgerName] = useState(`Bridge Test ${Date.now().toString().slice(-5)}`);
  const [lastAction, setLastAction] = useState(null);
  const [latestInstall, setLatestInstall] = useState(null);

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: async () => (await apiRequest("/v1/connections")).data,
  });

  const connections = connectionsQuery.data || [];
  const displayConnections = useMemo(() => {
    if (!connections.length) {
      return [];
    }

    const requestedRef = customerRef.trim();
    if (requestedRef) {
      const customerMatches = connections.filter(
        (connection) => connection.externalCustomerId === requestedRef
      );
      if (customerMatches.length) {
        return customerMatches;
      }
    }

    return connections.filter((connection) => connection.tenantId === "demo-tenant").slice(0, 1);
  }, [connections, customerRef]);

  const selectedConnection = useMemo(
    () =>
      selectedId
        ? displayConnections.find((connection) => connection.id === selectedId) || null
        : displayConnections.find((connection) => connection.pairingCode) || displayConnections[0] || null,
    [displayConnections, selectedId]
  );

  useEffect(() => {
    if (!displayConnections.length) {
      return;
    }

    const selectedStillExists = displayConnections.some((connection) => connection.id === selectedId);
    if (latestInstall?.connectionId === selectedId) {
      return;
    }

    if (!selectedId || !selectedStillExists) {
      const preferred =
        displayConnections.find((connection) => connection.pairingCode) || displayConnections[0];
      setSelectedId(preferred.id);
    }
  }, [displayConnections, latestInstall, selectedId]);

  const healthQuery = useQuery({
    queryKey: ["health", selectedConnection?.id],
    enabled: Boolean(selectedConnection?.id),
    queryFn: async () => (await apiRequest(`/v1/connections/${selectedConnection.id}/health`)).data,
  });

  const commandsQuery = useQuery({
    queryKey: ["commands", selectedConnection?.id],
    enabled: Boolean(selectedConnection?.id),
    queryFn: async () => (await apiRequest(`/v1/connections/${selectedConnection.id}/commands`)).data,
  });

  const createConnection = useMutation({
    mutationFn: async () =>
      apiRequest("/v1/connections", {
        method: "POST",
        body: {
          tenantId: "demo-tenant",
          externalCustomerId: customerRef,
          metadata: {
            createdFrom: "web-ui",
          },
        },
      }),
    onSuccess: (payload) => {
      setSelectedId(payload.data.id);
      queryClient.setQueryData(["connections"], (current = []) => [
        payload.data,
        ...current.filter((connection) => connection.id !== payload.data.id),
      ]);
      setLatestInstall({
        connectionId: payload.data.id,
        pairingCode: payload.install?.pairingCode || payload.data.pairingCode,
        installCommand:
          payload.install?.installCommand ||
          buildInstallCommand(payload.install?.pairingCode || payload.data.pairingCode),
      });
      setLastAction({
        title: payload.meta?.created ? "Connection created" : "Existing connection returned",
        payload,
      });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const readCompanies = useMutation({
    mutationFn: async () => apiRequest(`/v1/connections/${selectedConnection.id}/companies`),
    onSuccess: (payload) => setLastAction({ title: "Companies", payload }),
  });

  const readLedgers = useMutation({
    mutationFn: async () => apiRequest(`/v1/connections/${selectedConnection.id}/ledgers`),
    onSuccess: (payload) => setLastAction({ title: "Ledgers", payload }),
  });

  const createLedger = useMutation({
    mutationFn: async () =>
      apiRequest(`/v1/connections/${selectedConnection.id}/ledgers`, {
        method: "POST",
        body: {
          name: ledgerName,
          parent: "Sundry Debtors",
          isBillWiseOn: true,
        },
      }),
    onSuccess: (payload) => {
      setLastAction({ title: "Ledger created", payload });
      setLedgerName(`Bridge Test ${Date.now().toString().slice(-5)}`);
      queryClient.invalidateQueries({ queryKey: ["commands", selectedConnection.id] });
    },
  });

  const health = healthQuery.data;
  const commands = commandsQuery.data || [];
  const hiddenConnectionCount = Math.max(connections.length - displayConnections.length, 0);
  const activeInstall =
    latestInstall?.connectionId === selectedId
      ? latestInstall
      : selectedConnection?.pairingCode
        ? {
            connectionId: selectedConnection.id,
            pairingCode: selectedConnection.pairingCode,
            installCommand: buildInstallCommand(selectedConnection.pairingCode),
          }
        : null;
  const installCommand = activeInstall?.installCommand || "";
  const uiError =
    connectionsQuery.error ||
    healthQuery.error ||
    commandsQuery.error ||
    createConnection.error ||
    readCompanies.error ||
    readLedgers.error ||
    createLedger.error;

  return (
    <main className="shell">
      <header className="topBar">
        <div>
          <p className="eyebrow">TallyBridge Console</p>
          <h1>Connections</h1>
        </div>
        <StatusPill color={health?.color || "gray"}>{statusLabel(health?.status || "No connection")}</StatusPill>
      </header>

      {uiError ? <div className="errorBanner">{uiError.message}</div> : null}

      <section className="workbench">
        <aside className="sidebar">
          <SectionTitle icon={Router} title="Connection List" />
          <form
            className="createForm"
            onSubmit={(event) => {
              event.preventDefault();
              createConnection.mutate();
            }}
          >
            <label>
              Customer reference
              <input value={customerRef} onChange={(event) => setCustomerRef(event.target.value)} />
            </label>
            <IconButton icon={Plus} type="submit" disabled={createConnection.isPending}>
              Create or repair
            </IconButton>
          </form>

          <div className="connectionList">
            {hiddenConnectionCount ? (
              <p className="connectionHint">
                Showing this customer reference. Hiding {hiddenConnectionCount} historical demo row
                {hiddenConnectionCount === 1 ? "" : "s"}.
              </p>
            ) : null}
            {displayConnections.map((connection) => (
              <button
                key={connection.id}
                className={`connectionRow ${selectedConnection?.id === connection.id ? "selected" : ""}`}
                onClick={() => setSelectedId(connection.id)}
                type="button"
              >
                <span>{connection.externalCustomerId || connection.id}</span>
                <small>{statusLabel(connection.healthStatus || connection.status)}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="mainPanel">
          <div className="statusGrid">
            <div className="metric">
              <Server size={18} />
              <span>Bridge</span>
              <strong>{health?.bridgeStatus || "unknown"}</strong>
            </div>
            <div className="metric">
              <Building2 size={18} />
              <span>Tally</span>
              <strong>{health?.tallyStatus || "unknown"}</strong>
            </div>
            <div className="metric">
              <Activity size={18} />
              <span>TDL</span>
              <strong>{health?.tdlStatus || "unknown"}</strong>
            </div>
            <div className="metric">
              <RefreshCcw size={18} />
              <span>Heartbeat</span>
              <strong>{formatRelative(health?.lastHeartbeat)}</strong>
            </div>
          </div>

          <section className="band">
            <SectionTitle
              icon={TerminalSquare}
              title="Setup Command"
              action={
                <IconButton
                  icon={Clipboard}
                  disabled={!installCommand}
                  onClick={() => navigator.clipboard.writeText(installCommand)}
                >
                  Copy
                </IconButton>
              }
            />
            <pre className="commandBox">
              {installCommand || "Click Create or repair to generate a fresh one-line setup command."}
            </pre>
          </section>

          <section className="band">
            <SectionTitle icon={Database} title="Tally Operations" />
            <div className="actionRow">
              <IconButton icon={ListRestart} disabled={!selectedConnection || readCompanies.isPending} onClick={() => readCompanies.mutate()}>
                Companies
              </IconButton>
              <IconButton icon={ListRestart} disabled={!selectedConnection || readLedgers.isPending} onClick={() => readLedgers.mutate()}>
                Ledgers
              </IconButton>
            </div>
            <form
              className="ledgerForm"
              onSubmit={(event) => {
                event.preventDefault();
                createLedger.mutate();
              }}
            >
              <input value={ledgerName} onChange={(event) => setLedgerName(event.target.value)} />
              <IconButton icon={Send} type="submit" disabled={!selectedConnection || createLedger.isPending}>
                Create ledger
              </IconButton>
            </form>
          </section>

          <section className="split">
            <div className="band">
              <SectionTitle icon={CheckCircle2} title="Last Result" />
              <pre className="resultBox">{lastAction ? JSON.stringify(lastAction, null, 2) : "No action yet."}</pre>
            </div>
            <div className="band">
              <SectionTitle icon={CircleAlert} title="Recent Commands" />
              <div className="commandList">
                {commands.slice(0, 8).map((command) => (
                  <div key={command.id} className="commandRow">
                    <span>{command.type}</span>
                    <small>{command.status}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

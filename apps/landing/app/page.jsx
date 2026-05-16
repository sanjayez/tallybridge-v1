import {
  ArrowRight,
  CheckCircle2,
  CirclePlay,
  Cloud,
  Download,
  LockKeyhole,
  MonitorCheck,
  PlugZap,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: Download,
    title: "Install locally",
    text: "A Windows bootstrapper places the bridge in the current user profile.",
  },
  {
    icon: PlugZap,
    title: "Pair with your server",
    text: "The connector registers with a pairing code and starts heartbeating.",
  },
  {
    icon: MonitorCheck,
    title: "Operate from the dashboard",
    text: "Queue health checks, company reads, ledgers, and import commands remotely.",
  },
];

const assurances = [
  "No admin-first setup for the MVP path",
  "Per-install connector identity",
  "Built around TallyPrime and Tally.ERP9 locations",
];

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section
        className="border-b bg-[linear-gradient(180deg,#f8faf8_0%,#eef5f1_100%)]"
        id="top"
      >
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-6 sm:px-8 lg:min-h-[84vh] lg:grid-cols-[1fr_0.92fr] lg:py-8">
          <div className="flex flex-col items-start">
            <nav className="mb-10 flex w-full items-center justify-between lg:mb-12">
              <a className="flex items-center gap-2 text-sm font-bold" href="#top">
                <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
                  TB
                </span>
                Tally Bridge
              </a>
              <a
                className="text-sm font-semibold text-muted-foreground transition hover:text-foreground"
                href="#install-video"
              >
                Watch install
              </a>
            </nav>

            <Badge variant="secondary" className="mb-5 bg-emerald-100 text-emerald-900">
              Design-partner MVP
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] sm:text-5xl lg:text-6xl">
              Connect customer Tally installs without becoming their IT team.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Tally Bridge gives SaaS teams a small Windows connector, a hosted control
              plane, and a dashboard for remote Tally operations. It is built for fast
              pilots, clean onboarding, and low-friction outreach.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a href="#install-video">
                  <CirclePlay aria-hidden="true" />
                  Watch the install
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#flow">
                  See the flow
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          <div className="relative pb-6 lg:pt-12">
            <div className="overflow-hidden rounded-lg border bg-white shadow-2xl shadow-emerald-950/10">
              <div className="flex items-center justify-between border-b bg-slate-950 px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                  <TerminalSquare className="size-4 text-emerald-300" aria-hidden="true" />
                  <span className="text-sm font-semibold">Tally Bridge Console</span>
                </div>
                <span className="rounded bg-emerald-400/20 px-2 py-1 text-xs text-emerald-100">
                  active
                </span>
              </div>
              <div className="grid gap-0 md:grid-cols-[0.72fr_1fr]">
                <div className="border-b bg-slate-50 p-5 md:border-b-0 md:border-r">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Pairing code
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold">TB-48291</p>
                  <div className="mt-8 space-y-3">
                    {assurances.map((item) => (
                      <div className="flex items-start gap-2 text-sm" key={item}>
                        <CheckCircle2
                          className="mt-0.5 size-4 shrink-0 text-emerald-700"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric label="Bridge" value="online" tone="green" />
                    <Metric label="Tally" value="reachable" tone="blue" />
                    <Metric label="Heartbeat" value="18s ago" tone="amber" />
                    <Metric label="Commands" value="queued" tone="slate" />
                  </div>
                  <div className="mt-5 rounded-lg border bg-slate-950 p-4 font-mono text-sm leading-7 text-slate-100">
                    <p className="text-emerald-300">npm run demo -- companies</p>
                    <p>delivered to connector win-user-01</p>
                    <p>response: Gateway of Tally is ready</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Product visual based on the current bridge dashboard and demo command flow.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white" id="install-video">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.82fr_1fr]">
          <div>
            <Badge variant="outline" className="mb-4">
              Install video
            </Badge>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              One clear walkthrough can carry the whole first conversation.
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Drop your recorded install video into this frame when it is ready. The rest
              of the page stays intentionally short so prospects can understand the flow
              and ask for access quickly.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border bg-slate-950 shadow-xl shadow-slate-950/10">
            <div className="aspect-video">
              <div className="flex h-full flex-col items-center justify-center px-8 text-center text-white">
                <CirclePlay className="mb-5 size-14 text-emerald-300" aria-hidden="true" />
                <p className="text-xl font-semibold">Install walkthrough placeholder</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                  Replace this block with a hosted video embed, local MP4, or Loom iframe
                  after recording.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-slate-50" id="flow">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4">
              How it works
            </Badge>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              A focused bridge between hosted software and local Tally.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <article className="rounded-lg border bg-white p-6" key={step.title}>
                  <Icon className="size-8 text-emerald-700" aria-hidden="true" />
                  <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">{step.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold">Ready for a design-partner pilot?</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Use this page for outreach, then send qualified teams into the install video
              and dashboard demo.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="mailto:hello@example.com">
                Request access
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#top">
                <Cloud aria-hidden="true" />
                Back to top
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t bg-slate-950 px-5 py-8 text-sm text-slate-300 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Tally Bridge</span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-300" aria-hidden="true" />
            Built for narrow, high-trust Tally integration pilots.
          </span>
        </div>
      </footer>
    </main>
  );
}

function Metric({ label, value, tone }) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-900",
    blue: "bg-sky-50 text-sky-900",
    amber: "bg-amber-50 text-amber-950",
    slate: "bg-slate-100 text-slate-900",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase opacity-75">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { BenchRow } from "@/geo/reserves/bench";
import { PageHeader } from "../../_client/Modal";
import { useT } from "../../_client/i18n";

/** Spik 2 på telefon: samma fixturer och tidmätning som `scripts/spike2-bench.ts`, men i telefonens webbläsare. */
export function GeometrySpike() {
  const t = useT();
  const [rows, setRows] = useState<BenchRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const start = async () => {
    setRows([]);
    setFinished(false);
    setBusy("…");
    const [{ runBench }, a, b, c] = await Promise.all([import("@/geo/reserves/bench"), import("@/geo/reserves/ops-clipper2-ts"), import("@/geo/reserves/ops-clipper2-js"), import("@/geo/reserves/ops-jsts")]);
    for (const ops of [a.clipper2Ts, c.jsts, b.clipper2Js]) {
      setBusy(ops.name);
      await new Promise((r) => setTimeout(r, 50));
      const [row] = runBench([ops], 5);
      setRows((x) => [...(x ?? []), row]);
    }
    setBusy(null);
    setFinished(true);
  };
  return (
    <main className="page">
      <PageHeader title={t("spike2.title")} />
      <div className="pagebody">
        <p>{t("spike2.intro")}</p>
        <button className="btn primary wide" onClick={start} disabled={!!busy} data-testid="run-bench">{busy ? t("spike2.running", { lib: busy }) : t("spike2.run")}</button>
        {rows?.map((r) => (
          <div className="card" key={r.lib} data-testid={`row-${r.lib}`}>
            <h3>{r.lib}</h3>
            <p>{t("spike2.result", { passed: r.passed, total: r.total, ms: r.longWalkMs, n: r.longWalkPoints })}</p>
            <pre className="mono">{Object.entries(r.details).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
          </div>
        ))}
        {rows && finished && <pre className="mono" data-testid="bench-json">{JSON.stringify({ ua: navigator.userAgent, rows: rows.map(({ details: _d, ...x }) => x) })}</pre>}
      </div>
    </main>
  );
}

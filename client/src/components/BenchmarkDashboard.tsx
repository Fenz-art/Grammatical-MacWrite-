import type { TransformMetricsSnapshot } from "@shared/monitoring";
import { Activity, ChartNoAxesCombined, Clock3, Gauge, ServerCrash, TimerReset, X } from "lucide-react";

const formatLatency = (value: number) => value ? `${(value / 1000).toFixed(1)}s` : "—";

export function BenchmarkDashboard({ metrics, isLoading, onRefresh, onClose }: { metrics?: TransformMetricsSnapshot; isLoading: boolean; onRefresh: () => void; onClose: () => void }) {
  const maxLatency = Math.max(...(metrics?.samples.map(sample => sample.elapsedMs) ?? [1]), 1);
  const scopeCopy = metrics?.scope === "fleet-24h"
    ? `Fleet aggregate · trailing ${Math.round(metrics.retentionWindowMinutes / 60)} hours · no user text collected`
    : "Current instance fallback · no user text collected";
  return (
    <aside className="benchmark-dashboard" aria-label="Live benchmark dashboard">
      <div className="benchmark-header"><div><span className="benchmark-kicker"><Activity size={14} /> Protected telemetry</span><h2>Benchmark dashboard</h2><p>{scopeCopy}</p></div><div className="benchmark-actions"><button onClick={onRefresh} className="benchmark-refresh"><TimerReset size={14} /> Refresh</button><button onClick={onClose} className="benchmark-close" aria-label="Close benchmark dashboard"><X size={14} /></button></div></div>
      {isLoading && !metrics ? <p className="benchmark-empty">Loading fleet telemetry…</p> : metrics ? <>
        <div className="benchmark-stats">
          <article><Clock3 size={16} /><span>Average latency</span><strong>{formatLatency(metrics.averageLatencyMs)}</strong></article>
          <article><Gauge size={16} /><span>Queue wait</span><strong>{formatLatency(metrics.averageQueueWaitMs)}</strong></article>
          <article><ChartNoAxesCombined size={16} /><span>Accepted</span><strong>{metrics.successRate}<small>%</small></strong></article>
          <article><ServerCrash size={16} /><span>Provider failures</span><strong>{metrics.providerFailures}</strong></article>
        </div>
        <section className="latency-chart"><div className="chart-heading"><span>Recent latency</span><small>{metrics.samples.length} durable samples · {metrics.queueThroughputPerMinute}/min</small></div><div className="latency-bars" aria-label="Recent transformation latency chart">{metrics.samples.length ? metrics.samples.map((sample, index) => <span className={`latency-bar ${sample.outcome}`} title={`${sample.mode} · ${sample.outcome} · ${formatLatency(sample.elapsedMs)}`} key={`${sample.at}-${index}`} style={{ height: `${Math.max(8, (sample.elapsedMs / maxLatency) * 100)}%` }} />) : <p>No telemetry events in this window yet.</p>}</div></section>
        <section className="benchmark-modes"><div className="chart-heading"><span>Mode outcomes</span><small>{metrics.total} total</small></div>{metrics.modeBreakdown.map(row => <div className="benchmark-mode-row" key={row.mode}><span>{row.mode}</span><div><i style={{ width: `${row.count ? (row.accepted / row.count) * 100 : 0}%` }} /></div><strong>{row.accepted}/{row.count}</strong></div>)}</section>
      </> : <p className="benchmark-empty">Metrics are temporarily unavailable.</p>}
    </aside>
  );
}

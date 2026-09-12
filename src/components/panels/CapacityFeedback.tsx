import type { CapacityEstimate } from '../../lib/capacity'

/** Keep the effect of an edit visible even when the detailed results are below the form. */
export default function CapacityFeedback({ estimate: e }: { estimate: CapacityEstimate }) {
  const rate = e.tokensPerSec?.mid
  return (
    <div data-capacity-feedback role="status" aria-live="polite" aria-atomic="true"
      className="sticky top-0 z-20 rounded-lg border border-accent/25 bg-panel px-3 py-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="font-semibold text-accent">随场景更新</span>
        <span className="text-dim">计算估算 · 不含通信 / 调度</span>
      </div>
      {e.feasible ? <dl className="grid grid-cols-3 gap-2">
        <div><dt className="text-[10px] text-dim">Decode tokens/s</dt><dd className="font-mono text-lg font-semibold tabular-nums" data-feedback-throughput>{rate === undefined ? '—' : rate >= 1000 ? `${(rate / 1000).toFixed(1)}k` : rate.toFixed(0)}</dd></div>
        <div><dt className="text-[10px] text-dim">副本 · 每副本 GPU</dt><dd className="font-mono text-lg font-semibold tabular-nums">{e.replicas} <span className="text-xs font-normal text-dim">× {e.gpusPerReplica}</span></dd></div>
        <div><dt className="text-[10px] text-dim">每 GPU KV 峰值</dt><dd className="font-mono text-lg font-semibold tabular-nums">{e.allocation?.kvPerGpuGB.toFixed(1)} <span className="text-[10px] font-normal text-dim">GB</span></dd></div>
      </dl> : <p className="text-xs leading-relaxed text-warn">{e.reason ?? '当前单域配置放不下模型；请降低 batch、上下文或权重精度。'}</p>}
    </div>
  )
}

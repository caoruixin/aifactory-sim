/**
 * 产能粗估卡片——**纯 props 组件**（不读 store、不导入 three），
 * 因此工作台、比较模式与 `/report` 打印页可以共用同一张卡。
 *
 * 展示纪律（这张卡最容易被截图发出去，所以每条都不能省）：
 * 1. 「粗估」两个字必须在标题级别可见，不能藏进折叠区；
 * 2. 区间要标方向——时延是 low 更好，吞吐是 high 更好；
 * 3. 拒绝出数时要说清**为什么**并点名**缺哪条官方数据**，而不是显示 0 或 N/A；
 * 4. caveats 恒非空，首条常驻显示，其余折叠。
 */

import type { CapacityEstimate, Band, CapacityRefusalReasonCode } from '../../lib/capacity'
import { MetaChip } from '../ui/Chips'

/**
 * 策略性拒绝（`capacityPolicy !== 'standard'`）的固定标题文案——比 `estimate.reason`
 * 更短，用于卡片顶部的第一行；`estimate.reason` 仍然完整展示在下面作为详细说明。
 * 其余 reasonCode（缺数据类）没有固定标题，直接用 `estimate.reason`。
 */
const REASON_HEADLINE: Partial<Record<CapacityRefusalReasonCode, string>> = {
  'analyst-modeled-policy': '已官宣，但规格主要来自第三方分析师（forecast 数据），不出产能',
  'paired-only-policy': '仅提供配对产能语境，不单独出产能数字',
}

export interface CapacityBandsProps {
  estimate: CapacityEstimate
  /** 紧凑模式：比较视图下并排两张时用，隐藏次要行。 */
  compact?: boolean
}

// ─────────────────────────── 数字格式化 ───────────────────────────

function fmtTokens(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return v.toFixed(0)
}

function fmtMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`
  if (v >= 10) return v.toFixed(0)
  return v.toFixed(1)
}

function fmtGB(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(2)} TB` : `${v.toFixed(0)} GB`
}

// ─────────────────────────── 区间行 ───────────────────────────

interface BandRowProps {
  label: string
  band: Band | null
  unit: string
  format: (v: number) => string
  /** true = 数值越低越好（时延）；决定「中位值」旁边的方向注解。 */
  lowerIsBetter?: boolean
  hint: string
  nullNote?: string
}

function BandRow({ label, band, unit, format, lowerIsBetter = false, hint, nullNote }: BandRowProps) {
  return (
    <div className="border-t border-line px-3 py-2 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-dim" title={hint}>
          {label}
        </span>
        {band === null ? (
          <span className="text-sm text-dim italic">不出数</span>
        ) : (
          <span className="font-mono text-base font-semibold">
            {format(band.mid)}
            <span className="ml-1 text-xs font-normal text-dim">{unit}</span>
          </span>
        )}
      </div>
      {band === null ? (
        <p className="mt-0.5 text-[11px] leading-snug text-warn">{nullNote ?? '缺少必要的官方数据。'}</p>
      ) : (
        <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-dim">
          <span title={lowerIsBetter ? '高利用率假设（更快）' : '低利用率假设'}>{format(band.low)}</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span title={lowerIsBetter ? '低利用率假设（更慢）' : '高利用率假设'}>{format(band.high)}</span>
          <span className="ml-1 text-[10px]">{lowerIsBetter ? '低=快' : '高=快'}</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── 主组件 ───────────────────────────

export default function CapacityBands({ estimate, compact = false }: CapacityBandsProps) {
  const refused = estimate.kind === 'refused'

  return (
    <section
      data-capacity-card={estimate.systemId}
      data-capacity-kind={estimate.kind}
      className={`flex min-w-0 flex-col rounded-lg border ${
        refused ? 'border-bad/40 bg-bad/5' : 'border-line bg-panel'
      }`}
    >
      <header className="border-b border-line px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-px text-[11px] font-semibold text-warn">
            粗估
          </span>
          <h3 className="min-w-0 truncate text-sm font-semibold">{estimate.systemName}</h3>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-dim">
          <MetaChip title="参考模型">{estimate.modelId}</MetaChip>
          <MetaChip title="量化口径">{estimate.quantId.toUpperCase()}</MetaChip>
          <MetaChip title="参与估算的机架数">×{estimate.rackCount} 机架</MetaChip>
          {estimate.basis ? (
            <MetaChip title="算力口径（roofline 用的是稠密值）">按 {estimate.basis.toUpperCase()} 算力</MetaChip>
          ) : null}
        </p>
      </header>

      {refused ? (
        <div className="space-y-2 px-3 py-3">
          <p className="text-sm leading-relaxed text-bad">
            拒绝出数：{(estimate.reasonCode && REASON_HEADLINE[estimate.reasonCode]) ?? estimate.reason}
          </p>
          {estimate.reasonCode && REASON_HEADLINE[estimate.reasonCode] ? (
            <p className="text-[11px] leading-relaxed text-dim">{estimate.reason}</p>
          ) : null}
          {estimate.missing.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-dim uppercase">缺少的官方数据</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs leading-relaxed">
                {estimate.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[11px] leading-relaxed text-dim">
            这是刻意的行为：本工具只用厂商官方公布的数值做数学，缺一项就整体不出数，不用分析师估算或经验值补齐。
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 border-b border-line px-3 py-2 text-xs">
            <Fact label="单副本 GPU 数" value={`${estimate.gpusPerReplica ?? '—'} 张`} hint="按显存下限推导（含 10% 运行开销，留 10% 余量）" />
            <Fact
              label="并发副本数"
              value={estimate.feasible ? `${estimate.replicas}` : '装不下'}
              hint="floor(GPU 总数 ÷ 单副本 GPU 数)"
              bad={!estimate.feasible}
            />
            {!compact && estimate.memory ? (
              <>
                <Fact label="权重显存" value={fmtGB(estimate.memory.weightsGB)} hint="总参数 × 每参数字节" />
                <Fact
                  label="KV cache"
                  value={estimate.memory.kvGB === null ? '未知' : fmtGB(estimate.memory.kvGB)}
                  hint="每 token KV 字节 × 上下文 × batch"
                  bad={estimate.memory.kvGB === null}
                />
              </>
            ) : null}
          </div>

          <div>
            <BandRow
              label="集群吞吐"
              band={estimate.tokensPerSec}
              unit="tokens/s"
              format={fmtTokens}
              hint="decode 阶段：batch ÷ 步长 × 副本数。区间来自 MBU 0.5/0.6/0.7。"
              nullNote={
                estimate.feasible
                  ? '模型的 KV cache 口径未知，decode 步长无从计算。'
                  : '单副本所需 GPU 数超过可用 GPU 数，先解决装得下的问题。'
              }
            />
            <BandRow
              label="TTFT（首 token）"
              band={estimate.ttftMs}
              unit="ms"
              format={fmtMs}
              lowerIsBetter
              hint="prefill 算力瓶颈：2 × 激活参数 × prompt tokens ÷ (稠密算力 × MFU)。"
            />
            <BandRow
              label="TPOT（每 token）"
              band={estimate.tpotMs}
              unit="ms"
              format={fmtMs}
              lowerIsBetter
              hint="decode 带宽瓶颈：(激活权重 + batch 份 KV) ÷ (显存带宽 × MBU)。"
            />
            <BandRow
              label="能效"
              band={estimate.tokensPerWatt}
              unit="tokens/s/W"
              format={(v) => v.toFixed(2)}
              hint="集群吞吐 ÷ (官方机架功率 × 机架数)。未计入 CDU、机架外交换与 PUE。"
              nullNote="该系统的整机架功率官方未公布，本项目不编数。"
            />
          </div>
        </>
      )}

      <div className="mt-auto border-t border-line px-3 py-2">
        <p className="text-[11px] leading-relaxed text-warn">{estimate.caveats[0]}</p>
        {estimate.caveats.length > 1 ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] text-dim hover:text-accent">
              其余 {estimate.caveats.length - 1} 条前提与限制
            </summary>
            <ul className="mt-1 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-dim">
              {estimate.caveats.slice(1).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {estimate.evidence.inputClaims.length > 0 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
                <span className="font-semibold">用到的官方数据：</span>
                {estimate.evidence.inputClaims
                  .map((c) => `${c.label}${c.claim.value === null ? '（未公布）' : `＝${c.claim.value}${c.claim.unit ?? ''}`}`)
                  .join('；')}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] leading-relaxed text-dim">
              <span className="font-semibold">估算方法：</span>
              {estimate.evidence.method}
            </p>
          </details>
        ) : null}
      </div>
    </section>
  )
}

function Fact({
  label,
  value,
  hint,
  bad = false,
}: {
  label: string
  value: string
  hint: string
  bad?: boolean
}) {
  return (
    <div className="py-0.5" title={hint}>
      <span className="text-dim">{label}：</span>
      <span className={`font-mono font-medium ${bad ? 'text-warn' : ''}`}>{value}</span>
    </div>
  )
}

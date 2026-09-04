/**
 * 切面章节「动手算一算」计算器：按 `chapter.calculatorId` 分发三个变体。
 *
 * 输入控件视觉照抄 `CapacityPanel`（select/number/button，同一套 border-line/bg-panel
 * token）；输入状态刻意留在本组件的 `useState` 里——不进 store、不进深链，同 `CapacityPanel`
 * 的既有纪律（`ChapterBody` 已按 `chapter.id` 做 key，换章会连同这份局部状态一起重置）。
 *
 * 三个计算器共享的呈现规则：
 * - null 结果一律显示「无法估算」+ 原因，绝不显示 0 或编数；
 * - 官方没有的段/档提供「假设值（author_opinion）」输入框，假设值只进函数参数，不落数据层；
 * - 结果区包 `data-lens-calc-out`；根节点保留 `data-lens-calc={chapter.calculatorId}` 锚点
 *   （由调用方 `LensChapterPanel` 传入，E2E 已经在用这个选择器）；
 * - 每个计算器底部渲染 caveat 列表（首条 headline + 未建模清单）与 `inputClaims` 的 `ClaimRow`。
 */

import { useMemo, useState } from 'react'
import { FACTORY_PACK, systemById } from '../../data'
import type { LensChapter } from '../../data/types'
import { QUANTS, kvBytesPerToken, weightMemoryGB } from '../../lib/roofline'
import type { QuantOption } from '../../lib/roofline'
import {
  STORAGE_CALC_HEADLINE_CAVEAT,
  STORAGE_CALC_NOT_MODELED,
  gpuComponentOf,
  kvRestoreTiersOf,
  kvRestoreVsRecompute,
  modelLoadBreakdown,
  storageLadderOf,
} from '../../lib/storagePath'
import type { LinkRate, StorageSegmentInput } from '../../lib/storagePath'
import {
  KV_TRANSFER_HEADLINE_CAVEAT,
  KV_TRANSFER_NOT_MODELED,
  kvTransferLadder,
  kvTransferRungsOf,
} from '../../lib/kvTransfer'
import type { CapacityInputClaim } from '../../lib/capacity'
import ClaimRow from '../ui/ClaimRow'

export default function LensCalculator({ chapter }: { chapter: LensChapter }) {
  if (chapter.calculatorId === null) return null
  return (
    <div data-lens-calc={chapter.calculatorId}>
      {chapter.calculatorId === 'kv-transfer' ? <KvTransferCalculator systemId={chapter.systemId} /> : null}
      {chapter.calculatorId === 'model-load' ? <ModelLoadCalculator systemId={chapter.systemId} /> : null}
      {chapter.calculatorId === 'kv-restore' ? <KvRestoreCalculator systemId={chapter.systemId} /> : null}
    </div>
  )
}

// ─────────────────────────── 共享小件 ───────────────────────────

/** 时长统一格式化：µs / ms / s 三档，避免 "0.000976 s" 这种反直觉的小数。 */
function formatSeconds(seconds: number): string {
  const ms = seconds * 1000
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatMs(ms: number): string {
  return formatSeconds(ms / 1000)
}

/** 官方没有的段：数字输入框，明确标注「假设值（author_opinion）」，留空即保持 null。 */
function AssumedValueField({
  label,
  unit,
  raw,
  onChange,
}: {
  label: string
  unit: string
  raw: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="rounded border border-warn/35 bg-warn/10 px-1 py-px text-warn">假设值·author_opinion</span>
      <span className="text-dim">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        placeholder={unit}
        value={raw}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 rounded-md border border-line bg-panel px-1.5 py-1 font-mono"
      />
      <span className="text-dim">{unit}</span>
    </label>
  )
}

function CaveatBlock({ headline, notModeled }: { headline: string; notModeled: readonly string[] }) {
  return (
    <div className="rounded-md border border-line bg-panel-2 px-2 py-1.5 text-[11px] leading-relaxed text-dim">
      <p>{headline}</p>
      <p className="mt-0.5">未建模：{notModeled.join('、')}。</p>
    </div>
  )
}

function InputClaimsBlock({ claims }: { claims: CapacityInputClaim[] }) {
  if (claims.length === 0) return null
  return (
    <dl className="divide-y divide-line rounded-md border border-line">
      {claims.map((c, i) => (
        <ClaimRow key={`${c.label}-${i}`} name={c.label} claim={c.claim} />
      ))}
    </dl>
  )
}

/** 把用户填的字符串假设值套回一段 LinkRate（空串/非法数字保持原 null，不当 0）。 */
function withAssumedValue(rate: LinkRate, raw: string): LinkRate {
  if (rate.value !== null) return rate
  const parsed = raw.trim() === '' ? null : Number(raw)
  if (parsed === null || Number.isNaN(parsed) || parsed <= 0) return rate
  return { ...rate, value: parsed }
}

const modelOptions = FACTORY_PACK.models

// ─────────────────────────── 1. kv-transfer（网络切面 ch6，pin HGX） ───────────────────────────

function KvTransferCalculator({ systemId }: { systemId: string }) {
  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? 'deepseek-v3')
  const [contextTokens, setContextTokens] = useState(8192)

  const model = modelOptions.find((m) => m.id === modelId) ?? modelOptions[0]!
  const { rungs } = useMemo(() => kvTransferRungsOf(systemId), [systemId])

  const perToken = kvBytesPerToken(model.kvSpec)
  const kvGB = perToken === null ? null : (perToken * contextTokens) / 1e9
  const results = kvGB === null ? null : kvTransferLadder(kvGB, rungs)

  const inputClaims: CapacityInputClaim[] = rungs
    .filter((r) => r.claim !== null)
    .map((r) => ({ label: r.label, claim: r.claim! }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-dim">模型</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="rounded-md border border-line bg-panel px-1.5 py-1"
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-dim">交接时上下文长度</span>
          <input
            type="number"
            min={1}
            value={contextTokens}
            onChange={(e) => setContextTokens(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-md border border-line bg-panel px-1.5 py-1 font-mono"
          />
          <span className="text-dim">tokens</span>
        </label>
      </div>

      <div data-lens-calc-out="1" className="flex flex-col gap-1.5">
        {perToken === null ? (
          <p className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">
            无法估算：{model.name} 的 KV cache 口径没有可靠公开参数
            {model.kvSpec.kind === 'unsupported' ? `（${model.kvSpec.note}）` : ''}，KV 体积无从算起。
          </p>
        ) : (
          <>
            <p className="text-[11px] text-dim">
              本次交接 KV 体积 ≈ <span className="font-mono text-fg">{kvGB!.toFixed(3)} GB</span>
              （{model.name} · {perToken.toLocaleString('zh-CN')} B/token × {contextTokens.toLocaleString('zh-CN')} tokens）
            </p>
            <ul className="divide-y divide-line rounded-md border border-line">
              {results!.map((r) => (
                <li key={r.id} className="px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-dim">{r.label}</span>
                    <span className={`text-right text-sm font-medium ${r.seconds === null ? 'text-dim italic' : ''}`}>
                      {r.seconds === null ? '无法估算' : formatSeconds(r.seconds)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-dim">{r.conversionNote}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        <CaveatBlock headline={KV_TRANSFER_HEADLINE_CAVEAT} notModeled={KV_TRANSFER_NOT_MODELED} />
        <InputClaimsBlock claims={inputClaims} />
      </div>
    </div>
  )
}

// ─────────────────────────── 2. model-load（存储切面 ch2，pin GB300） ───────────────────────────

function ModelLoadCalculator({ systemId }: { systemId: string }) {
  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? 'deepseek-v3')
  const [quantId, setQuantId] = useState<QuantOption['id']>('fp8')
  const [assumed, setAssumed] = useState<Record<string, string>>({})

  const model = modelOptions.find((m) => m.id === modelId) ?? modelOptions[0]!
  const quant = QUANTS.find((q) => q.id === quantId)!
  const weightGB = weightMemoryGB(model.totalParamsB, quant.bytesPerParam)

  const ladder = useMemo(() => storageLadderOf(systemId), [systemId])
  const segments: StorageSegmentInput[] = ladder.segments.map((seg) => ({
    ...seg,
    rate: withAssumedValue(seg.rate, assumed[seg.id] ?? ''),
  }))
  const breakdown = modelLoadBreakdown(weightGB, segments)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-dim">模型</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="rounded-md border border-line bg-panel px-1.5 py-1"
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-1">
          <span className="text-dim">精度</span>
          {QUANTS.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setQuantId(q.id)}
              className={`rounded-md border px-1.5 py-1 font-mono ${
                quantId === q.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-dim hover:border-accent/50'
              }`}
            >
              {q.label}
            </button>
          ))}
        </span>
        <span className="text-[11px] text-dim">权重体积 ≈ {weightGB.toLocaleString('zh-CN')} GB</span>
      </div>

      <div className="flex flex-col gap-1">
        {ladder.segments
          .filter((seg) => seg.rate.value === null)
          .map((seg) => (
            <AssumedValueField
              key={seg.id}
              label={seg.label}
              unit="GB/s"
              raw={assumed[seg.id] ?? ''}
              onChange={(v) => setAssumed((prev) => ({ ...prev, [seg.id]: v }))}
            />
          ))}
      </div>

      <div data-lens-calc-out="1" className="flex flex-col gap-1.5">
        <ul className="divide-y divide-line rounded-md border border-line">
          {breakdown.segments.map((seg) => (
            <li key={seg.id} className="px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-dim">
                  {seg.label}
                  {breakdown.bottleneckId === seg.id ? (
                    <span className="ml-1 rounded border border-bad/35 bg-bad/10 px-1 py-px text-[10px] text-bad">
                      瓶颈段
                    </span>
                  ) : null}
                </span>
                <span className={`text-right text-sm font-medium ${seg.seconds === null ? 'text-dim italic' : ''}`}>
                  {seg.seconds === null ? '无法估算' : formatSeconds(seg.seconds)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-dim">{seg.conversionNote}</p>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between rounded-md border border-line bg-panel-2 px-2.5 py-2">
          <span className="text-[11px] font-semibold text-dim uppercase">串行总时长</span>
          <span className={`text-sm font-semibold ${breakdown.totalSeconds === null ? 'text-dim italic' : 'text-fg'}`}>
            {breakdown.totalSeconds === null
              ? '无法估算 · 至少一段官方带宽未公布（见上方⚠️假设值输入框）'
              : formatSeconds(breakdown.totalSeconds)}
          </span>
        </div>
        <CaveatBlock headline={STORAGE_CALC_HEADLINE_CAVEAT} notModeled={STORAGE_CALC_NOT_MODELED} />
        <InputClaimsBlock claims={ladder.inputClaims} />
      </div>
    </div>
  )
}

// ─────────────────────────── 3. kv-restore（存储切面 ch3，pin HGX） ───────────────────────────

function KvRestoreCalculator({ systemId }: { systemId: string }) {
  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? 'deepseek-v3')
  const [contextTokens, setContextTokens] = useState(32_768)
  const [assumed, setAssumed] = useState<Record<string, string>>({})

  const model = modelOptions.find((m) => m.id === modelId) ?? modelOptions[0]!
  const system = systemById(systemId)
  const gpu = gpuComponentOf(systemId, FACTORY_PACK)
  const gpuTflops = gpu?.mathSpecs?.fp8Tflops ?? null
  const gpuCount = typeof system?.keySpecs.gpuCount?.value === 'number' ? system.keySpecs.gpuCount.value : 1

  const ladder = useMemo(() => kvRestoreTiersOf(systemId), [systemId])
  const tiers = ladder.tiers.map((t) => ({ ...t, rate: withAssumedValue(t.rate, assumed[t.id] ?? '') }))

  const result = kvRestoreVsRecompute(model, contextTokens, gpuTflops, gpuCount, tiers)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-dim">模型</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="rounded-md border border-line bg-panel px-1.5 py-1"
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-dim">上下文长度</span>
          <input
            type="number"
            min={1}
            value={contextTokens}
            onChange={(e) => setContextTokens(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-md border border-line bg-panel px-1.5 py-1 font-mono"
          />
          <span className="text-dim">tokens</span>
        </label>
        <span className="text-[11px] text-dim">
          重算口径：{system?.name ?? systemId} · {gpuCount} 张卡 · FP8
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {ladder.tiers
          .filter((t) => t.rate.value === null)
          .map((t) => (
            <AssumedValueField
              key={t.id}
              label={t.label}
              unit="GB/s"
              raw={assumed[t.id] ?? ''}
              onChange={(v) => setAssumed((prev) => ({ ...prev, [t.id]: v }))}
            />
          ))}
      </div>

      <div data-lens-calc-out="1" className="flex flex-col gap-1.5">
        {result.unsupportedReason ? (
          <p className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">
            无法估算：{result.unsupportedReason}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-dim">
              该上下文 KV 体积 ≈ <span className="font-mono text-fg">{result.kvTotalGB!.toFixed(3)} GB</span>
            </p>
            <div className="rounded-md border border-line px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-dim">重算 prefill（TTFT，MFU 低/中/高）</span>
                <span className={`text-right text-sm font-medium ${result.recomputeTtftMsBand === null ? 'text-dim italic' : ''}`}>
                  {result.recomputeTtftMsBand === null
                    ? '无法估算 · GPU 算力口径未知'
                    : `${formatMs(result.recomputeTtftMsBand.low)} ~ ${formatMs(result.recomputeTtftMsBand.high)}`}
                </span>
              </div>
            </div>
            <ul className="divide-y divide-line rounded-md border border-line">
              {result.restoreByTier.map((t) => (
                <li key={t.id} className="px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-dim">从{t.label}恢复</span>
                    <span className={`text-right text-sm font-medium ${t.seconds === null ? 'text-dim italic' : ''}`}>
                      {t.seconds === null ? '无法估算' : formatSeconds(t.seconds)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-dim">{t.conversionNote}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        <CaveatBlock headline={STORAGE_CALC_HEADLINE_CAVEAT} notModeled={STORAGE_CALC_NOT_MODELED} />
        <InputClaimsBlock claims={ladder.inputClaims} />
      </div>
    </div>
  )
}

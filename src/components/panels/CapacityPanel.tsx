/**
 * 产能粗估面板：参数控件 + 一到两张 `CapacityBands` 卡。
 *
 * 控件状态刻意留在本组件的 `useState` 里而不是全局 store——它是「问一个假设性问题」
 * 的临时输入，不影响 3D 场景，也不该被 URL 深链或 persist 带走。
 *
 * 比较模式下传两个 systemId，两张卡并排（用同一组模型/量化/负载参数，
 * 否则「对比」就没有意义了）。
 */

import { useMemo, useState } from 'react'
import { FACTORY_PACK } from '../../data'
import { DEFAULT_WORKLOAD, capacityUnitWordingFor, estimateSystemCapacity } from '../../lib/capacity'
import type { CapacityWorkload } from '../../lib/capacity'
import { QUANTS } from '../../lib/roofline'
import type { QuantOption } from '../../lib/roofline'
import CapacityBands from './CapacityBands'

/** 三档参考负载。数字是教学用的典型量级，不代表任何客户的真实业务画像。 */
const WORKLOAD_PRESETS: { id: string; label: string; hint: string; workload: CapacityWorkload }[] = [
  {
    id: 'light',
    label: '轻',
    hint: '短问答：512 输入 / 1k 上下文 / 并发 8',
    workload: { promptTokens: 512, avgContextTokens: 1024, batchPerReplica: 8 },
  },
  {
    id: 'medium',
    label: '中',
    hint: '多轮对话：2k 输入 / 4k 上下文 / 并发 32',
    workload: DEFAULT_WORKLOAD,
  },
  {
    id: 'heavy',
    label: '重',
    hint: '长文档 / Agent：8k 输入 / 32k 上下文 / 并发 64',
    workload: { promptTokens: 8192, avgContextTokens: 32_768, batchPerReplica: 64 },
  },
]

export interface CapacityPanelProps {
  /** 要出卡的系统（比较模式传两个）。 */
  systemIds: string[]
  /** 参与估算的机架数。 */
  rackCount?: number
  compact?: boolean
}

export default function CapacityPanel({ systemIds, rackCount = 1, compact = false }: CapacityPanelProps) {
  const [modelId, setModelId] = useState(FACTORY_PACK.models[0]?.id ?? 'deepseek-v3')
  const [quantId, setQuantId] = useState<QuantOption['id']>('fp8')
  const [presetId, setPresetId] = useState('medium')
  const [racks, setRacks] = useState(rackCount)

  const workload = WORKLOAD_PRESETS.find((p) => p.id === presetId)!.workload
  // 数量输入框的标签按域架构分型；比较模式下两个系统架构不同时用合并措辞。
  const counterLabels = [...new Set(systemIds.map((id) => capacityUnitWordingFor(id).counterLabel))]
  const counterLabel = counterLabels.length === 1 ? counterLabels[0] : '机架 / 服务器数'
  const estimates = useMemo(
    () =>
      systemIds.map((systemId) =>
        estimateSystemCapacity({ systemId, modelId, quantId, rackCount: racks, workload }),
      ),
    [systemIds, modelId, quantId, racks, workload],
  )

  return (
    <div className="flex min-h-0 flex-col gap-2" data-capacity-panel="1">
      {/* ── 参数控件 ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-dim">模型</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="rounded-md border border-line bg-panel px-1.5 py-1"
          >
            {FACTORY_PACK.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（{m.activeParamsB}B 激活 / {m.totalParamsB}B 总参）
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

        <span className="flex items-center gap-1">
          <span className="text-dim">负载</span>
          {WORKLOAD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => setPresetId(p.id)}
              className={`rounded-md border px-1.5 py-1 ${
                presetId === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-dim hover:border-accent/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </span>

        <label className="flex items-center gap-1.5">
          <span className="text-dim">{counterLabel}</span>
          <input
            type="number"
            min={1}
            max={64}
            value={racks}
            onChange={(e) => setRacks(Math.max(1, Math.min(64, Number(e.target.value) || 1)))}
            className="w-14 rounded-md border border-line bg-panel px-1.5 py-1 font-mono"
          />
        </label>

        <span className="ml-auto text-[11px] text-dim">
          {WORKLOAD_PRESETS.find((p) => p.id === presetId)!.hint}
        </span>
      </div>

      {/* ── 卡片 ── */}
      <div className={estimates.length > 1 ? 'grid gap-2 md:grid-cols-2' : ''}>
        {estimates.map((est) => (
          <CapacityBands key={est.systemId} estimate={est} compact={compact} />
        ))}
      </div>
    </div>
  )
}

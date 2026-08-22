/**
 * 比较模式的右栏：代际 diff 明细（纯 DOM，不依赖 3D）。
 *
 * 与 3D 视口的分工：视口负责「哪里变了」（描边颜色），这里负责「变成什么了」（文字与数字）。
 * 两边消费的是同一个 `lib/compare.ts` 的输出，因此不会出现「颜色说变了、文字说没变」。
 */

import { FACTORY_PACK, systemById } from '../../data'
import { DIFF_LABEL, DIFF_ORDER, changedRows, compareSystems } from '../../lib/compare'
import type { DiffKind, DiffRow, SpecDelta } from '../../lib/compare'
import { useFactoryStore } from '../../store'
import { EvidenceChip, MetaChip, StatusChip } from '../ui/Chips'

/** diff 类别 → Tailwind 类。与 3D 描边色语义一致（新增绿 / 未收录红 / 数量紫 / 规格青）。 */
const KIND_CLASS: Record<DiffKind, string> = {
  added: 'border-ok/40 bg-ok/10 text-ok',
  removed: 'border-bad/40 bg-bad/10 text-bad',
  'qty-changed': 'border-accent-2/40 bg-accent-2/10 text-accent-2',
  'spec-changed': 'border-accent/40 bg-accent/10 text-accent',
  unchanged: 'border-line bg-panel-2 text-dim',
}

export default function ComparePanel() {
  const generation = useFactoryStore((s) => s.generation)
  const compare = useFactoryStore((s) => s.compare)
  const setCompare = useFactoryStore((s) => s.setCompare)
  const setGeneration = useFactoryStore((s) => s.setGeneration)

  const result = compareSystems(generation, compare.right)
  const rows = compare.showDiffOnly ? changedRows(result.rows) : result.rows
  const left = systemById(generation)
  const right = systemById(compare.right)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">代际比较</h2>
        <p className="mt-1.5 text-sm leading-snug font-semibold">{result.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-dim">左</span>
          {left ? <StatusChip status={left.status} /> : null}
          <span aria-hidden className="text-dim">
            →
          </span>
          <span className="text-dim">右</span>
          <select
            value={compare.right}
            onChange={(e) => setCompare({ right: e.target.value })}
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-1.5 py-1 text-xs"
            aria-label="右侧代际"
          >
            {FACTORY_PACK.systems
              .filter((s) => s.id !== generation)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {right ? <StatusChip status={right.status} /> : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {DIFF_ORDER.map((k) => (
            <span key={k} className={`rounded border px-1.5 py-px text-[11px] ${KIND_CLASS[k]}`}>
              {DIFF_LABEL[k]} {result.counts[k]}
            </span>
          ))}
        </div>

        <label className="mt-2 flex items-center gap-1.5 text-xs text-dim">
          <input
            type="checkbox"
            data-diff-only-toggle="1"
            checked={compare.showDiffOnly}
            onChange={(e) => setCompare({ showDiffOnly: e.target.checked })}
          />
          只看有变化的部件（3D 里未变化的降为半透明）
        </label>

        <button
          type="button"
          onClick={() => setGeneration(compare.right)}
          className="mt-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/20"
        >
          把右侧设为当前代际 →
        </button>
      </header>

      {result.summary.length > 0 ? (
        <section className="border-b border-line px-4 py-3">
          <h3 className="text-[11px] font-semibold tracking-widest text-dim uppercase">汇报要点</h3>
          <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed">
            {result.summary.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden className="text-accent">
                  ·
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="border-b border-line px-4 py-3 text-xs leading-relaxed text-dim">
          这一对组合没有写过人工比较定义（或方向与定义相反），下面是纯自动 diff——
          只有配对结果，没有叙述。把左右调回定义方向即可看到汇报要点。
        </p>
      )}

      <p className="border-b border-line bg-panel-2 px-4 py-2 text-[11px] leading-relaxed text-warn">
        ⚠️ 「新增 / 未收录」只描述**本内容包收录了什么**，不代表产品上有没有这个部件；
        一侧官方未公布的规格计为「无法比较」而不是「变化」。
      </p>

      <ol className="divide-y divide-line">
        {rows.map((row) => (
          <DiffRowItem key={row.roleKey} row={row} />
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-dim">两代在已收录的部件上没有差异。</li>
        ) : null}
      </ol>
    </div>
  )
}

function DiffRowItem({ row }: { row: DiffRow }) {
  const select = useFactoryStore((s) => s.select)
  const hover = useFactoryStore((s) => s.hover)
  const changed = row.specDeltas.filter((d) => d.kind === 'changed')
  const unknown = row.specDeltas.filter((d) => d.kind === 'unknown')

  return (
    <li
      className="px-4 py-2.5"
      data-diff-role={row.roleKey}
      data-diff-kind={row.kind}
      onMouseEnter={() => hover(row.left?.assemblyId ?? row.right?.assemblyId ?? null)}
      onMouseLeave={() => hover(null)}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded border px-1.5 py-px text-[11px] font-medium ${KIND_CLASS[row.kind]}`}>
          {DIFF_LABEL[row.kind]}
        </span>
        <span className="text-sm font-medium">{row.label}</span>
        <MetaChip title="跨代配对用的语义键">{row.roleKey}</MetaChip>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
        <SideText side="左" name={row.left?.componentName} total={row.left?.total} />
        <span aria-hidden className="text-dim">
          →
        </span>
        <SideText side="右" name={row.right?.componentName} total={row.right?.total} />
      </div>

      {row.narrative ? (
        <p className="mt-1.5 rounded-md border border-warn/25 bg-warn/5 px-2 py-1.5 text-[11px] leading-relaxed">
          {row.narrative}
        </p>
      ) : (
        <p className="mt-1 text-[11px] leading-relaxed text-dim">{row.summary}</p>
      )}

      {changed.length > 0 ? (
        <dl className="mt-1.5 space-y-1">
          {changed.map((d) => (
            <SpecDeltaRow key={d.key} delta={d} />
          ))}
        </dl>
      ) : null}

      {unknown.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-dim hover:text-accent">
            {unknown.length} 项无法比较（一侧官方未公布）
          </summary>
          <ul className="mt-1 space-y-0.5 text-[11px] text-dim">
            {unknown.map((d) => (
              <li key={d.key} className="font-mono">
                {d.key}：{d.left?.value === null ? '左未公布' : String(d.left?.value)} /{' '}
                {d.right?.value === null ? '右未公布' : String(d.right?.value)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-1 flex gap-2 text-[11px]">
        {row.left ? (
          <button type="button" onClick={() => select(row.left!.assemblyId)} className="text-accent underline">
            看左侧部件
          </button>
        ) : null}
        {row.right ? (
          <button type="button" onClick={() => select(row.right!.assemblyId)} className="text-accent underline">
            看右侧部件
          </button>
        ) : null}
      </div>
    </li>
  )
}

function SideText({ side, name, total }: { side: string; name?: string; total?: number }) {
  if (!name) return <span className="text-dim italic">{side}：未收录</span>
  return (
    <span>
      <span className="text-dim">{side}：</span>
      {name}
      {typeof total === 'number' ? <span className="ml-1 font-mono text-dim">×{total}</span> : null}
    </span>
  )
}

function SpecDeltaRow({ delta }: { delta: SpecDelta }) {
  const fmt = (v: unknown, unit: string | null | undefined) =>
    v === null || v === undefined ? '未公布' : `${typeof v === 'number' ? v.toLocaleString('zh-CN') : v}${unit ?? ''}`
  return (
    <div className="rounded-md border border-line px-2 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="font-mono text-[11px] break-all text-dim">{delta.key}</dt>
        <dd className="text-right text-xs">
          <span className="text-dim">{fmt(delta.left?.value, delta.left?.unit)}</span>
          <span aria-hidden className="mx-1 text-dim">
            →
          </span>
          <span className="font-medium">{fmt(delta.right?.value, delta.right?.unit)}</span>
        </dd>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {delta.left ? <EvidenceChip evidence={delta.left.evidence} /> : null}
        <span aria-hidden className="text-[10px] text-dim">
          →
        </span>
        {delta.right ? <EvidenceChip evidence={delta.right.evidence} /> : null}
      </div>
    </div>
  )
}

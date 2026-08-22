/**
 * 顶部条：代际切换 + 模式切换 + 物理层级面包屑。
 *
 * 它承担四件事：告诉你「在看哪一代、有多实」（状态徽章紧跟代际名，汇报时最忌把
 * forecast 的东西讲成已量产）、「现在在哪一层」、一键回跳、以及进比较模式与汇报页。
 */

import { Link } from 'react-router-dom'
import { FACTORY_PACK, systemById } from '../../data'
import { LEVEL_LABEL, crumbsOf } from '../../lib/drill'
import { focusIdOf, useFactoryStore } from '../../store'
import { StatusChip } from '../ui/Chips'

/** 代际按钮上的短名：去掉厂商前缀与「（预测）」后缀，塞得进一行。 */
function shortName(name: string): string {
  return name.replace(/^NVIDIA\s+/, '').replace(/（预测）$/, '')
}

export default function BreadcrumbBar() {
  const generation = useFactoryStore((s) => s.generation)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const level = useFactoryStore((s) => s.level)
  const mode = useFactoryStore((s) => s.mode)
  const jumpTo = useFactoryStore((s) => s.jumpTo)
  const drillUp = useFactoryStore((s) => s.drillUp)
  const setGeneration = useFactoryStore((s) => s.setGeneration)
  const setMode = useFactoryStore((s) => s.setMode)
  const focusId = useFactoryStore(focusIdOf)

  const system = systemById(generation)
  const crumbs = crumbsOf(focusPath)
  const compareMode = mode === 'compare'

  return (
    <div className="border-b border-line bg-panel">
      {/* ── 第一行：代际 + 模式 ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-1.5">
        <span className="text-[11px] font-semibold tracking-widest text-dim uppercase">代际</span>
        <div role="group" aria-label="代际切换" className="flex flex-wrap items-center gap-1">
          {FACTORY_PACK.systems.map((s) => {
            const active = s.id === generation
            return (
              <button
                key={s.id}
                type="button"
                data-generation={s.id}
                aria-pressed={active}
                onClick={() => setGeneration(s.id)}
                title={s.summary}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 font-medium text-accent'
                    : 'border-line text-dim hover:border-accent/50 hover:text-fg'
                }`}
              >
                {shortName(s.name)}
                <StatusChip status={s.status} />
              </button>
            )
          })}
        </div>

        <span aria-hidden className="h-4 w-px bg-line" />

        <div role="group" aria-label="模式切换" className="flex items-center gap-1">
          {(['explore', 'compare'] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-mode={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                mode === m
                  ? 'border-accent bg-accent/10 font-medium text-accent'
                  : 'border-line text-dim hover:border-accent/50 hover:text-fg'
              }`}
            >
              {m === 'explore' ? '探索' : '比较'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {system?.status !== 'shipping' ? (
            <span className="text-[11px] text-warn">
              {system?.status === 'forecast'
                ? '⚠️ 这一代的数据来自第三方分析师，不出产能数字'
                : '⚠️ 官方规格标注「Preliminary information」，可能变化'}
            </span>
          ) : null}
          <Link to="/report" className="text-xs text-accent underline">
            汇报页 →
          </Link>
        </div>
      </div>

      {/* ── 第二行：物理层级面包屑 ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{system?.name ?? generation}</span>
          {system ? <StatusChip status={system.status} /> : null}
        </div>

        <span aria-hidden className="h-4 w-px bg-line" />

        <nav aria-label="物理层级" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.assemblyId} className="flex items-center gap-1">
              {i > 0 ? (
                <span aria-hidden className="text-dim">
                  ›
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => jumpTo(c.assemblyId)}
                aria-current={c.current ? 'page' : undefined}
                className={
                  c.current
                    ? 'rounded px-1.5 py-0.5 font-medium text-fg'
                    : 'rounded px-1.5 py-0.5 text-dim hover:bg-panel-2 hover:text-accent'
                }
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {compareMode ? (
            <span className="text-[11px] text-dim">比较模式：两个视口共用同一机位，右栏看 diff 明细</span>
          ) : null}
          <span className="text-xs text-dim">
            当前层级：<span className="font-medium text-fg">{LEVEL_LABEL[level]}</span>
          </span>
          <button
            type="button"
            onClick={drillUp}
            disabled={level === 'cluster'}
            className="rounded-md border border-line bg-panel px-2 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↑ 上一层
          </button>
        </div>
      </div>

      {/* 深链与 E2E 用：当前焦点/代际/模式写进 DOM，不依赖 3D */}
      <span
        hidden
        data-focus-id={focusId ?? ''}
        data-level={level}
        data-generation={generation}
        data-mode={mode}
      />
    </div>
  )
}

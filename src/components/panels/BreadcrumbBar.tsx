/**
 * 顶部物理层级面包屑：机房 › 机架列 › 机架 › 计算托盘 › B300 GPU。
 *
 * 它同时承担三件事：告诉你「现在在哪一层」、提供一键回跳、把产品状态挂在最显眼的位置
 * （汇报时最忌讳把 forecast 的东西讲成已量产）。
 */

import { systemById } from '../../data'
import { LEVEL_LABEL, crumbsOf } from '../../lib/drill'
import { focusIdOf, useFactoryStore } from '../../store'
import { StatusChip } from '../ui/Chips'

export default function BreadcrumbBar() {
  const generation = useFactoryStore((s) => s.generation)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const level = useFactoryStore((s) => s.level)
  const jumpTo = useFactoryStore((s) => s.jumpTo)
  const drillUp = useFactoryStore((s) => s.drillUp)
  const focusId = useFactoryStore(focusIdOf)

  const system = systemById(generation)
  const crumbs = crumbsOf(focusPath)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-panel px-4 py-2">
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

      {/* 深链与 E2E 用：当前焦点写进 DOM，不依赖 3D */}
      <span hidden data-focus-id={focusId ?? ''} data-level={level} />
    </div>
  )
}

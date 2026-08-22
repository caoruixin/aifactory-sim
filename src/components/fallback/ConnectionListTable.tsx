/**
 * 连接列表——六平面在降级路径下的等价表达。
 *
 * 与 3D `ConnectionLayer` 的分工完全对应：`store.planes` 过滤哪些平面出现，
 * 色点取 `lib/palette.ts` 的同一组 token（DOM 图例/降级表/3D 连线三处共用配色，
 * 这条约定见 `palette.ts` 顶部注释）。数据流播放时不放粒子，改成整行高亮
 * （`activeConnectionIds`，由 `Fallback2D` 按当前 `FlowStep.connectionIds` 算出）。
 */

import { FACTORY_PACK, assemblyById } from '../../data'
import { PLANE_LABEL, planeColor } from '../../lib/palette'
import { useFactoryStore } from '../../store'

export interface ConnectionListTableProps {
  /** 当前数据流步骤引用的连接：整行高亮，替代 3D 里的加粗/提亮线段。 */
  activeConnectionIds?: ReadonlySet<string>
}

export default function ConnectionListTable({ activeConnectionIds }: ConnectionListTableProps) {
  const generation = useFactoryStore((s) => s.generation)
  const planes = useFactoryStore((s) => s.planes)
  const select = useFactoryStore((s) => s.select)
  const hover = useFactoryStore((s) => s.hover)

  const rows = FACTORY_PACK.connections.filter((c) => c.systemId === generation && planes[c.plane])
  const hiddenCount = FACTORY_PACK.connections.filter((c) => c.systemId === generation).length - rows.length

  if (rows.length === 0) {
    return (
      <p className="p-4 text-xs leading-relaxed text-dim">
        当前平面开关下没有可显示的连接——去左栏「网络与设施平面」打开更多平面。
      </p>
    )
  }

  return (
    <div data-connection-list="1">
      {hiddenCount > 0 ? (
        <p className="border-b border-line bg-panel-2 px-4 py-1.5 text-[11px] text-dim">
          已按左栏平面开关过滤：另有 {hiddenCount} 条连接因平面被关闭而隐藏。
        </p>
      ) : null}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-left text-dim">
            <th className="py-1.5 pr-2 pl-4 font-medium">平面</th>
            <th className="py-1.5 pr-2 font-medium">连接</th>
            <th className="py-1.5 pr-2 font-medium">协议 / 介质</th>
            <th className="py-1.5 pr-4 font-medium">带宽</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const active = activeConnectionIds?.has(c.id) ?? false
            const from = assemblyById(c.fromAssemblyId)
            const to = assemblyById(c.toAssemblyId)
            return (
              <tr
                key={c.id}
                data-connection-row={c.id}
                data-active={active ? '1' : '0'}
                className={`border-b border-line/60 align-top ${active ? 'bg-accent/10' : ''}`}
              >
                <td className="py-1.5 pr-2 pl-4">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: planeColor(c.plane) }}
                    />
                    <span className="text-dim">{PLANE_LABEL[c.plane]}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex flex-wrap items-center gap-1 font-medium">
                    <button
                      type="button"
                      onClick={() => select(c.fromAssemblyId)}
                      onMouseEnter={() => hover(c.fromAssemblyId)}
                      onMouseLeave={() => hover(null)}
                      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      {from?.label ?? c.fromAssemblyId}
                    </button>
                    <span aria-hidden className="text-dim">
                      →
                    </span>
                    <button
                      type="button"
                      onClick={() => select(c.toAssemblyId)}
                      onMouseEnter={() => hover(c.toAssemblyId)}
                      onMouseLeave={() => hover(null)}
                      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      {to?.label ?? c.toAssemblyId}
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-dim">{c.label}</p>
                </td>
                <td className="py-1.5 pr-2 text-dim">
                  {c.protocol} · {c.medium}
                </td>
                <td className="py-1.5 pr-4 font-mono text-dim">
                  {c.bandwidth && c.bandwidth.value !== null
                    ? `${c.bandwidth.value}${c.bandwidth.unit ?? ''}`
                    : '未公布'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

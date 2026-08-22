/**
 * 六平面开关 + 色点图例。
 *
 * 配色与文案在这里就定死——DOM 图例与 3D 连线（`ConnectionLayer`）共用 `lib/palette.ts`
 * 的同一组 token，因此这里的色点即最终配色，不会出现「图例是绿的，3D 里是别的绿」。
 * 开关状态由 `store.planes` 驱动，`ConnectionLayer` 直接读它决定挂载/卸载哪一组 `<Line>`。
 */

import type { NetworkPlane } from '../../data/types'
import { PLANE_LABEL, PLANE_ORDER, planeColor } from '../../lib/palette'
import { useFactoryStore } from '../../store'

export default function PlaneToggles() {
  const planes = useFactoryStore((s) => s.planes)
  const togglePlane = useFactoryStore((s) => s.togglePlane)
  const setPlanes = useFactoryStore((s) => s.setPlanes)

  const setAll = (on: boolean) => {
    setPlanes(PLANE_ORDER.reduce((acc, p) => ({ ...acc, [p]: on }), {} as Record<NetworkPlane, boolean>))
  }

  return (
    <section className="px-3 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">网络与设施平面</h2>
        <div className="flex gap-2 text-[11px]">
          <button type="button" onClick={() => setAll(true)} className="text-dim hover:text-accent">
            全开
          </button>
          <button type="button" onClick={() => setAll(false)} className="text-dim hover:text-accent">
            全关
          </button>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {PLANE_ORDER.map((plane) => (
          <li key={plane}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-panel-2">
              <input
                type="checkbox"
                checked={planes[plane]}
                onChange={() => togglePlane(plane)}
                className="h-3.5 w-3.5"
              />
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: planeColor(plane) }}
              />
              <span className={planes[plane] ? '' : 'text-dim line-through'}>
                {PLANE_LABEL[plane]}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-dim">
        机架/托盘视图下六个平面都能画出连线；集群总览只画 scale-out 主干（其余平面在这一级
        会收缩成同一个机架盒子，画出来没有教学意义）。
      </p>
    </section>
  )
}

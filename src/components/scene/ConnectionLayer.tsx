/**
 * 六平面连接可视化：按 `store.planes` 过滤，每平面一组 drei `<Line>`。
 *
 * - 折线路由来自 `lib/routing.ts`（纯几何查表，随 `depth` 变化重新计算，开销很小）；
 * - 平面开关的挂载/卸载由 React 自然处理（`planes` 是 store 的响应式订阅）；
 *   demand 帧循环下 React 重渲染不等于 WebGL 重绘，因此还需要显式 `invalidate()`；
 * - **集群级只画 scale-out**：cluster 视图下没有挂机架内部的任何网格，nvlink/power/
 *   cooling/mgmt/business 这些平面的端点要么收缩成同一个「机架」盒子（被 `routing.ts`
 *   当退化边过滤掉），要么会画出「机房→机架」这种在集群尺度没有教学意义的粗线——
 *   因此这里显式收窄，只保留天然适合鸟瞰的 scale-out 主干（rack↔leaf↔spine）；
 * - 当前 `FlowStep` 引用的连接会加粗、提高不透明度，配合 `FlowBar` 播放/`reducedMotion`
 *   静态高亮（同一条连接不需要 `FlowLayer` 另画一遍，颜色即所在平面色）。
 *
 * ★ **连线是「示意图层」，一律 `depthTest={false}` + `renderOrder=2` 画在几何体之上。**
 *   不这么做的话，**机架内部的连接会完全看不见**：`routing.ts` 的折线总线高度是
 *   `max(端点 y) + 距离 × 5%`，机架内两个托盘之间的距离本来就小，算出来的折线整段
 *   仍然埋在不透明的托盘盒子里。实测后果是 nvlink 平面在机架级**开关毫无画面变化**
 *   （六条 nvlink 边全是机架内的 scale-up），而导览第 2 站「拆开一个机架：18+9 的结构」
 *   恰恰点名要看 nvlink + power —— 那一屏当时是空的。
 *   这些线本来就不是实物线缆（内容包里一条边代表 72×18 条链路），当作示意图层画在
 *   最上层既符合它的语义，也让六个平面在任何层级下行为一致。
 */

import { Line } from '@react-three/drei'
import { invalidate } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { episodeOf } from '../../data'
import type { LodLevel, NetworkPlane } from '../../data/types'
import type { ResolvedLayout } from '../../lib/layout'
import { planeColor } from '../../lib/palette'
import { routeConnections } from '../../lib/routing'
import type { RoutedConnection } from '../../lib/routing'
import { useFactoryStore } from '../../store'

export interface ConnectionLayerProps {
  systemId: string
  layout: ResolvedLayout
  depth: LodLevel
  /** 额外收窄可见平面（比较模式只留 nvlink + scaleout 降噪）；与 store 的平面开关取交集。 */
  planeFilter?: readonly NetworkPlane[]
}

export default function ConnectionLayer({ systemId, layout, depth, planeFilter }: ConnectionLayerProps) {
  const planes = useFactoryStore((s) => s.planes)
  const flow = useFactoryStore((s) => s.flow)

  const routes = useMemo(
    () => routeConnections(systemId, layout, depth),
    [systemId, layout, depth],
  )

  // 当前步骤的高亮只对**该系统自己的**剧本有意义：换代际后 GB300 的连接 ID
  // 在这个系统里根本不存在，硬查会一条都点不亮（还会误导人以为数据错了）。
  const activeConnectionIds = useMemo(() => {
    const episode = episodeOf(systemId, flow.episodeIdx)
    const step = episode?.steps[flow.stepIdx]
    return new Set(step ? step.connectionIds : [])
  }, [systemId, flow.episodeIdx, flow.stepIdx])

  const byPlane = useMemo(() => {
    const clusterView = depth === 'cluster'
    const allowed = planeFilter ? new Set(planeFilter) : null
    const map = new Map<NetworkPlane, RoutedConnection[]>()
    for (const r of routes) {
      if (allowed && !allowed.has(r.plane)) continue
      // 集群级只保留天然适合鸟瞰的两个平面：scale-out 主干，以及**跨机架**的 scale-up
      // （NVL576 的机架间光互连就属于后者）。机架内的 nvlink 边在这一级两端会收缩到
      // 同一个机架盒子，已被 routing.ts 当退化边滤掉，因此不会有多余的线。
      if (clusterView && r.plane !== 'scaleout' && r.plane !== 'nvlink') continue
      const list = map.get(r.plane)
      if (list) list.push(r)
      else map.set(r.plane, [r])
    }
    return map
  }, [routes, depth, planeFilter])

  // demand 帧循环下，store 驱动的重渲染（平面开关、步骤切换）不会自动触发 WebGL 重绘。
  useEffect(() => {
    invalidate()
  }, [planes, byPlane, activeConnectionIds])

  return (
    <group name="connection-layer">
      {Array.from(byPlane.entries()).map(([plane, list]) => {
        if (!planes[plane]) return null
        const lineColor = planeColor(plane)
        return (
          <group key={plane} name={`plane-${plane}`}>
            {list.map((r) => {
              const active = activeConnectionIds.has(r.connectionId)
              return (
                <Line
                  key={r.connectionId}
                  points={r.points}
                  color={lineColor}
                  lineWidth={active ? 2.5 : 1.5}
                  transparent
                  opacity={active ? 1 : 0.55}
                  depthTest={false}
                  renderOrder={2}
                  raycast={() => null}
                />
              )
            })}
          </group>
        )
      })}
    </group>
  )
}

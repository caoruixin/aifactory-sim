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
 */

import { Line } from '@react-three/drei'
import { invalidate } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { FACTORY_PACK } from '../../data'
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
}

export default function ConnectionLayer({ systemId, layout, depth }: ConnectionLayerProps) {
  const planes = useFactoryStore((s) => s.planes)
  const flow = useFactoryStore((s) => s.flow)

  const routes = useMemo(
    () => routeConnections(systemId, layout, depth),
    [systemId, layout, depth],
  )

  const activeConnectionIds = useMemo(() => {
    const episode = FACTORY_PACK.flows[flow.episodeIdx]
    const step = episode?.steps[flow.stepIdx]
    return new Set(step ? step.connectionIds : [])
  }, [flow.episodeIdx, flow.stepIdx])

  const byPlane = useMemo(() => {
    const clusterView = depth === 'cluster'
    const map = new Map<NetworkPlane, RoutedConnection[]>()
    for (const r of routes) {
      if (clusterView && r.plane !== 'scaleout') continue
      const list = map.get(r.plane)
      if (list) list.push(r)
      else map.set(r.plane, [r])
    }
    return map
  }, [routes, depth])

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

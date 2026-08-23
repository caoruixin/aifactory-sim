/**
 * 六平面连接可视化：按 `store.planes` 过滤，每平面一组 drei `<Line>`。
 *
 * - 折线路由来自 `lib/routing.ts`（纯几何查表，随 `depth` 变化重新计算，开销很小）；
 * - 平面开关的挂载/卸载由 React 自然处理（`planes` 是 store 的响应式订阅）；
 *   demand 帧循环下 React 重渲染不等于 WebGL 重绘，因此还需要显式 `invalidate()`；
 * - **不按层级越权收窄平面**（v1.1 A1）：这里曾经在 cluster 深度硬过滤成「只画
 *   scale-out + nvlink」。实测后果是机房设备看起来互不相连——数据包里 10 条完全
 *   合法的机房级连接（manifold↔CDU、CDU↔一次侧水路、DPU→业务交换机→存储、
 *   带外管理上联、配电→电源架…）即使把开关打开也一条都不画。机架**内部**的边在
 *   这一级本来就会被 `routing.ts` 当退化边滤掉，所以「集群视图不该有一堆机架内细线」
 *   这件事根本不需要渲染层再管一次。现在的规则只有一条：**非退化 + 平面开关打开就画**，
 *   默认视觉秩序交给导览场景 preset（`scene.gb300.cluster-overview` 已收窄为
 *   scaleout/power/cooling）与用户自己的开关；
 * - **当前步骤强调 + 其余退让**（v1.1 B3）：播放中（或 `reducedMotion` 下——那时没有
 *   移动粒子，这就是主要反馈）当前 `FlowStep` 引用的线加粗 ×1.8 并拉满不透明度，
 *   同屏其余线降到 0.35。只改 opacity/linewidth/color，**不翻转 transparent**
 *   （材质本来就常开），因此不涉及着色器重编。当前步骤没有任何物理连接（逻辑层步骤）
 *   时不做退让——否则「网关鉴权」那一步会把整屏的线无缘无故压暗；
 * - **出界线「传送门」**（v1.1 B4）：托盘/板级视图下，通往托盘外部件（业务交换机、
 *   CDU、母排…）的线过去会拖成冲出画面的长斜线，两端都在托盘外的线更是纯噪音。
 *   现在由 `routeConnections` 的 `containment` 做三分：两端在内画全线 / 恰一端在内
 *   截断成 stub + drei `<Html>` 小标签「→ 远端组件名」（可点击选中远端）/ 两端在外丢弃。
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

import { Html, Line } from '@react-three/drei'
import { invalidate } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { assemblyById, episodeOf } from '../../data'
import type { LodLevel, NetworkPlane } from '../../data/types'
import type { ResolvedLayout } from '../../lib/layout'
import { FLOW_EMPHASIS, planeColor } from '../../lib/palette'
import { routeConnections } from '../../lib/routing'
import type { ContainmentOptions, RoutedConnection } from '../../lib/routing'
import { useFactoryStore } from '../../store'

export interface ConnectionLayerProps {
  systemId: string
  layout: ResolvedLayout
  depth: LodLevel
  /** 额外收窄可见平面（比较模式只留 nvlink + scaleout 降噪）；与 store 的平面开关取交集。 */
  planeFilter?: readonly NetworkPlane[]
  /** board 级拆解视图：路由必须走 explode 后的坐标，否则线与拆开的器件脱节。 */
  exploded?: boolean
  /** 托盘/板级：出界线三分规则的容器（scene anchor 的托盘装配）。 */
  containment?: ContainmentOptions | null
  /** 比较模式不挂 `<Html>` 标签：两个 `<View>` 共用一个事件层，DOM 覆盖层只会添乱。 */
  showStubLabels?: boolean
}

export default function ConnectionLayer({
  systemId,
  layout,
  depth,
  planeFilter,
  exploded = false,
  containment = null,
  showStubLabels = true,
}: ConnectionLayerProps) {
  const planes = useFactoryStore((s) => s.planes)
  const flow = useFactoryStore((s) => s.flow)
  const reducedMotion = useFactoryStore((s) => s.reducedMotion)
  const select = useFactoryStore((s) => s.select)

  const containRoot = containment?.rootAssemblyId ?? null
  const routes = useMemo(
    () => routeConnections(systemId, layout, depth, exploded, containRoot ? { rootAssemblyId: containRoot } : null),
    [systemId, layout, depth, exploded, containRoot],
  )

  // 当前步骤的高亮只对**该系统自己的**剧本有意义：换代际后 GB300 的连接 ID
  // 在这个系统里根本不存在，硬查会一条都点不亮（还会误导人以为数据错了）。
  const activeConnectionIds = useMemo(() => {
    const episode = episodeOf(systemId, flow.episodeIdx)
    const step = episode?.steps[flow.stepIdx]
    return new Set(step ? step.connectionIds : [])
  }, [systemId, flow.episodeIdx, flow.stepIdx])

  /**
   * 退让只在「这一屏**确实画得出**被强调的那条线」时才发生。
   *
   * 不能只看 `activeConnectionIds.size > 0`：prefill 引用的 `gpu-nvswitch` 在集群深度是
   * 退化边（根本没有路由），那时把其余线全压到 0.35 就是「无缘无故整屏变暗、却没有任何
   * 一条线被点亮」。逻辑层步骤（`connectionIds` 为空）同理。
   */
  const emphasize =
    (flow.playing || reducedMotion) && routes.some((r) => activeConnectionIds.has(r.connectionId))

  const byPlane = useMemo(() => {
    const allowed = planeFilter ? new Set(planeFilter) : null
    const map = new Map<NetworkPlane, RoutedConnection[]>()
    for (const r of routes) {
      if (allowed && !allowed.has(r.plane)) continue
      const list = map.get(r.plane)
      if (list) list.push(r)
      else map.set(r.plane, [r])
    }
    return map
  }, [routes, planeFilter])

  // demand 帧循环下，store 驱动的重渲染（平面开关、步骤切换）不会自动触发 WebGL 重绘。
  useEffect(() => {
    invalidate()
  }, [planes, byPlane, activeConnectionIds, emphasize])

  return (
    <group name="connection-layer">
      {Array.from(byPlane.entries()).map(([plane, list]) => {
        if (!planes[plane]) return null
        const lineColor = planeColor(plane)
        return (
          <group key={plane} name={`plane-${plane}`}>
            {list.flatMap((r) => {
              const active = activeConnectionIds.has(r.connectionId)
              const width = active ? 2.5 * (emphasize ? FLOW_EMPHASIS.activeWidthScale : 1) : 1.5
              const opacity = active ? 1 : emphasize ? FLOW_EMPHASIS.idleOpacity : 0.55
              // 一条内容连接可能有多条几何路径（集群级的 8 台机架各一条，见 routing.ts
              // 的 `instancePaths`）——它们共享同一个 connectionId 与同一套视觉参数。
              return r.instancePaths.map((path, i) => (
                <Line
                  key={`${r.connectionId}#${i}`}
                  points={path.points}
                  color={lineColor}
                  lineWidth={width}
                  transparent
                  opacity={opacity}
                  depthTest={false}
                  renderOrder={2}
                  raycast={() => null}
                />
              ))
            })}
            {showStubLabels
              ? list.map((r) =>
                  r.stub ? (
                    <StubLabel
                      key={`stub-${r.connectionId}`}
                      position={r.stub.tip}
                      assemblyId={r.stub.farAssemblyId}
                      color={lineColor}
                      onSelect={select}
                    />
                  ) : null,
                )
              : null}
          </group>
        )
      })}
    </group>
  )
}

/**
 * 出界线末端的「传送门」标签：告诉人这条线通向托盘外的什么部件，点一下就能选中它
 * （相机不动——这一屏看的是托盘内部，不该被一个标签拽走）。
 */
function StubLabel({
  position,
  assemblyId,
  color,
  onSelect,
}: {
  position: [number, number, number]
  assemblyId: string
  color: string
  onSelect: (id: string) => void
}) {
  const label = assemblyById(assemblyId)?.label ?? assemblyId
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
      <button
        type="button"
        data-stub-label={assemblyId}
        title={`通往托盘外：${label}（点击选中）`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(assemblyId)
          invalidate()
        }}
        className="cursor-pointer rounded-full border bg-panel/90 px-1.5 py-px text-[10px] leading-tight whitespace-nowrap text-fg"
        style={{ borderColor: color }}
      >
        → {label}
      </button>
    </Html>
  )
}

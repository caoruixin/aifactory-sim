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
 * - **强调集合的唯一裁决者是 `lib/connectionEmphasis.ts`**（v1.6）：数据流当前步与
 *   切面章节动线（`LensChapter.highlightConnectionIds`）会同时存在，优先级写在那个纯函数里，
 *   降级路径的连接列表走同一个入口。以下这条讲的是**视觉参数**，不是「谁被强调」的判定；
 * - **当前步骤强调 + 其余退让**（v1.1 B3）：播放中（或 `reducedMotion` 下——那时没有
 *   移动粒子，这就是主要反馈）当前 `FlowStep` 引用的线加粗 ×1.8 并拉满不透明度，
 *   同屏其余线降到 0.35。只改 opacity/linewidth/color，**不翻转 transparent**
 *   （材质本来就常开），因此不涉及着色器重编。当前步骤没有任何物理连接（逻辑层步骤）
 *   时不做退让——否则「网关鉴权」那一步会把整屏的线无缘无故压暗；
 * - **出界线「传送门」**（v1.1 B4，v1.2 F1 扩到机架级）：托盘/板级/**机架级**视图下，
 *   通往容器外部件（业务交换机、CDU、母排…）的线过去会拖成冲出画面的长斜线，
 *   两端都在容器外的线更是纯噪音。现在由 `routeConnections` 的 `containment` 做三分：
 *   两端在内画全线 / 恰一端在内截断成 stub + drei `<Html>` 小标签「→ 远端组件名」
 *   （可点击选中远端）/ 两端在外丢弃。多个 stub 的标签靠 `stackStubLabels` 错开，
 *   否则机架级几个 tip 只差几厘米的标签会完全叠死。
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
import { connectionEmphasis } from '../../lib/connectionEmphasis'
import type { ResolvedLayout, Vec3 } from '../../lib/layout'
import { FLOW_EMPHASIS, planeColor } from '../../lib/palette'
import { routeConnections, stackStubLabels } from '../../lib/routing'
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
  /** 机架/托盘/板级：出界线三分规则的容器（scene anchor 实际渲染出来的子树根）。 */
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
  // 窄订阅：切面只需要「模式 + 哪一章」两个标量，整个订 `s.lens` 会让每次
  // setLens 都重建对象引用（这里是 3D 层，重渲染代价比 DOM 面板高）。
  const mode = useFactoryStore((s) => s.mode)
  const lensId = useFactoryStore((s) => s.lens.lensId)
  const lensChapterIdx = useFactoryStore((s) => s.lens.chapterIdx)

  // containment 由调用方 memo 化（`SceneRoot` 已 useMemo），这里**整对象透传 + 整对象入依赖**：
  // 拆成 rootAssemblyId 再重建 `{rootAssemblyId}` 会在新增字段（如 margin）时静默丢数据——
  // v1.2 F1 的机架级 margin 就是这么被吞掉的。
  const routes = useMemo(
    () => routeConnections(systemId, layout, depth, exploded, containment),
    [systemId, layout, depth, exploded, containment],
  )

  /**
   * 强调哪几条线由 `lib/connectionEmphasis.ts` 一处裁决（数据流当前步 vs 切面章节动线），
   * 降级路径的连接列表走同一个函数——两边不可能再点亮不同的集合。
   *
   * 当前步骤的高亮只对**该系统自己的**剧本有意义：换代际后 GB300 的连接 ID 在这个系统里
   * 根本不存在，硬查会一条都点不亮（还会误导人以为数据错了）；切面章节同理，
   * 因此把 `systemId` 一并传进去让纯函数守这条。
   */
  const emphasis = useMemo(() => {
    const step = episodeOf(systemId, flow.episodeIdx)?.steps[flow.stepIdx]
    return connectionEmphasis({
      mode,
      lens: { lensId, chapterIdx: lensChapterIdx },
      stepConnectionIds: step?.connectionIds ?? [],
      flowPlaying: flow.playing,
      reducedMotion,
      systemId,
    })
  }, [systemId, flow.episodeIdx, flow.stepIdx, flow.playing, reducedMotion, mode, lensId, lensChapterIdx])

  const activeConnectionIds = useMemo(() => new Set(emphasis.connectionIds), [emphasis])

  /**
   * 退让只在「这一屏**确实画得出**被强调的那条线」时才发生。
   *
   * 不能只看 `activeConnectionIds.size > 0`：prefill 引用的 `gpu-nvswitch` 在集群深度是
   * 退化边（根本没有路由），那时把其余线全压到 0.35 就是「无缘无故整屏变暗、却没有任何
   * 一条线被点亮」。逻辑层步骤（`connectionIds` 为空）与切面章节的跨深度动线同理。
   */
  const emphasize = emphasis.dim && routes.some((r) => activeConnectionIds.has(r.connectionId))

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

  /**
   * stub 标签防重叠（v1.2 F1）：把**当前真的会画出来**的 stub（平面开关打开 + 未被
   * planeFilter 挡掉 + 允许挂标签）收齐，一次性算出错开后的位置。
   *
   * ★ 跨平面统一算：重叠是屏幕上的事，不分平面——机架级 `cx8-leaf`（scaleout）与
   *   `inrack-oob-uplink`（mgmt）的 tip 就只差几厘米。
   * ★ 位置随「哪些平面打开」变化是**预期行为**：只对当前这一屏负责，且对同一组输入
   *   逐位确定（`stackStubLabels` 内部先排序）。
   */
  const stubLabelPositions = useMemo(() => {
    if (!showStubLabels) return new Map<string, Vec3>()
    const allowed = planeFilter ? new Set(planeFilter) : null
    const visible: { connectionId: string; tip: Vec3 }[] = []
    for (const r of routes) {
      if (!r.stub) continue
      if (allowed && !allowed.has(r.plane)) continue
      if (!planes[r.plane]) continue
      visible.push({ connectionId: r.connectionId, tip: r.stub.tip })
    }
    return stackStubLabels(visible)
  }, [routes, planeFilter, planes, showStubLabels])

  // demand 帧循环下，store 驱动的重渲染（平面开关、步骤切换、**切面换章**）不会自动
  // 触发 WebGL 重绘。`emphasis` 入依赖 = 切面章节切换也一定补帧（哪怕两章点亮的是同
  // 一组连接，dim/来源变了画面也变）。
  useEffect(() => {
    invalidate()
  }, [planes, byPlane, activeConnectionIds, emphasis, emphasize, stubLabelPositions])

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
                      position={stubLabelPositions.get(r.connectionId) ?? r.stub.tip}
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
 * 出界线末端的「传送门」标签：告诉人这条线通向当前容器外的什么部件，点一下就能选中它
 * （相机不动——这一屏看的是容器内部，不该被一个标签拽走）。
 *
 * `position` 由 `stackStubLabels` 给出，可能比线端点略高一点（防重叠），因此它不总是
 * 精确压在 `stub.tip` 上——冲突时抬 0.12 m/档，实测最多抬 1~2 档。
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
        title={`通往视图外：${label}（点击选中）`}
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

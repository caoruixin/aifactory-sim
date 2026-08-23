/**
 * 可交互部件。
 *
 * 交互约定
 * - 单击 = 选中（右栏出详情），双击 = 下钻一层；
 * - `stopPropagation()` 让**最近命中**（= 视觉上最深的那一件）独占事件，
 *   否则点 GPU 会连带选中它外面的托盘；
 * - 装饰物（地面网格、邻架 ghost、容器玻璃罩）一律 `raycast={() => null}`，
 *   既避免误点，也把 raycast 的候选集压到最小；
 * - 每次视觉变化后显式 `invalidate()`——frameloop 是 demand，不主动请求就不会重绘。
 */

import { invalidate, type ThreeEvent } from '@react-three/fiber'
import { useCallback } from 'react'
import { componentById } from '../../data'
import type { AssemblyNode } from '../../data/types'
import type { Vec3 } from '../../lib/layout'
import { HIGHLIGHT, HIGHLIGHT_EMISSIVE, HIGHLIGHT_TOKEN, highlightKindOf, palette } from '../../lib/palette'
import { useFactoryStore } from '../../store'
import { ShapeMesh, surfaceStyleFor } from './GenericShapes'

/** 光标计数：多个热点交替进出时不会把 cursor 卡在 pointer 上。 */
let hoverCount = 0

function setCursor(active: boolean): void {
  if (typeof document === 'undefined') return
  hoverCount = Math.max(0, hoverCount + (active ? 1 : -1))
  document.body.style.cursor = hoverCount > 0 ? 'pointer' : ''
}

export interface HotspotProps {
  node: AssemblyNode
  /** 同一装配节点的第几个实例（18 个托盘里的第几个）。 */
  instanceIndex?: number
  position: Vec3
  size: Vec3
  /** 覆盖组件默认色（例如 ghost）。 */
  colorOverride?: string
  opacity?: number
  /** 双击是否下钻。叶子件（已到板级）关掉，避免「双击了但什么都没变」。 */
  drillable?: boolean
  /**
   * 数据流当前步骤参与的硬件（v1.1 B1）。走与「选中」同一套 emissive 机制，
   * 换 `accent-2` 区分——从而任何深度都能看出「这一步发生在哪个盒子里」。
   */
  flowActive?: boolean
  /**
   * 当前步骤是「本地物理动作」（v1.2 F2）：给已经在发光的部件再加一层缓慢呼吸，
   * 让 kv-write 这种不走网络链路的步骤也有动态反馈。由 `SceneRoot` 统一算好下传。
   */
  flowPulse?: boolean
  /**
   * 当前导览站点名的硬件（v1.3 W2，`ScenePreset.highlightAssemblyIds` 折叠到当前深度）。
   *
   * ★ 与 `flowActive` **分属两个通道**，不共用一个布尔：脉冲只认 flow（导览是静态讲解），
   *   而且两者同时命中时颜色档位要能分辨——裁决交给 `highlightKindOf`。
   */
  sceneActive?: boolean
}

export function Hotspot({
  node,
  instanceIndex = 0,
  position,
  size,
  colorOverride,
  opacity,
  drillable = true,
  flowActive = false,
  flowPulse = false,
  sceneActive = false,
}: HotspotProps) {
  const select = useFactoryStore((s) => s.select)
  const drillTo = useFactoryStore((s) => s.drillTo)
  const hover = useFactoryStore((s) => s.hover)
  const isSelected = useFactoryStore((s) => s.selectedId === node.id)
  const isHovered = useFactoryStore((s) => s.hoveredId === node.id)

  const component = componentById(node.componentId)
  // 材质随产品状态变化（shipping 实体 / announced 蓝调 / forecast 琥珀线框），
  // 因此换代际不需要改这里——颜色是从内容包的 status 推出来的。
  const style = surfaceStyleFor(component)
  const base = colorOverride ?? style.color
  const p = palette()

  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      hover(node.id)
      setCursor(true)
      invalidate()
    },
    [hover, node.id],
  )

  const onPointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      hover(null)
      setCursor(false)
      invalidate()
    },
    [hover],
  )

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      select(node.id)
      invalidate()
    },
    [select, node.id],
  )

  const onDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (drillable) drillTo(node.id)
      else select(node.id)
      invalidate()
    },
    [drillTo, select, node.id, drillable],
  )

  // 优先级链交给 palette 的 `highlightKindOf` 唯一裁决（selected > hovered > flow > scene）：
  // 前两者是「用户此刻的意图」，后两者是背景叙事（数据流当前步 / 导览当前站），
  // 背景叙事不该盖掉用户自己点的那一件。RackInstances 走同一个函数，两条渲染路径不会再分叉。
  const kind = highlightKindOf({
    selected: isSelected,
    hovered: isHovered,
    flow: flowActive,
    scene: sceneActive,
  })
  const emissive = kind ? p[HIGHLIGHT_TOKEN[kind]] : null
  const emissiveIntensity = kind ? HIGHLIGHT_EMISSIVE[kind] : 0

  return (
    <ShapeMesh
      shape={component?.visual.shape ?? 'tray-slab'}
      size={size}
      position={position}
      color={base}
      opacity={opacity ?? style.opacity}
      wireframe={style.wireframe}
      roughness={style.roughness}
      metalness={style.metalness}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      // 脉冲**只认 flow 通道**：`kind === 'flow'` 已经蕴含「没被选中/悬停盖掉」，
      // 而场景高亮（kind === 'scene'）是静态讲解，永远不呼吸。
      emissivePulse={kind === 'flow' && flowPulse}
      edgeColor={isSelected ? p[HIGHLIGHT.selectedToken] : undefined}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      userData={{ assemblyId: node.id, instanceIndex }}
    />
  )
}

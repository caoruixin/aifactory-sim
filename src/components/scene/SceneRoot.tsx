/**
 * 语义 LOD 的落地点。
 *
 * ★ 「LOD」在这里**不是** `THREE.LOD`（按距离切换网格），而是
 *   **按下钻层级挂载/卸载不同的 React 子树**：
 *     cluster → 只有机架壳 `<Instances>` + 机房设施 + 地面网格；
 *     rack    → 焦点机架的全部 U 位设备（18 计算托盘 + 9 交换托盘 + 8 电源架 + 2 管理交换机
 *               + 母排/歧管/背板），邻架用共享材质的 ghost；
 *     tray    → 焦点托盘的板级内部；
 *     board   → 同一棵子树，位置换成 `explodedSlots`（拆解视图）。
 *
 *   因此「集群总览里不会挂出 72 张 GPU」不是靠判断距离，而是**结构上就没挂**——
 *   这是本项目控制 draw call 的主要手段，也是唯一需要维护的一条不变量。
 *
 * 层级 → 渲染深度：cluster 只渲染 lodLevel='cluster' 的节点，rack 到 'rack'，
 * tray/board 到 'board'。深度截断由 `RENDER_DEPTH` 一处控制。
 */

import { Edges, Grid, Instance, Instances } from '@react-three/drei'
import { invalidate } from '@react-three/fiber'
import { useCallback, useMemo, useState } from 'react'
import { ancestorsOf, assemblyById, childrenOf, componentById } from '../../data'
import type { AssemblyNode, LodLevel, NetworkPlane } from '../../data/types'
import type { DiffKind } from '../../lib/compare'
import { DIFF_TOKEN } from '../../lib/compare'
import { levelIndex, sceneAnchorOf } from '../../lib/drill'
import { layoutOf, worldPositionOf } from '../../lib/layout'
import type { ResolvedLayout } from '../../lib/layout'
import { HIGHLIGHT, SURFACE, color as paletteColor, palette } from '../../lib/palette'
import { useFactoryStore } from '../../store'
import ConnectionLayer from './ConnectionLayer'
import FlowLayer from './FlowLayer'
import { ShapeMesh, ShellMesh, surfaceStyleFor } from './GenericShapes'
import { Hotspot } from './Hotspot'

/**
 * 比较模式的渲染上下文。`null` = 普通探索模式（可交互、无 diff 着色）。
 *
 * ⚠️ 比较模式下**刻意不挂 Hotspot**：drei `<View>` 的事件层同一时刻只能连到一个
 * tracked 元素（见 View 源码里的 `rootState.setEvents({connected: track.current})`），
 * 两个视口都挂交互会出现「只有一边能点」的诡异行为。比较是「看差异」，
 * 点选交给右栏的 DOM 列表，这样两边行为一致且可预期。
 */
export interface DiffContext {
  index: ReadonlyMap<string, DiffKind>
  showDiffOnly: boolean
}

/** 每级最深渲染到哪一层 lodLevel。 */
const RENDER_DEPTH: Record<LodLevel, LodLevel> = {
  cluster: 'cluster',
  rack: 'rack',
  tray: 'board',
  board: 'board',
}

/** 从根到该节点的 ID 链（复用 data 层的 ancestorsOf，不重写树遍历）。 */
function chainOf(assemblyId: string): string[] {
  return ancestorsOf(assemblyId).map((n) => n.id)
}

// ─────────────────────────── 递归分支 ───────────────────────────

interface BranchProps {
  node: AssemblyNode
  layout: ResolvedLayout
  depth: LodLevel
  exploded: boolean
  /** 该节点自身是否作为「玻璃罩」渲染（正在被钻入的容器）。 */
  asShell?: boolean
  /** 只渲染第几个实例；省略则全部渲染。 */
  onlyInstance?: number
  diff?: DiffContext | null
}

/** 比较模式下的静态部件：不可交互，用描边颜色表达 diff 类别。 */
function DiffMesh({
  node,
  size,
  diff,
}: {
  node: AssemblyNode
  size: [number, number, number]
  diff: DiffContext
}) {
  const component = componentById(node.componentId)
  const style = surfaceStyleFor(component)
  const kind = diff.index.get(node.id) ?? 'unchanged'
  const token = DIFF_TOKEN[kind]
  const ghost = diff.showDiffOnly && kind === 'unchanged'

  return (
    <ShapeMesh
      shape={component?.visual.shape ?? 'tray-slab'}
      size={size}
      color={style.color}
      opacity={ghost ? HIGHLIGHT.ghostOpacity : style.opacity}
      wireframe={style.wireframe}
      roughness={style.roughness}
      metalness={style.metalness}
      depthWrite={ghost ? false : undefined}
      edges={!ghost}
      edgeColor={token ? paletteColor(token, 'dim') : SURFACE.edge}
      raycast={() => null}
    >
      {/* 变化的部件再叠一圈更粗的语义色描边，远看也能一眼扫到 */}
      {token && !ghost ? <Edges color={paletteColor(token, 'dim')} lineWidth={2} threshold={15} /> : null}
    </ShapeMesh>
  )
}

function AssemblyBranch({
  node,
  layout,
  depth,
  exploded,
  asShell = false,
  onlyInstance,
  diff = null,
}: BranchProps) {
  const item = layout.get(node.id)
  const kids = childrenOf(node.id)
  const maxDepth = levelIndex(depth)
  const component = componentById(node.componentId)

  if (!item) return null

  const slots = exploded ? item.explodedSlots : item.slots
  const indices = onlyInstance === undefined ? slots.map((_, i) => i) : [onlyInstance]
  const visibleKids = kids.filter((k) => levelIndex(k.lodLevel) <= maxDepth)
  const drillable = kids.some((k) => levelIndex(k.lodLevel) > levelIndex(node.lodLevel))

  return (
    <>
      {indices.map((i) => {
        const p = slots[i]
        if (!p) return null
        return (
          <group key={`${node.id}#${i}`} position={p}>
            {asShell ? (
              <ShellMesh
                shape={component?.visual.shape ?? 'rack-frame'}
                size={item.size}
                color={SURFACE.rack}
              />
            ) : diff ? (
              <DiffMesh node={node} size={item.size} diff={diff} />
            ) : (
              <Hotspot node={node} instanceIndex={i} position={[0, 0, 0]} size={item.size} drillable={drillable} />
            )}
            {visibleKids.map((kid) => (
              <AssemblyBranch
                key={kid.id}
                node={kid}
                layout={layout}
                depth={depth}
                exploded={exploded}
                diff={diff}
              />
            ))}
          </group>
        )
      })}
    </>
  )
}

// ─────────────────────────── 集群级 ───────────────────────────

/**
 * 8 个机架用 drei `<Instances>` 走一次 draw call。
 * 代价：instanced mesh 不支持 per-instance emissive，因此高亮改用 per-instance color
 * （观感与 Hotspot 的 emissive 高亮对齐，两处都取 palette 的 accent）。
 */
function RackInstances({ node, layout }: { node: AssemblyNode; layout: ResolvedLayout }) {
  const item = layout.get(node.id)
  // 机架壳的底色同样跟产品状态走：集群总览一眼就能看出这是哪一代
  // （shipping 原色 / announced 蓝调 / forecast 琥珀线框）。
  const style = surfaceStyleFor(componentById(node.componentId))
  const select = useFactoryStore((s) => s.select)
  const drillTo = useFactoryStore((s) => s.drillTo)
  const hover = useFactoryStore((s) => s.hover)
  const isSelected = useFactoryStore((s) => s.selectedId === node.id)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const p = palette()

  const onOver = useCallback(
    (i: number) => () => {
      setHoveredIdx(i)
      hover(node.id)
      if (typeof document !== 'undefined') document.body.style.cursor = 'pointer'
      invalidate()
    },
    [hover, node.id],
  )
  const onOut = useCallback(() => {
    setHoveredIdx(null)
    hover(null)
    if (typeof document !== 'undefined') document.body.style.cursor = ''
    invalidate()
  }, [hover])

  if (!item) return null
  const base = style.color

  return (
    <Instances limit={item.slots.length} range={item.slots.length} frustumCulled={false}>
      <boxGeometry args={[item.size[0], item.size[1], item.size[2]]} />
      {/* ⚠️ InstancedMesh 的 per-instance color 是**乘**在材质色上的，
          所以材质必须留白，否则 base × base 会把机架压成一块黑。 */}
      <meshStandardMaterial
        color="#ffffff"
        roughness={style.roughness}
        metalness={style.metalness}
        wireframe={style.wireframe}
      />
      {item.slots.map((pos, i) => (
        <Instance
          key={i}
          position={pos}
          // 选中时高亮第 0 架（相机也飞向它），悬停时高亮鼠标下的那一架
          color={hoveredIdx === i ? p[HIGHLIGHT.hoveredToken] : isSelected && i === 0 ? p[HIGHLIGHT.selectedToken] : base}
          onPointerOver={onOver(i)}
          onPointerOut={onOut}
          onClick={(e) => {
            e.stopPropagation()
            select(node.id)
            invalidate()
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            drillTo(node.id)
            invalidate()
          }}
        />
      ))}
    </Instances>
  )
}

/** 比较模式下的机架阵列：同样走 `<Instances>`（一次 draw call），但不可交互。 */
function StaticRackInstances({
  node,
  layout,
  diff,
}: {
  node: AssemblyNode
  layout: ResolvedLayout
  diff: DiffContext
}) {
  const item = layout.get(node.id)
  if (!item) return null
  const component = componentById(node.componentId)
  const style = surfaceStyleFor(component)
  const kind = diff.index.get(node.id) ?? 'unchanged'
  const token = DIFF_TOKEN[kind]
  const ghost = diff.showDiffOnly && kind === 'unchanged'
  return (
    <Instances limit={item.slots.length} range={item.slots.length} frustumCulled={false}>
      <boxGeometry args={[item.size[0], item.size[1], item.size[2]]} />
      <meshStandardMaterial
        color={style.color}
        roughness={style.roughness}
        metalness={style.metalness}
        wireframe={style.wireframe}
        transparent={ghost}
        opacity={ghost ? HIGHLIGHT.ghostOpacity : 1}
        depthWrite={!ghost}
      />
      {item.slots.map((pos, i) => (
        <Instance key={i} position={pos} raycast={() => null}>
          {token && !ghost ? <Edges color={paletteColor(token, 'dim')} lineWidth={1.5} threshold={15} /> : null}
        </Instance>
      ))}
    </Instances>
  )
}

function ClusterScene({
  layout,
  rootId,
  diff = null,
}: {
  layout: ResolvedLayout
  rootId: string
  diff?: DiffContext | null
}) {
  const root = assemblyById(rootId)
  if (!root) return null
  const clusterKids = childrenOf(rootId).filter((k) => k.lodLevel === 'cluster')

  return (
    <group>
      {clusterKids.map((kid) => {
        if (kid.roleKey === 'rack-row') {
          const rowItem = layout.get(kid.id)
          const rack = childrenOf(kid.id).find((r) => r.roleKey === 'rack')
          return (
            <group key={kid.id} position={rowItem?.slots[0] ?? [0, 0, 0]}>
              {rack ? (
                diff ? (
                  <StaticRackInstances node={rack} layout={layout} diff={diff} />
                ) : (
                  <RackInstances node={rack} layout={layout} />
                )
              ) : null}
            </group>
          )
        }
        return (
          <AssemblyBranch
            key={kid.id}
            node={kid}
            layout={layout}
            depth="cluster"
            exploded={false}
            diff={diff}
          />
        )
      })}
    </group>
  )
}

// ─────────────────────────── 机架级 ───────────────────────────

/** 邻架 ghost：共享同一份材质与几何，`raycast=null`，只提供空间参照。 */
function GhostRacks({ layout, rackId, focusIndex }: { layout: ResolvedLayout; rackId: string; focusIndex: number }) {
  const item = layout.get(rackId)
  if (!item) return null
  const others = item.slots.map((p, i) => ({ p, i })).filter(({ i }) => i !== focusIndex)
  if (others.length === 0) return null
  return (
    <Instances limit={others.length} range={others.length} frustumCulled={false}>
      <boxGeometry args={[item.size[0], item.size[1], item.size[2]]} />
      {/* ghost 不设 per-instance color，材质色直接生效 */}
      <meshStandardMaterial
        color={SURFACE.ghost}
        transparent
        opacity={HIGHLIGHT.ghostOpacity}
        depthWrite={false}
        roughness={1}
        metalness={0}
      />
      {others.map(({ p, i }) => (
        <Instance key={i} position={p} raycast={() => null} />
      ))}
    </Instances>
  )
}

function RackScene({
  layout,
  rackId,
  depth,
  diff = null,
}: {
  layout: ResolvedLayout
  rackId: string
  depth: LodLevel
  diff?: DiffContext | null
}) {
  const rack = assemblyById(rackId)
  const chain = useMemo(() => chainOf(rackId), [rackId])
  if (!rack) return null
  const parentOrigin = worldPositionOf(layout, chain.slice(0, -1))

  return (
    <group position={parentOrigin}>
      <GhostRacks layout={layout} rackId={rackId} focusIndex={0} />
      <AssemblyBranch
        node={rack}
        layout={layout}
        depth={depth}
        exploded={false}
        asShell
        onlyInstance={0}
        diff={diff}
      />
    </group>
  )
}

// ─────────────────────────── 托盘 / 板级 ───────────────────────────

function TrayScene({
  layout,
  trayId,
  exploded,
  depth,
  diff = null,
}: {
  layout: ResolvedLayout
  trayId: string
  exploded: boolean
  depth: LodLevel
  diff?: DiffContext | null
}) {
  const tray = assemblyById(trayId)
  const chain = useMemo(() => chainOf(trayId), [trayId])
  if (!tray) return null
  const parentChain = chain.slice(0, -1)
  const parentOrigin = worldPositionOf(layout, parentChain)
  const rackId = parentChain[parentChain.length - 1]
  const rackItem = rackId ? layout.get(rackId) : undefined

  return (
    <group position={parentOrigin}>
      {/* 机架外壳保留成极淡的参照物，让人知道「这块板在机架的什么高度」。
          不画描边：板级视野里那几条贯穿全屏的粗线比参照价值更碍事。 */}
      {rackItem ? (
        <ShapeMesh
          shape="rack-frame"
          size={rackItem.size}
          color={SURFACE.ghost}
          opacity={0.05}
          edges={false}
          depthWrite={false}
          roughness={1}
          metalness={0}
          raycast={() => null}
        />
      ) : null}
      <AssemblyBranch
        node={tray}
        layout={layout}
        depth={depth}
        exploded={exploded}
        asShell
        onlyInstance={0}
        diff={diff}
      />
    </group>
  )
}

// ─────────────────────────── 地面 ───────────────────────────

function GroundGrid({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Grid
      position={[0, 0.002, 0]}
      args={[40, 24]}
      cellSize={0.9}
      cellThickness={0.6}
      cellColor={SURFACE.ground}
      sectionSize={4.5}
      sectionThickness={1}
      sectionColor={SURFACE.edge}
      fadeDistance={70}
      fadeStrength={1.2}
      infiniteGrid
      raycast={() => null}
    />
  )
}

// ─────────────────────────── 根 ───────────────────────────

export interface SceneRootProps {
  /** 省略则用 store 的当前代际（探索模式）。比较模式下两个视口各传一个。 */
  systemId?: string
  /** 省略则用 store 的当前层级。 */
  level?: LodLevel
  /** 省略则用 store 的当前 focusPath；比较模式的右视口按 roleKey 换算出等价路径。 */
  focusPath?: readonly string[]
  /** 传入则进入「比较渲染」：静态部件 + diff 描边，且不挂数据流层。 */
  diff?: DiffContext | null
  /** 只画这几个平面（比较模式收窄到 nvlink + scaleout 降噪）；省略则用 store 的平面开关。 */
  planeFilter?: readonly NetworkPlane[]
  /** 地面网格（比较模式的两个小视口里网格纯属噪音）。 */
  showGround?: boolean
}

export default function SceneRoot({
  systemId,
  level: levelProp,
  focusPath: focusPathProp,
  diff = null,
  planeFilter,
  showGround = true,
}: SceneRootProps = {}) {
  const storeGeneration = useFactoryStore((s) => s.generation)
  const storeLevel = useFactoryStore((s) => s.level)
  const storeFocusPath = useFactoryStore((s) => s.focusPath)

  const generation = systemId ?? storeGeneration
  const level = levelProp ?? storeLevel
  const focusPath = focusPathProp ?? storeFocusPath

  const layout = useMemo(() => layoutOf(generation), [generation])
  const anchor = useMemo(
    () => sceneAnchorOf({ level, focusPath: [...focusPath], selectedId: null }),
    [level, focusPath],
  )
  const rootId = focusPath[0]
  const depth = RENDER_DEPTH[level]

  return (
    <>
      <GroundGrid visible={showGround && anchor.kind === 'cluster'} />
      {anchor.kind === 'cluster' && rootId ? (
        <ClusterScene layout={layout} rootId={rootId} diff={diff} />
      ) : null}
      {anchor.kind === 'rack' ? (
        <RackScene layout={layout} rackId={anchor.rackAssemblyId} depth={depth} diff={diff} />
      ) : null}
      {anchor.kind === 'tray' ? (
        <TrayScene
          layout={layout}
          trayId={anchor.trayAssemblyId}
          exploded={anchor.exploded}
          depth={depth}
          diff={diff}
        />
      ) : null}
      {/* 六平面连线 + 推理数据流粒子：挂在 SceneRoot 顶层（不嵌进任何一级子场景的 group），
          全部用 worldPositionOf 直接出世界坐标最省事，也不必跟着 Cluster/Rack/Tray 三选一
          的挂载/卸载重新走一遍坐标换算。 */}
      <ConnectionLayer systemId={generation} layout={layout} depth={depth} planeFilter={planeFilter} />
      {/* ★ 比较模式绝不挂 FlowLayer：它在 useFrame 里 getState() 推进 stepIdx，
          挂两个会让步骤条以双倍速度跳。数据流是探索模式的功能。 */}
      {diff === null ? <FlowLayer systemId={generation} layout={layout} depth={depth} /> : null}
    </>
  )
}

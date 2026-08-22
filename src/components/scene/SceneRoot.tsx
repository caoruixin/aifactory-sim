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

import { Grid, Instance, Instances } from '@react-three/drei'
import { invalidate } from '@react-three/fiber'
import { useCallback, useMemo, useState } from 'react'
import { ancestorsOf, assemblyById, childrenOf, componentById } from '../../data'
import type { AssemblyNode, LodLevel } from '../../data/types'
import { levelIndex, sceneAnchorOf } from '../../lib/drill'
import { layoutOf, worldPositionOf } from '../../lib/layout'
import type { ResolvedLayout } from '../../lib/layout'
import { HIGHLIGHT, SURFACE, palette } from '../../lib/palette'
import { useFactoryStore } from '../../store'
import { ShapeMesh, ShellMesh } from './GenericShapes'
import { Hotspot } from './Hotspot'

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
}

function AssemblyBranch({ node, layout, depth, exploded, asShell = false, onlyInstance }: BranchProps) {
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
  const base = SURFACE.rack

  return (
    <Instances limit={item.slots.length} range={item.slots.length} frustumCulled={false}>
      <boxGeometry args={[item.size[0], item.size[1], item.size[2]]} />
      {/* ⚠️ InstancedMesh 的 per-instance color 是**乘**在材质色上的，
          所以材质必须留白，否则 base × base 会把机架压成一块黑。 */}
      <meshStandardMaterial color="#ffffff" roughness={0.55} metalness={0.2} />
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

function ClusterScene({ layout, rootId }: { layout: ResolvedLayout; rootId: string }) {
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
              {rack ? <RackInstances node={rack} layout={layout} /> : null}
            </group>
          )
        }
        return (
          <AssemblyBranch key={kid.id} node={kid} layout={layout} depth="cluster" exploded={false} />
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
}: {
  layout: ResolvedLayout
  rackId: string
  depth: LodLevel
}) {
  const rack = assemblyById(rackId)
  const chain = useMemo(() => chainOf(rackId), [rackId])
  if (!rack) return null
  const parentOrigin = worldPositionOf(layout, chain.slice(0, -1))

  return (
    <group position={parentOrigin}>
      <GhostRacks layout={layout} rackId={rackId} focusIndex={0} />
      <AssemblyBranch node={rack} layout={layout} depth={depth} exploded={false} asShell onlyInstance={0} />
    </group>
  )
}

// ─────────────────────────── 托盘 / 板级 ───────────────────────────

function TrayScene({
  layout,
  trayId,
  exploded,
  depth,
}: {
  layout: ResolvedLayout
  trayId: string
  exploded: boolean
  depth: LodLevel
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

export default function SceneRoot() {
  const generation = useFactoryStore((s) => s.generation)
  const level = useFactoryStore((s) => s.level)
  const focusPath = useFactoryStore((s) => s.focusPath)

  const layout = useMemo(() => layoutOf(generation), [generation])
  const anchor = useMemo(
    () => sceneAnchorOf({ level, focusPath, selectedId: null }),
    [level, focusPath],
  )
  const rootId = focusPath[0]
  const depth = RENDER_DEPTH[level]

  return (
    <>
      <GroundGrid visible={anchor.kind === 'cluster'} />
      {anchor.kind === 'cluster' && rootId ? (
        <ClusterScene layout={layout} rootId={rootId} />
      ) : null}
      {anchor.kind === 'rack' ? (
        <RackScene layout={layout} rackId={anchor.rackAssemblyId} depth={depth} />
      ) : null}
      {anchor.kind === 'tray' ? (
        <TrayScene
          layout={layout}
          trayId={anchor.trayAssemblyId}
          exploded={anchor.exploded}
          depth={depth}
        />
      ) : null}
    </>
  )
}

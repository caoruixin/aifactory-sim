/**
 * 数据流播放：单个 `InstancedMesh` 粒子沿当前步骤的路径移动。
 *
 * - `useFrame` 里推进「当前步骤已播放的秒数」，超过该步骤 `durationHint`（教学节奏，
 *   非真实时延）就跨段——循环播放到下一步，粗粒度回写 `store.setFlow({ stepIdx })`，
 *   `FlowBar` 的步骤条与 `ConnectionLayer` 的当前步高亮都读这个字段；
 * - `reducedMotion` 时依然按同样节奏推进 `stepIdx`（“播放”变成“离散步进”），
 *   但不渲染粒子——当前步骤连接的静态高亮已经由 `ConnectionLayer` 负责，两者不重复；
 * - `logicalOnly` 步骤、或当前深度下查不到路径的步骤，粒子隐藏（缩放为 0），
 *   叙事交给 `FlowBar` 的文案主导；
 * - HBM 装配节点常亮一颗微光标记，与是否在播放无关——呼应「权重常驻显存，不随
 *   请求加载」这条核心心智模型；只在 tray/board 深度（已经能看见板级器件）显示，
 *   避免在集群/机架总览上漂浮一个没有上下文的光点。
 *
 * v1.2 F3 的三件事（几何/相位全部下沉到 `flowTimeline.ts` 的纯函数，这里只写矩阵）：
 * 1. **方向**：粒子按 `TimelineSegment.direction` 播放。「请求进入机架」这一步的连接
 *    是 DPU→汇聚交换机，但请求本身反着走，过去一律正向播放 = 把箭头画反了；
 *    prefill/decode 的底层边是 `all-to-all, bidirectional`，改成相向串珠如实表现
 *    双向 collective。
 * 2. **串珠**：三颗粒子过去共用同一个 frac，画面上完全重合成一颗；现在按
 *    `PARTICLE_TRAIL_OFFSET` 错开相位、按 `TRAIL_SCALE` 收小，读得出流动方向。
 * 3. **淡入淡出**：段首段尾各 0.3 s 渐变，切步不再是瞬移 + 凭空消失。
 *    ⚠️ 暂停时 alpha 恒为 1（粒子转成「停在哪」的静态标记），这是设计不是 bug。
 */

import { invalidate, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ancestorsOf, componentById, episodeOf, FACTORY_PACK } from '../../data'
import type { LodLevel } from '../../data/types'
import { levelIndex } from '../../lib/drill'
import { buildTimeline, fadeAlpha, segmentParticlePosition } from '../../lib/flowTimeline'
import type { TimelineSegment } from '../../lib/flowTimeline'
import { worldPositionOf } from '../../lib/layout'
import type { ResolvedLayout } from '../../lib/layout'
import { palette } from '../../lib/palette'
import { indexRoutesById, routeConnections, visibleAncestorAt } from '../../lib/routing'
import type { ContainmentOptions } from '../../lib/routing'
import { useFactoryStore } from '../../store'

/** 单个步骤最多同时画几颗粒子（大多数步骤只有 1 条主路径，留一点余量给多路径步骤）。 */
const MAX_PARTICLES = 3
const PARTICLE_RADIUS = 0.02

/**
 * 串珠的逐颗缩放：头珠满尺寸，后两颗依次收小当拖尾。
 * 三颗珠子过去共用同一个 frac，完全重合成一颗——「串珠」是白给的（v1.2 F3）。
 */
const TRAIL_SCALE = [1, 0.75, 0.55] as const

/**
 * 粒子半径按深度缩放。板级是基准（0.02 m ≈ 一颗 HBM 堆栈的尺度）；到了集群级，
 * 同一颗球在几十米的取景里只剩不到一个像素——「步骤在推进、画面上什么也没有」。
 * 几何体只有一个，靠 per-instance scale 放大，不额外占 draw call。
 */
const PARTICLE_SCALE: Record<LodLevel, number> = {
  cluster: 4,
  rack: 2.5,
  tray: 1,
  board: 1,
}

export interface FlowLayerProps {
  systemId: string
  layout: ResolvedLayout
  depth: LodLevel
  /** board 级拆解视图：粒子/beacon 必须落在 explode 后的坐标上（v1.1 B4）。 */
  exploded?: boolean
  /** 机架/托盘/板级：与 `ConnectionLayer` 用同一套出界线三分规则，粒子不跑出画面。 */
  containment?: ContainmentOptions | null
}

export default function FlowLayer({
  systemId,
  layout,
  depth,
  exploded = false,
  containment = null,
}: FlowLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  const progressRef = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const episodeIdx = useFactoryStore((s) => s.flow.episodeIdx)
  const stepIdx = useFactoryStore((s) => s.flow.stepIdx)

  // 剧本按代际取：只有 GB300 有剧本，切到其它代际时 segments 为空、粒子自然隐藏
  // （FlowBar 会在 DOM 侧解释「该代际暂无剧本」）。
  const episode = episodeOf(systemId, episodeIdx)

  // 与 ConnectionLayer 同一条规则：containment **整对象透传 + 整对象入依赖**，
  // 拆字段再重建会静默丢掉 margin（粒子与线必须用同一个包围盒，否则粒子会跑到线外面去）。
  const segments = useMemo<TimelineSegment[]>(() => {
    if (!episode) return []
    const routes = indexRoutesById(routeConnections(systemId, layout, depth, exploded, containment))
    return buildTimeline(episode, routes)
  }, [episode, systemId, layout, depth, exploded, containment])

  // 步骤被改变（无论是本组件自己跨段，还是 FlowBar 的上一步/下一步/点击跳转）都要
  // 从段内进度 0 重新起步，否则「点下一步」会从上一段进行到一半的进度接着播。
  useEffect(() => {
    progressRef.current = 0
    invalidate()
  }, [stepIdx, episodeIdx])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || segments.length === 0) return

    const state = useFactoryStore.getState()
    const idx = Math.min(Math.max(state.flow.stepIdx, 0), segments.length - 1)
    const seg = segments[idx]!
    const dur = Math.max(seg.durationHint, 0.05)

    if (state.flow.playing) {
      progressRef.current += delta * state.flow.speed
      if (progressRef.current >= dur) {
        progressRef.current -= dur
        state.setFlow({ stepIdx: (idx + 1) % segments.length })
      }
      invalidate()
    }

    const showParticles = !state.reducedMotion && !seg.logicalOnly && seg.paths.length > 0
    const headFrac = Math.min(progressRef.current / dur, 1)
    const particleScale = PARTICLE_SCALE[depth] ?? 1
    // 段首淡入 / 段尾淡出；暂停时恒为 1（粒子转成静态标记，见 fadeAlpha 注释）。
    const alpha = fadeAlpha(progressRef.current, dur, state.flow.playing)
    if (materialRef.current) materialRef.current.opacity = showParticles ? alpha : 0

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      // 方向 / 相位 / 采样全在 flowTimeline 的纯函数里，这里只负责把结果写进矩阵——
      // 于是 reverse / bidirectional 有真实段单测兜底，不依赖「渲染层有没有写对分支」。
      const p = showParticles ? segmentParticlePosition(seg, headFrac, i) : null
      if (p) {
        dummy.position.set(p[0], p[1], p[2])
        // 拖尾越靠后越小、并跟着 alpha 一起收——淡出时不会留下一排硬边的点。
        dummy.scale.setScalar(particleScale * (TRAIL_SCALE[i] ?? 1) * alpha)
      } else {
        dummy.position.set(0, -9999, 0) // 藏到视野外，双保险（scale 已经是 0）
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  const p = palette()

  // HBM 常亮微光：只在能看见板级器件的深度显示，且随内容包泛化——不写死 GB300 的具体 ID，
  // 而是找「这个系统里 kind === 'hbm' 的组件对应的装配节点」，B4 换代际也不用改这个组件。
  const hbmPositions = useMemo(() => {
    if (levelIndex(depth) < levelIndex('tray')) return []
    const hbmAssemblyIds = FACTORY_PACK.assemblies
      .filter((a) => a.systemId === systemId && componentById(a.componentId)?.kind === 'hbm')
      .map((a) => a.id)
    return hbmAssemblyIds.map((id) => {
      const visibleId = visibleAncestorAt(id, depth)
      const chain = ancestorsOf(visibleId).map((n) => n.id)
      // exploded 必须贯穿：board 级 HBM 是按 explode 偏移画的，用收拢坐标会让
      // 那颗「权重常驻显存」的微光飘在拆开后的堆栈之外（v1.1 B4）。
      return worldPositionOf(layout, chain, 0, exploded)
    })
  }, [systemId, layout, depth, exploded])

  return (
    <group name="flow-layer">
      {/* ★ `frustumCulled={false}` 不是性能开关，是**功能必需**（本项目所有 InstancedMesh 都这么写）：
          three 的 `InstancedMesh.boundingSphere` 从 `instanceMatrix` 算出来后就**永久缓存**，
          之后实例怎么动都不会重算。而粒子在「未播放 / 逻辑层步骤 / 当前深度查不到路径」时
          一律停在 (0, -9999, 0)——也就是它第一次被渲染时的位置。于是包围球被钉死在视锥外，
          `Frustum.intersectsObject` 从此恒为 false，**粒子永远不再出现**（哪怕把半径调到 0.25
          也一个像素都看不到，实测确认过）。
          ★ depthTest=false + renderOrder：粒子沿 ConnectionLayer 的折线跑，而那些线本身就是
          画在几何体之上的示意图层（见 ConnectionLayer 注释）。粒子要是被托盘挡住，
          就会出现「线在最上层、跑在线上的点却时隐时现」的割裂感。 */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, MAX_PARTICLES]}
        frustumCulled={false}
        renderOrder={3}
        raycast={() => null}
      >
        <sphereGeometry args={[PARTICLE_RADIUS, 12, 12]} />
        {/* ★ transparent 在**挂载期**就写死成 true，绝不在运行期翻转：
            运行期翻 transparent 必须重编着色器，否则 `#define OPAQUE` 会把 alpha 强行
            写回 1（见 GenericShapes.tsx 的 useTransparencyProgramSync 长注释）。
            这里每帧只改 opacity，属性改动不触发重编，也就不会踩那个坑。 */}
        <meshStandardMaterial
          ref={materialRef}
          color={p.accent}
          emissive={p.accent}
          emissiveIntensity={1.8}
          toneMapped={false}
          depthTest={false}
          transparent
          opacity={1}
        />
      </instancedMesh>

      {/* HBM 常亮微光同理：它埋在 GPU 封装内部，不当作覆盖层画就一定被遮住，
          而「权重常驻显存」这条心智模型恰恰要求它随时可见。 */}
      {hbmPositions.map((pos, i) => (
        <mesh key={i} position={pos} renderOrder={3} raycast={() => null}>
          <sphereGeometry args={[PARTICLE_RADIUS * 0.9, 8, 8]} />
          <meshStandardMaterial
            color={p['plane-nvlink']}
            emissive={p['plane-nvlink']}
            emissiveIntensity={0.85}
            transparent
            opacity={0.8}
            toneMapped={false}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  )
}

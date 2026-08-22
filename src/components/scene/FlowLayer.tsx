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
 */

import { invalidate, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ancestorsOf, componentById, FACTORY_PACK } from '../../data'
import type { LodLevel } from '../../data/types'
import { levelIndex } from '../../lib/drill'
import { buildTimeline } from '../../lib/flowTimeline'
import type { TimelineSegment } from '../../lib/flowTimeline'
import { worldPositionOf } from '../../lib/layout'
import type { ResolvedLayout } from '../../lib/layout'
import { palette } from '../../lib/palette'
import { indexRoutesById, routeConnections, sampleAtFraction, visibleAncestorAt } from '../../lib/routing'
import { useFactoryStore } from '../../store'

/** 单个步骤最多同时画几颗粒子（大多数步骤只有 1 条主路径，留一点余量给多路径步骤）。 */
const MAX_PARTICLES = 3
const PARTICLE_RADIUS = 0.02

export interface FlowLayerProps {
  systemId: string
  layout: ResolvedLayout
  depth: LodLevel
}

export default function FlowLayer({ systemId, layout, depth }: FlowLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const progressRef = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const episodeIdx = useFactoryStore((s) => s.flow.episodeIdx)
  const stepIdx = useFactoryStore((s) => s.flow.stepIdx)

  const episode = FACTORY_PACK.flows[episodeIdx]

  const segments = useMemo<TimelineSegment[]>(() => {
    if (!episode) return []
    const routes = indexRoutesById(routeConnections(systemId, layout, depth))
    return buildTimeline(episode, routes)
  }, [episode, systemId, layout, depth])

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
    const frac = Math.min(progressRef.current / dur, 1)

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const path = showParticles ? seg.paths[i % seg.paths.length] : undefined
      if (path) {
        const p = sampleAtFraction(path.points, path.lengths, frac)
        dummy.position.set(p[0], p[1], p[2])
        dummy.scale.setScalar(1)
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
      return worldPositionOf(layout, chain, 0, false)
    })
  }, [systemId, layout, depth])

  return (
    <group name="flow-layer">
      <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]} raycast={() => null}>
        <sphereGeometry args={[PARTICLE_RADIUS, 12, 12]} />
        <meshStandardMaterial
          color={p.accent}
          emissive={p.accent}
          emissiveIntensity={1.8}
          toneMapped={false}
        />
      </instancedMesh>

      {hbmPositions.map((pos, i) => (
        <mesh key={i} position={pos} raycast={() => null}>
          <sphereGeometry args={[PARTICLE_RADIUS * 0.9, 8, 8]} />
          <meshStandardMaterial
            color={p['plane-nvlink']}
            emissive={p['plane-nvlink']}
            emissiveIntensity={0.85}
            transparent
            opacity={0.8}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

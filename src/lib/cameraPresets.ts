/**
 * 每级 LOD 的相机预设（纯数学，零 three 导入）。
 *
 * 产出的是 `CameraControls.setLookAt(...)` 需要的六个数 + 距离 clamp，
 * 3D 侧只负责把它们喂给控制器，不做任何取景计算——这样「取景对不对」可以在
 * node 环境里断言（距离 ≥ fit 距离、逐级收紧、确定性）。
 */

import { FACTORY_PACK } from '../data'
import type { FactoryContentPack, LodLevel } from '../data/types'
import { levelOfFocus, rackContainerOf, trayContainerOf } from './drill'
import type { ResolvedLayout, Vec3 } from './layout'
import { worldPositionOf } from './layout'

export const CAMERA_FOV = 45
export const DEFAULT_ASPECT = 16 / 9

export interface CameraPreset {
  position: Vec3
  target: Vec3
  minDistance: number
  maxDistance: number
  /** 刚好把包围盒装满视野所需的距离；`position` 到 `target` 的距离恒 ≥ 它。 */
  fitDistance: number
}

/** 每级的机位方位角（绕 Y 轴，自 +Z 起算）与仰角，单位度。 */
export const LEVEL_ANGLES: Record<LodLevel, { azimuthDeg: number; elevationDeg: number; margin: number }> = {
  cluster: { azimuthDeg: 38, elevationDeg: 26, margin: 1.35 },
  rack: { azimuthDeg: 30, elevationDeg: 12, margin: 1.5 },
  tray: { azimuthDeg: 34, elevationDeg: 40, margin: 1.3 },
  board: { azimuthDeg: 26, elevationDeg: 46, margin: 1.45 },
}

const DEG = Math.PI / 180

/**
 * 把包围盒装进视野所需的最小距离（用包围球，避免旋转到某个角度时露馅）。
 * 竖直视场角比水平的小（aspect > 1），所以竖直方向是约束项。
 */
export function fitDistance(
  extent: Vec3,
  fovDeg: number = CAMERA_FOV,
  aspect: number = DEFAULT_ASPECT,
  margin = 1.3,
): number {
  const radius = 0.5 * Math.hypot(extent[0], extent[1], extent[2])
  const vFov = fovDeg * DEG
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.2))
  const d = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2))
  return d * margin
}

export interface FitBox {
  center: Vec3
  extent: Vec3
}

/**
 * 该级该焦点应该「装进画面」的盒子。
 *
 * - cluster：整排机架（再放宽一点，把 CDU / 交换层带进画面），而不是整个机房地面；
 * - rack：单个机架外形；
 * - tray：单个托盘外形；
 * - board：焦点板级件的**单个实例**（放大 4 倍留上下文，刚好带上它周围的 HBM/邻居）；
 *   焦点不是板级件时退回整托盘的 explode 包络。
 */
export function fitBoxFor(
  level: LodLevel,
  focusPath: readonly string[],
  layout: ResolvedLayout,
  pack: FactoryContentPack = FACTORY_PACK,
): FitBox {
  const focusId = focusPath[focusPath.length - 1]

  if (level === 'cluster' || !focusId) {
    const rack = pack.assemblies.find((a) => a.roleKey === 'rack')
    const item = rack ? layout.get(rack.id) : undefined
    if (rack && item) {
      const parentChain = chainTo(rack.id, pack).slice(0, -1)
      const base = worldPositionOf(layout, parentChain)
      return {
        center: [base[0] + item.pos[0], base[1] + item.pos[1], base[2] + item.pos[2]],
        extent: [item.extent[0] * 1.45, item.extent[1] * 1.6, item.extent[2] * 3.2],
      }
    }
    return { center: [0, 1, 0], extent: [12, 3, 8] }
  }

  if (level === 'rack') {
    const rackId = rackContainerOf(focusId, pack) ?? focusId
    const item = layout.get(rackId)
    const center = worldPositionOf(layout, chainTo(rackId, pack))
    return { center, extent: item ? item.size : [1, 2, 1] }
  }

  const trayId = trayContainerOf(focusId, pack) ?? focusId
  const trayItem = layout.get(trayId)
  const trayCenter = worldPositionOf(layout, chainTo(trayId, pack), 0, level === 'board')

  if (level === 'tray') {
    return { center: trayCenter, extent: trayItem ? trayItem.size : [0.6, 0.05, 1.1] }
  }

  // board：优先框住焦点件本身
  if (levelOfFocus(focusId, pack) === 'board') {
    const item = layout.get(focusId)
    if (item) {
      const center = worldPositionOf(layout, chainTo(focusId, pack), 0, true)
      // 单实例尺寸 × 4：框住这一件 + 它周边（例如 GPU 两侧的 HBM 堆栈），
      // 而不是把它的全部 count 个兄弟实例都塞进画面（那会比整个托盘还大）。
      return {
        center,
        extent: [
          Math.max(item.size[0], 0.02) * 4,
          Math.max(item.size[1], 0.012) * 4,
          Math.max(item.size[2], 0.02) * 4,
        ],
      }
    }
  }
  const s = trayItem ? trayItem.size : [0.6, 0.05, 1.1]
  // explode 后托盘在 Y 方向展开到约 0.35 m（冷板抬升 0.17 + 各层）
  return { center: trayCenter, extent: [s[0] * 1.3, 0.36, s[2] * 1.15] }
}

function chainTo(assemblyId: string, pack: FactoryContentPack): string[] {
  const byId = new Map(pack.assemblies.map((a) => [a.id, a]))
  const out: string[] = []
  const seen = new Set<string>()
  let cur = byId.get(assemblyId)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur.id)
    cur = cur.parentId === null ? undefined : byId.get(cur.parentId)
  }
  return out
}

export function cameraPresetFor(
  level: LodLevel,
  focusPath: readonly string[],
  layout: ResolvedLayout,
  opts: { aspect?: number; pack?: FactoryContentPack } = {},
): CameraPreset {
  const pack = opts.pack ?? FACTORY_PACK
  const aspect = opts.aspect ?? DEFAULT_ASPECT
  const angles = LEVEL_ANGLES[level]
  const box = fitBoxFor(level, focusPath, layout, pack)
  const d = fitDistance(box.extent, CAMERA_FOV, aspect, angles.margin)

  const az = angles.azimuthDeg * DEG
  const el = angles.elevationDeg * DEG
  const position: Vec3 = [
    box.center[0] + d * Math.sin(az) * Math.cos(el),
    box.center[1] + d * Math.sin(el),
    box.center[2] + d * Math.cos(az) * Math.cos(el),
  ]

  return {
    position,
    target: box.center,
    minDistance: Math.max(d * 0.2, 0.02),
    maxDistance: d * 5,
    fitDistance: d,
  }
}

/** 相机与目标的距离，测试与 clamp 用。 */
export function distanceOf(preset: CameraPreset): number {
  return Math.hypot(
    preset.position[0] - preset.target[0],
    preset.position[1] - preset.target[1],
    preset.position[2] - preset.target[2],
  )
}

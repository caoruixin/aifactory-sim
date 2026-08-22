/**
 * `VisualShape` → 程序化几何体。
 *
 * 设计约束
 * - **3D 只认外形，不认型号**：新增一个 GPU/交换机型号只要在内容包里选一个已有 shape，
 *   这里一行都不用改。
 * - **示意风而非 CAD**：一律 BoxGeometry（管路用 Cylinder）+ `<Edges>` 描边，
 *   单环境光 + 单平行光，无阴影、无后处理。目标是「看得懂结构」而不是「看起来像渲染图」。
 * - **几何体模块级共享**：全场只有一个单位立方体和一个单位圆柱，靠 `scale` 变形。
 *   模块级常量天然对 StrictMode 双挂载幂等（不会重复 new，也不会被卸载时 dispose 掉），
 *   材质则交给 R3F 随 mesh 生命周期管理。
 * - **实例数阈值**：当前最重的一屏是 rack 级（约 40 个 mesh）与 board 级（约 30 个）。
 *   只有在单一形状的实例数超过 ~5000 时才值得换成手写 InstancedMesh + 属性缓冲；
 *   在那之前，drei `<Instances>`（集群级 8 机架）与普通 mesh 已经足够。
 */

import { Edges } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { HardwareComponent, VisualShape } from '../../data/types'
import type { Vec3 } from '../../lib/layout'
import { SURFACE, color as paletteColor } from '../../lib/palette'

// ─────────────────────────── 共享几何体 ───────────────────────────

/** 单位立方体（边长 1，中心在原点）：所有箱体形状靠 scale 得到实际尺寸。 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
/** 单位圆柱（直径 1、高 1，轴向 +Y）：管路/母排用。 */
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1)

const CYLINDER_SHAPES: ReadonlySet<VisualShape> = new Set<VisualShape>(['pipe'])

export function geometryForShape(shape: VisualShape): THREE.BufferGeometry {
  return CYLINDER_SHAPES.has(shape) ? UNIT_CYLINDER : UNIT_BOX
}

/**
 * 圆柱的轴向固定是 +Y，但管路不一定竖着走（机架歧管竖向、机房一次侧水管沿 Z 横向）。
 * 这里按 `size` 的最长边把圆柱转到对应轴上，并相应交换 scale 分量，
 * 否则横向水管会被压成一个扁圆盘。
 */
function cylinderOrientation(size: Vec3): { rotation: Vec3; scale: Vec3 } {
  const [x, y, z] = size
  if (z >= y && z >= x) return { rotation: [Math.PI / 2, 0, 0], scale: [x, z, y] }
  if (x >= y && x >= z) return { rotation: [0, 0, Math.PI / 2], scale: [y, x, z] }
  return { rotation: [0, 0, 0], scale: size }
}

// ─────────────────────────── 形状 → 默认色 ───────────────────────────

/**
 * 组件没有指定 `visual.colorToken` 时的兜底色。
 * 值全部来自 `lib/palette.ts`（3D 专用中性色阶），不在这里硬编码 hex。
 */
const SHAPE_SURFACE: Record<VisualShape, keyof typeof SURFACE> = {
  'facility-floor': 'ground',
  'rack-row': 'rack',
  'rack-frame': 'rack',
  'tray-slab': 'trayShell',
  board: 'board',
  chip: 'chip',
  'chip-stack': 'metal',
  'switch-box': 'dark',
  'nic-card': 'board',
  'ssd-stick': 'metal',
  'psu-brick': 'dark',
  busbar: 'metal',
  backplane: 'board',
  pipe: 'metal',
  'cold-plate': 'metal',
  'cdu-cabinet': 'rack',
  'storage-array': 'dark',
}

/** 组件的显示色：优先用内容包声明的 palette token，否则按外形取中性色。 */
export function colorForComponent(component: HardwareComponent | undefined): string {
  if (!component) return SURFACE.metal
  const token = component.visual.colorToken
  if (token) return paletteColor(token, 'accent')
  return SURFACE[SHAPE_SURFACE[component.visual.shape] ?? 'metal']
}

/**
 * 「盖子类」部件的默认半透明度。
 *
 * 冷板是压在芯片顶上的实心金属板——照实渲染的话，托盘一打开只能看到一块板，
 * 底下的 GPU/CPU/NVSwitch 全被挡住，教学价值归零。做成半透明既保留了
 * 「它在最上层」的正确空间关系，又能看穿到下面的器件。背板同理。
 */
const SHAPE_OPACITY: Partial<Record<VisualShape, number>> = {
  'cold-plate': 0.42,
  backplane: 0.6,
}

export function opacityForComponent(component: HardwareComponent | undefined): number {
  if (!component) return 1
  return SHAPE_OPACITY[component.visual.shape] ?? 1
}

// ─────────────────────────── ShapeMesh ───────────────────────────

export interface ShapeMeshProps extends Omit<ThreeElements['mesh'], 'scale' | 'geometry' | 'ref'> {
  shape: VisualShape
  size: Vec3
  color: string
  /** 自发光色（高亮用）；不传则不发光。 */
  emissive?: string | null
  emissiveIntensity?: number
  opacity?: number
  wireframe?: boolean
  /** 描边。示意风的关键：没有描边的白盒子在浅色背景里几乎看不出边界。 */
  edges?: boolean
  edgeColor?: string
  roughness?: number
  metalness?: number
  /** 半透明外壳（机架/托盘的「玻璃罩」）需要关掉深度写入，否则内部件会被裁掉。 */
  depthWrite?: boolean
}

export function ShapeMesh({
  shape,
  size,
  color,
  emissive = null,
  emissiveIntensity = 0,
  opacity = 1,
  wireframe = false,
  edges = true,
  edgeColor,
  roughness = 0.58,
  metalness = 0.16,
  depthWrite,
  children,
  ...meshProps
}: ShapeMeshProps) {
  const geometry = geometryForShape(shape)
  const { scale, rotation } = useMemo(() => {
    const safe: Vec3 = [Math.max(size[0], 1e-4), Math.max(size[1], 1e-4), Math.max(size[2], 1e-4)]
    if (!CYLINDER_SHAPES.has(shape)) return { scale: safe, rotation: [0, 0, 0] as Vec3 }
    const o = cylinderOrientation(safe)
    return { scale: o.scale, rotation: o.rotation }
  }, [size, shape])
  const transparent = opacity < 1

  return (
    <mesh
      {...meshProps}
      geometry={geometry}
      scale={scale}
      rotation={rotation}
      castShadow={false}
      receiveShadow={false}
    >
      <meshStandardMaterial
        color={color}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? emissiveIntensity : 0}
        roughness={roughness}
        metalness={metalness}
        wireframe={wireframe}
        transparent={transparent}
        opacity={opacity}
        depthWrite={depthWrite ?? !transparent}
      />
      {edges ? <Edges color={edgeColor ?? SURFACE.edge} threshold={20} /> : null}
      {children}
    </mesh>
  )
}

/**
 * 「玻璃罩」外壳：正在被钻入的容器（机架/托盘）用它渲染。
 * 关键是 `raycast={null}`——否则外壳会挡在内部件前面，点不到里面的芯片。
 */
export function ShellMesh(props: Omit<ShapeMeshProps, 'opacity' | 'raycast'>) {
  return (
    <ShapeMesh
      {...props}
      opacity={0.07}
      depthWrite={false}
      roughness={0.9}
      metalness={0}
      raycast={() => null}
    />
  )
}

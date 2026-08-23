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
import { invalidate, useFrame, type ThreeElements } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { HardwareComponent, VisualShape } from '../../data/types'
import type { Vec3 } from '../../lib/layout'
import { STATUS_MATERIALS, SURFACE, color as paletteColor, mixHex } from '../../lib/palette'

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

// ─────────────────────────── 产品状态 → 材质 ───────────────────────────

export interface SurfaceStyle {
  color: string
  opacity: number
  wireframe: boolean
  roughness: number
  metalness: number
}

/**
 * 部件的最终材质：本色（palette token 或外形默认色）叠上**产品状态**的语义色调。
 *
 * 这是三代同屏时最重要的一条视觉约定：
 *   shipping  = 实体原色（GB300：这是能买到的东西）
 *   announced = 蓝调实体（Vera Rubin：已发布但还没到你机房）
 *   forecast  = 琥珀线框（Rubin Ultra：连规格都还是分析师推的）
 * 用户不用看徽章，光凭材质就知道「这一屏的东西有多实」。
 */
export function surfaceStyleFor(component: HardwareComponent | undefined): SurfaceStyle {
  const base = colorForComponent(component)
  const status = component?.status ?? 'shipping'
  const mat = STATUS_MATERIALS[status]
  const tint = mat.tintToken ? paletteColor(mat.tintToken, 'dim') : null
  return {
    color: tint ? mixHex(base, tint, mat.tintAmount) : base,
    // 组件自己声明的 wireframe 优先，其次看状态
    wireframe: component?.visual.wireframe === true || mat.wireframe,
    opacity: opacityForComponent(component) * mat.opacity,
    roughness: mat.roughness,
    metalness: mat.metalness,
  }
}

// ─────────────────────── 运行期翻转透明度的必要仪式 ───────────────────────

/**
 * **运行期把 `transparent` 从 false 翻成 true（或反过来）必须显式 `needsUpdate`。**
 *
 * three 把「这个材质是不是不透明」编进了**着色器 define**，不只是渲染状态：
 *   `WebGLPrograms.getParameters()`：
 *     `opaque: material.transparent === false && blending === NormalBlending && !alphaToCoverage`
 *   → `parameters.opaque ? '#define OPAQUE' : ''`
 *   → `opaque_fragment` 里 `#ifdef OPAQUE  diffuseColor.a = 1.0;  #endif`
 * 而程序**只在 `material.version` 变化时才重编**（`needsUpdate` 的 setter 负责自增）。
 *
 * 于是只改 `material.transparent`/`opacity` 属性会得到一个自相矛盾的状态：
 * 混合确实被打开了（`WebGLState.setMaterial` 每帧现读 `material.transparent`），
 * 但片元着色器仍然把 alpha 强行写成 1.0 —— **src alpha=1 的混合等价于不混合**，
 * 画面逐位不变。这正是 B5 记录、当时误判成 drei `<View>` scissor 路径的那个
 * 「材质明明是 0.12/true、像素却和不透明时一模一样，连 ghostOpacity 改成 0 都没反应」：
 * 与 `<View>` 毫无关系，任何在运行期翻转 `transparent` 的材质都会中招。
 *
 * `<Edges>` 之所以「看起来生效了」，是因为它是被 React 整个卸载掉的组件，
 * 走的根本不是材质属性这条路——两者的表现差异正是这个根因的指纹。
 */
export function useTransparencyProgramSync(
  ref: React.RefObject<THREE.Material | null>,
  transparent: boolean,
): void {
  useLayoutEffect(() => {
    const material = ref.current
    if (!material) return
    material.needsUpdate = true
    // frameloop 是 demand：重编了也要有人请求一帧才画得出来。
    invalidate()
  }, [ref, transparent])
}

// ─────────────────────── 自发光脉冲（v1.2 F2） ───────────────────────

/**
 * 脉冲周期（秒）。E2E 的采样间隔按它推：半周期 0.7 s 时两次采样必然处在相反相位。
 * 1.4 s 是「看得出在呼吸、又不至于闪得烦人」的教学节奏。
 */
export const PULSE_PERIOD_SEC = 1.4

/**
 * 给已有的静态 emissive 高亮加一层缓慢呼吸，用来表达「本地物理动作」
 * （kv-write 那一步：18 个计算托盘已经在发光，但读不出「此刻正在写」）。
 *
 * ★ **复位必须放 effect，不能放 useFrame 的 else 分支。**
 *   `FactoryCanvas` 的 frameloop 是 `playing ? 'always' : 'demand'`：一暂停就切回
 *   demand，useFrame 可能**永远不再执行**，材质会永久冻结在按下暂停那一刻的脉冲值上
 *   （屏幕上表现为「暂停后这些托盘莫名其妙比平时暗/亮」）。effect 在 enabled 翻转时
 *   必然重跑，把 emissiveIntensity 写回 base 并请求一帧。
 *
 * ★ 常驻挂载、靠 `enabled` 切换，而不是按需挂载/卸载：卸载时机同样在 demand 下不可靠。
 *   相位从 enabled 置位那一刻起累加，因此每次开始播放的起始相位是确定的（E2E 可复现）。
 */
function EmissivePulseDriver({
  materialRef,
  base,
  enabled,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>
  base: number
  enabled: boolean
}) {
  const phaseRef = useRef(0)

  useEffect(() => {
    phaseRef.current = 0
    const m = materialRef.current
    if (m) m.emissiveIntensity = base
    invalidate()
  }, [materialRef, enabled, base])

  useFrame((_, delta) => {
    if (!enabled) return
    const m = materialRef.current
    if (!m) return
    phaseRef.current += delta
    m.emissiveIntensity = base * (0.7 + 0.5 * Math.sin((phaseRef.current * Math.PI * 2) / PULSE_PERIOD_SEC))
  })

  return null
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
  /**
   * 自发光脉冲开关（v1.2 F2）。**不传 = 完全不挂 driver**（DiffMesh / ShellMesh /
   * 托盘参照物走的就是这条路，比较模式零影响）；传了就常驻挂载，靠布尔值切换。
   */
  emissivePulse?: boolean
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
  emissivePulse,
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
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  useTransparencyProgramSync(materialRef, transparent)

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
        ref={materialRef}
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
      {/* base 与上面材质的 emissiveIntensity 表达式同源，避免 React 与 driver 抢着写。 */}
      {emissivePulse === undefined ? null : (
        <EmissivePulseDriver
          materialRef={materialRef}
          base={emissive ? emissiveIntensity : 0}
          enabled={emissivePulse}
        />
      )}
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

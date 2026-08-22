/**
 * 比较模式的中央视图：**单个 `<Canvas>` + drei `<View>` 双视口**（同一个 WebGL 上下文）。
 *
 * 为什么不是两个 Canvas：两个 Canvas = 两个 WebGL 上下文 + 两套资源，浏览器的上下文数量
 * 有硬上限，而且左右两边的相机同步会变成跨上下文的手工活。drei 的 `View` 用 scissor 在
 * 一张画布上切两块，天然共享 three 资源。
 *
 * 相机同步的实现比计划里更省事：drei `View` 的 `Container` 用的是**根 state 的相机**
 * （见 drei/web/View.js 里的 `state.gl.render(scene, state.camera)`），
 * 两个视口没有各自的相机，因此天然共用同一个位姿——不需要 poseRef，也不会有一帧的滞后。
 * 挂在 Canvas 根上的 `CompareCameraRig` 操作的就是那一个相机。
 *
 * ⚠️ Plan B（如果哪天 View + demand 帧循环出问题）：
 *   把两个 `<View>` 换成手写的双 scissor 渲染——
 *   `useFrame((state) => { for (const vp of viewports) { gl.setViewport(...); gl.setScissor(...);
 *   gl.setScissorTest(true); gl.render(sceneOf(vp), camera) } }, 1)`，
 *   两个子场景各自 `createPortal` 到独立的 THREE.Scene。逻辑与 View 内部完全一致，
 *   只是我们自己掌控 rect 的取法与清屏时机。
 *
 * ⚠️ 已知限制（刻意接受）：drei 的 View 在挂载时会把事件层 `connected` 指到自己的
 *   tracked 元素，两个 View 同时存在时只有后挂的那个能收到指针事件。因此比较模式下
 *   **两侧都不挂 Hotspot**（见 SceneRoot 的 DiffContext 注释），点选统一走右栏 DOM 列表。
 */

import { CameraControls, View } from '@react-three/drei'
import { Canvas, invalidate, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ancestorsOf, assemblyById, rootAssemblyOf, systemById } from '../../data'
import type { LodLevel, NetworkPlane } from '../../data/types'
import { CAMERA_FOV, cameraPresetFor } from '../../lib/cameraPresets'
import { assembliesByRoleKey, compareSystems, diffIndexOf } from '../../lib/compare'
import { layoutOf } from '../../lib/layout'
import { useFactoryStore } from '../../store'
import { ErrorBoundary } from '../ErrorBoundary'
import SceneRoot from './SceneRoot'
import type { DiffContext } from './SceneRoot'

/** 比较视图只画这两个平面：其余四个在两个小视口里纯属噪音。 */
const COMPARE_PLANES: readonly NetworkPlane[] = ['nvlink', 'scaleout']

/**
 * 把左侧的焦点按 **roleKey** 换算到右侧系统的等价节点。
 * 这样「左边在看计算托盘」时右边也自动在看它的计算托盘，而不是各看各的。
 * 右侧没有同名 roleKey（例如左边在看 GB300 的本地缓存盘）时退回右侧的树根。
 */
function mirrorFocusPath(leftFocusId: string | undefined, rightSystemId: string): string[] {
  const fallback = rootAssemblyOf(rightSystemId)
  const fallbackPath = fallback ? [fallback.id] : []
  if (!leftFocusId) return fallbackPath
  const leftNode = assemblyById(leftFocusId)
  if (!leftNode) return fallbackPath
  const mirrored = assembliesByRoleKey(rightSystemId).get(leftNode.roleKey)
  if (!mirrored) return fallbackPath
  return ancestorsOf(mirrored.id).map((n) => n.id)
}

/**
 * 每个视口自带的灯光。
 *
 * ★ 必须放在 `<View>` 内部：drei 的 View 把 children портal 到一个**独立的虚拟 Scene**，
 * 渲染的是那个虚拟场景（`gl.render(state.scene /* = virtualScene *&#47;, state.camera)`）。
 * 挂在 Canvas 根上的灯光属于根 Scene，两个视口一盏都照不到——那样 MeshStandardMaterial
 * 会全黑。同理，背景色也不能用根 Scene 的 `<color attach="background">`：
 * 这里改成 canvas 透明 + 下层 DOM 铺底色（见容器上的 bg-ink）。
 */
function ViewLights() {
  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight position={[8, 14, 7]} intensity={1.3} />
      <directionalLight position={[-7, 6, -9]} intensity={0.32} />
    </>
  )
}

export default function ComparisonView() {
  // 回调 ref：CameraControls 需要拿到**真实的** DOM 元素（不是 ref 对象）来挂事件，
  // 而 ref.current 的变化不会触发重渲染，所以这里用 state。
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  const generation = useFactoryStore((s) => s.generation)
  const compare = useFactoryStore((s) => s.compare)
  const level = useFactoryStore((s) => s.level)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const setGlStatus = useFactoryStore((s) => s.setGlStatus)
  const setReady = useFactoryStore((s) => s.setReady)

  const leftSystem = systemById(generation)
  const rightSystem = systemById(compare.right)

  const result = useMemo(() => compareSystems(generation, compare.right), [generation, compare.right])
  const diffIdx = useMemo(() => diffIndexOf(result), [result])

  const leftDiff: DiffContext = { index: diffIdx.left, showDiffOnly: compare.showDiffOnly }
  const rightDiff: DiffContext = { index: diffIdx.right, showDiffOnly: compare.showDiffOnly }

  const rightFocusPath = useMemo(
    () => mirrorFocusPath(focusPath[focusPath.length - 1], compare.right),
    [focusPath, compare.right],
  )

  // 视口尺寸/内容变化后必须显式请求一帧：frameloop 是 demand。
  useEffect(() => {
    invalidate()
  }, [generation, compare.right, compare.showDiffOnly, level, focusPath])

  return (
    <div ref={setContainer} className="relative h-full w-full bg-ink" data-compare-view="1">
      {/* 两个被 View 追踪的 DOM 块：它们只是尺寸占位，真正的像素来自上面那张透明 canvas */}
      <div className="grid h-full w-full grid-cols-2 gap-px bg-line">
        <ViewportFrame
          ref={leftRef}
          title={leftSystem?.name ?? generation}
          status={leftSystem?.status ?? 'shipping'}
          side="左"
        />
        <ViewportFrame
          ref={rightRef}
          title={rightSystem?.name ?? compare.right}
          status={rightSystem?.status ?? 'forecast'}
          side="右"
        />
      </div>

      <ErrorBoundary
        onError={() => {
          setGlStatus('failed')
          setReady(true)
        }}
        fallback={null}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 1.5]}
          shadows={false}
          flat
          camera={{ fov: CAMERA_FOV, near: 0.01, far: 600, position: [7, 4.5, 10] }}
          // alpha: true —— 让 canvas 透明，底色交给下层 DOM。原因见 ViewLights 的注释：
          // View 渲染的是虚拟 Scene，根 Scene 的 background 不生效。
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          className="!absolute inset-0"
          // pointerEvents: none —— 比较模式没有 3D 拾取，指针事件全部留给下层 DOM
          // （CameraControls 显式挂在整个容器上，因此拖任意一半都能转视角）。
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          onCreated={() => setReady(true)}
        >
          <View track={leftRef as React.RefObject<HTMLElement>} index={1}>
            <ViewLights />
            <SceneRoot
              systemId={generation}
              level={level}
              focusPath={focusPath}
              diff={leftDiff}
              planeFilter={COMPARE_PLANES}
              showGround={false}
            />
          </View>
          <View track={rightRef as React.RefObject<HTMLElement>} index={2}>
            <ViewLights />
            <SceneRoot
              systemId={compare.right}
              level={level}
              focusPath={rightFocusPath}
              diff={rightDiff}
              planeFilter={COMPARE_PLANES}
              showGround={false}
            />
          </View>

          {/* 相机只有一个：两个视口共用同一位姿，拖一边等于拖两边 */}
          <CompareCameraRig
            systemId={generation}
            level={level}
            focusPath={focusPath}
            domElement={container}
          />
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}

/** 视口标题栏（DOM，不进 3D）。 */
const ViewportFrame = ({
  ref,
  title,
  status,
  side,
}: {
  ref: React.Ref<HTMLDivElement>
  title: string
  status: string
  side: string
}) => (
  <div className="relative min-w-0 bg-ink">
    <div ref={ref} className="h-full w-full" />
    <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md border border-line bg-panel/85 px-2 py-1">
      <span className="text-[11px] text-dim">{side}</span>
      <span className="max-w-[16rem] truncate text-xs font-medium">{title}</span>
      <span className="font-mono text-[10px] text-dim">{status}</span>
    </div>
  </div>
)

/**
 * 比较模式的相机：沿用 `cameraPresets.ts` 的同一套机位数学，但取景盒子按**左侧**系统算。
 * 两代的机架尺寸接近，同一机位在两个视口里的观感是一致的——这正是「可比」的前提。
 */
function CompareCameraRig({
  systemId,
  level,
  focusPath,
  domElement,
}: {
  systemId: string
  level: LodLevel
  focusPath: readonly string[]
  /** 挂事件的 DOM：整个比较容器。不指定的话 drei 会挂到 View 最后连上的那个 tracked 元素，
   *  结果只有右半边能拖动。 */
  domElement: HTMLElement | null
}) {
  const controls = useRef<CameraControls | null>(null)
  const invalidateFrame = useThree((s) => s.invalidate)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  useLayoutEffect(() => {
    const c = controls.current
    if (!c) return
    // 单个视口只占一半宽度，取景要按半宽的宽高比算，否则两边都会被裁掉
    const aspect = height > 0 ? width / 2 / height : 8 / 9
    const preset = cameraPresetFor(level, [...focusPath], layoutOf(systemId), { aspect })
    c.minDistance = preset.minDistance
    c.maxDistance = preset.maxDistance
    void c.setLookAt(
      preset.position[0],
      preset.position[1],
      preset.position[2],
      preset.target[0],
      preset.target[1],
      preset.target[2],
      false, // 比较模式不做飞行动画：两个视口同时动只会让人晕
    )
    invalidateFrame()
  }, [systemId, level, focusPath, width, height, invalidateFrame])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      domElement={domElement ?? undefined}
      onChange={() => invalidateFrame()}
      maxPolarAngle={Math.PI * 0.495}
    />
  )
}

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
 *
 * ✅ **已修复（曾被误判成 View 的锅）**：`showDiffOnly` 开启后 ghost 半透明「视觉上不生效」
 *   （材质是 0.12/true、`<Edges>` 正确消失，但填充像素逐位不变，连把 `ghostOpacity`
 *   改成 0 都没反应）。B5 当时怀疑是 drei `View` 的 scissor + `autoClear=false` 渲染路径，
 *   **实际根因与 View 无关**：three 把「不透明」编进了着色器 define（`#define OPAQUE`
 *   → `diffuseColor.a = 1.0`），运行期翻转 `material.transparent` 不会触发重编。
 *   完整推导与修复见 `GenericShapes.tsx` 的 `useTransparencyProgramSync`。
 *   因此**不需要 Plan B**——上面那个手写双 scissor 的备选方案只是留给未来 View 真出问题时用。
 */

import { CameraControls, View } from '@react-three/drei'
import { Canvas, invalidate, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { systemById } from '../../data'
import type { LodLevel, NetworkPlane } from '../../data/types'
import { CAMERA_FOV } from '../../lib/cameraPresets'
import { compareSystems, diffIndexOf, mirrorFocusPath } from '../../lib/compare'
import { useFactoryStore } from '../../store'
import { ErrorBoundary } from '../ErrorBoundary'
import { pumpFrames } from './pump'
import SceneRoot from './SceneRoot'
import type { DiffContext } from './SceneRoot'
import { useCameraRig } from './useCameraRig'

/** 比较视图只画这两个平面：其余四个在两个小视口里纯属噪音。 */
const COMPARE_PLANES: readonly NetworkPlane[] = ['nvlink', 'scaleout']

/**
 * 每个视口自带的灯光。
 *
 * ★ 必须放在 `<View>` 内部：drei 的 View 把 children portal 到一个**独立的虚拟 Scene**，
 * 渲染的是那个虚拟场景（`gl.render(virtualScene, state.camera)`）。
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

  /**
   * ★ 必须「补一小段帧」而不是只 invalidate 一次。
   *
   * drei 的 `View` 要等一轮 effect 才拿到 tracked 元素的 rect 并建立 portal；
   * 挂载瞬间那次 invalidate 发生在它就绪之前，之后 demand 循环再没人请求帧——
   * 表现就是**两个视口全白，直到随手拖一下相机才突然出现**（已在浏览器里复现过）。
   * 这里在 700 ms 内持续补帧，覆盖 View 就绪 + 布局稳定的那段窗口，然后自动停。
   */
  useEffect(
    () => pumpFrames(invalidate, 700),
    [generation, compare.right, compare.showDiffOnly, level, focusPath],
  )

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
          {/* ★ 必须放在两个 View **之后**：React 先跑子组件的 effect，
              轮到它时 View 的 portal 已经建好、useFrame 已经订阅，这时补的帧才真的画得出东西。
              放在 Canvas 外面（组件树更上层）会赶在 View 就绪之前补完，然后一片空白。 */}
          <FramePump ms={900} token={`${generation}|${compare.right}|${compare.showDiffOnly}|${level}`} />
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}

/**
 * 在 Canvas 内部补一小段帧。放在 View 之后挂载，保证补帧发生在 portal 就绪之后。
 * `token` 变化时重新补一轮（换代际 / 换对比对象 / 切 showDiffOnly / 换层级）。
 */
function FramePump({ ms, token }: { ms: number; token: string }) {
  const invalidateFrame = useThree((s) => s.invalidate)
  useEffect(() => pumpFrames(invalidateFrame, ms), [invalidateFrame, ms, token])
  return null
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
 *
 * ★ 与探索模式共用 `useCameraRig`（v1.1 C1）：这里原本也是「一个效果、依赖含 width/height、
 *   触发即无条件 setLookAt」，因此比较模式下点数据流步骤或调窗口同样会没收用户视角。
 *   共用 hook 之后两条路径的 `userMoved` 语义完全一致。
 *   `widthDivisor: 2` —— 单个视口只占一半宽度，取景要按半宽的宽高比算，否则两边都会被裁掉。
 *   `animate: false` —— 比较模式不做飞行动画：两个视口同时动只会让人晕。
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
   *  结果只有右半边能拖动。`useCameraRig` 的 wheel/pointerdown 监听也挂在它上面。 */
  domElement: HTMLElement | null
}) {
  const rig = useCameraRig({
    systemId,
    level,
    focusPath,
    animate: false,
    widthDivisor: 2,
    pumpMs: 400,
    domElement,
  })

  return (
    <CameraControls
      ref={rig.ref}
      makeDefault
      domElement={domElement ?? undefined}
      onChange={rig.onChange}
      maxPolarAngle={Math.PI * 0.495}
    />
  )
}

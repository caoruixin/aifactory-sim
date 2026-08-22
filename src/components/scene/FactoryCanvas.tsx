/**
 * Canvas 宿主：帧循环策略、灯光、颜色与 WebGL 失效处理都集中在这一处。
 *
 * - `frameloop={playing ? 'always' : 'demand'}`：数据流播放时才连续出帧，其余时间空闲
 *   零连续帧。任何改变画面的动作都必须显式 `invalidate()`——约定见 Hotspot / CameraRig /
 *   ConnectionLayer / FlowLayer。
 * - 标签页切到后台（`visibilitychange`）时强制暂停播放：一是不留一个后台还在读 store、
 *   写 instance matrix 的定时器；二是 `always` 帧循环在不可见标签页里没有意义。
 * - `dpr`：桌面 [1, 1.75]，移动 [1, 1.5]。不用 devicePixelRatio 原值，
 *   高分屏上 3x 渲染对这种示意场景是纯浪费。
 * - 灯光只有一盏环境光 + 一盏平行光（外加一盏很弱的补光），无阴影：
 *   工程示意图风格，靠 `<Edges>` 描边而不是靠光影表达结构。
 * - 颜色全部经 `lib/palette.ts`（Canvas 内 Tailwind class 不生效）。
 * - 初始化抛错 / `webglcontextlost` → `store.glStatus = 'failed'`，
 *   外层 FactoryPage 立刻切到结构视图，永不白屏。
 */

import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CAMERA_FOV } from '../../lib/cameraPresets'
import { palette } from '../../lib/palette'
import { useFactoryStore } from '../../store'
import { ErrorBoundary } from '../ErrorBoundary'
import CameraRig from './CameraRig'
import SceneRoot from './SceneRoot'

export default function FactoryCanvas() {
  const setGlStatus = useFactoryStore((s) => s.setGlStatus)
  const setReady = useFactoryStore((s) => s.setReady)
  const playing = useFactoryStore((s) => s.flow.playing)
  const setFlow = useFactoryStore((s) => s.setFlow)
  const cleanupRef = useRef<(() => void) | null>(null)

  const p = palette()
  const dpr = useMemo<[number, number]>(() => {
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768
    return mobile ? [1, 1.5] : [1, 1.75]
  }, [])

  useEffect(() => () => cleanupRef.current?.(), [])

  // 后台标签页不该继续播放数据流动画：既没有观众，`always` 帧循环也纯粹浪费电量。
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.hidden) setFlow({ playing: false })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [setFlow])

  return (
    <ErrorBoundary
      onError={() => {
        setGlStatus('failed')
        setReady(true)
      }}
      fallback={null}
    >
      <Canvas
        frameloop={playing ? 'always' : 'demand'}
        dpr={dpr}
        shadows={false}
        flat
        camera={{ fov: CAMERA_FOV, near: 0.01, far: 600, position: [7, 4.5, 10] }}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement
          const onLost = (e: Event) => {
            e.preventDefault()
            setGlStatus('failed')
          }
          canvas.addEventListener('webglcontextlost', onLost, false)
          cleanupRef.current = () => canvas.removeEventListener('webglcontextlost', onLost)
          // ready 必须由 onCreated 决定，不能靠 requestAnimationFrame：
          // 后台/未聚焦标签页里 rAF 会被节流甚至完全暂停，那样 data-ready 永远停在 0，
          // E2E 会白等到超时。onCreated 说明 WebGL 上下文已经建起来了，这就够了。
          setReady(true)
        }}
      >
        <color attach="background" args={[p.ink]} />
        <ambientLight intensity={0.95} />
        <directionalLight position={[8, 14, 7]} intensity={1.3} />
        <directionalLight position={[-7, 6, -9]} intensity={0.32} />
        <SceneRoot />
        <CameraRig />
      </Canvas>
    </ErrorBoundary>
  )
}

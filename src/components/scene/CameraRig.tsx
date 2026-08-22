/**
 * 相机控制：drei `<CameraControls>` + `lib/cameraPresets.ts` 的纯数学机位。
 *
 * 层级或焦点一变，就 `setLookAt(...preset, enableTransition)` 平滑飞过去，
 * 并按该级的 fit 距离 clamp 缩放范围（防止在板级把镜头推进芯片内部，
 * 或在集群级拉到看不见机架）。
 *
 * ⚠️ frameloop 是 `demand`：平滑飞行期间没有任何东西会自动请求帧，
 *    所以过渡开始时手动 pump 一段 rAF。`reducedMotion` 下直接瞬移，不 pump。
 */

import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { cameraPresetFor } from '../../lib/cameraPresets'
import { layoutOf } from '../../lib/layout'
import { useFactoryStore } from '../../store'

/** 过渡期间持续请求帧；返回取消函数。 */
function pumpFrames(invalidate: () => void, ms: number): () => void {
  if (ms <= 0) {
    invalidate()
    return () => {}
  }
  let raf = 0
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const step = () => {
    invalidate()
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - t0 < ms) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

export default function CameraRig() {
  const controls = useRef<CameraControls | null>(null)
  /**
   * 首次落位必须是**瞬移**：平滑过渡靠 rAF 推进，而后台/未聚焦标签页会节流 rAF——
   * 那种情况下相机会永远停在 `<Canvas camera>` 的默认机位，画面看上去像是空的
   * （深链、E2E 截图、后台预热全都会踩到）。开场直接就位，之后的切换才做动画。
   */
  const firstApply = useRef(true)
  const invalidate = useThree((s) => s.invalidate)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  const generation = useFactoryStore((s) => s.generation)
  const level = useFactoryStore((s) => s.level)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const reducedMotion = useFactoryStore((s) => s.reducedMotion)

  // useLayoutEffect 而非 useEffect：必须赶在浏览器绘制**之前**把相机放好，
  // 否则首帧会用 <Canvas camera> 的默认机位渲染一次，而 demand 模式下
  // 「补一帧」要等 rAF——后台标签页里 rAF 被节流时，那一帧空画面会一直挂着。
  useLayoutEffect(() => {
    const c = controls.current
    if (!c) return
    const aspect = height > 0 ? width / height : 16 / 9
    const preset = cameraPresetFor(level, focusPath, layoutOf(generation), { aspect })
    c.minDistance = preset.minDistance
    c.maxDistance = preset.maxDistance
    const animate = !reducedMotion && !firstApply.current
    firstApply.current = false
    void c.setLookAt(
      preset.position[0],
      preset.position[1],
      preset.position[2],
      preset.target[0],
      preset.target[1],
      preset.target[2],
      animate,
    )
    return pumpFrames(invalidate, animate ? 1500 : 0)
  }, [level, focusPath, generation, width, height, reducedMotion, invalidate])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      // 拖拽/滚轮期间也要请求帧，否则 demand 模式下画面不动
      onChange={() => invalidate()}
      // 示意场景不需要仰角翻到地面以下
      maxPolarAngle={Math.PI * 0.495}
    />
  )
}

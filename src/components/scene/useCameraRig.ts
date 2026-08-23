/**
 * 相机装配的共享逻辑（v1.1 C1）：导航飞行 / 尺寸自适应 / `userMoved` 归属判定 / 位姿遥测。
 *
 * ## 为什么要拆成两个效果
 *
 * 原来只有**一个** `useLayoutEffect`，依赖里同时含 `level/focusPath/generation` 与
 * `width/height`，触发即无条件 `setLookAt(preset)`。后果是：任何改变画布尺寸的动作
 * ——点一下数据流步骤（底栏高度跳变）、拖一下窗口——都会把用户手动转好的视角
 * **强制打回默认机位**。用户的原话是「视角被没收」。
 *
 * 现在拆成：
 * - **效果 A（导航飞行）**：依赖 `[level, focusPath, systemId]`。这是**唯一**允许程序化
 *   改机位的路径（下钻 / 面包屑 / 导览 / 代际切换）。它同时更新 min/maxDistance clamp
 *   ——clamp 必须在这里更新，只放进 resize 效果的话，下钻到板级后还套着集群级的缩放限位。
 * - **效果 B（尺寸自适应）**：依赖 `[width, height]`，只更新 clamp，**不** `setLookAt`。
 *   唯一例外：用户自上次程序化落位以来**没动过相机**，这时 resize 重新 fit 是帮忙而不是
 *   捣乱（开场把窗口拉大一点，画面理应重新取景）。
 *
 * ## 为什么 `userMoved` 不能只听 `controlstart`
 *
 * camera-controls 的文档明确写了：**滚轮缩放不触发 `controlstart`**（它没有「按下—拖动—
 * 抬起」的生命周期）。只听 `controlstart` 的话，「只用滚轮缩放过」的用户在 resize 时
 * 依然会被打回默认机位。因此这里 `controlstart` + canvas/容器上的 DOM `wheel`、
 * `pointerdown` 三个来源共同置位；每次程序化 `setLookAt` 之后复位。
 *
 * ## 位姿遥测
 *
 * `data-camera-pose="px,py,pz,tx,ty,tz"` 写在 canvas 元素上（同时镜像到
 * `window.__cameraPose`）。E2E 断言「相机保持」必须用它，**不能用截图差异**：
 * 数据流高亮本身就会改像素，「与默认基线不同」在相机已被复位时也能假通过。
 */

import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CameraControls } from '@react-three/drei'
import * as THREE from 'three'
import type { LodLevel } from '../../data/types'
import { cameraPresetFor } from '../../lib/cameraPresets'
import type { CameraPreset } from '../../lib/cameraPresets'
import { layoutOf } from '../../lib/layout'
import { pumpFrames } from './pump'

/** 读位姿用的模块级暂存向量：每次 change 都 new 一个 Vector3 太浪费。 */
const SCRATCH_POSITION = new THREE.Vector3()
const SCRATCH_TARGET = new THREE.Vector3()

declare global {
  interface Window {
    /** 仅供 E2E/调试读取的相机位姿快照；写它不影响任何渲染逻辑。 */
    __cameraPose?: string
  }
}

export interface CameraRigOptions {
  /** 取景盒子按这一代的摆位算。 */
  systemId: string
  level: LodLevel
  focusPath: readonly string[]
  /** 导航飞行是否做平滑过渡（`reducedMotion` 时瞬移）。首帧恒为瞬移。 */
  animate: boolean
  /** 取景宽高比的宽度除数：比较模式单个视口只占半宽 ⇒ 2。默认 1。 */
  widthDivisor?: number
  /** 平滑飞行期间补帧的毫秒数（demand 帧循环下没人自动请求帧）。 */
  pumpMs?: number
  /**
   * 手动输入监听挂在哪个 DOM 上。比较模式的 `CameraControls` 显式挂在整个比较容器上，
   * 因此 `wheel`/`pointerdown` 也要挂同一个元素；省略则用 canvas 本身。
   */
  domElement?: HTMLElement | null
}

export interface CameraRigHandle {
  /** 挂到 `<CameraControls ref>`。 */
  ref: React.RefObject<CameraControls | null>
  /** 挂到 `<CameraControls onChange>`：请求一帧 + 写位姿遥测。 */
  onChange: () => void
  /** 当前生效的机位预设（调用方一般用不上，留给调试）。 */
  preset: CameraPreset
}

export function useCameraRig({
  systemId,
  level,
  focusPath,
  animate,
  widthDivisor = 1,
  pumpMs = 1500,
  domElement = null,
}: CameraRigOptions): CameraRigHandle {
  const controls = useRef<CameraControls | null>(null)
  /**
   * 首次落位必须是**瞬移**：平滑过渡靠 rAF 推进，而后台/未聚焦标签页会节流 rAF——
   * 那种情况下相机会永远停在 `<Canvas camera>` 的默认机位，画面看上去像是空的
   * （深链、E2E 截图、后台预热全都会踩到）。开场直接就位，之后的切换才做动画。
   */
  const firstApply = useRef(true)
  /** 用户自上次程序化落位以来动过相机没有（拖拽 / 滚轮 / 触摸）。 */
  const userMoved = useRef(false)

  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  const preset = useMemo(() => {
    const aspect = height > 0 ? width / widthDivisor / height : 16 / 9
    return cameraPresetFor(level, [...focusPath], layoutOf(systemId), { aspect })
  }, [level, focusPath, systemId, width, height, widthDivisor])

  // 两个效果共用同一份 preset，但**都不把它放进依赖**：preset 随 aspect 变化，
  // 放进导航效果的依赖会让 resize 重新触发飞行——正是这次要修掉的行为。
  const presetRef = useRef(preset)
  presetRef.current = preset
  const animateRef = useRef(animate)
  animateRef.current = animate

  const writePose = useCallback(() => {
    const c = controls.current
    if (!c) return
    c.getPosition(SCRATCH_POSITION)
    c.getTarget(SCRATCH_TARGET)
    const pose = [
      SCRATCH_POSITION.x,
      SCRATCH_POSITION.y,
      SCRATCH_POSITION.z,
      SCRATCH_TARGET.x,
      SCRATCH_TARGET.y,
      SCRATCH_TARGET.z,
    ]
      .map((v) => v.toFixed(3))
      .join(',')
    gl.domElement.setAttribute('data-camera-pose', pose)
    if (typeof window !== 'undefined') window.__cameraPose = pose
  }, [gl])

  const applyClamp = useCallback((c: CameraControls, p: CameraPreset) => {
    c.minDistance = p.minDistance
    c.maxDistance = p.maxDistance
  }, [])

  // ── 效果 A：导航飞行（唯一允许程序化改机位的路径） ──
  // useLayoutEffect 而非 useEffect：必须赶在浏览器绘制**之前**把相机放好，
  // 否则首帧会用 <Canvas camera> 的默认机位渲染一次，而 demand 模式下
  // 「补一帧」要等 rAF——后台标签页里 rAF 被节流时，那一帧空画面会一直挂着。
  useLayoutEffect(() => {
    const c = controls.current
    if (!c) return
    const p = presetRef.current
    applyClamp(c, p)
    const withTransition = animateRef.current && !firstApply.current
    firstApply.current = false
    void c.setLookAt(
      p.position[0],
      p.position[1],
      p.position[2],
      p.target[0],
      p.target[1],
      p.target[2],
      withTransition,
    )
    // 程序化落位之后重新把「视角归属」交还给系统：下一次 resize 可以重新 fit，
    // 直到用户又动了相机为止。
    userMoved.current = false
    writePose()
    return pumpFrames(invalidate, withTransition ? pumpMs : 0)
  }, [level, focusPath, systemId, applyClamp, invalidate, pumpMs, writePose])

  // ── 效果 B：尺寸自适应（只更新 clamp，不夺走视角） ──
  useLayoutEffect(() => {
    const c = controls.current
    if (!c) return
    applyClamp(c, presetRef.current)
    if (userMoved.current) {
      // 用户已经自己取好景了：换个窗口大小不是「请重新取景」的意思。
      invalidate()
      return
    }
    const p = presetRef.current
    void c.setLookAt(p.position[0], p.position[1], p.position[2], p.target[0], p.target[1], p.target[2], false)
    writePose()
    return pumpFrames(invalidate, 0)
  }, [width, height, applyClamp, invalidate, writePose])

  // ── userMoved 置位：controlstart + DOM wheel/pointerdown（缺一不可，见文件头） ──
  useEffect(() => {
    const c = controls.current
    const el = domElement ?? gl.domElement
    if (!c || !el) return
    const mark = (): void => {
      userMoved.current = true
    }
    c.addEventListener('controlstart', mark)
    el.addEventListener('wheel', mark, { passive: true })
    el.addEventListener('pointerdown', mark)
    return () => {
      c.removeEventListener('controlstart', mark)
      el.removeEventListener('wheel', mark)
      el.removeEventListener('pointerdown', mark)
    }
  }, [gl, domElement])

  const onChange = useCallback(() => {
    invalidate()
    writePose()
  }, [invalidate, writePose])

  return { ref: controls, onChange, preset }
}

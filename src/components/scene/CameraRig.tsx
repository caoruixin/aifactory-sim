/**
 * 相机控制：drei `<CameraControls>` + `lib/cameraPresets.ts` 的纯数学机位。
 *
 * 层级或焦点一变，就 `setLookAt(...preset, enableTransition)` 平滑飞过去，
 * 并按该级的 fit 距离 clamp 缩放范围（防止在板级把镜头推进芯片内部，
 * 或在集群级拉到看不见机架）。
 *
 * ★ **视角归用户所有**（v1.1 C1）：导航飞行与尺寸自适应已拆成两个效果、`userMoved`
 *   由 `controlstart` + DOM `wheel`/`pointerdown` 共同置位、位姿写进 `data-camera-pose`
 *   ——完整推导见 `useCameraRig.ts` 的文件头注释。比较模式的 `CompareCameraRig` 用的
 *   是同一个 hook，因此两条路径行为一致。
 *
 * ⚠️ frameloop 是 `demand`：平滑飞行期间没有任何东西会自动请求帧，
 *    所以过渡开始时手动 pump 一段 rAF。`reducedMotion` 下直接瞬移，不 pump。
 *
 * `interactive=false`（移动端用）：`CameraControls.enabled = false` 只关掉用户的
 * 拖拽/触摸/滚轮输入，`setLookAt` 等程序化方法照常生效——正合移动端「导览按钮驱动
 * 机位、但不希望手指划动和页面滚动打架」的需求。
 */

import { CameraControls } from '@react-three/drei'
import { useFactoryStore } from '../../store'
import { useCameraRig } from './useCameraRig'

export interface CameraRigProps {
  /** false = 禁用用户手动 orbit/缩放/平移（程序化机位切换不受影响）。默认 true。 */
  interactive?: boolean
}

export default function CameraRig({ interactive = true }: CameraRigProps = {}) {
  const generation = useFactoryStore((s) => s.generation)
  const level = useFactoryStore((s) => s.level)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const reducedMotion = useFactoryStore((s) => s.reducedMotion)

  const rig = useCameraRig({
    systemId: generation,
    level,
    focusPath,
    animate: !reducedMotion,
  })

  return (
    <CameraControls
      ref={rig.ref}
      makeDefault
      enabled={interactive}
      // 拖拽/滚轮期间也要请求帧，否则 demand 模式下画面不动（顺带写位姿遥测）
      onChange={rig.onChange}
      // 示意场景不需要仰角翻到地面以下
      maxPolarAngle={Math.PI * 0.495}
    />
  )
}

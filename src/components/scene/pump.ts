/**
 * demand 帧循环下的「补帧」工具。
 *
 * 背景：`frameloop="demand"` 只在显式 `invalidate()` 后出一帧。有两类情况一次
 * invalidate 不够用——
 *   1. **相机平滑过渡**：CameraControls 靠 rAF 推进，中间每一帧都得有人请求；
 *   2. **drei `<View>` 挂载**：View 要等一轮 effect 才拿到 tracked 元素的 rect 并
 *      建立 portal，挂载瞬间那次 invalidate 发生在它就绪之前，之后就再没人请求帧了
 *      ——表现为两个视口全白，直到你随手拖一下相机才突然出现。
 *
 * 所以这里在一小段时间内持续请求帧，然后自动停下（不是常驻 rAF）。
 */
export function pumpFrames(invalidate: () => void, ms: number): () => void {
  if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
    invalidate()
    return () => {}
  }
  let raf = 0
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const t0 = now()
  const step = () => {
    invalidate()
    if (now() - t0 < ms) raf = requestAnimationFrame(step)
  }
  invalidate()
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

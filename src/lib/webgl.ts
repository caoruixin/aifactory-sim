/**
 * WebGL 能力探测（零 three 导入）。
 *
 * 三个用途：
 * 1. 无 WebGL 的环境（老机器 / 远程桌面 / 禁用硬件加速）直接走降级视图，永不白屏；
 * 2. `?gl=off` 强制降级——既方便演示时兜底，也是 E2E 截图测试的确定性入口；
 * 3. 运行期 `webglcontextlost` 由 FactoryCanvas 监听后把 store 打成 'failed'。
 */

export type GlStatus = 'webgl2' | 'webgl' | 'none'

/** 从查询串里判断是否强制关闭 WebGL。 */
export function isGlForcedOff(search: string): boolean {
  return /(?:^|[?&])gl=off(?:&|$)/.test(search)
}

export function detectWebGL(search?: string): GlStatus {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search)
  if (isGlForcedOff(query)) return 'none'
  if (typeof document === 'undefined') return 'none'
  try {
    const canvas = document.createElement('canvas')
    if (canvas.getContext('webgl2')) return 'webgl2'
    if (canvas.getContext('webgl')) return 'webgl'
    return 'none'
  } catch {
    // 某些环境下 getContext 会直接抛（而不是返回 null）。
    return 'none'
  }
}

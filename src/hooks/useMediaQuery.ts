/**
 * 断点判定（B2 未建，B5 移动端需要，因此自建这个小 hook）。
 *
 * 不放进 `src/lib/`：那里的硬规则是「零 three 导入 + node 环境可测的纯函数」，
 * 而这是一个读 `window.matchMedia` 的 React hook，天然不满足「纯函数」也不需要
 * node 单测——放在 `src/hooks/` 明确它是「浏览器副作用」而不是可移植的业务逻辑。
 *
 * SSR / Vitest node 环境下 `window.matchMedia` 不存在，一律返回 `false`
 * （与其它 store 里的 `prefersReducedMotion()` 同样的兜底策略）。
 */

import { useEffect, useState } from 'react'

function getMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMatch(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange() // query 本身变化时（不同的调用方传了不同字符串）立刻同步一次
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    // Safari < 14 兼容路径
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [query])

  return matches
}

/** 与 `FactoryCanvas` 的 dpr 判定、Tailwind `md` 断点对齐：768px 以下算移动端。 */
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_BREAKPOINT_QUERY)
}

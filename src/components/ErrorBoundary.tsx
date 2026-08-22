/**
 * 应用级兜底。
 *
 * 存在的唯一理由：**永不白屏**。3D 初始化失败、驱动崩溃、内容包某条数据把渲染打挂，
 * 都应该退化成一段可读的文字 + 结构视图，而不是一片空白让人以为「网站坏了」。
 */

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** null = 出错时什么都不渲染（由外层决定替代内容，例如切到结构视图）。 */
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  onError?: (error: Error) => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留控制台线索：降级之后现场就没了，日志是唯一的排查入口。
    console.error('[aifactory] 渲染异常，已降级：', error, info.componentStack)
    this.props.onError?.(error)
  }

  private reset = (): void => this.setState({ error: null })

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    const { fallback } = this.props
    return typeof fallback === 'function' ? fallback(error, this.reset) : fallback
  }
}

/** 整页兜底界面（App 根用）。 */
export function AppErrorFallback(error: Error, reset: () => void): ReactNode {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold">页面出了点问题</h1>
      <p className="mt-3 text-sm leading-relaxed text-dim">
        模拟器渲染时抛出了异常，已经中断以免出现白屏。可以先重试；如果反复出现，
        用 <code className="rounded bg-panel-2 px-1">?gl=off</code> 打开纯结构视图。
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md border border-line bg-panel-2 p-3 text-xs text-dim">
        {error.message}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-md border border-line bg-panel px-3 py-1.5 text-sm hover:border-accent"
      >
        重试
      </button>
    </main>
  )
}

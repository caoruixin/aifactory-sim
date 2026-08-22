import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { AppErrorFallback, ErrorBoundary } from './components/ErrorBoundary'
import FactoryPage from './pages/FactoryPage'

// /report 懒加载：批次 4 起该页会独立成 chunk，且**禁止导入 three/scene**，
// 以保证打印报告在无 WebGL 环境下也能打开。
const ReportPage = lazy(() => import('./pages/ReportPage'))

export default function App() {
  return (
    // 应用级兜底：任何未捕获的渲染异常都退化成可读页面，而不是白屏。
    <ErrorBoundary fallback={AppErrorFallback}>
      <Routes>
        <Route path="/" element={<FactoryPage />} />
        <Route
          path="/report"
          element={
            <Suspense fallback={<div className="p-8 text-dim">报告加载中…</div>}>
              <ReportPage />
            </Suspense>
          }
        />
        {/* ★ 兜底路由不是可选项：`vite preview`/任何 SPA 托管都会把未知路径回落到
            index.html，没有这一条时 `<Routes>` 一个都不匹配、**整页渲染成空白**
            （实测 `/no-such-page` 就是纯白屏）。拼错一个字母就白屏，比 404 难看得多。 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  )
}

/** 404。刻意只用 DOM（不导入 three / scene），无 WebGL 环境同样能打开。 */
function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-fg" data-not-found="1">
      <p className="font-mono text-sm text-dim">404</p>
      <h1 className="mt-1 text-2xl font-semibold">这个地址不存在</h1>
      <p className="mt-3 text-sm leading-relaxed text-dim">
        本工具只有两个页面：3D 工作台与汇报页。深链参数（<code className="font-mono">?level=</code>、
        <code className="font-mono">?focus=</code>、<code className="font-mono">?gen=</code> 等）都挂在工作台上。
      </p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <Link to="/" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 font-medium text-accent hover:bg-accent/20">
          ← 回到工作台
        </Link>
        <Link to="/report" className="rounded-md border border-line px-3 py-1.5 hover:border-accent">
          汇报页 →
        </Link>
      </div>
    </main>
  )
}

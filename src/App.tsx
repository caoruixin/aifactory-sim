import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
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
      </Routes>
    </ErrorBoundary>
  )
}

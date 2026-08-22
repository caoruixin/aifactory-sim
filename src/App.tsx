import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import FactoryPage from './pages/FactoryPage'

// /report 懒加载：批次 4 起该页会独立成 chunk，且**禁止导入 three/scene**，
// 以保证打印报告在无 WebGL 环境下也能打开。
const ReportPage = lazy(() => import('./pages/ReportPage'))

export default function App() {
  return (
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
  )
}

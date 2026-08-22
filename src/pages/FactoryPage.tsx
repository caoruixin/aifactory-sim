/**
 * 主工作台。四区布局：
 *   顶  BreadcrumbBar（物理层级 + 产品状态）
 *   左  TourPanel（场景导览 + 六平面开关）
 *   中  FactoryCanvas（3D）或 ComponentTree（降级）
 *   右  DetailPanel
 *   底  FlowBar（推理数据流播放控件：步骤条 + 播放/暂停/步进/速度）
 *
 * 布局原则：**除中央格外全部是 DOM**。这样 WebGL 不可用时只要换掉中央那一格，
 * 面包屑/导览/详情/步骤条全部照常工作——降级路径不是另写一套界面。
 *
 * 桌面三栏 grid；移动端先纵向堆叠保证可用，专门的移动视图（禁 orbit、自动导览、
 * 热点列表 + Drawer）留到 B5。
 */

import { Suspense, lazy } from 'react'
import BreadcrumbBar from '../components/panels/BreadcrumbBar'
import DetailPanel from '../components/panels/DetailPanel'
import FlowBar from '../components/panels/FlowBar'
import TourPanel from '../components/panels/TourPanel'
import ComponentTree from '../components/fallback/ComponentTree'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useFactoryStore } from '../store'
import { useShotParams } from './useShotParams'

// three 体量不小，且降级路径根本不需要它 → 懒加载，让 `?gl=off` 首屏不必下载 3D 代码。
const FactoryCanvas = lazy(() => import('../components/scene/FactoryCanvas'))

export default function FactoryPage() {
  useShotParams()
  const glStatus = useFactoryStore((s) => s.glStatus)
  const ready = useFactoryStore((s) => s.ready)
  const degraded = glStatus === 'none' || glStatus === 'failed'

  return (
    <main
      data-ready={ready ? '1' : '0'}
      data-gl={glStatus}
      className="grid h-screen grid-rows-[auto_1fr_auto] bg-ink text-fg"
    >
      <BreadcrumbBar />

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[248px_1fr_360px]">
        <aside className="min-h-0 border-line bg-panel lg:border-r">
          <TourPanel />
        </aside>

        {/* flex 列而不是让子元素 h-full：降级提示条要占掉自己的高度，
            剩下的才归中央视图，否则结构树会撑出容器、被底部步骤条盖住。 */}
        <section className="relative flex min-h-[52vh] min-w-0 flex-col bg-ink lg:min-h-0">
          {degraded ? <DegradedNotice status={glStatus} /> : null}
          <div className="relative min-h-0 flex-1">
            {degraded ? (
              <ComponentTree />
            ) : (
              <ErrorBoundary
                fallback={<ComponentTree />}
                onError={() => useFactoryStore.getState().setGlStatus('failed')}
              >
                <Suspense fallback={<CanvasSkeleton />}>
                  <FactoryCanvas />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
          {!degraded ? <ViewHint /> : null}
        </section>

        <aside className="min-h-0 border-line bg-panel lg:border-l">
          <DetailPanel />
        </aside>
      </div>

      <FlowBar />
    </main>
  )
}

function DegradedNotice({ status }: { status: string }) {
  return (
    <div className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs leading-relaxed text-warn">
      3D 不可用（{status === 'none' ? '未检测到 WebGL 或已用 ?gl=off 关闭' : 'WebGL 上下文丢失'}
      ），已切换结构视图。层级、选中与详情面板功能不受影响。
    </div>
  )
}

function CanvasSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-dim">3D 场景加载中…</div>
  )
}

/** 3D 视图的操作提示：第一次用的人不知道双击能下钻。 */
function ViewHint() {
  return (
    <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel/85 px-3 py-1 text-[11px] text-dim">
      单击选中 · 双击下钻 · 拖拽旋转 · 滚轮缩放
    </p>
  )
}

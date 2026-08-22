/**
 * 主工作台。四区布局：
 *   顶  BreadcrumbBar（代际切换 / 模式切换 / 物理层级）
 *   左  TourPanel（场景导览 + 六平面开关）
 *   中  FactoryCanvas（3D）/ ComparisonView（比较双视口）/ ComponentTree（降级）
 *   右  DetailPanel 或 ComparePanel（比较模式）+ 产能粗估 tab
 *   底  FlowBar（推理数据流播放控件）
 *
 * 布局原则：**除中央格外全部是 DOM**。这样 WebGL 不可用时只要换掉中央那一格，
 * 面包屑/导览/详情/步骤条/产能卡全部照常工作——降级路径不是另写一套界面。
 *
 * 桌面三栏 grid；`md`（768px）以下换成 `MobileFactoryView`——专门的移动布局
 * （禁 orbit、导览按钮驱动机位、热点列表 + Drawer 详情），不是桌面栏位纵向堆叠。
 * `<main>` 本身（含 `data-ready`/`data-gl`/`data-mode`）两种断点下都保留，
 * 深链播种与降级检测不因断点切换而失效。
 */

import { Suspense, lazy, useState } from 'react'
import BreadcrumbBar from '../components/panels/BreadcrumbBar'
import CapacityPanel from '../components/panels/CapacityPanel'
import ComparePanel from '../components/panels/ComparePanel'
import DetailPanel from '../components/panels/DetailPanel'
import FlowBar from '../components/panels/FlowBar'
import TourPanel from '../components/panels/TourPanel'
import Fallback2D from '../components/fallback/Fallback2D'
import MobileFactoryView from '../components/mobile/MobileFactoryView'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useIsMobile } from '../hooks/useMediaQuery'
import { useFactoryStore } from '../store'
import { useShotParams } from './useShotParams'

// three 体量不小，且降级路径根本不需要它 → 懒加载，让 `?gl=off` 首屏不必下载 3D 代码。
const FactoryCanvas = lazy(() => import('../components/scene/FactoryCanvas'))
const ComparisonView = lazy(() => import('../components/scene/ComparisonView'))

type RightTab = 'detail' | 'capacity'

export default function FactoryPage() {
  useShotParams()
  const isMobile = useIsMobile()
  const glStatus = useFactoryStore((s) => s.glStatus)
  const ready = useFactoryStore((s) => s.ready)
  const mode = useFactoryStore((s) => s.mode)
  const generation = useFactoryStore((s) => s.generation)
  const compareRight = useFactoryStore((s) => s.compare.right)
  const [tab, setTab] = useState<RightTab>('detail')

  const degraded = glStatus === 'none' || glStatus === 'failed'
  const compareMode = mode === 'compare'

  return (
    <main
      data-ready={ready ? '1' : '0'}
      data-gl={glStatus}
      data-mode={mode}
      className={
        isMobile
          ? 'h-screen overflow-hidden bg-ink text-fg'
          : 'grid h-screen grid-rows-[auto_1fr_auto] bg-ink text-fg'
      }
    >
      {isMobile ? (
        <MobileFactoryView />
      ) : (
        <>
          <BreadcrumbBar />

          <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[248px_1fr_380px]">
            <aside className="min-h-0 border-line bg-panel lg:border-r">
              <TourPanel />
            </aside>

            {/* flex 列而不是让子元素 h-full：降级提示条与产能卡各占自己的高度，
                剩下的才归中央视图，否则结构树会撑出容器、被底部步骤条盖住。 */}
            <section className="relative flex min-h-[52vh] min-w-0 flex-col bg-ink lg:min-h-0">
              {degraded ? <DegradedNotice status={glStatus} /> : null}
              <div className="relative min-h-0 flex-1">
                {degraded ? (
                  <Fallback2D />
                ) : (
                  <ErrorBoundary
                    fallback={<Fallback2D />}
                    onError={() => useFactoryStore.getState().setGlStatus('failed')}
                  >
                    <Suspense fallback={<CanvasSkeleton />}>
                      {compareMode ? <ComparisonView /> : <FactoryCanvas />}
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>

              {/* 比较模式下把两代的产能卡并排放在画布正下方：视觉上「上面看结构、下面看产出」 */}
              {compareMode ? (
                <div className="max-h-[42%] overflow-y-auto border-t border-line bg-panel px-3 py-2">
                  <CapacityPanel systemIds={[generation, compareRight]} compact />
                </div>
              ) : null}

              {!degraded && !compareMode ? <ViewHint /> : null}
            </section>

            <aside className="flex min-h-0 flex-col border-line bg-panel lg:border-l">
              {compareMode ? (
                <ComparePanel />
              ) : (
                <>
                  <div className="flex shrink-0 gap-1 border-b border-line px-3 py-1.5">
                    {(
                      [
                        ['detail', '部件详情'],
                        ['capacity', '产能粗估'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        data-right-tab={id}
                        aria-pressed={tab === id}
                        onClick={() => setTab(id)}
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                          tab === id
                            ? 'border-accent bg-accent/10 font-medium text-accent'
                            : 'border-line text-dim hover:border-accent/50 hover:text-fg'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {tab === 'detail' ? (
                      <DetailPanel />
                    ) : (
                      <div className="p-3">
                        <CapacityPanel systemIds={[generation]} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </aside>
          </div>

          <FlowBar />
        </>
      )}
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

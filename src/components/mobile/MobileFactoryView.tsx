/**
 * 移动端主视图（`md` / 768px 以下）。
 *
 * 与桌面共享同一份 store/内容包/相机数学，只是换了一套交互模型：
 * - 顶部精简面包屑（代际 + 层级 + 上一层），不放六平面开关/完整面包屑那一整条；
 * - 3D 画布禁用手动 orbit（`FactoryCanvas interactive={false}`）——机位完全由
 *   「导览：上一站/下一站」按钮驱动，走桌面同一套 `lib/cameraPresets.ts` 语义
 *   （`store.applyScene` 本就是唯一入口，移动端不另写相机代码）；
 * - 3D 画布下方是「热点列表」：当前焦点的下级装配节点，点击 = `drillTo`
 *   （选中 + 层级/机位一起推进，与桌面双击下钻同一动作）；
 * - 详情面板换成从底部拉起的 `Drawer`（窄屏塞不下常驻右栏）。
 *
 * 比较模式在窄屏放弃双视口（会议屏都嫌挤，何况手机）：给出提示 + 复用桌面同款
 * `CapacityPanel`/`ComparePanel`——它们是纯 DOM 组件，产能卡与 diff 明细本来就
 * 不依赖 3D，移动端直接抄近路复用，不必另画一套。
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { assemblyById, childrenOf, scenesOfSystem, systemById } from '../../data'
import { LEVEL_LABEL, canDrillInto } from '../../lib/drill'
import { detailIdOf, focusIdOf, useFactoryStore } from '../../store'
import { ErrorBoundary } from '../ErrorBoundary'
import CapacityPanel from '../panels/CapacityPanel'
import ComparePanel from '../panels/ComparePanel'
import DetailPanel from '../panels/DetailPanel'
import Drawer from '../ui/Drawer'
import { StatusChip } from '../ui/Chips'
import Fallback2D from '../fallback/Fallback2D'

const FactoryCanvas = lazy(() => import('../scene/FactoryCanvas'))

export default function MobileFactoryView() {
  const generation = useFactoryStore((s) => s.generation)
  const mode = useFactoryStore((s) => s.mode)
  const level = useFactoryStore((s) => s.level)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const tourStopIdx = useFactoryStore((s) => s.tourStopIdx)
  const compare = useFactoryStore((s) => s.compare)
  const glStatus = useFactoryStore((s) => s.glStatus)
  const applyScene = useFactoryStore((s) => s.applyScene)
  const drillTo = useFactoryStore((s) => s.drillTo)
  const drillUp = useFactoryStore((s) => s.drillUp)
  const setGlStatus = useFactoryStore((s) => s.setGlStatus)
  const focusId = useFactoryStore(focusIdOf)
  const detailId = useFactoryStore(detailIdOf)

  const [drawerOpen, setDrawerOpen] = useState(false)

  const system = systemById(generation)
  const scenes = scenesOfSystem(generation)
  const degraded = glStatus === 'none' || glStatus === 'failed'
  const compareMode = mode === 'compare'

  // 首次进入（或换代际后还没选过任何一站）自动落到第一站，保证移动端一进来就有画面
  // 可看，而不是空的集群总览——但深链已经显式定了 focus/level 时不要覆盖它：
  // `focusPath.length <= 1` 就是「还停在系统根」这个判据（见 initialDrillState）。
  useEffect(() => {
    if (mode === 'compare') return
    if (tourStopIdx >= 0) return
    if (focusPath.length > 1) return
    const first = scenes[0]
    if (first) applyScene(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])

  const stopIdx = tourStopIdx >= 0 && tourStopIdx < scenes.length ? tourStopIdx : 0
  const activeScene = scenes[stopIdx]

  const goStop = (idx: number) => {
    const clamped = Math.max(0, Math.min(scenes.length - 1, idx))
    const scene = scenes[clamped]
    if (scene) applyScene(scene.id)
  }

  const hotspots = focusId ? childrenOf(focusId) : []
  const focusNode = focusId ? assemblyById(focusId) : undefined

  const openDetail = (assemblyId: string) => {
    drillTo(assemblyId)
    setDrawerOpen(true)
  }

  return (
    <div className="flex h-full flex-col" data-mobile-view="1">
      {/* ── 精简面包屑 ── */}
      <header className="shrink-0 border-b border-line bg-panel px-3 py-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
          {system ? (
            <>
              <span className="shrink-0 text-sm font-semibold">{system.name}</span>
              <StatusChip status={system.status} />
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-dim">
            当前层级：<span className="font-medium text-fg">{LEVEL_LABEL[level]}</span>
          </span>
          {focusNode ? <span className="min-w-0 truncate text-dim">· {focusNode.label}</span> : null}
          <button
            type="button"
            onClick={drillUp}
            disabled={level === 'cluster'}
            className="ml-auto shrink-0 rounded-md border border-line bg-panel px-2 py-1 text-[11px] hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↑ 上一层
          </button>
        </div>
      </header>

      {compareMode ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
            比较双视口仅在桌面宽屏下渲染——请在桌面浏览器打开工作台查看左右分屏对比。
            以下的产能粗估与差异明细在移动端同样可用。
          </p>
          <div className="border-b border-line px-3 py-2">
            <CapacityPanel systemIds={[generation, compare.right]} compact />
          </div>
          <ComparePanel />
        </div>
      ) : (
        <>
          {/* ── 3D / 降级画布 ── */}
          <div className="relative h-[38vh] shrink-0 border-b border-line bg-ink">
            {degraded ? (
              <Fallback2D />
            ) : (
              <ErrorBoundary
                fallback={<Fallback2D />}
                onError={() => setGlStatus('failed')}
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-dim">
                      3D 场景加载中…
                    </div>
                  }
                >
                  <FactoryCanvas interactive={false} />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>

          {/* ── 导览：上一站 / 下一站 ── */}
          <div
            className="shrink-0 border-b border-line bg-panel px-3 py-2"
            data-tour-stop={stopIdx}
            data-tour-total={scenes.length}
          >
            {scenes.length === 0 ? (
              <p className="text-xs text-dim">该代际暂无导览场景。</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-tour-prev
                    onClick={() => goStop(stopIdx - 1)}
                    disabled={stopIdx === 0}
                    className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ◀ 上一站
                  </button>
                  <span className="text-[11px] text-dim">
                    第 {stopIdx + 1} / {scenes.length} 站
                  </span>
                  <button
                    type="button"
                    data-tour-next
                    onClick={() => goStop(stopIdx + 1)}
                    disabled={stopIdx === scenes.length - 1}
                    className="ml-auto rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一站 ▶
                  </button>
                </div>
                {activeScene ? (
                  <div className="mt-1.5">
                    <p className="text-sm font-medium">{activeScene.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-dim">{activeScene.narration}</p>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* ── 热点列表：当前焦点的下级部件 ── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" data-hotspot-list="1">
            <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">
              这一屏里有什么
            </h2>
            {hotspots.length === 0 ? (
              <p className="mt-2 text-xs text-dim">
                {focusNode ? `${focusNode.label} 已经是叶子件，没有更细的下级了。` : '没有可展开的部件。'}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {hotspots.map((kid) => (
                  <li key={kid.id}>
                    <button
                      type="button"
                      onClick={() => openDetail(kid.id)}
                      className="flex w-full items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-left hover:border-accent/50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{kid.label}</span>
                      {kid.count > 1 ? (
                        <span className="shrink-0 font-mono text-[11px] text-dim">×{kid.count}</span>
                      ) : null}
                      {canDrillInto(kid.id) ? (
                        <span className="shrink-0 text-[11px] text-accent">进入 →</span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-dim">查看</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="部件详情" side="bottom">
        {detailId ? <DetailPanel /> : <p className="p-4 text-sm text-dim">未选中任何部件。</p>}
      </Drawer>
    </div>
  )
}

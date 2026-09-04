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
 *
 * 领域切面（v1.6 W-D）：头部下加一行切面入口，进切面后导览块换成「上一章/下一章 +
 * 章标题 + 代际徽章」、热点列表换成章节列表，「本章内容 ▸」从底部拉起内嵌桌面版
 * `LensChapterPanel`——因果链/关键数字/计算器整块复用，移动端不必另画一套渲染。
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { FACTORY_PACK, assemblyById, childrenOf, lensById, scenesOfSystem, systemById } from '../../data'
import { LEVEL_LABEL, canDrillInto } from '../../lib/drill'
import { DEFAULT_LENS_ID, activeLensChapter, lensChapterCount, shortSystemNameOf } from '../../lib/lens'
import { detailIdOf, focusIdOf, useFactoryStore } from '../../store'
import { ErrorBoundary } from '../ErrorBoundary'
import CapacityPanel from '../panels/CapacityPanel'
import ComparePanel from '../panels/ComparePanel'
import DetailPanel from '../panels/DetailPanel'
import LensChapterPanel from '../panels/LensChapterPanel'
import Drawer from '../ui/Drawer'
import RichText from '../ui/RichText'
import { MetaChip, StatusChip } from '../ui/Chips'
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
  const setGeneration = useFactoryStore((s) => s.setGeneration)
  const setGlStatus = useFactoryStore((s) => s.setGlStatus)
  const focusId = useFactoryStore(focusIdOf)
  const detailId = useFactoryStore(detailIdOf)
  // 领域切面（v1.6 W-D）：窄订阅两个标量字段，同 BreadcrumbBar 的取法。
  const lensId = useFactoryStore((s) => s.lens.lensId)
  const lensChapterIdx = useFactoryStore((s) => s.lens.chapterIdx)
  const setLens = useFactoryStore((s) => s.setLens)
  const setLensChapter = useFactoryStore((s) => s.setLensChapter)
  const setMode = useFactoryStore((s) => s.setMode)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lensDrawerOpen, setLensDrawerOpen] = useState(false)

  const system = systemById(generation)
  const scenes = scenesOfSystem(generation)
  const degraded = glStatus === 'none' || glStatus === 'failed'
  const compareMode = mode === 'compare'

  // 首次进入（或换代际后还没选过任何一站）自动落到第一站，保证移动端一进来就有画面
  // 可看，而不是空的集群总览——但深链已经显式定了 focus/level 时不要覆盖它：
  // `focusPath.length <= 1` 就是「还停在系统根」这个判据（见 initialDrillState）。
  //
  // ★ 切面模式必须最先挡（W-B 交接明确指出的坑）：`setLensChapter` 已经把下钻状态、
  //   代际、平面、模式一次原子落地（见 `store.lensChapterPatch`），这条 effect 只是给
  //   「还没选过任何一站」的探索/导览态兜底，两套自动纠正逻辑不能共用同一份判据。
  //   集群级章节的 `focusAssemblyId` 常常就是 facility 根（甚至是 null，如「RAG 与 L4」
  //   纯叙事章），换代后 `focusPath.length` 可能 ≤ 1，会被下面那条判据放过——没有这条
  //   lens 守卫的话，`applyScene(first)` 会把 `mode` 强制打回 'tour'，覆盖掉刚落地的切面状态。
  useEffect(() => {
    if (mode === 'lens') return
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

  // 领域切面派生值：`activeChapter` 为 null 有两种情况——mode 还不是 'lens'，
  // 或换代打断了章节 pin（`lens.chapterIdx === -1` 的显式空态，同桌面
  // `LensChapterPanel` 的空态判断，唯一出处仍是 `lib/lens.ts` 的 `activeLensChapter`）。
  const lensModeActive = mode === 'lens'
  const activeLensId = lensId ?? DEFAULT_LENS_ID
  const activeLens = lensById(activeLensId)
  const activeChapter = activeLensChapter(mode, { lensId, chapterIdx: lensChapterIdx })
  const chapterTotal = lensChapterCount(activeLensId)

  return (
    <div
      className="flex h-full flex-col"
      data-mobile-view="1"
      data-generation={generation}
      data-focus-id={focusId ?? ''}
    >
      {/* ── 精简面包屑 + 紧凑代际选择器 ── */}
      <header className="shrink-0 border-b border-line bg-panel px-3 py-2">
        {/*
          代际切换在窄屏用 <select> 而不是桌面那排按钮：内容包已经有四个系统，
          四个按钮（每个还带状态徽章）在 390px 下必然横向溢出。<select> 是原生的
          紧凑控件，选项再多也只占一行，且 `min-w-0` + `flex-1` 保证它自己会收缩
          而不是把整行撑宽。
        */}
        <div className="flex items-center gap-2 pb-1.5">
          <label className="sr-only" htmlFor="mobile-generation-select">
            代际
          </label>
          <select
            id="mobile-generation-select"
            data-mobile-gen-select="1"
            value={generation}
            onChange={(e) => setGeneration(e.target.value)}
            className="min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-1.5 py-1 text-sm font-semibold"
          >
            {FACTORY_PACK.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {system ? <StatusChip status={system.status} /> : null}
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

      {/*
        ── 切面入口行（v1.6 W-D）──
        lens 未激活：只有两个入口按钮（网络/存储），点了就 `setLens` 续读上次章节。
        lens 已激活：同一排按钮兼任「当前切面切换」（点另一条切面立即换过去），
        右边多一个「退出」把 mode 打回 'explore'。
      */}
      <div
        className="flex shrink-0 items-center gap-1.5 border-b border-line bg-panel px-3 py-1.5"
        data-mobile-lens-entry="1"
      >
        {FACTORY_PACK.lenses.map((lens) => {
          const active = lensModeActive && activeLensId === lens.id
          return (
            <button
              key={lens.id}
              type="button"
              data-mobile-lens-tab={lens.id}
              aria-pressed={active}
              onClick={() => setLens(lens.id)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                active
                  ? 'border-accent bg-accent/10 font-medium text-accent'
                  : 'border-line text-dim hover:border-accent/50 hover:text-fg'
              }`}
            >
              {lens.title.split('：')[0] ?? lens.id}
            </button>
          )
        })}
        {lensModeActive ? (
          <button
            type="button"
            data-mobile-lens-exit="1"
            onClick={() => setMode('explore')}
            className="ml-auto rounded-md border border-line px-2 py-1 text-xs text-dim hover:border-accent/50 hover:text-fg"
          >
            退出
          </button>
        ) : null}
      </div>

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

          {lensModeActive ? (
            <>
              {/* ── 切面：上一章 / 下一章 + 章标题 + 代际徽章（复用 data-lens-prev/next 语义）── */}
              <div
                className="shrink-0 border-b border-line bg-panel px-3 py-2"
                data-lens-chapter-nav={activeChapter?.id ?? ''}
              >
                {activeChapter === null ? (
                  <p className="text-xs text-dim" data-lens-chapter-empty="1">
                    本章视角已失效（手动换代打断了切面 pin 的代际）。从下面的章节列表点一章继续，
                    3D 会跟着切回它 pin 的那一代。
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-lens-prev={lensChapterIdx - 1}
                        aria-label="上一章"
                        disabled={lensChapterIdx <= 0}
                        onClick={() => setLensChapter(lensChapterIdx - 1)}
                        className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ◀ 上一章
                      </button>
                      <span className="text-[11px] text-dim">
                        第 {lensChapterIdx + 1} / {chapterTotal} 章
                      </span>
                      <button
                        type="button"
                        data-lens-next={lensChapterIdx + 1}
                        aria-label="下一章"
                        disabled={lensChapterIdx >= chapterTotal - 1}
                        onClick={() => setLensChapter(lensChapterIdx + 1)}
                        className="ml-auto rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        下一章 ▶
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <MetaChip title="本章 pin 的代际（3D 已同步切换）">
                        {shortSystemNameOf(activeChapter.systemId)}
                      </MetaChip>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{activeChapter.title}</p>
                    </div>
                  </>
                )}
              </div>

              {/* ── 章节列表：本切面全部章节，点击 = setLensChapter ── */}
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" data-lens-chapter-list="1">
                <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">
                  {activeLens ? activeLens.title.split('：')[0] : '领域切面'} · 章节
                </h2>
                {activeLens ? (
                  <ol className="mt-2 space-y-1.5">
                    {activeLens.chapters.map((c, i) => {
                      const active = activeChapter !== null && i === lensChapterIdx
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            data-lens-chapter={c.id}
                            data-lens-chapter-active={active ? '1' : '0'}
                            onClick={() => setLensChapter(i)}
                            className={`flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                              active
                                ? 'border-accent bg-accent/10'
                                : 'border-line bg-panel hover:border-accent/50'
                            }`}
                          >
                            <span className="shrink-0 font-mono text-[11px] text-dim">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                ) : null}

                <button
                  type="button"
                  data-lens-open-chapter="1"
                  disabled={activeChapter === null}
                  onClick={() => setLensDrawerOpen(true)}
                  className="mt-3 w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-center text-sm font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  本章内容 ▸
                </button>
              </div>
            </>
          ) : (
            <>
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
                        <p className="mt-0.5 text-xs leading-relaxed text-dim">
                          <RichText text={activeScene.narration} />
                        </p>
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
        </>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="部件详情" side="bottom">
        {detailId ? <DetailPanel /> : <p className="p-4 text-sm text-dim">未选中任何部件。</p>}
      </Drawer>

      {/* 本章内容抽屉：内嵌桌面版 LensChapterPanel——因果链/关键数字/计算器整块复用，
          计算器随 W-C 接入即可用（`data-lens-calc`/`data-lens-calc-out` 锚点原样带过来），
          这里不必单独处理。 */}
      <Drawer open={lensDrawerOpen} onClose={() => setLensDrawerOpen(false)} title="本章内容" side="bottom">
        <LensChapterPanel />
      </Drawer>
    </div>
  )
}

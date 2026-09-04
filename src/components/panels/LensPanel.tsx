/**
 * 左栏（切面模式）：切面切换 + 章节列表 + 偏离提示 + 六平面开关。
 *
 * 与 `TourPanel` 是**同一套体例**（`<ol>` 条目 + 当前项自动滚入可视区 + 下方 PlaneToggles），
 * 因为对用户来说这两条都是「按顺序读一遍」的学习路径，只是纵向（下钻）与横向（切面）之分。
 * 刻意不复用同一个组件：条目副行、偏离提示、退出入口三处都不同，抽公共壳只会让两边
 * 互相绑架。
 *
 * ★ 章节副行必须显示**代际**：切面章节可以跨代（网络切面第 3 章在 Vera Rubin、
 *   第 6 章在 HGX B300），点进去 3D 会换一整台机器——不写出来的话用户会以为界面乱跳。
 *
 * ★ 偏离提示（`isChapterStateDirty`）：切面章节把「层级 + 焦点 + 平面」摆成一个特定视角，
 *   而用户随时可以自己下钻或改开关。偏离后给一个**幂等**的「↺ 恢复」（重放同一个
 *   `setLensChapter`），而不是禁止用户操作。
 */

import { useCallback } from 'react'
import { FACTORY_PACK, lensById } from '../../data'
import { LEVEL_LABEL } from '../../lib/drill'
import {
  DEFAULT_LENS_ID,
  activeLensChapter,
  isChapterStateDirty,
  shortSystemNameOf,
} from '../../lib/lens'
import { useFactoryStore } from '../../store'
import RichText from '../ui/RichText'
import SegmentedTabs from '../ui/SegmentedTabs'
import PlaneToggles from './PlaneToggles'

/** 切面标签取标题的冒号前半段（「网络切面：六张网如何喂出 token」→「网络切面」）。 */
const LENS_TABS = FACTORY_PACK.lenses.map((lens) => ({
  id: lens.id,
  label: lens.title.split('：')[0] ?? lens.id,
}))

export default function LensPanel() {
  const mode = useFactoryStore((s) => s.mode)
  const lensId = useFactoryStore((s) => s.lens.lensId)
  const chapterIdx = useFactoryStore((s) => s.lens.chapterIdx)
  const level = useFactoryStore((s) => s.level)
  const focusPath = useFactoryStore((s) => s.focusPath)
  const planes = useFactoryStore((s) => s.planes)
  const setLens = useFactoryStore((s) => s.setLens)
  const setLensChapter = useFactoryStore((s) => s.setLensChapter)
  const setMode = useFactoryStore((s) => s.setMode)

  /** 当前站的条目一挂载就滚进可视区（同 TourPanel：深链可以直接落到第 6 章）。 */
  const focusActive = useCallback((el: HTMLLIElement | null) => {
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ block: 'nearest' })
  }, [])

  // lensId 为空只可能出现在「mode 被直接置成 lens 却没选切面」的边角场合：
  // 列出默认切面的章节，点任意一章即可正常进入（setLensChapter 有同样的兜底）。
  const activeLensId = lensId ?? DEFAULT_LENS_ID
  const lens = lensById(activeLensId)
  const chapter = activeLensChapter(mode, { lensId, chapterIdx })
  const dirty = chapter !== null && isChapterStateDirty(chapter, { level, focusPath, planes })

  if (!lens) return null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="border-b border-line px-3 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">领域切面</h2>
          <button
            type="button"
            data-lens-exit="1"
            onClick={() => setMode('explore')}
            className="text-[11px] text-dim hover:text-accent"
          >
            退出切面
          </button>
        </div>

        <div className="mt-2" data-lens={lens.id}>
          <SegmentedTabs tabs={LENS_TABS} value={lens.id} onChange={(id) => setLens(id)} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          <RichText text={lens.summary} />
        </p>

        <ol className="mt-2.5 space-y-1.5">
          {lens.chapters.map((c, i) => {
            const active = chapter !== null && i === chapterIdx
            return (
              <li key={c.id} ref={active ? focusActive : undefined}>
                <button
                  type="button"
                  // 深链（`?lens=&chapter=`）落到哪一章，E2E 与手册截图都靠这两个锚点核对。
                  data-lens-chapter={c.id}
                  data-lens-chapter-active={active ? '1' : '0'}
                  onClick={() => setLensChapter(i)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    active ? 'border-accent bg-accent/10' : 'border-line bg-panel-2 hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-dim">{i + 1}</span>
                    <span className="text-sm leading-snug font-medium">{c.title}</span>
                  </div>
                  <span className="mt-0.5 block text-[11px] text-dim">
                    {LEVEL_LABEL[c.lodLevel]}级 · {shortSystemNameOf(c.systemId)} · {c.planes.length}{' '}
                    个平面
                  </span>
                </button>
                {active && dirty ? (
                  <button
                    type="button"
                    data-lens-restore={c.id}
                    // 幂等：重放同一个 setLensChapter，把层级/焦点/平面一次拉回本章视角。
                    onClick={() => setLensChapter(i)}
                    className="mt-1 w-full rounded-md border border-warn/35 bg-warn/10 px-2 py-1 text-left text-[11px] text-warn hover:bg-warn/20"
                  >
                    已偏离本章视角 · ↺ 恢复
                  </button>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      <PlaneToggles />
    </div>
  )
}

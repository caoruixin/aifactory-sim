/**
 * 右栏（切面模式）：一章的完整内容。
 *
 * 版面顺序即讲解顺序：
 *   章头（第 i/N 章 + 代际徽章 + 上/下章）
 *   → narration（三段式：看到什么 / 谁连谁 + 关键数字 / 没有这层会怎样）
 *   → **因果链**（本板块的核心：硬件 → serving 技术 → 推理环节 · 业务指标）
 *   → 关键数字（走 `ClaimRow`，证据徽章全套）
 *   → 计算器（W-C 接入）
 *   → 代际对照跳转 → 售前提示
 *
 * ★ 因果链的每一行是一张**纵向卡**而不是节点图：一行自含「什么硬件 → 支撑什么技术 →
 *   带来什么效果」，正好对应售前的心智模型，380px 宽也放得下。
 * ★ 硬件 chip 复用既有的两条通道：hover → `store.hover`（3D 里那件亮一下）、
 *   click → `store.select` + 右侧 Drawer 内嵌 `DetailPanel`（不移动相机——这是「顺手看一眼
 *   这是什么」，不是导航动作，与 FlowBar 的「本步涉及」chip 同一个决定）。
 * ★ 技术 chip 展开的是**注册表原文**（`techniqueById`），不在这里复述——技术卡跨章节复用，
 *   一份数据只能有一个渲染出处。
 */

import { useState } from 'react'
import { assemblyById, techniqueById } from '../../data'
import type { ChainLink, LensChapter } from '../../data/types'
import { FLOW_PHASE_LABEL } from '../../lib/flowTimeline'
import {
  DEFAULT_LENS_ID,
  TECHNIQUE_CATEGORY_LABEL,
  activeLensChapter,
  chainHardwareRefs,
  lensChapterCount,
  locateChapter,
  shortSystemNameOf,
} from '../../lib/lens'
import { METRIC_HINT, METRIC_LABEL } from '../../lib/metricLabel'
import { useFactoryStore } from '../../store'
import ClaimRow from '../ui/ClaimRow'
import { MetaChip, StatusChip } from '../ui/Chips'
import Drawer from '../ui/Drawer'
import RichText from '../ui/RichText'
import Section from '../ui/Section'
import DetailPanel from './DetailPanel'

export default function LensChapterPanel() {
  const mode = useFactoryStore((s) => s.mode)
  const lensId = useFactoryStore((s) => s.lens.lensId)
  const chapterIdx = useFactoryStore((s) => s.lens.chapterIdx)
  const generation = useFactoryStore((s) => s.generation)

  const chapter = activeLensChapter(mode, { lensId, chapterIdx })

  if (!chapter) {
    return (
      <div data-lens-chapter-empty="1" className="p-4 text-sm leading-relaxed text-dim">
        <h2 className="text-xs font-semibold tracking-widest text-dim uppercase">切面章节</h2>
        <p className="mt-3">
          当前代际是 <strong className="font-medium text-fg">{shortSystemNameOf(generation)}</strong>
          ，本章视角已失效（章节自带代际，手动换代等于离开这一章）。
        </p>
        <p className="mt-2">从左栏点任意一章继续——3D 会跟着章节切回它 pin 的那一代。</p>
      </div>
    )
  }

  // key：换章时把「展开的技术卡 / 打开的详情抽屉」这类局部 UI 状态一并重置。
  return (
    <ChapterBody
      key={chapter.id}
      chapter={chapter}
      index={chapterIdx}
      total={lensChapterCount(lensId ?? DEFAULT_LENS_ID)}
    />
  )
}

function ChapterBody({
  chapter,
  index,
  total,
}: {
  chapter: LensChapter
  index: number
  total: number
}) {
  const setLens = useFactoryStore((s) => s.setLens)
  const setLensChapter = useFactoryStore((s) => s.setLensChapter)
  const [detailOpen, setDetailOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col" data-lens-chapter-panel={chapter.id}>
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <MetaChip title="本切面内的章节序号">
            第 {index + 1}/{total} 章
          </MetaChip>
          {/* 代际徽章：章节 pin 死代际，3D 与顶栏都已经跟着切过去了 */}
          <MetaChip title="本章 pin 的代际（3D 已同步切换）">
            {shortSystemNameOf(chapter.systemId)}
          </MetaChip>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              data-lens-prev={index - 1}
              aria-label="上一章"
              disabled={index <= 0}
              onClick={() => setLensChapter(index - 1)}
              className="rounded-md border border-line px-2 py-1 text-xs hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ◀
            </button>
            <button
              type="button"
              data-lens-next={index + 1}
              aria-label="下一章"
              disabled={index >= total - 1}
              onClick={() => setLensChapter(index + 1)}
              className="rounded-md border border-line px-2 py-1 text-xs hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ▶
            </button>
          </div>
        </div>
        <h2 className="mt-2 text-base leading-snug font-semibold">{chapter.title}</h2>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <p className="text-sm leading-relaxed">
          <RichText text={chapter.narration} />
        </p>

        <Section title="因果链：硬件 → 技术 → 环节 · 指标">
          <ol className="space-y-2">
            {chapter.chain.map((link) => (
              <ChainCard key={link.id} chapter={chapter} link={link} onInspect={() => setDetailOpen(true)} />
            ))}
          </ol>
        </Section>

        {chapter.keyFigures.length > 0 ? (
          <Section title="关键数字">
            <dl className="divide-y divide-line rounded-md border border-line">
              {chapter.keyFigures.map((fig) => (
                <ClaimRow key={fig.key} name={fig.label} claim={fig.claim} />
              ))}
            </dl>
          </Section>
        ) : null}

        {chapter.calculatorId ? (
          <Section title="动手算一算">
            {/* W-C 会用真正的计算器替换这个容器；锚点与 id 现在就固定下来，
                这样移动端与 E2E 不必等计算器落地才能定位。 */}
            <div
              data-lens-calc={chapter.calculatorId}
              className="rounded-lg border border-dashed border-line bg-panel-2 px-2.5 py-2 text-[11px] text-dim"
            >
              计算器（W-C 接入）
            </div>
          </Section>
        ) : null}

        {chapter.crossRefs.length > 0 ? (
          <Section title="代际对照">
            <ul className="space-y-1 text-xs">
              {chapter.crossRefs.map((ref) => {
                const loc = locateChapter(ref.chapterId)
                if (!loc) return null
                return (
                  <li key={ref.chapterId}>
                    <button
                      type="button"
                      data-lens-crossref={ref.chapterId}
                      // 一次落地：跳转自带换代（章节 pin 了代际），走同一个原子 action。
                      onClick={() => setLens(loc.lensId, loc.chapterIdx)}
                      className="text-left text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      {ref.label} →
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>
        ) : null}

        {chapter.presalesNote ? (
          <div className="rounded-lg border border-warn/30 bg-warn/10 p-3">
            <h3 className="text-[11px] font-semibold tracking-widest text-warn uppercase">
              售前怎么解释
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed">
              <RichText text={chapter.presalesNote} />
            </p>
          </div>
        ) : null}
      </div>

      {/* 部件详情走右侧抽屉：右栏此刻被章节内容占着，但「点了硬件 chip 要能看到那件东西」
          是既有的交互承诺（详情面板本身零改动，原样内嵌）。 */}
      <Drawer open={detailOpen} onClose={() => setDetailOpen(false)} title="部件详情" side="right">
        <DetailPanel />
      </Drawer>
    </div>
  )
}

/** 因果链一行：硬件 chips ↓ 技术 chip ↓ 环节 · 指标 chips + 叙述。 */
function ChainCard({
  chapter,
  link,
  onInspect,
}: {
  chapter: LensChapter
  link: ChainLink
  onInspect: () => void
}) {
  const select = useFactoryStore((s) => s.select)
  const hover = useFactoryStore((s) => s.hover)
  const [expanded, setExpanded] = useState(false)

  const hardware = chainHardwareRefs(chapter, link)
  const technique = link.techniqueId ? techniqueById(link.techniqueId) : undefined

  return (
    <li data-causal-node={link.id} className="rounded-lg border border-line bg-panel-2 p-2.5">
      {/* ── 硬件 ── */}
      <div data-causal-tier="hardware" className="flex flex-wrap items-center gap-1">
        {hardware.length === 0 ? (
          <span className="text-[11px] text-dim">不经硬件 · 这一层不在机架里</span>
        ) : (
          hardware.map((ref) =>
            ref.assemblyId ? (
              <button
                key={ref.roleKey}
                type="button"
                data-causal-hardware={ref.assemblyId}
                title="选中该部件并打开详情（相机不动）"
                onMouseEnter={() => hover(ref.assemblyId)}
                onMouseLeave={() => hover(null)}
                onClick={() => {
                  select(ref.assemblyId)
                  onInspect()
                }}
                className="cursor-pointer rounded-full border border-accent/40 bg-accent/10 px-1.5 py-px text-[11px] text-accent hover:border-accent hover:bg-accent/20"
              >
                {/* 查不到时退回 ID——不编名字，也不静默隐藏 */}
                {assemblyById(ref.assemblyId)?.label ?? ref.assemblyId}
              </button>
            ) : (
              // 角色在本章代际里没有对应节点：如实显示角色键，不静默吞掉。
              <span
                key={ref.roleKey}
                className="rounded-full border border-line bg-panel px-1.5 py-px font-mono text-[11px] text-dim"
              >
                {ref.roleKey}
              </span>
            ),
          )
        )}
      </div>

      <Arrow />

      {/* ── 技术 ── */}
      <div data-causal-tier="technique">
        {technique ? (
          <button
            type="button"
            data-causal-technique={technique.id}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="cursor-pointer rounded-full border border-accent-2/40 bg-accent-2/10 px-1.5 py-px text-[11px] text-accent-2 hover:border-accent-2 hover:bg-accent-2/20"
          >
            {technique.name} {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="text-[11px] text-dim">硬件直达指标 · 中间没有 serving 技术</span>
        )}
      </div>

      <Arrow />

      {/* ── 环节 · 指标 ── */}
      <div data-causal-tier="outcome" className="flex flex-wrap items-center gap-1">
        {link.phases.map((phase) => (
          <span
            key={phase}
            className="rounded border border-line bg-panel px-1.5 py-px text-[11px] text-dim"
          >
            {FLOW_PHASE_LABEL[phase]}
          </span>
        ))}
        {link.metrics.map((metric) => (
          <span
            key={metric}
            title={METRIC_HINT[metric]}
            data-causal-metric={metric}
            className="rounded border border-line bg-panel px-1.5 py-px text-[11px] font-medium text-fg"
          >
            {METRIC_LABEL[metric]}
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed">
        <RichText text={link.narrative} />
      </p>

      {expanded && technique ? (
        <div
          data-causal-expanded={technique.id}
          className="mt-2 rounded-md border border-accent-2/30 bg-panel p-2.5"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{technique.name}</span>
            <StatusChip status={technique.status} />
            <MetaChip title="技术类别">{TECHNIQUE_CATEGORY_LABEL[technique.category]}</MetaChip>
            <span className="text-[11px] text-dim">{technique.vendor}</span>
          </div>
          {technique.fullName ? (
            <p className="mt-0.5 text-[11px] text-dim">{technique.fullName}</p>
          ) : null}
          <p className="mt-1.5 text-xs leading-relaxed">
            <RichText text={technique.summary} />
          </p>
          <p className="mt-1.5 rounded-md border border-warn/30 bg-warn/10 px-2 py-1.5 text-[11px] leading-relaxed">
            <span className="font-semibold text-warn">售前怎么解释：</span>
            <RichText text={technique.presalesNote} />
          </p>
          {technique.figures.length > 0 ? (
            <dl className="mt-2 divide-y divide-line rounded-md border border-line">
              {technique.figures.map((fig) => (
                <ClaimRow key={fig.key} name={fig.label} claim={fig.claim} />
              ))}
            </dl>
          ) : null}
          {technique.docUrl ? (
            <a
              href={technique.docUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-[11px] text-accent underline"
            >
              官方文档 ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function Arrow() {
  return (
    <span aria-hidden className="my-0.5 block text-[11px] leading-none text-dim">
      ↓
    </span>
  )
}

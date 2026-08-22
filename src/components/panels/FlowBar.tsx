/**
 * 底部步骤条：推理数据流播放控件。
 *
 * 步骤态参考 llms-study `LifecycleSim` 的三态模式（active/done/pending），但这里不依赖
 * framer-motion——footer 高度有限，纯 CSS 过渡足够。
 *
 * - 播放/暂停/上一步/下一步/速度(0.5/1/2) 都只写 `store.flow`，真正驱动播放进度的是
 *   3D 侧的 `FlowLayer`（`useFrame` 里推进并粗粒度回写 `stepIdx`）——这里只读不驱动，
 *   保证 FlowBar 在 `?gl=off` 降级路径下也能挂载而不报错（虽然此时不会自动前进，
 *   手动点步骤依然可用）。
 * - t0/t1 用 `flowTimeline.ts` 算，不需要真的路由结果（传空 Map 即可，t0/t1 只看
 *   `durationHint`），因此 FlowBar 完全不用知道当前 3D 深度/摆位。
 * - `reducedMotion` 时给一行提示：没有移动的粒子是预期行为，不是 bug。
 */

import { FACTORY_PACK } from '../../data'
import { buildTimeline, FLOW_PHASE_LABEL } from '../../lib/flowTimeline'
import { useFactoryStore } from '../../store'

const EMPTY_ROUTES = new Map<string, never>()
const SPEEDS = [0.5, 1, 2] as const

export default function FlowBar() {
  const flow = useFactoryStore((s) => s.flow)
  const setFlow = useFactoryStore((s) => s.setFlow)
  const reducedMotion = useFactoryStore((s) => s.reducedMotion)

  const episode = FACTORY_PACK.flows[flow.episodeIdx]

  if (!episode || episode.steps.length === 0) {
    return (
      <footer className="border-t border-line bg-panel px-4 py-2 text-xs text-dim">
        内容包中暂无可播放的推理数据流剧本。
      </footer>
    )
  }

  const segments = buildTimeline(episode, EMPTY_ROUTES)
  const stepIdx = Math.min(Math.max(flow.stepIdx, 0), segments.length - 1)
  const current = segments[stepIdx]!

  const goTo = (idx: number) => setFlow({ stepIdx: Math.min(Math.max(idx, 0), segments.length - 1) })
  const togglePlay = () => setFlow({ playing: !flow.playing })

  return (
    <footer className="border-t border-line bg-panel">
      {/* 播放控制行 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-1.5 text-xs">
        <span className="rounded border border-line bg-panel-2 px-1.5 py-px text-[11px] font-medium">
          推理数据流
        </span>
        <span className="max-w-[22rem] truncate text-dim" title={episode.title}>
          {episode.title}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goTo(stepIdx - 1)}
            disabled={stepIdx === 0}
            className="rounded-md border border-line px-2 py-1 hover:border-accent/50 disabled:opacity-30"
            aria-label="上一步"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="min-w-16 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-medium text-accent hover:bg-accent/20"
          >
            {flow.playing ? '暂停' : '▶ 播放'}
          </button>
          <button
            type="button"
            onClick={() => goTo(stepIdx + 1)}
            disabled={stepIdx === segments.length - 1}
            className="rounded-md border border-line px-2 py-1 hover:border-accent/50 disabled:opacity-30"
            aria-label="下一步"
          >
            ▶
          </button>

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <span className="text-dim">速度</span>
          {SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFlow({ speed: v })}
              className={`rounded-md border px-1.5 py-1 font-mono ${
                flow.speed === v
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-dim hover:border-accent/50'
              }`}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>

      {reducedMotion ? (
        <p className="border-b border-line bg-panel-2 px-4 py-1 text-[11px] text-dim">
          已开启减少动态效果：数据流不显示移动粒子，改为逐步高亮当前步骤引用的连接。
        </p>
      ) : null}

      {/* 步骤条 */}
      <ol className="scrollbar-thin flex items-stretch gap-1 overflow-x-auto px-4 py-2">
        {segments.map((seg, i) => {
          const state = i === stepIdx ? 'active' : i < stepIdx ? 'done' : 'pending'
          return (
            <li key={seg.stepId} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                className={`flex h-full min-w-28 flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  state === 'active'
                    ? 'border-accent bg-accent/10'
                    : state === 'done'
                      ? 'border-ok/35 bg-ok/5'
                      : 'border-line bg-panel-2 opacity-70 hover:opacity-100'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px]">
                  <span className={state === 'done' ? 'text-ok' : state === 'active' ? 'text-accent' : 'text-dim'}>
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span className="font-mono text-dim">{FLOW_PHASE_LABEL[seg.phase]}</span>
                </span>
                <span className="text-xs leading-snug font-medium">{seg.label}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* 当前步骤详情 */}
      <div className="border-t border-line px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-line bg-panel-2 px-1.5 py-px text-[11px] text-dim">
            {FLOW_PHASE_LABEL[current.phase]}
          </span>
          <span
            className={`rounded border px-1.5 py-px text-[11px] font-medium ${
              current.logicalOnly
                ? 'border-accent-2/35 bg-accent-2/10 text-accent-2'
                : 'border-ok/35 bg-ok/10 text-ok'
            }`}
            title={current.logicalOnly ? '纯逻辑层步骤，没有对应的物理链路' : '有对应物理链路，六平面连线会点亮'}
          >
            {current.logicalOnly ? '逻辑层' : '物理层'}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed">{current.description}</p>
        {current.presalesNote ? (
          <p className="mt-1.5 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11px] leading-relaxed">
            <span className="font-semibold text-warn">售前怎么解释：</span>
            {current.presalesNote}
          </p>
        ) : null}
      </div>
    </footer>
  )
}

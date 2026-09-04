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
 *
 * ★ **底栏高度必须恒定**（v1.1 C2）：当前步骤卡以前随文案长短伸缩，切一次步骤就改变
 *   一次画布尺寸 → `CameraRig` 的 resize 效果重放 → 用户手动调好的视角被打回默认机位。
 *   C1 已经从相机侧堵死了这条路，这里再从源头消除抖动：详情区固定行高 + 内部滚动，
 *   步骤切换不再改变 `<canvas>` 的高度（E2E 有一条断言直接钉住这一点）。
 *
 * ★ 「本步涉及」chips（v1.1 B2）来自纯函数 `flowStepFocus(episode, stepIdx, depth)` 的
 *   `chipIds`（**精确**装配 ID，不折叠——点进去要看到 HBM 本身而不是它所在的托盘）。
 *   点击 = 选中 + 把右栏切到「部件详情」tab；**相机不动**（这是「顺手看一眼这是什么」，
 *   不是导航动作）。tab 是 `FactoryPage` 的本地 state，所以切换动作由它下传。
 */

import { assemblyById, episodeOf, systemById } from '../../data'
import { buildTimeline, FLOW_PHASE_LABEL, flowStepFocus } from '../../lib/flowTimeline'
import { useFactoryStore } from '../../store'
import RichText from '../ui/RichText'

const EMPTY_ROUTES = new Map<string, never>()
const SPEEDS = [0.5, 1, 2] as const

export interface FlowBarProps {
  /**
   * 点击「本步涉及」chip 时调用（选中该装配节点 + 把右栏切到部件详情）。
   * 省略则只做选中——降级/移动路径下右栏 tab 不由这里管。
   */
  onInspectAssembly?: (assemblyId: string) => void
}

export default function FlowBar({ onInspectAssembly }: FlowBarProps = {}) {
  const flow = useFactoryStore((s) => s.flow)
  const setFlow = useFactoryStore((s) => s.setFlow)
  const select = useFactoryStore((s) => s.select)
  const reducedMotion = useFactoryStore((s) => s.reducedMotion)
  const generation = useFactoryStore((s) => s.generation)

  // 剧本按当前代际取：内容包里只有 GB300 有推理数据流剧本，
  // 切到 Vera Rubin / Rubin Ultra 时如实说明「这一代还没有剧本」，
  // 而不是拿上一代的步骤文案配着另一代的画面播（那会讲错架构）。
  const episode = episodeOf(generation, flow.episodeIdx)

  if (!episode || episode.steps.length === 0) {
    return (
      <footer className="border-t border-line bg-panel px-4 py-2 text-xs text-dim">
        {systemById(generation)?.name ?? generation} 这一代暂无推理数据流剧本
        （目前只为 GB300 NVL72 编写了完整剧本）。切回 GB300 即可播放。
      </footer>
    )
  }

  const segments = buildTimeline(episode, EMPTY_ROUTES)
  const stepIdx = Math.min(Math.max(flow.stepIdx, 0), segments.length - 1)
  const current = segments[stepIdx]!

  // chipIds 与渲染深度无关（深度只影响 3D 侧的 sceneHighlightIds），
  // 因此这里固定传最深一级——FlowBar 完全不需要知道当前钻到了哪一层。
  const chipIds = flowStepFocus(episode, stepIdx, 'board').chipIds

  const goTo = (idx: number) => setFlow({ stepIdx: Math.min(Math.max(idx, 0), segments.length - 1) })
  const togglePlay = () => setFlow({ playing: !flow.playing })
  const inspect = (assemblyId: string) => {
    select(assemblyId)
    onInspectAssembly?.(assemblyId)
  }

  return (
    <footer
      className="border-t border-line bg-panel"
      data-flow-step={stepIdx}
      data-flow-total={segments.length}
      data-flow-playing={flow.playing ? '1' : '0'}
    >
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
                data-flow-step-button={i}
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

      {/* 当前步骤详情。★ 固定高度 + 内部滚动：见文件头 C2 注释 —— 这一块以前随文案
          长短伸缩，切一次步骤就抖一次画布高度，正是相机被没收的诱因。 */}
      <div
        data-flow-detail
        className="scrollbar-thin h-[8.5rem] overflow-y-auto border-t border-line px-4 py-2"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-line bg-panel-2 px-1.5 py-px text-[11px] text-dim">
            {FLOW_PHASE_LABEL[current.phase]}
          </span>
          <span
            data-flow-logical={current.logicalOnly ? '1' : '0'}
            className={`rounded border px-1.5 py-px text-[11px] font-medium ${
              current.logicalOnly
                ? 'border-accent-2/35 bg-accent-2/10 text-accent-2'
                : 'border-ok/35 bg-ok/10 text-ok'
            }`}
            title={current.logicalOnly ? '纯逻辑层步骤，没有对应的物理链路' : '有对应物理链路，六平面连线会点亮'}
          >
            {current.logicalOnly ? '逻辑层' : '物理层'}
          </span>

          {/* 本步涉及的硬件：把「这一步在讲什么」和「屏幕上哪个盒子亮了」对上号 */}
          {chipIds.length > 0 ? (
            <span data-flow-chips className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-dim">本步涉及</span>
              {chipIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-flow-chip={id}
                  onClick={() => inspect(id)}
                  title="选中该部件并打开右栏详情（不移动相机）"
                  className="cursor-pointer rounded-full border border-accent-2/40 bg-accent-2/10 px-1.5 py-px text-[11px] text-accent-2 hover:border-accent-2 hover:bg-accent-2/20"
                >
                  {assemblyById(id)?.label ?? id}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed">
          <RichText text={current.description} />
        </p>
        {current.presalesNote ? (
          <p className="mt-1.5 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11px] leading-relaxed">
            <span className="font-semibold text-warn">售前怎么解释：</span>
            <RichText text={current.presalesNote} />
          </p>
        ) : null}
      </div>
    </footer>
  )
}

/**
 * 完整 2D 降级视图：WebGL 不可用（探测失败 / `?gl=off` / 运行期 context lost）时
 * 中央格的替代品。三个 tab 对应 3D 的三种读图方式：
 *
 *   结构图   —— 复用 `/report` 的 `RackElevationSvg`（机架立面），比较模式下并排双立面；
 *   组件树   —— B2 起就有的 `ComponentTree`（原地复用，不再是「最小降级」的唯一形态）；
 *   连接列表 —— 新写的 `ConnectionListTable`，按 `store.planes` 过滤，色点与 3D 同源。
 *
 * 数据流播放在这里没有粒子：当前步骤引用的连接在连接列表里整行高亮，
 * 引用的装配节点（含 `highlightAssemblyIds`，例如「权重常驻 HBM」这类没有连接、
 * 只点亮部件本身的步骤）在结构图里对应档位描边强调——策略与 3D `FlowLayer`/
 * `ConnectionLayer` 一致，只是把「移动的粒子」换成了「静态强调」。
 */

import { useMemo, useState } from 'react'
import { connectionById, episodeOf } from '../../data'
import { emphasizedConnectionIds } from '../../lib/connectionEmphasis'
import { sceneHighlightSet } from '../../lib/sceneHighlight'
import { useFactoryStore } from '../../store'
import SegmentedTabs from '../ui/SegmentedTabs'
import ComponentTree from './ComponentTree'
import ConnectionListTable from './ConnectionListTable'
import RackElevationSvg from './RackElevationSvg'

type FallbackTab = 'structure' | 'tree' | 'connections'

const TABS: readonly { id: FallbackTab; label: string }[] = [
  { id: 'structure', label: '结构图' },
  { id: 'tree', label: '组件树' },
  { id: 'connections', label: '连接列表' },
]

export default function Fallback2D() {
  const [tab, setTab] = useState<FallbackTab>('structure')
  const generation = useFactoryStore((s) => s.generation)
  const mode = useFactoryStore((s) => s.mode)
  const compareRight = useFactoryStore((s) => s.compare.right)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const select = useFactoryStore((s) => s.select)
  const flow = useFactoryStore((s) => s.flow)
  const tourStopIdx = useFactoryStore((s) => s.tourStopIdx)
  const reducedMotion = useFactoryStore((s) => s.reducedMotion)
  // 窄订阅：切面只需要这两个标量（同 SceneRoot / ConnectionLayer 的做法）。
  const lensId = useFactoryStore((s) => s.lens.lensId)
  const lensChapterIdx = useFactoryStore((s) => s.lens.chapterIdx)

  const episode = episodeOf(generation, flow.episodeIdx)
  const step = episode?.steps[flow.stepIdx]

  /**
   * 强调集合与 3D 的 `ConnectionLayer` **共用同一个纯函数**（v1.6）：
   * 数据流当前步 vs 切面章节动线的优先级只有一处裁决，因此 `?gl=off` 下连接列表整行
   * `data-active` 的集合恒等于 3D 里被加粗的那一组——降级不是另一套逻辑。
   * `ConnectionListTable` 本身零改动。
   */
  const activeConnectionIds = useMemo(
    () =>
      emphasizedConnectionIds({
        mode,
        lens: { lensId, chapterIdx: lensChapterIdx },
        stepConnectionIds: step?.connectionIds ?? [],
        flowPlaying: flow.playing,
        reducedMotion,
        systemId: generation,
      }),
    [mode, lensId, lensChapterIdx, step, flow.playing, reducedMotion, generation],
  )

  // 结构图的高亮集合：步骤显式点亮的部件 + 它引用的每条连接的两端——
  // 与 ConnectionLayer 里「当前步骤加粗对应连接」是同一份数据源（FlowStep），
  // 只是这里额外把连接两端的装配节点也标出来，因为 SVG 立面画的是部件不是线。
  const activeAssemblyIds = useMemo(() => {
    const out = new Set<string>(step?.highlightAssemblyIds ?? [])
    for (const cid of activeConnectionIds) {
      const c = connectionById(cid)
      if (c) {
        out.add(c.fromAssemblyId)
        out.add(c.toAssemblyId)
      }
    }
    return out
  }, [activeConnectionIds, step])

  /**
   * 导览当前站（v1.3 W2）/ 切面当前章（v1.6）点名的硬件——与 3D 的 `SceneRoot`
   * **共用同一个纯函数**，于是 `?gl=off`、探测不到 WebGL、移动端降级这三条路径下
   * 导览站与切面章同样有高亮，而不是像 v1.2 那样降级视图只认数据流。
   *
   * ★ 折叠深度固定取 `'rack'`：结构图画的就是机架立面（只有带 rackU 的档位），
   *   因此把「板级件」折叠到它所在的托盘正好对上图上的粒度。集群级件
   *   （Leaf/Spine/汇聚交换层）在机架立面上本来就没有对应档位，折叠后落回自身、
   *   自然不产生标记——这是正确行为，不是漏标。
   */
  const sceneAssemblyIds = useMemo(
    () => sceneHighlightSet(mode, generation, tourStopIdx, 'rack', { lensId, chapterIdx: lensChapterIdx }),
    [mode, generation, tourStopIdx, lensId, lensChapterIdx],
  )

  const compareMode = mode === 'compare'

  return (
    <div className="flex h-full flex-col" data-fallback-2d="1">
      <div className="shrink-0 border-b border-line bg-panel px-3 py-2">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'structure' ? (
          <div className="flex flex-wrap items-start gap-6 p-4">
            <RackElevationSvg
              systemId={generation}
              selectedId={selectedId}
              highlightAssemblyIds={activeAssemblyIds}
              sceneAssemblyIds={sceneAssemblyIds}
              onSelectAssembly={select}
            />
            {compareMode ? (
              <RackElevationSvg
                systemId={compareRight}
                selectedId={selectedId}
                highlightAssemblyIds={activeAssemblyIds}
                onSelectAssembly={select}
              />
            ) : null}
          </div>
        ) : tab === 'tree' ? (
          <ComponentTree />
        ) : (
          <ConnectionListTable activeConnectionIds={activeConnectionIds} />
        )}
      </div>
    </div>
  )
}

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

  const episode = episodeOf(generation, flow.episodeIdx)
  const step = episode?.steps[flow.stepIdx]

  const activeConnectionIds = useMemo(() => new Set(step?.connectionIds ?? []), [step])

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

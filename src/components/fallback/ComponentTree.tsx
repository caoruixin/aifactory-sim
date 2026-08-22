/**
 * 最小降级视图：嵌套装配树。
 *
 * 触发条件：`?gl=off`、探测不到 WebGL、运行期 context lost、或 Canvas 抛错。
 * 交互与 3D 完全对齐——点节点 = 选中（右栏同样出详情），点「进入」= 下钻，
 * 因此即使没有 3D，这个工具的**学习价值仍然成立**。B5 会把它扩成完整 Fallback2D
 * （SVG 机架立面 / 连接表 / 行高亮流）。
 */

import { assemblyById, childrenOf, componentById, rootAssemblyOf } from '../../data'
import type { AssemblyNode } from '../../data/types'
import { LEVEL_LABEL, canDrillInto, levelOfFocus } from '../../lib/drill'
import { useFactoryStore } from '../../store'
import { MetaChip, StatusChip } from '../ui/Chips'

export default function ComponentTree() {
  const generation = useFactoryStore((s) => s.generation)
  const root = rootAssemblyOf(generation)
  if (!root) return <p className="p-4 text-sm text-dim">内容包中找不到该系统的装配树。</p>
  return (
    <div className="h-full overflow-auto px-4 py-3" data-component-tree="1">
      <TreeNode node={root} depth={0} />
    </div>
  )
}

function TreeNode({ node, depth }: { node: AssemblyNode; depth: number }) {
  const selectedId = useFactoryStore((s) => s.selectedId)
  const select = useFactoryStore((s) => s.select)
  const drillTo = useFactoryStore((s) => s.drillTo)
  const hover = useFactoryStore((s) => s.hover)
  const component = componentById(node.componentId)
  const kids = childrenOf(node.id)
  const selected = selectedId === node.id

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 14 }}>
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded border-l-2 py-1 pl-2 ${
          selected ? 'border-accent bg-accent/10' : 'border-line hover:bg-panel-2'
        }`}
      >
        <button
          type="button"
          onClick={() => select(node.id)}
          onMouseEnter={() => hover(node.id)}
          onMouseLeave={() => hover(null)}
          className="text-sm font-medium"
        >
          {node.label}
        </button>
        {node.count > 1 ? <span className="font-mono text-[11px] text-dim">×{node.count}</span> : null}
        <MetaChip>{LEVEL_LABEL[levelOfFocus(node.id)]}</MetaChip>
        {component ? <StatusChip status={component.status} /> : null}
        {node.rackU ? (
          <span className="font-mono text-[11px] text-dim">
            U{node.rackU.start}–{node.rackU.start + node.rackU.height - 1}
          </span>
        ) : null}
        {canDrillInto(node.id) ? (
          <button
            type="button"
            onClick={() => drillTo(node.id)}
            className="ml-1 text-[11px] text-accent underline"
          >
            进入
          </button>
        ) : null}
      </div>
      {kids.map((kid) => (
        <TreeNode key={kid.id} node={assemblyById(kid.id) ?? kid} depth={depth + 1} />
      ))}
    </div>
  )
}

/**
 * 右栏详情面板——本批次的核心 UI，也是这个工具「学习价值」的落点。
 *
 * 一个部件被选中后要回答六个问题：
 *   1. 它是干嘛的（summary）
 *   2. 官方怎么说（Claim 表：值 + 单位 + 证据徽章 + 状态 + 出处 + locator + asOf；
 *      value 为 null 时显示「官方未公布」，绝不编数）
 *   3. 它在哪（rack-U、父链、每机架/每集群多少个）
 *   4. 它连着谁（六平面连接，点邻居直接跳过去）
 *   5. 长什么样（实物图外链）
 *   6. **售前怎么解释**（presalesNote，参考 llms-study StackExplorer 的 interview 卡）
 */

import {
  assemblyById,
  componentById,
  connectionsOf,
  sourceById,
  totalInstances,
  ancestorsOf,
  childrenOf,
  systemById,
} from '../../data'
import type { AssemblyNode, Connection, HardwareComponent } from '../../data/types'
import { componentReuseGroups } from '../../lib/componentReuse'
import { LEVEL_LABEL, canDrillInto, levelOfFocus, rackContainerOf } from '../../lib/drill'
import { planeColor } from '../../lib/palette'
import { planeLabel } from '../../lib/planeLabel'
import { detailIdOf, useFactoryStore } from '../../store'
import { MetaChip, StatusChip } from '../ui/Chips'
// Section / ClaimRow 已提取到 ui/（v1.6 W-B）：切面章节面板要出同一套证据行，
// 就地再写一遍必然分叉。DOM 与 class 与提取前逐字相同。
import ClaimRow from '../ui/ClaimRow'
import RichText from '../ui/RichText'
import Section from '../ui/Section'

export default function DetailPanel() {
  const detailId = useFactoryStore(detailIdOf)
  const select = useFactoryStore((s) => s.select)
  const drillTo = useFactoryStore((s) => s.drillTo)
  const hover = useFactoryStore((s) => s.hover)

  const node = detailId ? assemblyById(detailId) : undefined
  const component = node ? componentById(node.componentId) : undefined

  if (!node || !component) {
    return (
      <div className="p-4 text-sm leading-relaxed text-dim">
        <h2 className="text-xs font-semibold tracking-widest text-dim uppercase">部件详情</h2>
        <p className="mt-3">
          在 3D 视图里<strong className="font-medium text-fg">单击</strong>任意部件查看它的作用、
          官方规格与连接关系；<strong className="font-medium text-fg">双击</strong>下钻一层。
        </p>
        <p className="mt-2">也可以从左栏的场景导览直接跳到某一屏。</p>
      </div>
    )
  }

  const connections = connectionsOf(node.id)
  const kids = childrenOf(node.id)
  const parent = node.parentId ? assemblyById(node.parentId) : undefined
  const drillable = canDrillInto(node.id)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── 标题 ── */}
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <MetaChip title="语义 LOD 层级">{LEVEL_LABEL[levelOfFocus(node.id)]}</MetaChip>
          <StatusChip status={component.status} />
          {node.count > 1 ? <MetaChip title="每个父实例下的数量">×{node.count}</MetaChip> : null}
        </div>
        <h2 className="mt-2 text-base leading-snug font-semibold">{node.label}</h2>
        <p className="mt-0.5 text-xs text-dim">
          {component.name} · {component.vendor}
        </p>
        {drillable ? (
          <button
            type="button"
            onClick={() => drillTo(node.id)}
            className="mt-2.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
          >
            进入 →
          </button>
        ) : null}
      </header>

      <div className="space-y-5 px-4 py-4">
        {/* ── 作用 ── */}
        <Section title="它是干嘛的">
          <p className="text-sm leading-relaxed">
            <RichText text={component.summary} />
          </p>
          {node.note ? (
            <p className="mt-2 text-xs leading-relaxed text-dim">
              <RichText text={node.note} />
            </p>
          ) : null}
        </Section>

        {/* ── 售前话术 ── */}
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-3">
          <h3 className="text-[11px] font-semibold tracking-widest text-warn uppercase">
            售前怎么解释
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed">
            <RichText text={component.presalesNote} />
          </p>
        </div>

        {/* ── 数量证据 ── */}
        {node.countClaim ? (
          <Section title="数量出处">
            <ClaimRow name="每个上级里的数量" claim={node.countClaim} />
          </Section>
        ) : null}

        {/* ── 规格表 ── */}
        <Section title="官方规格">
          {Object.keys(component.specs).length === 0 ? (
            <p className="text-xs text-dim">该组件在内容包中未登记规格项。</p>
          ) : (
            <dl className="divide-y divide-line rounded-md border border-line">
              {Object.entries(component.specs).map(([key, claim]) => (
                <ClaimRow key={key} name={key} specKey={key} claim={claim} />
              ))}
            </dl>
          )}
        </Section>

        {/* ── 物理位置 ── */}
        <Section title="物理位置">
          <Position node={node} />
        </Section>

        {/* ── 上下级 ── */}
        <Section title="上下级结构">
          <ul className="space-y-1 text-sm">
            {parent ? (
              <li>
                <span className="text-dim">上级：</span>
                <LinkButton onClick={() => select(parent.id)} onHover={hover} id={parent.id}>
                  {parent.label}
                </LinkButton>
              </li>
            ) : (
              <li className="text-dim">上级：装配树根</li>
            )}
            {kids.length > 0 ? (
              <li>
                <span className="text-dim">下级：</span>
                <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5 align-top">
                  {kids.map((k) => (
                    <LinkButton key={k.id} onClick={() => select(k.id)} onHover={hover} id={k.id}>
                      {k.label}
                      {k.count > 1 ? ` ×${k.count}` : ''}
                    </LinkButton>
                  ))}
                </span>
              </li>
            ) : (
              <li className="text-dim">下级：无（叶子件）</li>
            )}
          </ul>
        </Section>

        {/* ── 连接 ── */}
        <Section title={`相邻连接（${connections.length}）`}>
          {connections.length === 0 ? (
            <p className="text-xs text-dim">内容包中没有登记与该部件直接相连的链路。</p>
          ) : (
            <ul className="space-y-2">
              {connections.map((c) => (
                <ConnectionRow
                  key={c.id}
                  connection={c}
                  selfId={node.id}
                  onJump={(id) => select(id)}
                  onHover={hover}
                />
              ))}
            </ul>
          )}
        </Section>

        {/* ── 实物参考 ── */}
        <Section title="实物参考与出处">
          <ul className="space-y-1 text-xs">
            {component.imageUrl ? (
              <li>
                <a
                  href={component.imageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline"
                >
                  厂商页面 / 实物图 ↗
                </a>
              </li>
            ) : (
              <li className="text-dim">未收录实物图外链。</li>
            )}
            {component.sourceIds.map((sid) => (
              <SourceLine key={sid} sourceId={sid} />
            ))}
          </ul>
          <ComponentReuse component={component} selfId={node.id} onJump={select} />
        </Section>
      </div>
    </div>
  )
}

// ─────────────────────────── 子块 ───────────────────────────

function Position({ node }: { node: AssemblyNode }) {
  const rackId = rackContainerOf(node.id)
  const chain = ancestorsOf(node.id)
  const perRack = rackId ? totalInstances(node.id, rackId) : null
  const perCluster = totalInstances(node.id)

  return (
    <ul className="space-y-1 text-sm">
      <li>
        <span className="text-dim">父链：</span>
        <span className="text-xs">{chain.map((n) => n.label).join(' › ')}</span>
      </li>
      {node.rackU ? (
        <li>
          <span className="text-dim">机架 U 位：</span>
          {node.count > 1
            ? `U${node.rackU.start} – U${node.rackU.start + node.rackU.height - 1}（${node.count} 个实例连续占位，每个 ${node.rackU.height / node.count}U）`
            : `U${node.rackU.start} – U${node.rackU.start + node.rackU.height - 1}`}
          <p className="mt-0.5 text-[11px] leading-snug text-dim">
            ⚠️ NVIDIA 未公布逐 U 布局，此处为 3D 摆位示意占位。
          </p>
        </li>
      ) : null}
      {perRack !== null && rackId !== node.id ? (
        <li>
          <span className="text-dim">每机架数量：</span>
          <span className="font-mono">{perRack.toLocaleString('zh-CN')}</span>
        </li>
      ) : null}
      <li>
        <span className="text-dim">全集群数量：</span>
        <span className="font-mono">{perCluster.toLocaleString('zh-CN')}</span>
        <span className="ml-1 text-[11px] text-dim">（按装配树 count 连乘）</span>
      </li>
    </ul>
  )
}

function ConnectionRow({
  connection,
  selfId,
  onJump,
  onHover,
}: {
  connection: Connection
  selfId: string
  onJump: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const otherId =
    connection.fromAssemblyId === selfId ? connection.toAssemblyId : connection.fromAssemblyId
  const other = assemblyById(otherId)
  const outgoing = connection.fromAssemblyId === selfId

  return (
    <li className="rounded-md border border-line px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: planeColor(connection.plane) }}
        />
        {/* 显示名按代际取（lib/planeLabel.ts）：LPX 的 nvlink = C2C scale-up。
            连接自带 systemId，不必再去 store 取当前代际。 */}
        <span className="text-[11px] text-dim" data-plane={connection.plane}>
          {planeLabel(connection.systemId, connection.plane)}
        </span>
        <span className="ml-auto font-mono text-[11px] text-dim">{connection.topology}</span>
      </div>
      <div className="mt-1 text-sm">
        <span className="text-dim">{outgoing ? '→ ' : '← '}</span>
        <LinkButton onClick={() => onJump(otherId)} onHover={onHover} id={otherId}>
          {other?.label ?? otherId}
        </LinkButton>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-dim">
        {connection.protocol}
        {connection.bandwidth?.value !== null && connection.bandwidth
          ? ` · ${connection.bandwidth.value}${connection.bandwidth.unit ?? ''}`
          : ''}
        {' · '}
        {connection.medium}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed">
        <RichText text={connection.summary} />
      </p>
    </li>
  )
}

/**
 * 「同一组件还出现在」——**必须按代际分开**（v1.5 缺陷 3）。
 *
 * 出问题的现场：`shared.ts` 里的 9 个共享组件（机房 / 一次侧水路 / 机房配电 …）被 5 个
 * 系统各引用一次，装配节点的 `label` 又都叫「机房」，于是 GB300 里选中根节点时这一行
 * 会渲染出四个**完全同名**的链接；点进去 `select()` 把 `selectedId` 指到了 Vera Rubin 的
 * 节点上，右栏换成了另一棵树，而顶栏代际按钮、面包屑、3D 场景、导览面板全部仍停在 GB300
 * ——用户被静默带进一个左右不一致的状态。
 *
 * ★ 修法（三选一里选「跨代单独一行、标代际名、纯文字不可点」），理由：
 * 1. **不可能再产生自相矛盾的画面**——跨代那一行根本不改任何状态，这是结构上的保证，
 *    而不是「记得同时改 generation」这种要靠人守的约定。
 * 2. **换代在本项目里是一个有明确重置语义的显式动作**（`store.setGeneration` 会重置
 *    focusPath / selectedId / tourStopIdx / flow，并给比较模式重挑右侧）。把这么重的一次
 *    状态重置藏在「实物参考与出处」末尾一个 11px 的脚注链接后面，点击代价远超它的外观。
 *    顶栏那排代际按钮才是换代的正确入口，用户仍然两步就能过去。
 * 3. **信息一条都没少**：共享组件跨代复用本身就是教学内容（同一个机房/水路服务五代），
 *    列出代际名比列出四个同名的「机房」链接更能把这件事讲清楚。
 */
function ComponentReuse({
  component,
  selfId,
  onJump,
}: {
  component: HardwareComponent
  selfId: string
  onJump: (id: string) => void
}) {
  // 分组逻辑是纯函数（lib/componentReuse.ts），在 node 环境里单测。
  const { sameGeneration, otherSystemIds } = componentReuseGroups(component.id, selfId)
  if (sameGeneration.length === 0 && otherSystemIds.length === 0) return null

  return (
    <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-dim" data-component-reuse="1">
      {sameGeneration.length > 0 ? (
        <p data-reuse-same-generation="1">
          同一组件在本代际还出现在：
          {sameGeneration.map((a, i) => (
            <span key={a.id}>
              {i > 0 ? '、' : ' '}
              <button type="button" onClick={() => onJump(a.id)} className="text-accent underline">
                {a.label}
              </button>
            </span>
          ))}
        </p>
      ) : null}
      {otherSystemIds.length > 0 ? (
        <p data-reuse-other-generations={otherSystemIds.join(',')}>
          其他代际也用了这个组件：
          <span className="text-fg">
            {otherSystemIds.map((id) => systemById(id)?.name ?? id).join('、')}
          </span>
          <span>（不可直接跳转——换代际请用顶栏的代际按钮，否则左右两边会讲不同的机器）</span>
        </p>
      ) : null}
    </div>
  )
}

function SourceLine({ sourceId }: { sourceId: string }) {
  const source = sourceById(sourceId)
  if (!source) return <li className="text-dim">{sourceId}</li>
  return (
    <li>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-accent underline">
          {source.title} ↗
        </a>
      ) : (
        <span>{source.title}</span>
      )}
      <span className="text-dim">
        {' · '}
        {source.publisher} · {source.asOf}
      </span>
    </li>
  )
}

function LinkButton({
  id,
  onClick,
  onHover,
  children,
}: {
  id: string
  onClick: () => void
  onHover: (id: string | null) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </button>
  )
}

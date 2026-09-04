/**
 * 「同一组件还出现在哪里」的分组（纯函数，零 three 导入，可在 node 环境单测）。
 *
 * ★ 为什么要按代际分（v1.5 缺陷 3）：`data/shared.ts` 的 9 个共享组件被 5 个系统各引用
 * 一次，装配节点的 `label` 还都一样（五个「机房」）。详情面板原来把
 * `assembliesUsingComponent()` 的结果直接铺成一排链接，于是 GB300 里会出现四个同名的
 * 「机房」，点进去把 `selectedId` 指到了另一棵装配树上，而顶栏代际、面包屑、3D 场景、
 * 导览面板全都还停在 GB300——一个左右不一致的界面。
 *
 * 分组规则：
 * - `sameGeneration`：同一 `systemId` 的其他装配节点。点它只是在同一棵树里换个焦点，
 *   不会造成任何不一致，UI 保持可点。
 * - `otherSystemIds`：其他系统的 `systemId`，按内容包声明顺序去重。UI 只展示代际名、
 *   **不做成链接**（换代是 `store.setGeneration` 那种带整体重置语义的显式动作，
 *   不该藏在脚注链接里；理由详见 `DetailPanel.ComponentReuse` 的注释）。
 */

import { FACTORY_PACK } from '../data'
import type { AssemblyNode, FactoryContentPack } from '../data/types'

export interface ComponentReuseGroups {
  /** 当前代际内、除自己以外的其他出现位置（可点跳转）。 */
  sameGeneration: AssemblyNode[]
  /** 其他代际的 systemId，按内容包 `assemblies` 声明顺序去重（只展示名字，不可点）。 */
  otherSystemIds: string[]
}

/**
 * 某个组件在内容包里的复用情况，按「本代际 / 其他代际」分组。
 *
 * `selfAssemblyId` 既用来剔除自己，也用来确定「本代际」是哪一代——
 * 传一个不存在的 ID 时没有本代际可言，全部归入 `otherSystemIds`（不抛错）。
 */
export function componentReuseGroups(
  componentId: string,
  selfAssemblyId: string,
  pack: FactoryContentPack = FACTORY_PACK,
): ComponentReuseGroups {
  const self = pack.assemblies.find((a) => a.id === selfAssemblyId)
  const uses = pack.assemblies.filter((a) => a.componentId === componentId && a.id !== selfAssemblyId)
  const sameGeneration = uses.filter((a) => a.systemId === self?.systemId)
  const otherSystemIds = [
    ...new Set(uses.filter((a) => a.systemId !== self?.systemId).map((a) => a.systemId)),
  ]
  return { sameGeneration, otherSystemIds }
}

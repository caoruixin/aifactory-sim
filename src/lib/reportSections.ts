/**
 * `/report` §04「代际变化」的分组逻辑（纯函数，零 three 导入）。
 *
 * ★ 为什么不能再按 `systems` 声明顺序两两串联（v1.5 缺陷 4）：
 * 老实现把内容包里的系统按声明顺序机械串成一条链
 * （GB300 → Vera Rubin → NVL576 → Groq 3 LPX → HGX B300），产生三个问题——
 *   1. 标题断言了一条**错误的路线图**：HGX B300 用的是 Blackwell Ultra（B300），
 *      与 GB300 NVL72 同代、现在就在量产，比 Vera Rubin 早一代。把它排在链尾等于
 *      告诉客户它是 NVIDIA 最新一代，这在售前场合会当场翻车；
 *   2. 相邻对里有两对（NVL576→LPX、LPX→HGX）根本没有人工比较定义，落到 `cmpdef.auto`
 *      后只剩一张裸表，满屏「右侧内容包未收录 直流母排 / 分液歧管」，读起来像
 *      「新一代砍掉了直流母排和液冷」；
 *   3. 这一节的叙述全靠 `ComparisonDefinition.summary` / `rows[].narrative`，
 *      而声明顺序里恰好只有一部分组合有定义——链的形状和内容的形状对不上。
 *
 * ★ 新规则：**遍历人工比较定义**（`FACTORY_PACK.comparisons`），而不是遍历 `systems`。
 * 于是「哪些组合值得对比」这件事回到了内容作者手里，机器只负责分组与排版；
 * 新增代际时只要写一条 cmpdef，这一节就自动长出来，不需要改这个文件。
 */

import { FACTORY_PACK } from '../data'
import type { ComparisonDefinition, FactoryContentPack, FactorySystem } from '../data/types'

/**
 * 一对系统之间是什么关系。判据全部取自内容包里已有的两个字段，不解析 ID、不硬编码名单：
 *
 * - `pairing`：任一侧 `capacityPolicy === 'paired-only'`。这个策略的定义就是
 *   「只在与配对系统联合工作时才有产能语义」（见 `types.ts`），也就是说它压根不是
 *   时间轴上的一环——Groq 3 LPX 不接替 Vera Rubin NVL72，而是和它一起工作。
 * - `same-era-domain`：两侧 `architecture` 不同（如机架级 NVLink 域 vs 服务器级 NVLink 域）。
 *   `SystemArchitecture` 描述的是「scale-up 域画在哪一层」，两边不同意味着这张对比讲的是
 *   **同一时点上怎么选域**，不是「谁替代谁」。
 * - `generation`：两侧同属一种域架构 ⇒ 是同一条产品线上的前后代。
 *
 * ⚠️ 将来如果出现「既换代又换域架构」的组合（例如一条全新的非 NVLink 路线的下一代），
 *    这条判据会把它归到 `same-era-domain`。那时应当在内容包里加一个显式字段
 *    （如 `FactorySystem.successorOf`）来表达继承关系，而不是在这里靠猜。
 */
export type ComparisonRelation = 'generation' | 'same-era-domain' | 'pairing'

/** §04 主体渲染的两种关系（`pairing` 在 §4b 单独成段，不进这个循环）。 */
export type ReportBodyRelation = Exclude<ComparisonRelation, 'pairing'>

/** 渲染顺序：先讲换代主线，再讲同代内怎么选域。 */
export const REPORT_RELATION_ORDER: readonly ReportBodyRelation[] = ['generation', 'same-era-domain']

export const REPORT_RELATION_TITLE: Record<ComparisonRelation, string> = {
  generation: '换代主线（读的是时间轴）',
  'same-era-domain': '同代内的域选择（不是换代）',
  pairing: '配对（不是换代）',
}

export function comparisonRelationOf(
  left: FactorySystem | undefined,
  right: FactorySystem | undefined,
): ComparisonRelation {
  if (!left || !right) return 'generation'
  if (left.capacityPolicy === 'paired-only' || right.capacityPolicy === 'paired-only') return 'pairing'
  if (left.architecture !== right.architecture) return 'same-era-domain'
  return 'generation'
}

export interface ReportComparisonGroup {
  relation: ReportBodyRelation
  definitions: ComparisonDefinition[]
}

/** 一条比较定义的关系分类（两侧系统查不到时按 `generation` 处理，不抛错）。 */
export function relationOfDefinition(
  def: ComparisonDefinition,
  pack: FactoryContentPack = FACTORY_PACK,
): ComparisonRelation {
  const byId = new Map(pack.systems.map((s) => [s.id, s]))
  return comparisonRelationOf(byId.get(def.leftSystemId), byId.get(def.rightSystemId))
}

/**
 * §04 主体要渲染的分组：只含 `REPORT_RELATION_ORDER` 里的关系，
 * 组内顺序 = 内容包 `comparisons` 声明顺序（截图基线依赖这个确定性）。空组不返回。
 */
export function reportComparisonGroups(
  pack: FactoryContentPack = FACTORY_PACK,
): ReportComparisonGroup[] {
  return REPORT_RELATION_ORDER.map((relation) => ({
    relation,
    definitions: pack.comparisons.filter((d) => relationOfDefinition(d, pack) === relation),
  })).filter((g) => g.definitions.length > 0)
}

/** §4b 用的配对定义（当前恰好一条：Vera Rubin NVL72 ↔ Groq 3 LPX）。 */
export function pairingComparisons(pack: FactoryContentPack = FACTORY_PACK): ComparisonDefinition[] {
  return pack.comparisons.filter((d) => relationOfDefinition(d, pack) === 'pairing')
}

/**
 * 换代主线上的系统，按内容包 `systems` 声明顺序。
 *
 * ★ 只收「出现在某条 `generation` 类比较定义里」的系统——**这条链断言的是有人写过比较
 * 定义的那些代**，而不是内容包里恰好有几个系统。HGX B300 因此不会进来（它与 GB300 的
 * 那条定义被判成 `same-era-domain`），Groq 3 LPX 也不会（`paired-only`）。
 *
 * 顺序取声明顺序的依据：`data/index.ts` 已经约定 `systems` 只能在尾部追加，
 * 而换代主线本身就是按时间追加的。v1.4 追加 HGX B300 之所以把老实现带偏，正是因为
 * 老实现拿**所有**系统连链——现在这条链只收换代关系，同代追加不会再挤进来。
 */
export function generationChainSystems(pack: FactoryContentPack = FACTORY_PACK): FactorySystem[] {
  const onChain = new Set<string>()
  for (const def of pack.comparisons) {
    if (relationOfDefinition(def, pack) !== 'generation') continue
    onChain.add(def.leftSystemId)
    onChain.add(def.rightSystemId)
  }
  return pack.systems.filter((s) => onChain.has(s.id))
}

/** 去掉厂商前缀的短名，用于标题里的链条（与 `BreadcrumbBar.shortName` 同一口径）。 */
export function shortSystemName(name: string): string {
  return name.replace(/^NVIDIA\s+/, '').replace(/（预测）$/, '')
}

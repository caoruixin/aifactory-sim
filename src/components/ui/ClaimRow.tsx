/**
 * 一行「可溯源数字」：值 + 单位 + 证据徽章 + 状态 + 出处 + locator + note。
 * 从 `DetailPanel` 提取（DOM 与 class 逐字不变），因为它是整个项目最重要的 UI 约定：
 * **每个数字旁边都必须能一眼看出它有多硬**。
 *
 * 两个消费者：
 *   - `DetailPanel`：组件规格表（给 `specKey` → 走 `lib/specLabel` 换中文标签）；
 *   - `LensChapterPanel`（v1.6）：章节 `keyFigures` 与技术卡 `figures`
 *     （`FigureRow` 自带中文 `label`，**不进 specLabel 体系**——这些数字不参与跨代规格配对）。
 *
 * `value === null` 一律显示「官方未公布」，绝不编数（null 传播是本项目的硬纪律）。
 */

import { sourceById } from '../../data'
import type { Claim } from '../../data/types'
import { plainText } from '../../lib/richText'
import { hasSpecLabel, specLabel } from '../../lib/specLabel'
import { EvidenceChip, StatusChip } from './Chips'
import RichText from './RichText'

export function formatClaimValue(claim: Claim): string {
  if (claim.value === null) return '官方未公布'
  if (typeof claim.value === 'boolean') return claim.value ? '是' : '否'
  if (typeof claim.value === 'number') return claim.value.toLocaleString('zh-CN')
  return claim.value
}

export interface ClaimRowProps {
  /** 没有 `specKey` 时（如「每个上级里的数量」「章节关键数字」）直接用这个显示名。 */
  name: string
  /**
   * 内容包里的原始规格键。给了它就查 `lib/specLabel.ts` 换成中文标签，
   * 同时把原 key 挂到 `<dt title>`——键名是 `compare.ts` 跨代配对的依据、不能改，
   * 但懂行的人仍然要能一眼对回内容包。查不到标签时回落显示键名本身（并保留等宽字体，
   * 让「这是个未翻译的标识符」这件事一眼可见）。
   */
  specKey?: string
  claim: Claim
}

export default function ClaimRow({ name, specKey, claim }: ClaimRowProps) {
  const source = sourceById(claim.sourceId)
  const unknown = claim.value === null
  const labelled = specKey !== undefined && hasSpecLabel(specKey)
  const display = specKey !== undefined ? specLabel(specKey) : name
  return (
    <div className="px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <dt
          className={`text-[11px] break-all text-dim ${labelled ? '' : 'font-mono'}`}
          title={specKey}
        >
          {display}
        </dt>
        <dd className={`text-right text-sm font-medium ${unknown ? 'text-dim italic' : ''}`}>
          {formatClaimValue(claim)}
          {claim.unit && !unknown ? <span className="ml-0.5 text-xs text-dim">{claim.unit}</span> : null}
        </dd>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <EvidenceChip evidence={claim.evidence} />
        <StatusChip status={claim.status} />
        {/* title= 放不下 <strong>，用 plainText 去掉成对的 `**`（locator 里也会出现粗体）。 */}
        <span className="text-[11px] text-dim" title={plainText(claim.locator) || undefined}>
          {source ? source.title : claim.sourceId}
          {' · '}
          {claim.asOf}
        </span>
      </div>
      {claim.locator ? (
        <p className="mt-1 text-[11px] leading-snug text-dim">
          出处：
          <RichText text={claim.locator} />
        </p>
      ) : null}
      {claim.note ? (
        <p className="mt-1 text-[11px] leading-snug text-warn">
          <RichText text={claim.note} />
        </p>
      ) : null}
    </div>
  )
}

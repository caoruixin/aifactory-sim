/**
 * 证据体系的视觉词汇表。
 *
 * 这是整个项目最重要的 UI 约定之一：**每个数字旁边都必须能一眼看出它有多硬**。
 * 「官方规格表」和「分析师预测」长得一样，是售前讲错话的头号来源。
 */

import type { EvidenceType, ProductStatus } from '../../data/types'

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  verified_spec: '官方规格',
  vendor_claim: '厂商宣称',
  benchmark: '公开跑分',
  management_guidance: '管理层指引',
  analyst_estimate: '分析师测算',
  forecast: '预测',
  author_opinion: '作者解读',
}

/** 证据越硬颜色越「实」；越软越偏警示色。 */
const EVIDENCE_CLASS: Record<EvidenceType, string> = {
  verified_spec: 'border-ok/35 bg-ok/10 text-ok',
  vendor_claim: 'border-accent/35 bg-accent/10 text-accent',
  benchmark: 'border-accent-2/35 bg-accent-2/10 text-accent-2',
  management_guidance: 'border-warn/35 bg-warn/10 text-warn',
  analyst_estimate: 'border-warn/35 bg-warn/10 text-warn',
  forecast: 'border-bad/35 bg-bad/10 text-bad',
  author_opinion: 'border-line bg-panel-2 text-dim',
}

export const STATUS_LABEL: Record<ProductStatus, string> = {
  shipping: '已量产',
  announced: '已发布',
  forecast: '预测',
}

const STATUS_CLASS: Record<ProductStatus, string> = {
  shipping: 'border-ok/35 bg-ok/10 text-ok',
  announced: 'border-accent/35 bg-accent/10 text-accent',
  forecast: 'border-bad/35 bg-bad/10 text-bad',
}

const BASE = 'inline-flex items-center rounded border px-1.5 py-px text-[11px] leading-4 font-medium'

export function EvidenceChip({ evidence }: { evidence: EvidenceType }) {
  return (
    <span className={`${BASE} ${EVIDENCE_CLASS[evidence]}`} title={`证据类型：${EVIDENCE_LABEL[evidence]}`}>
      {EVIDENCE_LABEL[evidence]}
    </span>
  )
}

export function StatusChip({ status }: { status: ProductStatus }) {
  return (
    <span className={`${BASE} ${STATUS_CLASS[status]}`} title={`产品状态：${STATUS_LABEL[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

/** 中性小标签（数量、单位、层级等）。 */
export function MetaChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className={`${BASE} border-line bg-panel-2 text-dim`} title={title}>
      {children}
    </span>
  )
}

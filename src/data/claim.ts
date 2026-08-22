import type { Claim, ClaimValue, Confidence, EvidenceType, ProductStatus } from './types'

/**
 * Claim 构造小工具。纯函数、返回纯对象（模块加载期求值），不破坏 JSON 可序列化。
 * 目的只有一个：让内容文件里「每个数字都带出处」写起来不痛苦，从而不会有人图省事去写裸数字。
 */

export const RA_SOURCE = 'src.nvidia-nvl72-ra'
export const GB300_PAGE_SOURCE = 'src.nvidia-gb300-page'
/** NVIDIA 官方页面抓取时间。 */
export const NVIDIA_ASOF = '2026-08'

interface ClaimInit<T extends ClaimValue> {
  value: T | null
  sourceId: string
  unit?: string | null
  evidence?: EvidenceType
  status?: ProductStatus
  locator?: string | null
  asOf?: string
  confidence?: Confidence
  note?: string | null
}

export function claim<T extends ClaimValue>(init: ClaimInit<T>): Claim<T> {
  return {
    value: init.value,
    unit: init.unit ?? null,
    evidence: init.evidence ?? 'verified_spec',
    status: init.status ?? 'shipping',
    sourceId: init.sourceId,
    locator: init.locator ?? null,
    asOf: init.asOf ?? NVIDIA_ASOF,
    confidence: init.confidence ?? 'high',
    note: init.note ?? null,
  }
}

/** NVIDIA GB300 NVL72 企业参考架构文档中的确切规格。 */
export function raSpec<T extends ClaimValue>(
  value: T | null,
  unit: string | null,
  locator: string,
  note: string | null = null,
): Claim<T> {
  return claim<T>({ value, unit, sourceId: RA_SOURCE, locator, note })
}

/** 关键数量：locator 必填，保证任何时候都能回查官方文档的具体表格/段落。 */
export function raCount(value: number, locator: string, note: string | null = null): Claim<number> {
  return claim<number>({ value, unit: '个', sourceId: RA_SOURCE, locator, note })
}

/** NVIDIA GB300 NVL72 产品页规格表中的确切规格。 */
export function pageSpec<T extends ClaimValue>(
  value: T | null,
  unit: string | null,
  locator: string,
  note: string | null = null,
): Claim<T> {
  return claim<T>({ value, unit, sourceId: GB300_PAGE_SOURCE, locator, note })
}

/** 厂商宣称（营销口径，非可验证规格）——UI 上要与 verified_spec 明显区分。 */
export function vendorClaim<T extends ClaimValue>(
  value: T | null,
  unit: string | null,
  sourceId: string,
  locator: string,
  note: string | null = null,
): Claim<T> {
  return claim<T>({ value, unit, sourceId, locator, evidence: 'vendor_claim', confidence: 'medium', note })
}

/**
 * 「官方未公布，本项目不编数」——value 恒为 null。
 * 下游必须把它渲染成 N/A 并显示 note，产能估算遇到它要走拒绝/降级门。
 */
export function notPublished(
  unit: string | null,
  sourceId: string,
  note: string,
  locator: string | null = null,
): Claim {
  return claim({
    value: null,
    unit,
    sourceId,
    locator,
    confidence: 'low',
    note,
  })
}

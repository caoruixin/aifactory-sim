import type { Claim } from './types'
export type VerificationDisposition = 'reviewed'|'existing-source'|'deployment-dependent'|'scope-conflict'|'not-found'|'not-applicable'|'non-spec'
export const VERIFICATION_LABELS: Record<VerificationDisposition,string> = {
  reviewed:'本轮已核验', 'existing-source':'沿用既有来源', 'deployment-dependent':'OEM / 部署决定',
  'scope-conflict':'来源或型号范围待确认', 'not-found':'未找到可靠公开依据', 'not-applicable':'不适用', 'non-spec':'非官方规格',
}
/** Null is an absence of a confirmed applicable value, not proof that nobody has published it. */
export function claimDisposition(c:Claim):VerificationDisposition {
  if(c.review) return c.review.disposition
  const note=c.note??''
  if(c.value===null) {
    if(/没有 GPU|不适用/.test(note)) return 'not-applicable'
    if(/冲突|不一致|范围不清|配图|型号.*不清/.test(note)) return 'scope-conflict'
    if(/OEM|客户|场地|选型|部署|机电|由.*决定|取决于|业务|命中率/.test(note)) return 'deployment-dependent'
    return 'not-found'
  }
  if(c.evidence!=='verified_spec') return 'non-spec'
  if(/来源范围不清|型号范围不清/.test(note)) return 'scope-conflict'
  return c.asOf==='2026-09' ? 'reviewed' : 'existing-source'
}

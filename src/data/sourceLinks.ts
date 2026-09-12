import type { Claim, SourceRef } from './types'

/** RA source references span chapters. Link to the chapter named by this claim. */
export function claimSourceUrl(claim: Claim, source: SourceRef | undefined): string | null {
  const url = source?.url ?? null
  if (!url?.includes('enterprise-reference-architectures')) return url
  const at = claim.locator ?? ''
  const chapter = /Appendix|appendix|附录/.test(at) && !/^Components/.test(at) ? 'appendix-node-configurations'
    : /Networking Physical|Dual Plane|Single Plane/.test(at) ? 'networking-physical-topologies'
    : /Network(?:ing)? Logical/.test(at) ? 'network-logical-architecture'
    : /Networking Hardware/.test(at) ? 'networking-hardware'
    : /^Abstract/.test(at) ? 'abstract'
    : /^Overview/.test(at) ? 'overview' : 'components'
  return url.replace(/[^/]+\.html.*$/, `${chapter}.html`)
}

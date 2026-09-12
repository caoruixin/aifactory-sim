import type { FactoryContentPack } from './types'
import { claimInventory, claimKey } from './claimInventory'
import { RECHECKED_CLAIMS } from './recheckedClaims'
import { claimDisposition } from './verification'

/** An audit conclusion is distinct from the source's publication date and product status. */
export function applyClaimReview(pack: FactoryContentPack) {
  const checked = new Map(RECHECKED_CLAIMS.map(r => [r.id as string, r]))
  const component = (id: string) => pack.components.find(c => c.id === id)!
  // Absence in the RA is not evidence that every OEM uses this power distribution design.
  const power = component('cmp.hgx.rack-pdu').specs.distributionForm!
  power.evidence = 'author_opinion'
  power.value = '示意采用交流 PDU → OEM 服务器电源；实际配电形态由 OEM / 场地确定'
  power.note = 'RA 的未提及不能证明不存在 DC 母排或机架电源架；本项只解释此图的示意方式。'
  component('cmp.rubin.power-shelf').specs.gpuDensityGain!.evidence = 'vendor_claim'
  component('cmp.rubin.bluefield-4').specs.vsPreviousGen!.evidence = 'vendor_claim'
  component('cmp.rubin.compute-tray').specs.assemblyTime!.evidence = 'vendor_claim'
  for(const [id,key] of [['cmp.rubin.power-shelf','gpuDensityGain'],['cmp.rubin.bluefield-4','vsPreviousGen'],['cmp.rubin.compute-tray','assemblyTime']]) {
    const claim=component(id!).specs[key!]!
    claim.note=`${claim.note??''} 厂商在特定比较条件下的效率 / 工序收益宣称，不是可保证的硬件额定规格。`
  }
  const vera = component('cmp.rubin.vera-cpu')
  for(const key of ['memoryBandwidthTBs','threadsPerCpu']) {
    vera.specs[key]!.sourceId = 'src.nvidia-vera-cpu-rack'
    vera.specs[key]!.locator = 'Specifications / Vera CPU cores, threads and memory bandwidth'
    vera.specs[key]!.asOf = '2026-09'
  }
  component('cmp.rubin.lpddr5x').specs.memoryBandwidthTBs = vera.specs.memoryBandwidthTBs!
  component('cmp.rubin.compute-tray').specs.fastMemoryPerTrayTB!.note = '六芯片博客早期托盘示例的 2 TB；不代表当前网页的最高 54 TB CPU + 20.7 TB HBM 整架配置。'
  const cx9 = component('cmp.rubin.connectx-9')
  cx9.specs.perGpuBandwidthTbs!.sourceId = 'src.nvidia-dgx-rubin-page'
  cx9.specs.perGpuBandwidthTbs!.locator = 'DGX specifications / 144 × 800 Gb/s ports ÷ 72 GPUs'
  cx9.specs.perGpuBandwidthTbs!.note = 'DGX 已列网口配置折合 1.6 Tb/s/ GPU 单向；当前 NVL72 网页 MaxLPS 的 0.45 TB/s/GPU 双向是另一组系统规格。实际网卡板数与端口映射仍需确认。Preliminary information，所有值以配置为准。'
  const cx9Connection = pack.connections.find(c=>c.id==='con.rubin.gpu-cx9')!
  cx9Connection.bandwidth = {...cx9.specs.perGpuBandwidthTbs!} as typeof cx9Connection.bandwidth
  const conflicts = new Set([
    'cmp.rubin.connectx-9:specs.perGpuBandwidthTbs',
    'cmp.rubin.connectx-9:specs.gpuToNicRatio',
    'con.rubin.gpu-cx9:bandwidth',
    'cmp.hgx.server:specs.cpuCoresPerSocket',
    'cmp.hgx.host-cpu:specs.minCoresPerSocket',
    'cmp.gb300.connectx-8:specs.minComputeBandwidthGBs',
    'cmp.gb300.connectx-8:specs.recommendedComputeBandwidthGBs',
    'cmp.gb300.sn5610:specs.switchesPerRack',
  ])
  const deploymentComponents = new Set([
    'cmp.shared.oberon-rack','cmp.shared.busbar','cmp.shared.cdu','cmp.shared.manifold',
    'cmp.hgx.rack','cmp.hgx.rack-pdu','cmp.hgx.air-handler','cmp.hgx.local-nvme',
  ])
  for (const entry of claimInventory(pack)) {
    const c = entry.claim, id = claimKey(entry), record = checked.get(id)
    let disposition = claimDisposition(c)
    if(record && record.value === c.value && record.sourceId === c.sourceId && c.evidence === 'verified_spec') disposition = 'reviewed'
    if(conflicts.has(id)) disposition = 'scope-conflict'
    if(c.value === null && (deploymentComponents.has(entry.owner ?? '') || /scaleout-switch.*switchesPerRack|cold-start.*keyFigures/.test(id))) disposition = 'deployment-dependent'
    if(disposition === 'existing-source') continue // a future changed value cannot inherit this audit
    const reason = disposition === 'reviewed'
      ? '已核对所列官方规格 / 原始章节及适用范围；算术派生与配置差异见 note。'
      : disposition === 'non-spec'
      ? '保留厂商宣称、第三方分析或教学假设的证据等级，不作为官方硬件数学输入。'
      : disposition === 'deployment-dependent'
      ? '需要 OEM 型号、机房条件或部署拓扑才能确定；没有适用于所有系统的通用值。'
      : disposition === 'scope-conflict'
      ? '原始资料存在配置、数量或范围差异；保留出处供对照，不作为已确认的统一配置。'
      : disposition === 'not-applicable' ? '此架构不适用该参数。'
      : '截至 2026-09-12，所查官方资料仍未提供可采纳的适用值；不能据此断言从未公开。'
    c.review = {date:'2026-09-12',disposition,reason}
  }
}

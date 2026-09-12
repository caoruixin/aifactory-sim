/** Reviewed corrections, applied before indexing. Historical values remain in the audit ledger. */
import { claim } from './claim'
import { gpuMathFromClaims } from './resolvedMath'
import type { Claim, FactoryContentPack, SourceRef } from './types'

export const VERIFIED_AT = '2026-09-12'
const BW = 'src.nvidia-blackwell-ultra-datasheet'
const VR = 'src.nvidia-vera-rubin-page'
const VDS = 'src.nvidia-vera-rubin-datasheet'
export function reviewed(value: number | string | null, unit: string | null, sourceId: string, locator: string, note: string | null = null): Claim {
  return claim({ value, unit, sourceId, locator, note: /vera|rubin/.test(sourceId) ? `${note ?? ''} Preliminary information; up to，规格随配置而变。` : note, status: /vera|rubin|stx|bf4/.test(sourceId) ? 'announced' : 'shipping', asOf: '2026-09', confidence: 'high' })
}
export const REVIEW_SOURCES: SourceRef[] = [
  ['sn5000-manual', 'SN5000 硬件手册 · 接口与型号', 'https://networking-docs.nvidia.com/sn5000hw/introduction'],
  ['sn2201-manual', 'SN2201 硬件手册 · 规格', 'https://networking-docs.nvidia.com/sn2201hw/specifications'],
  ['bf4-datasheet', 'BlueField-4 DPU 数据手册（2026-06）', 'https://dam-cdn.nvd.orangelogic.com/AssetLink/whs8mhb340t412js4612g3356607hapf.pdf'],
  ['stx-datasheet', 'BlueField-4 STX 存储处理器数据手册', 'https://dam-cdn.nvd.orangelogic.com/AssetLink/2pgc1k5w103r3rfnn4n5weq08hec7038.pdf'],
  ['vera-cpu-rack', 'NVIDIA Vera CPU Rack', 'https://www.nvidia.com/en-us/data-center/products/vera-rack/'],
].map(([id, title, url]) => ({ id: `src.nvidia-${id}`, title, url, publisher: 'NVIDIA', kind: 'official_doc', localFile: null, asOf: '2026-09', note: `核验日期 ${VERIFIED_AT}。` }))

/** Each profile binds GPU and rack quantities from ONE publication/configuration. */
export const RUBIN_PROFILES = {
  'maxlps': {
    label: '网页 · DSX MaxLPS', sourceId: VR,
    gpu: {
      memoryBandwidthTBs: reviewed(19.2, 'TB/s', VR, 'GPU Specifications / HBM bandwidth', 'DSX MaxLPS at-scale 配置；不得与手册上限配置混用。'),
      nvlinkPerGpuGBs: reviewed(3000, 'GB/s', VR, 'GPU Specifications / NVLink', '单 GPU 双向合计。'),
      scaleOutPerGpuTBs: reviewed(0.45, 'TB/s', VR, 'Specifications / Scale-out bandwidth', '单 GPU 双向合计；不等于端口线速。'),
    },
    system: {
      gpuMemoryBandwidthTBs: reviewed(1400, 'TB/s', VR, 'Rack Specifications / HBM bandwidth', '整架；网页取整，DSX MaxLPS。'),
      nvlinkAggregateBandwidthTBs: reviewed(216, 'TB/s', VR, 'Rack Specifications / NVLink', '整架双向合计，DSX MaxLPS。'),
      scaleOutBandwidthTBs: reviewed(32.4, 'TB/s', VR, 'Rack Specifications / Scale-out bandwidth', '整架双向合计，DSX MaxLPS。'),
    },
  },
  'datasheet': {
    label: '数据手册 · up to', sourceId: VDS,
    gpu: {
      memoryBandwidthTBs: reviewed(22, 'TB/s', VDS, 'p.9 / GPU specifications', 'up to；preliminary；与网页 MaxLPS 配置独立。'),
      nvlinkPerGpuGBs: reviewed(3600, 'GB/s', VDS, 'p.9 / NVLink', '单 GPU 双向合计，上限配置。'),
      scaleOutPerGpuTBs: reviewed(0.4, 'TB/s', VDS, 'p.8 / rack scale-out 28.8 TB/s ÷ 72', '按整架双向合計推导；上限配置。'),
    },
    system: {
      gpuMemoryBandwidthTBs: reviewed(1580, 'TB/s', VDS, 'p.8 / Rack specifications', '整架、up to；手册取整。'),
      nvlinkAggregateBandwidthTBs: reviewed(260, 'TB/s', VDS, 'p.8 / NVLink', '整架双向合计，手册取整。'),
      scaleOutBandwidthTBs: reviewed(28.8, 'TB/s', VDS, 'p.8 / Scale-out bandwidth', '整架双向合计。'),
    },
  },
} as const
export type HardwareProfileId = keyof typeof RUBIN_PROFILES

export function applyReviewedSpecifications(pack: FactoryContentPack) {
  pack.sources.push(...REVIEW_SOURCES.filter(r=>!pack.sources.some(s=>s.id===r.id)))
  const vds = pack.sources.find(s => s.id === VDS)!
  vds.url = 'https://dam-cdn.nvd.orangelogic.com/AssetLink/56p68o47y6f1yucpubl0ump1c0aif422.pdf'
  vds.note = 'p.8–9：上限配置、preliminary。与当前产品页 DSX MaxLPS 的带宽数值分开登记。'
  const c = (id: string) => pack.components.find(c => c.id === id)!
  pack.sources.find(s=>s.id===BW)!.url='https://dam-cdn.nvd.orangelogic.com/AssetLink/1k0p832eq8r5ca0u5383ie5o4tp3bst1.pdf'
  const gb = c('cmp.gb300.b300-gpu')
  gb.specs.hbmArchitectureGB = { ...gb.specs.hbmPerGpuGB!, note: '288 GB：架构/参考架构口径。默认模拟用数据手册 GB300 SKU 的 279 GB。' }
  Object.assign(gb.specs, {
    hbmPerGpuGB: reviewed(279, 'GB', BW, 'p.5 / GB300 GPU memory', '采用产品 SKU 口径；架构最大 288 GB 单独列出。RA Appendix 的每托盘 720 GB 与主体表不一致，未采纳。'),
    memoryBandwidthTBs: reviewed(8, 'TB/s', BW, 'p.5 / GB300 GPU memory bandwidth'),
    fp16DenseTflops: reviewed(2500, 'TFLOPS', BW, 'p.5 / FP16/BF16 Tensor Core', '5 PFLOPS sparse ÷ 2 = 2.5 PFLOPS dense。'),
    fp8DenseTflops: reviewed(5000, 'TFLOPS', BW, 'p.5 / FP8 Tensor Core', '10 PFLOPS sparse ÷ 2。'),
    tdpW: reviewed(1400, 'W', BW, 'p.5 / Configurable TDP', '最高可配置 TDP，不代表典型运行功耗。'),
    pcieBidirectionalGBs: reviewed(256, 'GB/s', BW, 'p.5 / PCIe Gen6', '单 GPU 双向合计接口上限；有效 DMA 路径仍取决于 OEM 布线。'),
  })
  gb.presalesNote = '容量决定模型与 KV 是否放得下，计算与显存带宽共同限制产出。默认采用 GB300 数据手册的 279 GB；架构 288 GB 独立列示。最高可配置 TDP 不是整卡实际耗电。'
  gb.summary = 'Blackwell Ultra GPU：GB300 SKU 279 GB HBM3E、8 TB/s；架构口径最大 288 GB。'
  const grace = c('cmp.gb300.grace-cpu')
  grace.specs.coresPerCpu = reviewed(72, '核', 'src.nvidia-gb300-page', 'Specifications / 36 CPUs, 2,592 cores', '2592 ÷ 36 = 72 核/CPU。')
  grace.specs.coresPerTray = reviewed(144, '核', 'src.nvidia-gb300-page', 'Specifications / 36 CPUs, 18 compute trays', '每托盘两颗 CPU。RA Table 1 的 72 未清楚标范围；按产品页整架数据闭合。')
  grace.summary = '每颗 Grace CPU 72 核，每个双 CPU 计算托盘共 144 核；整架 2,592 核。'
  const hbm = c('cmp.gb300.hbm3e')
  hbm.specs.stacksPerGpu = reviewed(8, '堆栈', 'src.nvidia-blackwell-ultra-blog', 'Blackwell Ultra memory subsystem', '每 GPU 8 个 12-Hi HBM3E 堆栈。')
  hbm.specs.stackHeight = reviewed(12, '层', 'src.nvidia-blackwell-ultra-blog', 'Blackwell Ultra memory subsystem')
  hbm.summary = '每 GPU 8 个 12-Hi HBM3E 堆栈；封装容量按 GPU SKU 区分。'
  const hbmAssembly = pack.assemblies.find(a => a.componentId === hbm.id)
  if (hbmAssembly) { hbmAssembly.count = 8; hbmAssembly.countClaim = hbm.specs.stacksPerGpu as Claim<number>; hbmAssembly.note = '每 GPU 八个堆栈；几何位置为封装示意。' }
  const hgx = c('cmp.hgx.b300-sxm')
  hgx.specs.fp16DenseTflops = reviewed(2250, 'TFLOPS', BW, 'p.5 / HGX B300 GPU FP16/BF16', '4.5 PFLOPS sparse ÷ 2。')
  hgx.specs.pcieBidirectionalGBs = { ...gb.specs.pcieBidirectionalGBs!, locator: 'p.5 / HGX B300 GPU PCIe Gen6' }
  const rubin = c('cmp.rubin.rubin-gpu')
  Object.assign(rubin.specs, RUBIN_PROFILES.maxlps.gpu, {
    fp16DenseTflops: reviewed(4000, 'TFLOPS', VR, 'GPU specifications / FP16/BF16 training', '稠密值。'),
    fp8DenseTflops: reviewed(17500, 'TFLOPS', VR, 'GPU specifications / FP8 training', '稠密值；非 FP4 inference sparse。'),
  })
  Object.assign(pack.systems.find(s => s.id === 'sys.vera-rubin-nvl72')!.keySpecs, RUBIN_PROFILES.maxlps.system)
  rubin.summary = '单 GPU 封装、288 GB HBM4。当前网页 MaxLPS 与数据手册 up-to 为独立规格配置。'
  rubin.presalesNote = '显存带宽、NVLink 和 scale-out 必须使用同组配置。较高理论带宽不意味着 token 吞吐按同样倍数增长；仍取决于工作负载和计算、通信约束。'
  rubin.specs.hbmPerGpuGB = reviewed(288,'GB',VR,'GPU Specifications / HBM capacity','单 GPU 封装。')
  const vera = c('cmp.rubin.vera-cpu')
  vera.specs.tdpW = reviewed('250–450','W','src.nvidia-vera-cpu-rack','Specifications / Form factor and cooling','通用 Vera CPU 可配置范围；NVL72 的实际运行配置与整架功率仍未知。')
  vera.presalesNote = '每颗 Vera CPU 88 核，每托盘两颗共 176 核。Grace 为每颗 72 核、双 CPU 托盘共 144 核。CPU 用于主机执行与内存服务，吞吐还取决于数据路径。'
  const rhbm = pack.components.find(c => c.id === 'cmp.rubin.hbm4')
  if (rhbm) { rhbm.specs.memoryBandwidthTBs = rubin.specs.memoryBandwidthTBs!; rhbm.specs.bandwidthPerRackTBs = RUBIN_PROFILES.maxlps.system.gpuMemoryBandwidthTBs; rhbm.summary = '12-Hi HBM4，单 GPU 288 GB；带宽随当前规格配置切换。'; rhbm.presalesNote = 'HBM 容量与带宽是两个维度；端点带宽不等于整域聚合带宽，也不等于外部 DMA 输入速度。' }
  const nvConnection = pack.connections.find(c=>c.id==='con.rubin.gpu-nvswitch')!
  nvConnection.bandwidth = RUBIN_PROFILES.maxlps.gpu.nvlinkPerGpuGBs as Claim<number>
  nvConnection.summary = '72 GPU 的 NVLink 域。带宽按所选规格配置区分单 GPU 端点与整架双向合计；每 GPU 链路条数未确认。'
  const bf = c('cmp.rubin.bluefield-4')
  Object.assign(bf.specs, {
    cpuCores: reviewed(64, '核', 'src.nvidia-bf4-datasheet', 'p.2 / CPU', 'BlueField-4 DPU 使用 Grace / Neoverse V2；Vera CPU 属于另列的 STX 存储处理器。'),
    oobPortGbs: reviewed(1, 'Gb/s', 'src.nvidia-bf4-datasheet', 'p.2 / Management'),
    memoryCapacityGB: reviewed(128, 'GB', 'src.nvidia-bf4-datasheet', 'p.2 / Memory', '最高 128 GB LPDDR5X，具体板卡配置独立确认。'),
    pcieInterface: reviewed('PCIe Gen6 ×16', null, 'src.nvidia-bf4-datasheet', 'p.2 / Host interface'),
  })
  bf.summary = 'BlueField-4 DPU：64 核 Grace、最高 800 Gb/s 网络；与 Vera CPU 的 STX 存储处理器分开建模。'
  for (const id of ['cmp.gb300.sn5610', 'cmp.hgx.sn5600']) {
    const sw = c(id)
    sw.specs.ports = reviewed(64, 'OSFP 物理接口', 'src.nvidia-sn5000-manual', 'Introduction / SN5600 and SN5610', '800G 物理连接器；breakout 后可为 128×400G 逻辑端口。')
    sw.specs.portSpeedGbs = reviewed(800, 'Gb/s', 'src.nvidia-sn5000-manual', 'Introduction / 64-port 800GbE')
    sw.specs.breakoutPorts400G = reviewed(128, '逻辑端口', 'src.nvidia-sn5000-manual', 'Introduction / breakout', '部署使用数量依参考架构，不代表 128 个物理接口。')
  }
  c('cmp.hgx.sn5600').summary = 'SN5600：64 个 800G OSFP 物理接口，可拆分为 128×400G；HGX 参考架构采用 400G 逻辑端口。'
  c('cmp.shared.sn2201').specs.uplinkPorts100G = reviewed(4, 'QSFP28 接口', 'src.nvidia-sn2201-manual', 'Specifications / Interfaces', '除 48×1GbE RJ45 以外的 4×100GbE 上联。')
  const storage = c('cmp.shared.storage-array')
  const target = storage.specs.perNodeStorageBandwidthGBs
  if (target) {
    pack.systems.find(s => s.id === 'sys.gb300-nvl72')!.keySpecs.perNodeStorageBandwidthGBs = { ...target, note: 'GB300 企业参考架构的每节点部署带宽目标；不是存储阵列通用规格。' }
    delete storage.specs.perNodeStorageBandwidthGBs
  }
  storage.summary = '共享存储阵列：存放模型与数据集，性能、容量、介质由厂商与部署决定。'
  const nvchip=c('cmp.rubin.nvlink6-switch-chip')
  nvchip.specs.aggregateBandwidthPerRackTBs=RUBIN_PROFILES.maxlps.system.nvlinkAggregateBandwidthTBs
  nvchip.specs.perGpuBandwidthTBs=reviewed(3,'TB/s',VR,'NVL72 Specs / NVLink bandwidth','MaxLPS 单 GPU 双向合计；不是单交换 ASIC 吞吐。')
  const tray=c('cmp.rubin.compute-tray')
  tray.specs.nvlinkPerTrayTBs=reviewed(12,'TB/s',VR,'NVL72 Specs / 3 TB/s per GPU × 4 GPUs per tray','按四个 GPU 端点的双向合计相加；非一根物理链路。')
  const switchTray=c('cmp.rubin.nvlink6-switch-tray')
  switchTray.specs.trayBandwidthUpperTBs={...switchTray.specs.trayBandwidthTBs!,note:'六芯片博客 / 手册上限配置；不作为 MaxLPS 配置的有效托盘带宽。'}
  switchTray.specs.trayBandwidthTBs=reviewed(null,'TB/s',VR,'NVL72 Specs / NVLink bandwidth','网页只列 GPU / Superchip / 整架带宽，未找到 MaxLPS 下单交换托盘的可靠数值；不能把整架端点聚合带宽除以托盘数当实测交换能力。')
  const trayConnection=pack.connections.find(c=>c.id==='con.rubin.tray-midplane')!
  trayConnection.bandwidth=tray.specs.nvlinkPerTrayTBs as Claim<number>
  trayConnection.summary='计算托盘四个 GPU 端点的聚合上限，随规格配置变化；不是一根铜连接器的速率。'
  // Generic component limits remain distinct from the current system wiring.
  for(const id of ['cmp.gb300.sn5610','cmp.hgx.sn5600']) {
    const sw=c(id)
    sw.specs.siliconGeneration=reviewed('NVIDIA Spectrum-4',null,'src.nvidia-sn5000-manual','Introduction / Spectrum-4 ASIC','SN5600 与 SN5610 均在手册明确列为 Spectrum-4。')
    sw.specs.switchingThroughputTbs=reviewed(51.2,'Tb/s','src.nvidia-sn5000-manual','Introduction / SN5600, SN5610 Throughput','按厂商 Throughput 字段保留；手册又称 bidirectional switching capacity，方向表述存在歧义，不用来计算端口间传输时间。')
  }
  for (const source of pack.sources) {
    if(source.localFile?.includes('Overv (1).pdf')) source.localFile=source.localFile.replace('） _ASIC','）  _ASIC')
    if(source.id==='src.nvidia-rubin-chips-blog') source.note='六芯片技术博客：BlueField-4 DPU 为 Grace CPU；Vera CPU 的 STX 模块另列，二者不是同一 SKU。'
  }
  for (const gpu of pack.components) if (gpu.kind === 'gpu') gpu.mathSpecs = gpuMathFromClaims(gpu.specs)
  pack.generatedAsOf = '2026-09'
}

/** Read-only display/comparison view of the same versioned claims used by the solver. */
export function packForHardwareProfile(pack: FactoryContentPack, profile: HardwareProfileId): FactoryContentPack {
  const variant=RUBIN_PROFILES[profile]
  const nvGbps=variant.gpu.nvlinkPerGpuGBs.value as number
  return {...pack,
    systems:pack.systems.map(s=>s.id==='sys.vera-rubin-nvl72'?{...s,keySpecs:{...s.keySpecs,...variant.system}}:s),
    components:pack.components.map(c=>{
      if(c.id==='cmp.rubin.rubin-gpu' && c.kind==='gpu') {const specs={...c.specs,...variant.gpu};return {...c,specs,mathSpecs:gpuMathFromClaims(specs)}}
      if(c.id==='cmp.rubin.nvlink6-switch-chip') return {...c,specs:{...c.specs,aggregateBandwidthPerRackTBs:variant.system.nvlinkAggregateBandwidthTBs,perGpuBandwidthTBs:{...variant.gpu.nvlinkPerGpuGBs,value:nvGbps/1000,unit:'TB/s'}}}
      if(c.id==='cmp.rubin.compute-tray') return {...c,specs:{...c.specs,nvlinkPerTrayTBs:{...variant.gpu.nvlinkPerGpuGBs,value:nvGbps*4/1000,unit:'TB/s',note:'所选配置 4 GPU 端点的双向合计相加；不是物理单链路。'}}}
      if(c.id==='cmp.rubin.nvlink6-switch-tray' && profile==='datasheet') return {...c,specs:{...c.specs,trayBandwidthTBs:c.specs.trayBandwidthUpperTBs!}}
      if(c.id==='cmp.rubin.hbm4') return {...c,specs:{...c.specs,memoryBandwidthTBs:variant.gpu.memoryBandwidthTBs,bandwidthPerRackTBs:variant.system.gpuMemoryBandwidthTBs}}
      return c
    }),
    connections:pack.connections.map(c=>{
      if(c.id==='con.rubin.gpu-nvswitch') return {...c,bandwidth:variant.gpu.nvlinkPerGpuGBs as Claim<number>}
      if(c.id==='con.rubin.tray-midplane') return {...c,bandwidth:{...variant.gpu.nvlinkPerGpuGBs,value:nvGbps*4/1000,unit:'TB/s',note:'四个 GPU 端点双向聚合；非单根链路。'}}
      return c
    }),
  }
}

import { describe, expect, it } from 'vitest'
import {
  FACTORY_PACK,
  assemblyById,
  componentById,
  connectionsOfPlane,
  descendantsOf,
  modelById,
  scenesOfSystem,
  systemById,
  totalInstances,
} from './index'
import { resolveLayout } from '../lib/layout'
import { kvBytesPerToken } from '../lib/roofline'
import { routeConnections } from '../lib/routing'
import {
  GROQ3_LPX_ASSEMBLIES,
  GROQ3_LPX_COMPONENTS,
  GROQ3_LPX_CONNECTIONS,
  GROQ3_LPX_SCENES,
  GROQ3_LPX_SYSTEM,
} from './groq3-lpx'
import {
  RUBIN_ULTRA_ASSEMBLIES,
  RUBIN_ULTRA_COMPONENTS,
  RUBIN_ULTRA_CONNECTIONS,
  RUBIN_ULTRA_SCENES,
  RUBIN_ULTRA_SYSTEM,
} from './rubin-ultra-nvl576'
import {
  VERA_RUBIN_ASSEMBLIES,
  VERA_RUBIN_COMPONENTS,
  VERA_RUBIN_CONNECTIONS,
  VERA_RUBIN_SYSTEM,
} from './vera-rubin-nvl72'
import type { Claim, NetworkPlane } from './types'

/**
 * GB300 NVL72 事实校验。
 * 这里的每一条都是「说错了客户就不信你」的高风险数字，
 * 尤其是 NVSwitch 托盘数（9 托盘 × 2 ASIC = 18，常被误写成 9 颗或 18 个托盘）
 * 与网卡/DPU 代际（ConnectX-8 / BlueField-3，不是上一代 CX-7 / BF-2）。
 */

const SYSTEM_ID = 'sys.gb300-nvl72'
const RACK = 'asm.gb300.rack'

describe('GB300 NVL72：机架级数量', () => {
  it('系统存在且为已量产状态', () => {
    const sys = systemById(SYSTEM_ID)
    expect(sys).toBeDefined()
    expect(sys!.status).toBe('shipping')
    expect(sys!.generation).toBe('blackwell-ultra')
  })

  it('18 个计算托盘、9 个 NVLink 交换托盘', () => {
    const computeTray = assemblyById('asm.gb300.compute-tray')!
    const nvswitchTray = assemblyById('asm.gb300.nvswitch-tray')!
    expect(computeTray.count).toBe(18)
    expect(nvswitchTray.count).toBe(9)
    // 关键数量必须带官方出处
    expect(computeTray.countClaim?.value).toBe(18)
    expect(nvswitchTray.countClaim?.value).toBe(9)
    expect(computeTray.countClaim?.sourceId).toBe('src.nvidia-nvl72-ra')
    expect(nvswitchTray.countClaim?.sourceId).toBe('src.nvidia-nvl72-ra')
  })

  it('GPU 总数 = 18 × 4 = 72，与系统 keySpecs 的官方值一致', () => {
    expect(totalInstances('asm.gb300.b300-gpu', RACK)).toBe(72)
    expect(assemblyById('asm.gb300.b300-gpu')!.count).toBe(4)
    expect(systemById(SYSTEM_ID)!.keySpecs.gpuCount!.value).toBe(72)
  })

  it('Grace CPU 总数 = 18 × 2 = 36，与系统 keySpecs 的官方值一致', () => {
    expect(totalInstances('asm.gb300.grace-cpu', RACK)).toBe(36)
    expect(assemblyById('asm.gb300.grace-cpu')!.count).toBe(2)
    expect(systemById(SYSTEM_ID)!.keySpecs.cpuCount!.value).toBe(36)
  })

  it('★ NVSwitch：9 托盘 × 2 ASIC = 18 颗，恰好等于每张 GPU 的 NVLink 链路数', () => {
    const asic = assemblyById('asm.gb300.nvswitch-asic')!
    expect(asic.count).toBe(2)
    expect(asic.countClaim?.value).toBe(2)
    expect(totalInstances('asm.gb300.nvswitch-asic', RACK)).toBe(18)

    // 18 条 NVLink / GPU ↔ 18 颗 NVSwitch，一一对应就是「无阻塞全互联」的物理含义
    const gpu = componentById('cmp.gb300.b300-gpu')!
    expect(gpu.specs.nvlinkLinksPerGpu!.value).toBe(18)
  })

  it('ConnectX-8 总数 = 18 托盘 × 2 夹层板 × 2 = 72，即官方的 1:1 GPU:NIC', () => {
    expect(totalInstances('asm.gb300.cx8-nic', RACK)).toBe(72)
    expect(totalInstances('asm.gb300.cx8-nic', RACK)).toBe(totalInstances('asm.gb300.b300-gpu', RACK))
    expect(componentById('cmp.gb300.connectx-8')!.specs.gpuToNicRatio!.value).toBe('1:1')
  })

  it('每托盘 1 张 BlueField-3；电源架 8 个、机架内管理交换机 2 台', () => {
    expect(assemblyById('asm.gb300.bf3-dpu')!.count).toBe(1)
    expect(assemblyById('asm.gb300.power-shelf')!.count).toBe(8)
    expect(assemblyById('asm.gb300.inrack-mgmt-switch')!.count).toBe(2)
  })
})

describe('GB300 NVL72：代际口径（最容易讲错的地方）', () => {
  const trayDescendants = descendantsOf('asm.gb300.compute-tray')
  const trayComponents = trayDescendants.map((a) => componentById(a.componentId)!)
  const names = trayComponents.map((c) => c.name).join(' | ')

  it('★ 计算托盘含 ConnectX-8 与 BlueField-3', () => {
    expect(trayDescendants.some((a) => a.componentId === 'cmp.gb300.connectx-8')).toBe(true)
    expect(trayDescendants.some((a) => a.componentId === 'cmp.gb300.bluefield-3')).toBe(true)
    expect(names).toContain('ConnectX-8')
    expect(names).toContain('BlueField-3')
  })

  it('★ 计算托盘不含上一代的 ConnectX-7 / BlueField-2', () => {
    expect(names).not.toContain('ConnectX-7')
    expect(names).not.toContain('BlueField-2')
    expect(trayComponents.some((c) => c.id.includes('connectx-7'))).toBe(false)
    expect(trayComponents.some((c) => c.id.includes('bluefield-2'))).toBe(false)
  })

  it('计算托盘 = 2 Grace + 4 B300（GB300 口径，不是任何 1:2 变体）', () => {
    const byRole = new Map(descendantsOf('asm.gb300.compute-tray').map((a) => [a.roleKey, a]))
    expect(byRole.get('host-cpu')!.count).toBe(2)
    expect(byRole.get('accelerator')!.count).toBe(4)
  })

  it('管理节点用 ConnectX-7 是正常的——它与计算托盘不是同一类节点', () => {
    // 这条用来防止「全局搜 CX-7 然后误删」的过度修正
    expect(componentById('cmp.gb300.mgmt-node')!.specs.nics!.value).toContain('ConnectX-7')
    expect(descendantsOf('asm.gb300.compute-tray').some((a) => a.componentId === 'cmp.gb300.mgmt-node')).toBe(
      false,
    )
  })
})

describe('GB300 NVL72：六平面连接', () => {
  const planes: NetworkPlane[] = ['nvlink', 'scaleout', 'business', 'mgmt', 'power', 'cooling']

  it.each(planes)('%s 平面至少有一条连接', (plane) => {
    expect(connectionsOfPlane(SYSTEM_ID, plane).length).toBeGreaterThan(0)
  })

  it('GPU ↔ NVSwitch 是 all-to-all 铜背板连接（按类型建边，不铺 72×18 条实例）', () => {
    const conn = FACTORY_PACK.connections.find((c) => c.id === 'con.gb300.gpu-nvswitch')!
    expect(conn.plane).toBe('nvlink')
    expect(conn.topology).toBe('all-to-all')
    expect(conn.medium).toBe('copper-backplane')
    expect(conn.bandwidth?.value).toBe(1800)
  })

  it('scale-out 计算网为 rail-optimized + fat-tree', () => {
    const topos = connectionsOfPlane(SYSTEM_ID, 'scaleout').map((c) => c.topology)
    expect(topos).toContain('rail-optimized')
    expect(topos).toContain('fat-tree')
  })

  it('机架内管理交换机由直流母排供电（官方明确区分机架内外供电方式）', () => {
    const conn = FACTORY_PACK.connections.find((c) => c.id === 'con.gb300.busbar-mgmt-switch')!
    expect(conn.plane).toBe('power')
    expect(conn.medium).toBe('busbar')
    expect(componentById('cmp.shared.busbar')!.specs.feedsInRackSwitches!.value).toBe(true)
  })
})

describe('GB300 NVL72：功率、液冷与 roofline 输入', () => {
  it('整机架最高 142 kW，来自官方参考架构且标注为「up to」', () => {
    const claim = systemById(SYSTEM_ID)!.keySpecs.rackPowerKW!
    expect(claim.value).toBe(142)
    expect(claim.unit).toBe('kW')
    expect(claim.sourceId).toBe('src.nvidia-nvl72-ra')
    expect(claim.note).toContain('up to')
  })

  it('电源架供电能力（8 × 33 kW）覆盖机架最高负载', () => {
    const shelf = componentById('cmp.gb300.power-shelf')!
    const shelves = shelf.specs.shelvesPerRack!.value as number
    const perShelfKW = shelf.specs.shelfPowerKW!.value as number
    expect(shelves * perShelfKW).toBeGreaterThan(
      systemById(SYSTEM_ID)!.keySpecs.rackPowerKW!.value as number,
    )
    expect((shelf.specs.psusPerShelf!.value as number) * (shelf.specs.psuPowerKW!.value as number)).toBe(33)
  })

  it('机架为液冷，冷却链路完整：冷板 → 歧管 → CDU → 机房一次侧水', () => {
    expect(componentById('cmp.shared.oberon-rack')!.specs.liquidCooled!.value).toBe(true)
    const coolingIds = connectionsOfPlane(SYSTEM_ID, 'cooling').map((c) => c.id)
    expect(coolingIds).toContain('con.gb300.tray-cold-plate-manifold')
    expect(coolingIds).toContain('con.gb300.manifold-cdu')
    expect(coolingIds).toContain('con.gb300.cdu-facility-water')
  })

  it('B300 的 mathSpecs 与官方系统级数字自洽（显存 ×72≈20TB、带宽 ×72=576TB/s）', () => {
    const gpu = componentById('cmp.gb300.b300-gpu')!
    expect(gpu.kind).toBe('gpu')
    const math = (gpu as Extract<typeof gpu, { kind: 'gpu' }>).mathSpecs!
    expect(math).not.toBeNull()

    // 288 GB × 72 = 20,736 GB ≈ 官方「20 TB」口径
    expect(math.memoryGB * 72).toBeGreaterThan(20_000)
    expect(math.memoryGB * 72).toBeLessThan(21_000)
    // 8 TB/s × 72 = 576 TB/s，与产品页完全一致
    expect(math.bandwidthTBs * 72).toBe(
      systemById(SYSTEM_ID)!.keySpecs.gpuMemoryBandwidthTBs!.value as number,
    )
    // FP4 稠密 15 PFLOPS × 72 = 1080 PFLOPS，与产品页稠密口径一致
    expect((math.fp4Tflops! / 1000) * 72).toBe(
      systemById(SYSTEM_ID)!.keySpecs.fp4DensePflops!.value as number,
    )
    // TDP 官方未公布 → 必须是 null，不得编数
    expect(math.tdpW).toBeNull()
    expect(math.derivation).toContain('÷ 72')
  })

  it('单卡 TDP 的 Claim 明确标注为「官方未公布」', () => {
    const claim = componentById('cmp.gb300.b300-gpu')!.specs.tdpW!
    expect(claim.value).toBeNull()
    expect(claim.note).toContain('未')
  })

  it('官方文档内部冲突已在数据里留痕（每托盘 HBM 与 E1.S 数量）', () => {
    expect(componentById('cmp.gb300.b300-gpu')!.specs.hbmPerGpuGB!.note).toContain('720 GB')
    expect(assemblyById('asm.gb300.cache-nvme')!.countClaim!.note).toContain('8')
  })
})

describe('参考模型', () => {
  it('deepseek-v3 存在，且 KV 为已知可计算的 MLA 口径', () => {
    const m = modelById('deepseek-v3')!
    expect(m).toBeDefined()
    expect(m.kvSpec.kind).toBe('mla')
    expect(kvBytesPerToken(m.kvSpec)).toBe(70_272)
    expect(m.activeParamsB).toBeLessThan(m.totalParamsB) // MoE：算力看激活参、显存看总参
    expect(m.moe).not.toBeNull()
  })

  it('本批收录的模型 KV 口径全部已知（产能估算能真跑出数）', () => {
    for (const m of FACTORY_PACK.models) {
      expect(m.kvSpec.kind, `${m.id} 的 KV 口径`).not.toBe('unsupported')
      expect(kvBytesPerToken(m.kvSpec), `${m.id}`).not.toBeNull()
    }
  })

  it('MLA 的每 token KV 字节数显著小于同期 GQA 模型', () => {
    const mla = kvBytesPerToken(modelById('deepseek-v3')!.kvSpec)!
    const gqa = kvBytesPerToken(modelById('llama3-70b')!.kvSpec)!
    expect(mla).toBeLessThan(gqa)
  })
})

describe('数据源登记', () => {
  it('7 类来源全部登记（券商类拆成 GS 与 JPM 两条独立记录）', () => {
    const ids = FACTORY_PACK.sources.map((s) => s.id)
    expect(ids).toContain('src.nvidia-nvl72-ra')
    expect(ids).toContain('src.nvidia-gb300-page')
    expect(ids).toContain('src.nvidia-rubin-press')
    expect(ids).toContain('src.semianalysis-nvl576')
    expect(ids).toContain('src.waic2026-deck')
    expect(ids).toContain('src.marvell-fy27q1-call')
    expect(ids).toContain('src.gs-marvell-note')
    expect(ids).toContain('src.jpm-asic-report')
  })

  it('SemiAnalysis 明确登记为分析师报告而非官方源', () => {
    const s = FACTORY_PACK.sources.find((x) => x.id === 'src.semianalysis-nvl576')!
    expect(s.kind).toBe('analyst_report')
    expect(s.publisher).toBe('SemiAnalysis')
    expect(s.note).toContain('非 NVIDIA 官方')
  })

  it('本地文件类源都指向 sources/ 目录', () => {
    for (const s of FACTORY_PACK.sources) {
      if (s.localFile !== null) expect(s.localFile.startsWith('sources/'), s.id).toBe(true)
    }
  })

  it('GB300 的事实全部来自 NVIDIA 官方两源', () => {
    const gb300Sources = new Set(
      FACTORY_PACK.assemblies
        .filter((a) => a.systemId === SYSTEM_ID && a.countClaim)
        .map((a) => a.countClaim!.sourceId),
    )
    expect([...gb300Sources]).toEqual(['src.nvidia-nvl72-ra'])
  })
})

/**
 * v1.4 W-B：`src.waic2026-deck` 是「国产超节点对照」段与数据流叙述的素材源，
 * 但它是内部材料转述（internal_deck），不是可验证的官方规格——纪律要求它只能进
 * narration / presalesNote / summary 这类纯文案字段（见 `flows.ts` 的 WAIC_SOURCE 用法与
 * `ReportPage.tsx` 的国产超节点对照段），绝不能包进任何 `Claim`。
 *
 * 现状本来就满足这条规则（deck 从未被当作某个数量/规格的证据源），这条测试单纯是把
 * 「现状为真」钉成回归锁：以后谁想偷懒直接拿 deck 里的数字当 Claim 出处，这里会先红。
 */
describe('★ WAIC 2026 内部材料纪律：deck 源不得进入任何 Claim（锁防回归）', () => {
  it('src.waic2026-deck 不出现在任何 keySpecs / specs / countClaim / bandwidth 的 sourceId 上', () => {
    const offenders: string[] = []
    for (const s of FACTORY_PACK.systems) {
      for (const [k, c] of Object.entries(s.keySpecs)) {
        if (c.sourceId === 'src.waic2026-deck') offenders.push(`${s.id}.keySpecs.${k}`)
      }
    }
    for (const c of FACTORY_PACK.components) {
      for (const [k, claim] of Object.entries(c.specs)) {
        if (claim.sourceId === 'src.waic2026-deck') offenders.push(`${c.id}.specs.${k}`)
      }
    }
    for (const a of FACTORY_PACK.assemblies) {
      if (a.countClaim && a.countClaim.sourceId === 'src.waic2026-deck') {
        offenders.push(`${a.id}.countClaim`)
      }
    }
    for (const conn of FACTORY_PACK.connections) {
      if (conn.bandwidth && conn.bandwidth.sourceId === 'src.waic2026-deck') {
        offenders.push(`${conn.id}.bandwidth`)
      }
    }
    expect(offenders, `deck 源混入了 Claim.sourceId：${offenders.join('、')}`).toEqual([])
  })
})

// ═══════════════════════════ Vera Rubin NVL72（B4） ═══════════════════════════

const VR = 'sys.vera-rubin-nvl72'
const VR_RACK = 'asm.rubin.rack'

/** 本代际文件里作者写下的全部 Claim（不含复用的共享/上代组件）。 */
function claimsAuthoredIn(
  system: typeof VERA_RUBIN_SYSTEM,
  components: typeof VERA_RUBIN_COMPONENTS,
  assemblies: typeof VERA_RUBIN_ASSEMBLIES,
  connections: typeof VERA_RUBIN_CONNECTIONS,
): { where: string; claim: Claim }[] {
  const out: { where: string; claim: Claim }[] = []
  for (const [k, c] of Object.entries(system.keySpecs)) out.push({ where: `${system.id}.keySpecs.${k}`, claim: c })
  for (const comp of components) {
    for (const [k, c] of Object.entries(comp.specs)) out.push({ where: `${comp.id}.specs.${k}`, claim: c })
  }
  for (const a of assemblies) if (a.countClaim) out.push({ where: `${a.id}.countClaim`, claim: a.countClaim })
  for (const c of connections) if (c.bandwidth) out.push({ where: `${c.id}.bandwidth`, claim: c.bandwidth })
  return out
}

describe('Vera Rubin NVL72：机架级数量（NVIDIA 官方口径）', () => {
  it('系统存在且为已发布（announced）状态', () => {
    expect(VERA_RUBIN_SYSTEM.status).toBe('announced')
    expect(VERA_RUBIN_SYSTEM.generation).toBe('vera-rubin')
    expect(systemById(VR)).toBeDefined()
  })

  it('18 计算托盘 + 9 交换托盘（与 GB300 骨架相同）', () => {
    expect(assemblyById('asm.rubin.compute-tray')!.count).toBe(18)
    expect(assemblyById('asm.rubin.nvswitch-tray')!.count).toBe(9)
    expect(assemblyById('asm.rubin.compute-tray')!.countClaim!.sourceId).toBe('src.nvidia-rubin-pod-blog')
  })

  it('GPU 72 张、CPU 36 颗，与官方规格表 keySpecs 一致', () => {
    expect(totalInstances('asm.rubin.rubin-gpu', VR_RACK)).toBe(72)
    expect(totalInstances('asm.rubin.vera-cpu', VR_RACK)).toBe(36)
    expect(VERA_RUBIN_SYSTEM.keySpecs.gpuCount!.value).toBe(72)
    expect(VERA_RUBIN_SYSTEM.keySpecs.cpuCount!.value).toBe(36)
  })

  it('★ NVLink 6 交换芯片：9 托盘 × 4 = 36 颗（GB300 是 18 颗，最容易讲错的对比）', () => {
    expect(assemblyById('asm.rubin.nvswitch-asic')!.count).toBe(4)
    expect(totalInstances('asm.rubin.nvswitch-asic', VR_RACK)).toBe(36)
    expect(totalInstances('asm.gb300.nvswitch-asic', RACK)).toBe(18)
  })

  it('★ ConnectX-9：18 托盘 × 4 板 × 2 = 144 张 = 每 GPU 两张（官方 DGX 规格表口径）', () => {
    expect(totalInstances('asm.rubin.cx9-nic', VR_RACK)).toBe(144)
    expect(totalInstances('asm.rubin.cx9-nic', VR_RACK)).toBe(
      totalInstances('asm.rubin.rubin-gpu', VR_RACK) * 2,
    )
    expect(componentById('cmp.rubin.connectx-9')!.specs.gpuToNicRatio!.value).toContain('1:2')
  })

  it('★ 代际口径：托盘里是 ConnectX-9 与 BlueField-4，不是上一代 CX-8 / BF-3', () => {
    const names = descendantsOf('asm.rubin.compute-tray')
      .map((a) => componentById(a.componentId)!.name)
      .join(' | ')
    expect(names).toContain('ConnectX-9')
    expect(names).toContain('BlueField-4')
    expect(names).not.toContain('ConnectX-8')
    expect(names).not.toContain('BlueField-3')
  })

  it('计算托盘仍是 2 CPU + 4 GPU（超级芯片口径：2 个超级芯片 = 2 Vera + 4 Rubin）', () => {
    const byRole = new Map(descendantsOf('asm.rubin.compute-tray').map((a) => [a.roleKey, a]))
    expect(byRole.get('host-cpu')!.count).toBe(2)
    expect(byRole.get('accelerator')!.count).toBe(4)
    expect(componentById('cmp.rubin.compute-tray')!.specs.superchipsPerTray!.value).toBe(2)
  })
})

describe('Vera Rubin NVL72：证据纪律与 null 传播', () => {
  const claims = claimsAuthoredIn(
    VERA_RUBIN_SYSTEM,
    VERA_RUBIN_COMPONENTS,
    VERA_RUBIN_ASSEMBLIES,
    VERA_RUBIN_CONNECTIONS,
  )

  /**
   * ★ v1.5 订正：本代际的 evidence 不再是「一律 verified_spec」。
   *
   * `types.ts` 把 `verified_spec` 定义成「官方规格表/参考架构中的**确切数字**」，
   * 有两类内容不满足这个定义，硬标成 verified_spec 是给读者错误的确定性：
   * 1. 发布稿里的**前瞻性上市承诺**（两篇 Vera Rubin 发布稿末尾都带 Safe Harbor 声明）；
   * 2. 官方英文本身**有歧义**、当前值是本项目对该英文的一种解读（ConnectX-9 板级拆分），
   *    或官方规格表**刻意留空**、数值取自另一层级口径（NVLink-C2C 的 1.8 TB/s 是每超级芯片，
   *    产品页 Rubin GPU 列写的是「-」）。
   *
   * 因此这条断言改成：官方源 + announced 仍是硬约束；evidence 放宽到
   * `verified_spec | vendor_claim`，但**下面那条白名单锁死了哪几条可以是 vendor_claim**
   * ——任何人把一个规格表数字悄悄降级、或把一条解读悄悄升级成 verified_spec，都会在这里红掉。
   */
  const VENDOR_CLAIM_ALLOWLIST = new Set([
    // 发布稿里的前瞻性上市承诺（Safe Harbor）
    'sys.vera-rubin-nvl72.keySpecs.availability',
    // 产品页规格表 Rubin GPU 列在 NVLink-C2C 行是「-」；1.8 TB/s 是每超级芯片口径
    'cmp.rubin.rubin-gpu.specs.c2cBandwidthGBs',
    'con.rubin.vera-gpu-c2c.bandwidth',
    // 「quad ConnectX-9 SuperNIC boards」英文有歧义，板级拆分不是确证事实
    'cmp.rubin.cx9-mezzanine.specs.boardsPerTray',
    'cmp.rubin.cx9-mezzanine.specs.nicsPerBoard',
    'cmp.rubin.cx9-mezzanine.specs.cpuPairing',
    'asm.rubin.nic-board.countClaim',
    'asm.rubin.cx9-nic.countClaim',
  ])

  it('★ 本代际的每条 Claim 都引用 NVIDIA 官方源，且状态为 announced', () => {
    const official = new Set(
      FACTORY_PACK.sources
        .filter((s) => s.kind === 'official_doc' || s.kind === 'official_press')
        .map((s) => s.id),
    )
    expect(claims.length).toBeGreaterThan(40)
    for (const { where, claim } of claims) {
      expect(official.has(claim.sourceId), `${where} 引用了非官方源 ${claim.sourceId}`).toBe(true)
      expect(claim.status, `${where}.status`).toBe('announced')
      expect(['verified_spec', 'vendor_claim'], `${where}.evidence`).toContain(claim.evidence)
      expect(claim.locator === null || claim.locator.length > 0, `${where}.locator`).toBe(true)
    }
  })

  it('★ 只有白名单里的 Claim 能是 vendor_claim（其余必须是官方规格表里的确切数字）', () => {
    const actual = claims.filter((c) => c.claim.evidence === 'vendor_claim').map((c) => c.where)
    expect(new Set(actual)).toEqual(VENDOR_CLAIM_ALLOWLIST)
    // 每条 vendor_claim 都必须写清「为什么它不是 verified_spec」
    for (const { where, claim } of claims.filter((c) => c.claim.evidence === 'vendor_claim')) {
      expect(claim.note, `${where} 是 vendor_claim 却没有说明理由`).not.toBeNull()
      expect(claim.note!.length, `${where}.note 太短`).toBeGreaterThan(20)
    }
  })

  it('★ 官方未公布的项一律 value: null 且带说明（不编数）', () => {
    const nulls = claims.filter((c) => c.claim.value === null)
    expect(nulls.length).toBeGreaterThan(5)
    for (const { where, claim } of nulls) {
      expect(claim.note, `${where} 是 null 却没有说明`).not.toBeNull()
      expect(claim.note!.length, `${where}.note 太短`).toBeGreaterThan(8)
    }
  })

  it('★ 整机架功率官方未公布 → null（产能估算的 tokens/W 会因此拒绝出数）', () => {
    const claim = VERA_RUBIN_SYSTEM.keySpecs.rackPowerKW!
    expect(claim.value).toBeNull()
    expect(claim.note).toContain('未在任何官方规格表中公布')
  })

  it('★ Rubin GPU 单卡 TDP 未公布 → mathSpecs.tdpW 为 null（1800 W 是另一款产品的假设，不挪用）', () => {
    const gpu = componentById('cmp.rubin.rubin-gpu')!
    const math = (gpu as Extract<typeof gpu, { kind: 'gpu' }>).mathSpecs!
    expect(math.tdpW).toBeNull()
    expect(gpu.specs.tdpW!.value).toBeNull()
    expect(gpu.specs.tdpW!.note).toContain('NVL4')
  })

  it('★ mathSpecs 只取带「Dense specification」脚注的官方值，与整机架稠密值自洽', () => {
    const gpu = componentById('cmp.rubin.rubin-gpu')!
    const math = (gpu as Extract<typeof gpu, { kind: 'gpu' }>).mathSpecs!
    expect(math.memoryGB).toBe(288)
    expect(math.bandwidthTBs).toBe(22)
    // 35 PFLOPS/卡 × 72 = 2,520 PFLOPS（官方 NVFP4 Training 稠密值）
    expect((math.fp4Tflops! / 1000) * 72).toBe(VERA_RUBIN_SYSTEM.keySpecs.fp4DensePflops!.value)
    // 17.5 PFLOPS/卡 × 72 = 1,260 PFLOPS（官方 FP8/FP6 Training 稠密值）
    expect((math.fp8Tflops! / 1000) * 72).toBe(VERA_RUBIN_SYSTEM.keySpecs.fp8DensePflops!.value)
    // 显存/带宽与整机架口径自洽（1% 容差：官方 20.7 TB / 1,580 TB/s 是取整后的值）
    expect(Math.abs((math.memoryGB * 72) / 1000 - 20.7) / 20.7).toBeLessThan(0.01)
    expect(Math.abs(math.bandwidthTBs * 72 - 1580) / 1580).toBeLessThan(0.01)
    // NVFP4 Inference 那一列没有稠密标注，绝不能出现在 mathSpecs 里
    expect(math.fp4Tflops).not.toBe(50_000)
    expect(math.derivation).toContain('Dense specification')
  })

  it('预发布限定（Preliminary information）在关键 Claim 上留痕', () => {
    expect(VERA_RUBIN_SYSTEM.keySpecs.gpuCount!.note).toContain('Preliminary')
    expect(VERA_RUBIN_SYSTEM.keySpecs.fp4InferencePflops!.note).toContain('稀疏')
  })

  /**
   * ★ v1.5：把「Preliminary information」从「手写 2 条」升级成「按源自动注入」后的可执行锁。
   *
   * 背景：`DetailPanel` 的 `SourceLine` 只渲染 source 的 title/publisher/asOf，`SourceRef.note`
   * 从不上屏——写在 sources.ts 里那句脚注声明对最终用户不可见。用户看到的是一枚证据徽章加一个
   * 不带任何预发布提示的数字。因此这条限定必须落在 **Claim.note** 上，且必须是无遗漏的。
   */
  it('★ 三个带脚注 1 的源上的每条有值 Claim 都自动带「Preliminary information」', () => {
    const PRELIM_SOURCES = new Set([
      'src.nvidia-vera-rubin-page',
      'src.nvidia-dgx-rubin-page',
      'src.nvidia-vera-rubin-datasheet',
    ])
    const targets = claims.filter((c) => PRELIM_SOURCES.has(c.claim.sourceId) && c.claim.value !== null)
    // 这三个源承载了 20.7 TB / 1,580 TB/s / 2,520 PFLOPS / 3,168 核 / 1,296 颗… 十几条规格
    expect(targets.length).toBeGreaterThan(15)
    for (const { where, claim } of targets) {
      expect(claim.note, `${where} 落在脚注 1 下却没有预发布提示`).toContain('Preliminary information')
    }
  })

  it('★ V1 机架级 NVLink 走后部铜缆脊柱（不是 PCB 中板），且两句官方话并存', () => {
    const bp = componentById('cmp.rubin.nvlink-midplane')!
    // 5,000 根铜缆 / 4 个线缆匣是官方数字，不再是「未公布」
    expect(bp.specs.cableCount!.value).toBe(5000)
    expect(bp.specs.cableCartridgeCount!.value).toBe(4)
    // locator 必须同时含两句官方原文，防止有人再用一句否定另一句
    expect(bp.specs.medium!.locator).toContain('NVLink spine at the back of the rack')
    expect(bp.specs.medium!.locator).toContain('through the PCB midplane')
    expect(bp.specs.medium!.note).toContain('不要用一句去否定另一句')
    // 「cable-free」的主语是托盘：机架组件必须显式说明这条边界
    expect(componentById('cmp.rubin.mgx-rack')!.specs.cableFree!.note).toContain('tray')
  })

  it('★ V5 NVLink-C2C 的 1.8 TB/s 是每超级芯片口径，不得按单卡乘 72', () => {
    const c2c = componentById('cmp.rubin.rubin-gpu')!.specs.c2cBandwidthGBs!
    expect(c2c.value).toBe(1800)
    expect(c2c.evidence).toBe('vendor_claim')
    expect(c2c.note).toContain('每超级芯片')
    // 36 × 1.8 ≈ 官方整机架 65 TB/s；72 × 1.8 = 129.6 会差一倍
    expect(36 * 1.8).toBeCloseTo(64.8, 5)
    expect(VERA_RUBIN_SYSTEM.keySpecs.c2cAggregateBandwidthTBs!.value).toBe(65)
  })

  it('★ V4 ConnectX-9 板级拆分是解读不是事实：乘积锁死 8，因子降为 low', () => {
    const mez = componentById('cmp.rubin.cx9-mezzanine')!
    // 确证事实：每托盘 8 张
    expect(mez.specs.nicsPerTray!.value).toBe(8)
    expect(mez.specs.nicsPerTray!.evidence).toBe('verified_spec')
    // 两个因子都是低置信解读，且乘积必须仍等于 8
    for (const k of ['boardsPerTray', 'nicsPerBoard'] as const) {
      expect(mez.specs[k]!.confidence, k).toBe('low')
      expect(mez.specs[k]!.note, k).toContain('歧义')
    }
    expect((mez.specs.boardsPerTray!.value as number) * (mez.specs.nicsPerBoard!.value as number)).toBe(8)
  })

  it('★ V7 上市时间是 vendor_claim，且两版官方口径都留痕；status 仍为 announced', () => {
    const av = VERA_RUBIN_SYSTEM.keySpecs.availability!
    expect(av.evidence).toBe('vendor_claim')
    expect(av.sourceId).toBe('src.nvidia-vera-rubin-fullprod-press')
    expect(av.locator).toContain('Production shipments of Vera Rubin are set to begin starting this fall')
    expect(av.note).toContain('second half of 2026') // CES 2026-01 的原口径未被丢弃
    // 「ramping into full production」说的是制造，客户出货只是 set to begin ⇒ 不改 shipping
    expect(VERA_RUBIN_SYSTEM.status).toBe('announced')
  })
})

// ═══════════════════════════ Rubin Ultra NVL576（B4） ═══════════════════════════

const RU = 'sys.rubin-ultra-nvl576'
const RU_RACK = 'asm.ru.rack'

describe('Rubin Ultra NVL576：结构（官方拓扑事实 + SemiAnalysis 结构细节）', () => {
  it('系统为 announced 状态，产能策略为 analyst-modeled（v1.3：拓扑官方已确认，细节仍是分析师推测）', () => {
    expect(RUBIN_ULTRA_SYSTEM.status).toBe('announced')
    expect(RUBIN_ULTRA_SYSTEM.capacityPolicy).toBe('analyst-modeled')
    expect(RUBIN_ULTRA_SYSTEM.generation).toBe('rubin-ultra')
    expect(systemById(RU)!.sourceIds).toEqual(
      expect.arrayContaining([
        'src.nvidia-rubin-pod-blog',
        'src.nvidia-ocp-vera-rubin-blog',
        'src.nvidia-gtc25-keynote-blog',
        'src.cnbc-kyber-delay',
        'src.semianalysis-nvl576',
      ]),
    )
  })

  it('8 个 Oberon 机架构成**一个** NVLink 域，合计 576 张 GPU', () => {
    expect(assemblyById(RU_RACK)!.count).toBe(8)
    expect(totalInstances('asm.ru.gpu', RU_RACK)).toBe(72) // 每机架
    expect(totalInstances('asm.ru.gpu')).toBe(576) // 全域
    expect(RUBIN_ULTRA_SYSTEM.keySpecs.gpuCount!.value).toBe(576)
  })

  it('★ 9+18+9：18 个 1U 计算托架 + 18 个 0.75U 交换托架', () => {
    expect(assemblyById('asm.ru.compute-tray')!.count).toBe(18)
    expect(assemblyById('asm.ru.nvswitch-tray')!.count).toBe(18)
    // 18 × 0.75U = 13.5U
    expect(assemblyById('asm.ru.nvswitch-tray')!.rackU!.height).toBe(13.5)
    expect(componentById('cmp.rubin-ultra.nvswitch-tray')!.specs.trayHeightU!.value).toBe(0.75)
  })

  it('★ 可扩展交换托架每个 4 颗 NVLink 7 芯片 ⇒ 每机架 72 颗（NVL72 版是 36 颗）', () => {
    expect(assemblyById('asm.ru.nvswitch-asic')!.count).toBe(4)
    expect(totalInstances('asm.ru.nvswitch-asic', RU_RACK)).toBe(72)
    expect(componentById('cmp.rubin-ultra.nvswitch-tray')!.specs.asicsPerRack!.value).toBe(72)
  })

  it('计算托架 = 2 Vera CPU + 4 Rubin Ultra GPU；CPU socket 总数 288 与表①一致', () => {
    const byRole = new Map(descendantsOf('asm.ru.compute-tray').map((a) => [a.roleKey, a]))
    expect(byRole.get('host-cpu')!.count).toBe(2)
    expect(byRole.get('accelerator')!.count).toBe(4)
    expect(totalInstances('asm.ru.vera-cpu')).toBe(288)
    expect(RUBIN_ULTRA_SYSTEM.keySpecs.cpuSocketCount!.value).toBe(288)
  })

  it('电源架 4 × 3U/110 kW（6 × 18.3 kW）', () => {
    const shelf = componentById('cmp.rubin-ultra.power-shelf')!
    expect(assemblyById('asm.ru.power-shelf')!.count).toBe(4)
    expect(shelf.specs.shelfPowerKW!.value).toBe(110)
    expect(shelf.specs.psuPowerKW!.value).toBe(18.3)
    expect((shelf.specs.psusPerShelf!.value as number) * 18.3).toBeCloseTo(110, 0)
  })

  it('★ 跨机架 scale-up 光互连是本代新增层（机架内仍是铜）', () => {
    expect(assemblyById('asm.ru.optics')).toBeDefined()
    expect(assemblyById('asm.ru.interrack-fabric')!.roleKey).toBe('interrack-scaleup-fabric')
    expect(componentById('cmp.rubin-ultra.backplane')!.specs.medium!.value).toContain('铜')
    const nvlink = connectionsOfPlane(RU, 'nvlink').map((c) => c.id)
    expect(nvlink).toContain('con.ru.optics-interrack')
  })

  it('★ 来源没写的东西不建模：全代际没有 scale-out / DPU 相关装配与连接', () => {
    const roleKeys = new Set(RUBIN_ULTRA_ASSEMBLIES.map((a) => a.roleKey))
    expect(roleKeys.has('scaleout-nic')).toBe(false)
    expect(roleKeys.has('north-south-dpu')).toBe(false)
    expect(connectionsOfPlane(RU, 'scaleout').length).toBe(0)
    expect(connectionsOfPlane(RU, 'business').length).toBe(0)
  })

  // v1.4 W-A：把 rubin-ultra-nvl576.ts 里「CPO 是互斥在研版本，同树并存=建了一台不存在的机器」
  // 这条裁决（原来只在注释里）升级为可执行锁——CPO 只能出现在讲解站与 specs 里，
  // 不能进装配树、不能有自己的 roleKey，装配树与 nvlink 平面连接集必须原样保持 NPO 版建模。
  it('★ CPO 只做讲解不建实体：装配树没有 cpo 类角色，光模块仍是 NPO 16 个，nvlink 平面连接集恰为现有 5 条', () => {
    const roleKeys = [...new Set(RUBIN_ULTRA_ASSEMBLIES.map((a) => a.roleKey))]
    for (const rk of roleKeys) {
      expect(rk.toLowerCase(), `roleKey ${rk} 不应含 cpo`).not.toContain('cpo')
    }
    expect(assemblyById('asm.ru.optics')!.count).toBe(16)
    const nvlinkConnIds = connectionsOfPlane(RU, 'nvlink').map((c) => c.id)
    expect(nvlinkConnIds).toEqual([
      'con.ru.gpu-nvswitch',
      'con.ru.nvswitch-backplane',
      'con.ru.tray-backplane',
      'con.ru.nvswitch-optics',
      'con.ru.optics-interrack',
    ])
  })

  it('第 3 站 scene.ru.optics-formfactor：CPO vs NPO 讲解站结构与三段式证据分层措辞', () => {
    const scenes = RUBIN_ULTRA_SCENES
    expect(scenes.length).toBe(3)
    const ids = RUBIN_ULTRA_ASSEMBLIES.map((a) => a.id)
    for (const s of scenes) {
      expect(s.systemId).toBe(RU)
      for (const h of s.highlightAssemblyIds) expect(ids, `${s.id} → ${h}`).toContain(h)
      if (s.focusAssemblyId) expect(ids).toContain(s.focusAssemblyId)
    }
    const optics = scenes.find((s) => s.id === 'scene.ru.optics-formfactor')!
    expect(optics.lodLevel).toBe('board')
    expect(optics.focusAssemblyId).toBe('asm.ru.nvswitch-tray')
    expect(optics.planes).toEqual(['nvlink'])
    expect(optics.highlightAssemblyIds).toEqual(['asm.ru.nvswitch-asic', 'asm.ru.optics'])
    expect(optics.narration).toContain('NPO')
    expect(optics.narration).toContain('CPO')
    expect(optics.narration).toContain('不可更换')
  })
})

describe('★ Rubin Ultra NVL576：SemiAnalysis 专项证据纪律（四重锁，只施加于 SemiAnalysis 源 Claim）', () => {
  const allClaims = claimsAuthoredIn(
    RUBIN_ULTRA_SYSTEM,
    RUBIN_ULTRA_COMPONENTS,
    RUBIN_ULTRA_ASSEMBLIES,
    RUBIN_ULTRA_CONNECTIONS,
  )
  // v1.3：系统本身已 announced，keySpecs/组件里混入了官方（POD/OCP/GTC25/CNBC）Claim——
  // 这四重锁只能施加在真正引用 SemiAnalysis 分析师文章的那些 Claim 上，不能再要求
  // 「这个系统下的每一条 Claim」都是 SemiAnalysis（pack.test.ts 另有通用的跨系统规则）。
  const claims = allClaims.filter(({ claim }) => claim.sourceId === 'src.semianalysis-nvl576')

  it('至少一部分内容仍然是 SemiAnalysis 专属（不能因为官方补了几条 Claim 就把分析师内容全挤没）', () => {
    expect(claims.length).toBeGreaterThan(30)
    expect(claims.length).toBeLessThan(allClaims.length) // 官方 Claim 确实混入了，两者不相等
  })

  it('SemiAnalysis 源 Claim 四重锁：状态 forecast、证据 ∈ {analyst_estimate, forecast}、置信度 low、locator 带页码', () => {
    for (const { where, claim } of claims) {
      expect(claim.status, `${where}.status`).toBe('forecast')
      expect(['analyst_estimate', 'forecast'], `${where}.evidence=${claim.evidence}`).toContain(claim.evidence)
      expect(claim.confidence, `${where}.confidence`).toBe('low')
      if (claim.value === null) continue
      expect(claim.locator, `${where} 没有 locator`).not.toBeNull()
      expect(/p\.\d+/.test(claim.locator!), `${where}.locator 缺页码：${claim.locator}`).toBe(true)
    }
  })

  it('★ Rubin Ultra GPU 的 mathSpecs 整体为 null（分析师规格表禁止进产能数学）', () => {
    const gpu = componentById('cmp.rubin-ultra.gpu')!
    expect(gpu.kind).toBe('gpu')
    expect((gpu as Extract<typeof gpu, { kind: 'gpu' }>).mathSpecs).toBeNull()
    // 但规格表里的数字仍作为「可展示的预测」保留，并明确标注不进产能
    expect(gpu.specs.fp4DensePflopsPerPackage!.value).toBe(35)
    expect(gpu.specs.fp4DensePflopsPerPackage!.note).toContain('不进 mathSpecs')
  })

  it('★ 反常识数字原样留痕：192 GB HBM4（低于 Rubin 的 288 GB）且标注冲突', () => {
    const gpu = componentById('cmp.rubin-ultra.gpu')!
    expect(gpu.specs.memoryPerPackageGB!.value).toBe(192)
    expect(gpu.specs.memoryPerPackageGB!.note).toContain('冲突')
    expect(componentById('cmp.rubin-ultra.hbm4')!.specs.generation!.note).toContain('HBM4e')
  })

  it('机架总功率没有出数（文中没有，440 kW 只是算术推论）', () => {
    expect(RUBIN_ULTRA_SYSTEM.keySpecs.rackPowerKW!.value).toBeNull()
    expect(RUBIN_ULTRA_SYSTEM.keySpecs.rackPowerKW!.note).toContain('推论')
  })

  it('年份口径冲突已留痕（表① 2027 / 表② 2026）', () => {
    expect(RUBIN_ULTRA_SYSTEM.keySpecs.year!.note).toContain('矛盾')
  })

  // v1.4 W-A：对比事实各归其位——两条新增的 CPO 讲解 Claim 走的是与其余 SemiAnalysis
  // Claim 相同的四重锁（已被上面的循环覆盖），这里另外钉住三点内容纪律：
  // ① 两条新 Claim 确实存在且 sourceId 是 SemiAnalysis；② NPO 先上市是分析师判断（forecast）；
  // ③ 光模块带宽占位符「x.xT」续锁不编数。
  it('★ CPO 讲解只在 specs/场景里，不在实体：两条新 Claim 都是 SemiAnalysis 源，firstToMarket 为分析师判断，带宽占位符不编数', () => {
    const optics = componentById('cmp.rubin-ultra.optics-module')!
    expect(optics.specs.cpoExternalLaserSource!.sourceId).toBe('src.semianalysis-nvl576')
    expect(optics.specs.cpoExternalLaserSource!.locator).toContain('p.9')
    expect(optics.specs.fieldReplaceability!.sourceId).toBe('src.semianalysis-nvl576')
    expect(optics.specs.fieldReplaceability!.locator).toContain('p.10')
    expect(String(optics.specs.fieldReplaceability!.value)).toContain('不可更换')

    const tray = componentById('cmp.rubin-ultra.nvswitch-tray')!
    expect(tray.specs.firstToMarket!.evidence).toBe('forecast')
    expect(String(tray.specs.firstToMarket!.value)).toContain('NPO')

    expect(optics.specs.bandwidthTbs!.value).toBeNull()
    expect(optics.specs.bandwidthTbs!.note).toContain('x.xT')
  })

  /**
   * ★ v1.5 R1/R2：官方**已经**点名 NVL576 的拓扑类别（two-layer all-to-all）。
   * 此前两处 note 断言「官方没有点名任何拓扑」是事实错误，场景层因此把分析师命名
   * （Dragonfly）当唯一说法对外讲。这条锁保证官方词不会再被删掉、也不会被 Dragonfly 顶替。
   */
  it('★ R1 拓扑官方已命名 two-layer all-to-all，Dragonfly 只能作分析师归类并存', () => {
    for (const c of [
      RUBIN_ULTRA_SYSTEM.keySpecs.topologyNameOfficial!,
      componentById('cmp.rubin-ultra.interrack-fabric')!.specs.topologyNameOfficial!,
    ]) {
      expect(c.sourceId).toBe('src.nvidia-rubin-pod-blog')
      expect(c.evidence).toBe('vendor_claim')
      expect(c.status).toBe('announced')
      expect(c.asOf).toBe('2026-03')
      expect(c.locator).toContain('two-layer all-to-all NVLink topology')
      expect(String(c.value)).toContain('all-to-all')
    }
    // 分析师归类保留，但必须显式写明与官方措辞不等价
    const analyst = componentById('cmp.rubin-ultra.interrack-fabric')!.specs.topologyName!
    expect(analyst.sourceId).toBe('src.semianalysis-nvl576')
    expect(analyst.note).toContain('不等价')
    // 曾经断言「官方没有点名任何拓扑」的两处 note，现在都必须写出官方那个名字
    // （历史措辞只允许以「此前……是错的」的订正形式出现，不能再作为结论）
    expect(analyst.note).toContain('two-layer all-to-all')
    expect(RUBIN_ULTRA_SYSTEM.keySpecs.scaleUpTopology!.note).toContain('two-layer all-to-all')
    // 场景旁白必须先说官方词——不能只把分析师命名讲给客户
    const overview = RUBIN_ULTRA_SCENES.find((s) => s.id === 'scene.ru.domain-overview')!
    expect(overview.narration).toContain('two-layer all-to-all')
    expect(overview.narration).toContain('分析师')
  })

  it('★ R2 跨机架光互连的 topology 与官方一致（不是无来源的 fat-tree）', () => {
    const link = RUBIN_ULTRA_CONNECTIONS.find((c) => c.id === 'con.ru.optics-interrack')!
    // 官方 = two-layer all-to-all；SemiAnalysis 表① = Dragonfly、表② = Direct Connect NPO。
    // 三处来源没有任何一处说过 fat-tree。
    expect(link.topology).toBe('all-to-all')
    expect(link.summary).toContain('two-layer all-to-all')
    expect(link.sourceIds).toContain('src.nvidia-rubin-pod-blog')
  })

  it('★ R3 Kyber 是 MGX NVL 的下一代（不是并列产品线），但仍与 NVL576 分属两档', () => {
    const opts = RUBIN_ULTRA_SYSTEM.keySpecs.nvlinkDomainOptions!
    expect(opts.locator).toContain('standalone NVL144 system')
    expect(opts.note).toContain('next-generation MGX NVL rack design')
    expect(opts.note).toContain('两档不同产品')
    expect(opts.note).not.toContain('并列的产品线')
  })

  it('★ R4/R6 三处措辞精度：keynote 自相矛盾留痕、可制造性、驳斥、22.5U 是增加', () => {
    const t = RUBIN_ULTRA_SYSTEM.keySpecs.announceTimeline!
    expect(t.confidence).toBe('low')
    expect(t.note).toContain('原句自身矛盾')

    const d = RUBIN_ULTRA_SYSTEM.keySpecs.delayOutlook!
    expect(d.note).toContain('可制造性')
    expect(d.note).toContain('manufacturability')
    expect(d.note).toContain('驳斥')
    expect(d.note).toContain('rejected')
    // 「良率」只允许以订正说明的形式出现，不能再作为原因的表述
    expect(d.note).toContain('原文没有出现 yield/良率')

    const maxU = componentById('cmp.rubin-ultra.oberon-rack')!.specs.maxTrayDistanceU!
    expect(maxU.value).toBe(22.5)
    expect(maxU.note).toContain('增加')
    expect(maxU.locator).toContain('19U')
  })
})

// ═══════════════════════════ Groq 3 LPX（v1.3 W3） ═══════════════════════════

const LPX = 'sys.groq3-lpx'
const LPX_RACK = 'asm.lpx.rack'

describe('Groq 3 LPX：机架/托盘/芯片三级数量与容量', () => {
  it('系统为 announced，产能策略为 paired-only（官方口径只有「与 Vera Rubin 配对」）', () => {
    expect(GROQ3_LPX_SYSTEM.status).toBe('announced')
    expect(GROQ3_LPX_SYSTEM.capacityPolicy).toBe('paired-only')
    expect(GROQ3_LPX_SYSTEM.generation).toBe('groq3-lpx')
    expect(GROQ3_LPX_SYSTEM.vendor).toBe('NVIDIA')
  })

  it('★ 32 托盘 × 8 颗 LP30 = 每机架 256 颗 LPU（三处官方口径闭合）', () => {
    expect(totalInstances('asm.lpx.lpu-tray', LPX_RACK)).toBe(32)
    expect(totalInstances('asm.lpx.lp30', LPX_RACK)).toBe(256)
    expect(GROQ3_LPX_SYSTEM.keySpecs.acceleratorCount!.value).toBe(256)
    expect(GROQ3_LPX_SYSTEM.keySpecs.lpuTrayCount!.value).toBe(32)
    expect(GROQ3_LPX_SYSTEM.keySpecs.lpusPerTray!.value).toBe(8)
  })

  it('★ keySpecs 用 acceleratorCount 表达加速器数量；gpuCount 恒为 null（LPX 没有 GPU）', () => {
    expect(GROQ3_LPX_SYSTEM.keySpecs.gpuCount!.value).toBeNull()
    expect(GROQ3_LPX_SYSTEM.keySpecs.gpuCount!.note).toContain('没有 GPU')
    expect(GROQ3_LPX_SYSTEM.keySpecs.acceleratorCount!.value).toBe(256)
    // 装配树里也确实一颗 GPU 都没有
    const kinds = new Set(
      GROQ3_LPX_ASSEMBLIES.map((a) => componentById(a.componentId)?.kind).filter(Boolean),
    )
    expect(kinds.has('gpu')).toBe(false)
    expect(kinds.has('lpu')).toBe(true)
  })

  it('★ 机架 315 PF 与每托盘 9.6 PF 并存：两条独立 Claim，note 注明官方口径不闭合', () => {
    const rackPf = GROQ3_LPX_SYSTEM.keySpecs.fp8RackPflops!
    const trayPf = GROQ3_LPX_SYSTEM.keySpecs.fp8PerTrayPflops!
    expect(rackPf.value).toBe(315)
    expect(trayPf.value).toBe(9.6)
    // 32 × 9.6 = 307.2 ≠ 315 —— 这里刻意**不**写相等断言，只钉住「两条都在、都留了痕」。
    expect(32 * (trayPf.value as number)).not.toBeCloseTo(rackPf.value as number, 1)
    for (const c of [rackPf, trayPf]) {
      expect(c.note).toContain('307.2')
      expect(c.note).toContain('不完全闭合')
    }
  })

  it('★ 单 LP30：500 MB SRAM / 150 TB/s / 2.5 TB/s（96 × 112 Gb/s C2C），且明确无 HBM', () => {
    const lpu = componentById('cmp.lpx.lp30-lpu')!
    expect(lpu.kind).toBe('lpu')
    expect(lpu.specs.sramPerChipMB!.value).toBe(500)
    expect(lpu.specs.sramPerChipMB!.unit).toBe('MB')
    expect(lpu.specs.sramBandwidthTBs!.value).toBe(150)
    expect(lpu.specs.scaleUpBandwidthTBs!.value).toBe(2.5)
    expect(lpu.specs.c2cLinkCount!.value).toBe(96)
    expect(lpu.specs.c2cLinkGbps!.value).toBe(112)
    expect(String(lpu.specs.memoryTechnology!.value)).toContain('无 HBM')
  })

  it('机架级容量与带宽：128 GB SRAM / 40 PB/s / 640 TB/s C2C / 12 TB DDR5', () => {
    expect(GROQ3_LPX_SYSTEM.keySpecs.sramTotalGB!.value).toBe(128)
    expect(GROQ3_LPX_SYSTEM.keySpecs.sramBandwidthPBs!.value).toBe(40)
    expect(GROQ3_LPX_SYSTEM.keySpecs.scaleUpBandwidthTBs!.value).toBe(640)
    expect(GROQ3_LPX_SYSTEM.keySpecs.ddr5TotalTB!.value).toBe(12)
  })

  it('★ 托盘 = 8 × LP30 + 1 独立 host CPU + 1 fabric expansion + 1 BF4（四个并列部件）', () => {
    const kids = GROQ3_LPX_ASSEMBLIES.filter((a) => a.parentId === 'asm.lpx.lpu-tray')
    const byRole = new Map(kids.map((a) => [a.roleKey, a]))
    expect(byRole.get('accelerator')!.count).toBe(8)
    expect(byRole.get('host-cpu')!.count).toBe(1)
    expect(byRole.get('fabric-expansion')!.count).toBe(1)
    expect(byRole.get('north-south-dpu')!.count).toBe(1)
    // ★ R2 P0-4：host CPU 与 BF-4 是**两个不同的组件**，绝不能让 BF-4 内嵌的 CPU 冒充主机 CPU
    expect(byRole.get('host-cpu')!.componentId).toBe('cmp.lpx.host-cpu')
    expect(byRole.get('north-south-dpu')!.componentId).toBe('cmp.rubin.bluefield-4')
    expect(byRole.get('host-cpu')!.componentId).not.toBe(byRole.get('north-south-dpu')!.componentId)
  })

  it('★ 托盘主机 CPU 型号未公布：component 为 unknown、claim value 为 null，且明令禁止用 BF-4 顶替', () => {
    const cpu = componentById('cmp.lpx.host-cpu')!
    expect(cpu.kind).toBe('cpu')
    expect(cpu.vendor).toBe('未公布')
    expect(cpu.specs.model!.value).toBeNull()
    expect(cpu.specs.coreCount!.value).toBeNull()
    expect(cpu.specs.architecture!.value).toBeNull()
    expect(cpu.specs.model!.note).toContain('BlueField-4')
    expect(cpu.presalesNote).toContain('独立部件')
  })

  it('★ 没有 NVSwitch / 交换托盘：scale-up 是 LPU 直连 C2C', () => {
    const roleKeys = new Set(GROQ3_LPX_ASSEMBLIES.map((a) => a.roleKey))
    expect(roleKeys.has('nvswitch-tray')).toBe(false)
    expect(roleKeys.has('nvswitch-asic')).toBe(false)
    expect(String(componentById('cmp.lpx.c2c-spine')!.specs.switchless!.value)).toContain('无交换芯片')
  })

  it('整机架功率与单芯片 TDP 都没出数（官方只给相对能效倍数）', () => {
    expect(GROQ3_LPX_SYSTEM.keySpecs.rackPowerKW!.value).toBeNull()
    expect(componentById('cmp.lpx.lp30-lpu')!.specs.tdpW!.value).toBeNull()
    // 供电层整组规格全为 null
    for (const [k, c] of Object.entries(componentById('cmp.lpx.power-shelf')!.specs)) {
      expect(c.value, `power-shelf.${k} 不该有数值`).toBeNull()
    }
  })

  it('★ 晶体管数整条不建（keynote-only 数字不进内容包）', () => {
    const lpu = componentById('cmp.lpx.lp30-lpu')!
    for (const key of Object.keys(lpu.specs)) {
      expect(/transistor/i.test(key), `${key} 不该存在——晶体管数只在主题演讲里出现过`).toBe(false)
    }
    const allText = JSON.stringify(lpu)
    expect(allText).not.toContain('98')
  })

  it('★ 全部 LPX Claim 都是 vendor_claim + announced，且只引官方源', () => {
    // v1.5：新增两个官方源。
    // - `src.nvidia-lpx-fullprod-press`（2026-08-24 量产发布稿）：availability 的最新官方口径，
    //   GTC 2026-03 的「2026 下半年上市」已被它超越（详见该 Claim 的 note）。
    // - `src.nvidia-rubin-pod-blog`（2026-03 POD 博客）：LPX 的 C2C spine 物理介质
    //   （2 个铜缆匣、数千对铜缆）的唯一官方出处——此前本项目误记为「官方未公布介质」。
    const officialLpxSources = new Set([
      'src.nvidia-lpx-page',
      'src.nvidia-lpx-blog',
      'src.nvidia-vera-rubin-gtc26-press',
      'src.groq-nvidia-licensing',
      'src.nvidia-lpx-fullprod-press',
      'src.nvidia-rubin-pod-blog',
    ])
    const claims: Claim[] = [
      ...Object.values(GROQ3_LPX_SYSTEM.keySpecs),
      ...GROQ3_LPX_COMPONENTS.flatMap((c) => Object.values(c.specs)),
      ...GROQ3_LPX_ASSEMBLIES.flatMap((a) => (a.countClaim ? [a.countClaim as Claim] : [])),
      ...GROQ3_LPX_CONNECTIONS.flatMap((c) => (c.bandwidth ? [c.bandwidth as Claim] : [])),
    ]
    expect(claims.length).toBeGreaterThan(30)
    for (const c of claims) {
      expect(c.evidence, `${c.sourceId} / ${c.locator}`).toBe('vendor_claim')
      expect(c.status).toBe('announced')
      expect(officialLpxSources.has(c.sourceId), `意外的源 ${c.sourceId}`).toBe(true)
    }
  })

  it('Groq×NVIDIA 关系建成叙事 Claim：非排他许可 + 团队加入 + 独立运营，且不提金额', () => {
    const rel = GROQ3_LPX_SYSTEM.keySpecs.groqRelationship!
    expect(rel.sourceId).toBe('src.groq-nvidia-licensing')
    const text = String(rel.value)
    expect(text).toContain('非排他')
    expect(text).toContain('独立公司')
    expect(rel.note).toContain('不是收购')
    // 金额一律不建（发布稿没有提到任何数字）
    expect(JSON.stringify(GROQ3_LPX_SYSTEM)).not.toContain('20B')
    expect(JSON.stringify(GROQ3_LPX_SYSTEM)).not.toContain('200 亿')
  })

  /**
   * ★ v1.5 L3：官方对「35×」有**三个**前提，此前对外文案只带了两个。
   * 「trillion-parameter models」这句限定在产品页与 GTC26 发布稿里都与 35× 写在同一句，
   * 漏掉它就等于允许售前拿 35× 去讲一个 70B 模型——这是实打实的超范围引用。
   */
  it('AFD 叙事数字（35×）带齐三个前提：万亿参数模型 + 400 TPS/用户 + 对比 GB200 NVL72', () => {
    const gain = GROQ3_LPX_SYSTEM.keySpecs.pairedThroughputGain!
    expect(gain.sourceId).toBe('src.nvidia-lpx-blog')
    for (const s of ['35', '400 TPS', '万亿参数', 'GB200 NVL72']) {
      expect(String(gain.value), `35× 的前提缺了「${s}」`).toContain(s)
    }
    expect(gain.locator).toContain('trillion-parameter models')
    expect(gain.note).toContain('配对')
    expect(gain.note).toContain('超范围引用')
    // 「万亿参数」这个前提必须出现在**对外可见**的地方，不能只躺在 sources.ts 的引文里
    const outward = JSON.stringify([GROQ3_LPX_SYSTEM, GROQ3_LPX_SCENES, FACTORY_PACK.comparisons])
    expect(outward).toContain('万亿参数')
  })

  /**
   * ★ v1.5 L2：带宽口径与算力口径是同一类「官方自身不闭合」，此前只给算力加了留痕。
   *   256 × 150 TB/s = 32 × 1.2 PB/s = 38.4 PB/s ≠ 官方机架级 40 PB/s。
   * 对照：容量与 scale-up 带宽那两对确实闭合，**不该**贴这条 note。
   */
  it('★ L2 带宽三条口径不闭合已留痕，且真正闭合的两对不受污染', () => {
    expect(256 * 150).toBe(38_400) // TB/s ⇒ 38.4 PB/s ≠ 40
    expect(32 * 1.2).toBeCloseTo(38.4, 5) // PB/s ≠ 40
    const tray = componentById('cmp.lpx.compute-tray')!
    const lpu = componentById('cmp.lpx.lp30-lpu')!
    for (const c of [
      GROQ3_LPX_SYSTEM.keySpecs.sramBandwidthPBs!,
      tray.specs.sramBandwidthPerTrayPBs!,
      lpu.specs.sramBandwidthTBs!,
    ]) {
      expect(c.note).toContain('38.4')
      expect(c.note).toContain('互不推导')
    }
    // 闭合的两对：128 GB = 256 × 500 MB、640 TB/s = 256 × 2.5 = 32 × 20
    expect(GROQ3_LPX_SYSTEM.keySpecs.sramTotalGB!.note).not.toContain('38.4')
    expect(GROQ3_LPX_SYSTEM.keySpecs.scaleUpBandwidthTBs!.note).not.toContain('38.4')
    // 旁白不得再把两条独立口径讲成推导关系
    const anatomy = GROQ3_LPX_SCENES.find((s) => s.id === 'scene.lpx.rack-anatomy')!
    expect(anatomy.narration).toContain('不要互推')
    expect(anatomy.narration).not.toContain('150 TB/s 片上带宽（机架合计 40 PB/s）')
  })

  /**
   * ★ v1.5 L5：LPX 的 C2C spine 物理介质官方**公布了**（2026-03 POD 博客），
   * 此前记作「未公布」是漏检。同时锁住那个措辞陷阱：cableless 的主语是托盘不是机架。
   */
  it('★ L5 C2C spine 是铜缆脊柱（2 个铜缆匣），且不编造铜缆根数', () => {
    const spine = componentById('cmp.lpx.c2c-spine')!
    expect(spine.specs.medium!.value).not.toBeNull()
    expect(String(spine.specs.medium!.value)).toContain('铜')
    expect(spine.specs.medium!.sourceId).toBe('src.nvidia-rubin-pod-blog')
    expect(spine.specs.medium!.locator).toContain('two copper cable cartridges')
    expect(spine.specs.cableCartridgeCount!.value).toBe(2)
    // 官方只说 thousands of paired，没给根数 ⇒ 不建根数 Claim
    expect(Object.keys(spine.specs)).not.toContain('cableCount')
    // 「无线缆」的主语必须写清是托盘
    expect(spine.presalesNote).toContain('修饰的是**托盘**')
  })

  it('★ L1 上市口径已更新到 2026-08 量产发布稿，GTC 原口径保留；status 仍为 announced', () => {
    const av = GROQ3_LPX_SYSTEM.keySpecs.availability!
    expect(av.sourceId).toBe('src.nvidia-lpx-fullprod-press')
    expect(av.locator).toContain('is now in full production')
    expect(av.note).toContain('second half of this year') // GTC 2026-03 原口径未被丢弃
    // 「量产」不等于「在售」：官方没有 shipping now 这类措辞，云厂商也只是 plans to
    expect(av.note).toContain('plans to')
    expect(GROQ3_LPX_SYSTEM.status).toBe('announced')
  })

  it('两个导览场景讲 rack 解剖与 AFD 三段流，highlight 指向本系统真实节点', () => {
    const scenes = GROQ3_LPX_SCENES
    expect(scenes.length).toBe(2)
    const ids = GROQ3_LPX_ASSEMBLIES.map((a) => a.id)
    for (const s of scenes) {
      expect(s.systemId).toBe(LPX)
      for (const h of s.highlightAssemblyIds) expect(ids, `${s.id} → ${h}`).toContain(h)
      if (s.focusAssemblyId) expect(ids).toContain(s.focusAssemblyId)
    }
    const afd = scenes.find((s) => s.id === 'scene.lpx.afd-pairing')!
    expect(afd.narration).toContain('prefill')
    expect(afd.narration).toContain('attention')
    expect(afd.narration).toContain('FFN/MoE')
    expect(afd.narration).toContain('Dynamo')
  })
})

const HGX = 'sys.hgx-b300'

describe('五代并存后的全局不变量', () => {
  // v1.3 W3：Groq 3 LPX 作为第四个系统**追加在尾部**；v1.4 W-C：HGX B300 作为第五个同样追加在尾部
  // ——`systems[0]` 是默认代际、`systems[1]` 是比较模式默认右侧，中间插入会让这两个约定
  // 连同全部截图基线一起漂移。
  it('五个系统各自成树，顺序不漂移，且 shipping 的恰好是 GB300 与 HGX B300', () => {
    expect(FACTORY_PACK.systems.map((s) => s.id)).toEqual([SYSTEM_ID, VR, RU, LPX, HGX])
    // v1.4 W-C 起 shipping 不再唯一：HGX B300 同样在售（HGX 产品页规格表脚注 4
    //「HGX B300 and HGX B200 shipping now.」）。但 systems[0] 仍必须是默认代际 GB300。
    expect(FACTORY_PACK.systems.filter((s) => s.status === 'shipping').map((s) => s.id)).toEqual([
      SYSTEM_ID,
      HGX,
    ])
    expect(FACTORY_PACK.systems[0]!.id).toBe(SYSTEM_ID)
  })

  it('每代都有导览场景，且场景按系统分组连续排列（TourPanel 按系统内序号取用）', () => {
    for (const sys of FACTORY_PACK.systems) {
      expect(FACTORY_PACK.scenes.filter((s) => s.systemId === sys.id).length, sys.id).toBeGreaterThan(0)
    }
    const order = FACTORY_PACK.scenes.map((s) => s.systemId)
    const firstIdx = new Map<string, number>()
    order.forEach((id, i) => {
      if (!firstIdx.has(id)) firstIdx.set(id, i)
    })
    for (const [id, start] of firstIdx) {
      const count = order.filter((x) => x === id).length
      expect(order.slice(start, start + count).every((x) => x === id), `${id} 的场景不连续`).toBe(true)
    }
  })

  /**
   * v1.1 A3：「机房配电」原本没有实体——`con.*.facility-power-shelf` 的起点是**装配树根**
   * （机房），而 `ClusterScene` 只画 `childrenOf(root)`，根节点自己从不渲染，那条供电线
   * 于是从空气里长出来。
   *
   * ⚠️ 这里必须精确锁「改的是哪条边」：只断言「存在某条 power 路由」是漏的——
   * 原来的 facility→power-shelf 本来就非退化，不改也照样产出一条路由。
   */
  it('★ 五代的「机房配电 → 机架侧配电」都从 facility-power 装配节点出发（不是从装配树根）', () => {
    const cases = [
      ['sys.gb300-nvl72', 'con.gb300.facility-power-shelf', 'asm.gb300.facility-power', 'asm.gb300.facility'],
      ['sys.vera-rubin-nvl72', 'con.rubin.facility-power-shelf', 'asm.rubin.facility-power', 'asm.rubin.facility'],
      ['sys.rubin-ultra-nvl576', 'con.ru.facility-power-shelf', 'asm.ru.facility-power', 'asm.ru.facility'],
      // v1.3 W3：LPX 保持与前三代同构（机房配电必须有实体盒子，供电线才不会从树根长出来）
      ['sys.groq3-lpx', 'con.lpx.facility-power-shelf', 'asm.lpx.facility-power', 'asm.lpx.facility'],
      // v1.4 W-C：HGX 的机架侧对端不是电源架而是机架 PDU（风冷机架没有电源架/母排），
      // 但「配电线必须从一个真实盒子出发」这条不变量对它同样成立。
      ['sys.hgx-b300', 'con.hgx.facility-power-pdu', 'asm.hgx.facility-power', 'asm.hgx.facility'],
    ] as const

    for (const [systemId, conId, powerId, rootId] of cases) {
      // ① 内容层：连接的 from 端指向新节点
      const conn = FACTORY_PACK.connections.find((c) => c.id === conId)
      expect(conn, `${conId} 不存在`).toBeDefined()
      expect(conn!.fromAssemblyId, conId).toBe(powerId)
      expect(conn!.fromAssemblyId, `${conId} 仍指向装配树根`).not.toBe(rootId)

      // ② 新节点确实存在、是 cluster 级、挂在机房下、用共享的机房配电组件
      const node = assemblyById(powerId)
      expect(node, `${powerId} 不存在`).toBeDefined()
      expect(node!.roleKey).toBe('facility-power')
      expect(node!.lodLevel).toBe('cluster')
      expect(node!.parentId).toBe(rootId)
      expect(node!.componentId).toBe('cmp.shared.facility-power')

      // ③ 渲染层：cluster 深度产出的那条路由，起点也必须是新节点
      const route = routeConnections(systemId, resolveLayout(systemId), 'cluster').find(
        (r) => r.connectionId === conId,
      )
      expect(route, `${systemId}: ${conId} 在 cluster 深度下应有一条非退化路由`).toBeDefined()
      expect(route!.fromAssemblyId, conId).toBe(powerId)
      // 五代机架都是 count=8 ⇒ 配电线扇出到每一台机架
      expect(route!.instancePaths.length, `${conId} 的机架扇出`).toBe(8)
    }
  })

  it('机房配电组件的规格 Claim 全部未公布（参考架构不涉及机房侧配电，不编数）', () => {
    const comp = componentById('cmp.shared.facility-power')!
    expect(comp.kind).toBe('power')
    expect(Object.keys(comp.specs).length).toBeGreaterThan(0)
    for (const [k, claim] of Object.entries(comp.specs)) {
      expect(claim.value, `${k} 不应有数值`).toBeNull()
      expect(claim.note, `${k} 缺说明`).not.toBeNull()
    }
    expect(comp.sourceIds).toContain('src.nvidia-nvl72-ra')
  })

  it('每代的六平面覆盖情况如实反映来源（GB300/Vera Rubin/LPX/HGX 六平面齐全，NVL576 只有四个）', () => {
    const planes: NetworkPlane[] = ['nvlink', 'scaleout', 'business', 'mgmt', 'power', 'cooling']
    for (const p of planes) {
      expect(connectionsOfPlane(SYSTEM_ID, p).length, `GB300 ${p}`).toBeGreaterThan(0)
      expect(connectionsOfPlane(VR, p).length, `Vera Rubin ${p}`).toBeGreaterThan(0)
      // LPX 的 nvlink 平面装的是 LPU C2C（UI 上经 planeLabel 显示为「C2C scale-up」），
      // scaleout 平面装的是与 Vera Rubin NVL72 之间的 AFD 交换。
      expect(connectionsOfPlane(LPX, p).length, `Groq 3 LPX ${p}`).toBeGreaterThan(0)
      // v1.4 W-C：HGX 六平面同样齐全——注意 nvlink 平面**在数据层非空**（三条边都在服务器内部），
      // 「机架里一条线都没有」是**渲染深度**上的结果，由下面的路由用例单独锁定。
      expect(connectionsOfPlane(HGX, p).length, `HGX B300 ${p}`).toBeGreaterThan(0)
    }
    for (const p of ['nvlink', 'power', 'mgmt', 'cooling'] as NetworkPlane[]) {
      expect(connectionsOfPlane(RU, p).length, `NVL576 ${p}`).toBeGreaterThan(0)
    }
  })
})

/**
 * v1.4 W-C：HGX B300 = 第五个系统，也是第一个 `nvlink-node-domain` 代际。
 *
 * 这一组用例锁的全是「教学主线成立所依赖的事实」——尤其是那条最反直觉的：
 * **机架级 NVLink 平面必须是空的**。它不是文案，是装配树 + routing 退化边规则的结果，
 * 因此必须在渲染层面钉死，否则哪天有人把某条 nvlink 边的端点提到 rack 层，
 * 导览词「切到 NVLink 平面，这个机架里一条线都没有」就会当场变成谎话。
 */
describe('HGX B300：NVLink 服务器域（v1.4 W-C）', () => {
  it('系统存在、shipping、standard 产能策略、nvlink-node-domain 架构', () => {
    const sys = systemById(HGX)!
    expect(sys).toBeDefined()
    expect(sys.status).toBe('shipping')
    expect(sys.capacityPolicy).toBe('standard')
    expect(sys.architecture).toBe('nvlink-node-domain')
    expect(sys.generation).toBe('hgx-b300')
  })

  it('★★ 机架级与集群级的 nvlink 平面**恰好为空**（域在服务器里面，这就是教学内容本身）', () => {
    const layout = resolveLayout(HGX)
    for (const depth of ['cluster', 'rack'] as const) {
      const nvlink = routeConnections(HGX, layout, depth).filter((r) => r.plane === 'nvlink')
      expect(
        nvlink.map((r) => r.connectionId),
        `HGX 在 ${depth} 深度下不该有任何 nvlink 路由——NVLink 域止步单服务器`,
      ).toEqual([])
    }
  })

  it('★ 但下钻到板级，NVLink 域就出现了（空平面是「域在里面」，不是「没有域」）', () => {
    const layout = resolveLayout(HGX)
    const nvlink = routeConnections(HGX, layout, 'board').filter((r) => r.plane === 'nvlink')
    expect(nvlink.length, 'board 深度下应能看到服务器内部的 NVLink 域').toBeGreaterThan(0)
    expect(nvlink.map((r) => r.connectionId)).toContain('con.hgx.gpu-nvswitch')
  })

  it('★ 对照组：同深度下 scaleout 平面在机架级是有线的（证明上面的「空」不是整体没连线）', () => {
    const layout = resolveLayout(HGX)
    const rackRoutes = routeConnections(HGX, layout, 'rack')
    expect(rackRoutes.length, 'rack 深度总路由数').toBeGreaterThan(0)
    expect(
      rackRoutes.filter((r) => r.plane === 'scaleout').length,
      'rack 深度下 scale-out 平面必须有线——出了服务器全靠它',
    ).toBeGreaterThan(0)
  })

  it('★ 装配树：每台服务器 1 块基板、8 GPU、2 CPU、8 张 CX-8、1 张 BF-3', () => {
    const server = 'asm.hgx.gpu-server'
    expect(totalInstances('asm.hgx.baseboard', server)).toBe(1)
    expect(totalInstances('asm.hgx.b300-gpu', server)).toBe(8)
    expect(totalInstances('asm.hgx.host-cpu', server)).toBe(2)
    expect(totalInstances('asm.hgx.cx8-nic', server)).toBe(8)
    expect(totalInstances('asm.hgx.bf3-dpu', server)).toBe(1)
    // 官方口诀 2-8-9-800 里的 9 = 8 张 CX-8 + 1 张 BF-3
    expect(
      totalInstances('asm.hgx.cx8-nic', server) + totalInstances('asm.hgx.bf3-dpu', server),
    ).toBe(9)
  })

  it('★ GPU 与网卡都挂在 HGX 基板下（官方：SuperNIC integrated onto the baseboard）', () => {
    expect(assemblyById('asm.hgx.b300-gpu')!.parentId).toBe('asm.hgx.baseboard')
    expect(assemblyById('asm.hgx.cx8-nic')!.parentId).toBe('asm.hgx.baseboard')
    expect(assemblyById('asm.hgx.nvswitch')!.parentId).toBe('asm.hgx.baseboard')
    // 主机 CPU 与 DPU 反过来挂在服务器下——它们是 OEM 主机板的一部分，不在 NVIDIA 的基板上
    expect(assemblyById('asm.hgx.host-cpu')!.parentId).toBe('asm.hgx.gpu-server')
    expect(assemblyById('asm.hgx.bf3-dpu')!.parentId).toBe('asm.hgx.gpu-server')
  })

  it('★ 刻意缺席的角色：没有交换托盘/背板/母排/电源架/液冷链路', () => {
    const keys = new Set(
      FACTORY_PACK.assemblies.filter((a) => a.systemId === HGX).map((a) => a.roleKey),
    )
    for (const k of [
      'nvswitch-tray',
      'nvlink-backplane',
      'compute-tray',
      'dc-busbar',
      'power-shelf',
      'liquid-manifold',
      'cold-plate',
      'nvswitch-cold-plate',
      'cdu',
      'facility-water-loop',
    ]) {
      expect(keys.has(k), `HGX 不该有 ${k}（风冷 + 服务器级域）`).toBe(false)
    }
    // 而这一族的定义特征必须在（pack.test 另有同款强制，这里从内容侧再锁一次）
    for (const k of ['gpu-server', 'hgx-baseboard', 'nvswitch-asic', 'rack-pdu', 'room-air-handler']) {
      expect(keys.has(k), `HGX 缺少 ${k}`).toBe(true)
    }
  })

  it('★ 风冷：cooling 平面存在 airflow 介质的边，且全包只有 HGX 用它', () => {
    const airflow = FACTORY_PACK.connections.filter((c) => c.medium === 'airflow')
    expect(airflow.length, '应存在 airflow 介质的连接').toBeGreaterThan(0)
    for (const c of airflow) expect(c.systemId, `${c.id} 不该是 HGX 之外的系统`).toBe(HGX)
    for (const c of airflow) expect(c.plane).toBe('cooling')
    // 反向：HGX 不该出现任何液冷介质
    const hgxCooling = FACTORY_PACK.connections.filter((c) => c.systemId === HGX && c.plane === 'cooling')
    for (const c of hgxCooling) {
      expect(c.medium, `${c.id} 用了液冷介质`).not.toBe('liquid-loop')
    }
  })

  it('★ mathSpecs 取数据手册 HGX B300 列，且与整机官方值自洽（8 卡口径）', () => {
    const gpu = componentById('cmp.hgx.b300-sxm')!
    expect(gpu.kind).toBe('gpu')
    const m = (gpu as Extract<typeof gpu, { kind: 'gpu' }>).mathSpecs!
    expect(m).not.toBeNull()
    expect(m.memoryGB).toBe(270)
    expect(m.bandwidthTBs).toBe(7.7)
    expect(m.fp4Tflops).toBe(14000)
    expect(m.fp8Tflops).toBe(4500)
    // ★ 与 GB300 那一颗刻意不同：同一芯片、不同平台功率档位（1,100 W vs 1,400 W）
    expect(m.tdpW).toBe(1100)
    const gb300Gpu = componentById('cmp.gb300.b300-gpu')!
    const gb300Math = (gb300Gpu as Extract<typeof gb300Gpu, { kind: 'gpu' }>).mathSpecs!
    expect(m.memoryGB, 'HGX 与 GB300 的单卡显存口径不同（270 vs 288）').not.toBe(gb300Math.memoryGB)
    expect(m.fp4Tflops, 'HGX 与 GB300 的稠密 FP4 口径不同（14 vs 15 PFLOPS）').not.toBe(gb300Math.fp4Tflops)

    // 整机自洽（数据手册 HGX B300 列内部闭合）：8 × 270 = 2,160 GB ≈ 2.1 TB；8 × 7.7 = 61.6 ≈ 62 TB/s
    const sys = systemById(HGX)!
    expect((m.memoryGB * 8) / 1000).toBeCloseTo(sys.keySpecs.gpuMemoryPerNodeTB!.value as number, 0)
    expect(m.bandwidthTBs * 8).toBeCloseTo(sys.keySpecs.gpuMemoryBandwidthPerNodeTBs!.value as number, 0)
    // FP8 稠密闭合：8 × 4.5 PFLOPS = 36 PFLOPS = 整板稀疏 72 ÷ 2
    expect((m.fp8Tflops! * 8) / 1000).toBeCloseTo((sys.keySpecs.fp8SparsePflops!.value as number) / 2, 1)
  })

  /**
   * ★ 官方 FP4 口径「稀疏闭合、稠密不闭合」——与 Groq 3 LPX 的「315 vs 32 × 9.6」同类。
   *
   * 这条用例的作用是**把不闭合本身钉死**：如果哪天有人「顺手修正」成 13.5 让它闭合，
   * 或者反过来把整板值改成 112，这里都会红——两个数字都是官方原文，谁都不能改。
   */
  it('★ FP4 稠密口径官方不闭合（8 × 14 = 112 ≠ 108），两条各自成立且都已留痕', () => {
    const sys = systemById(HGX)!
    const gpu = componentById('cmp.hgx.b300-sxm')!
    const m = (gpu as Extract<typeof gpu, { kind: 'gpu' }>).mathSpecs!

    const perGpuDensePflops = m.fp4Tflops! / 1000 // 14
    const boardDensePflops = sys.keySpecs.fp4DensePflops!.value as number // 108
    expect(perGpuDensePflops).toBe(14)
    expect(boardDensePflops).toBe(108)
    expect(perGpuDensePflops * 8, '这两个官方数字确实不闭合，本项目不互推').not.toBe(boardDensePflops)

    // 但稀疏侧是闭合的（8 × 18 = 144），说明差异只出在稠密行的取整上
    expect(gpu.specs.fp4DenseTflops!.value).toBe(14000)

    // 两条 Claim 都必须解释这个不闭合，否则读内容包的人会以为是录入错误
    for (const note of [sys.keySpecs.fp4DensePflops!.note, gpu.specs.fp4DenseTflops!.note]) {
      expect(note, 'FP4 稠密不闭合必须留痕').not.toBeNull()
      expect(note!).toContain('112')
    }
    // mathSpecs.derivation 也要说明「取单卡行、不用整板反推」
    expect(m.derivation).toContain('112')
  })

  it('★ 每卡 NVLink 带宽与 GB300 完全相同——变的是域里有几张卡，不是链路速度', () => {
    const sys = systemById(HGX)!
    const gb300 = systemById(SYSTEM_ID)!
    expect(sys.keySpecs.gpuToGpuBandwidthGBs!.value).toBe(1800)
    // 域聚合带宽之比 = 卡数之比：130 / 14.4 ≈ 72 / 8 = 9
    const hgxAgg = sys.keySpecs.nvlinkAggregateBandwidthTBs!.value as number
    const gb300Agg = gb300.keySpecs.nvlinkAggregateBandwidthTBs!.value as number
    expect(gb300Agg / hgxAgg).toBeCloseTo(72 / 8, 0)
  })

  it('★ gpuCount 是「每台服务器 8 张」，note 必须交代口径与「官方不给每机架台数」', () => {
    const sys = systemById(HGX)!
    expect(sys.keySpecs.gpuCount!.value).toBe(8)
    expect(sys.keySpecs.gpuCount!.note).toContain('每台')
    expect(sys.keySpecs.gpuCount!.note).toContain('available rack power')
    // 整机架功率官方未公布 ⇒ 产能不出 tokens/W
    expect(sys.keySpecs.rackPowerKW!.value).toBeNull()
    expect(sys.keySpecs.rackPowerKW!.note).not.toBeNull()
  })

  it('★ 示意数量一律没有 countClaim（每机架台数/NVSwitch 颗数/PDU 路数/空调台数）', () => {
    for (const id of [
      'asm.hgx.rack',
      'asm.hgx.gpu-server',
      'asm.hgx.nvswitch',
      'asm.hgx.rack-pdu',
      'asm.hgx.air-handler',
      'asm.hgx.local-nvme',
    ]) {
      const node = assemblyById(id)!
      expect(node.countClaim, `${id} 是示意数量，不该有 countClaim`).toBeNull()
      expect(node.note, `${id} 缺少「为什么是示意」的说明`).not.toBeNull()
    }
  })

  it('★ 官方有数的数量都带 countClaim，且引用的是 HGX 自己的官方源', () => {
    const officialSources = new Set([
      'src.nvidia-hgx-ra',
      'src.nvidia-hgx-page',
      'src.nvidia-blackwell-ultra-datasheet',
      'src.nvidia-blackwell-ultra-blog',
    ])
    for (const id of [
      'asm.hgx.baseboard',
      'asm.hgx.b300-gpu',
      'asm.hgx.host-cpu',
      'asm.hgx.cx8-nic',
      'asm.hgx.bf3-dpu',
      'asm.hgx.hbm',
      'asm.hgx.scaleout-leaf',
      'asm.hgx.scaleout-spine',
      'asm.hgx.converged-switch',
      'asm.hgx.oob-fabric-switch',
      'asm.hgx.control-plane-node',
      'asm.hgx.boot-nvme',
    ]) {
      const node = assemblyById(id)!
      expect(node.countClaim, `${id} 应有 countClaim`).not.toBeNull()
      expect(node.countClaim!.value, `${id} 的 countClaim 与 count 不一致`).toBe(node.count)
      expect(node.countClaim!.locator, `${id} 的 countClaim 缺 locator`).not.toBeNull()
      expect(
        officialSources.has(node.countClaim!.sourceId),
        `${id} 的 countClaim 引用了非 HGX 官方源 ${node.countClaim!.sourceId}`,
      ).toBe(true)
    }
  })

  it('★ 三个官方显存数字（288 / 270）并存且各自留痕，不互相覆盖', () => {
    const gpu = componentById('cmp.hgx.b300-sxm')!
    expect(gpu.specs.hbmPerGpuGB!.value).toBe(270)
    expect(gpu.specs.hbmPerGpuRaGB!.value).toBe(288)
    // 两条都必须解释「为什么并存」——官方脚注 varies by SKU
    for (const key of ['hbmPerGpuGB', 'hbmPerGpuRaGB'] as const) {
      expect(gpu.specs[key]!.note, `${key} 缺少 SKU 口径说明`).toContain('SKU')
    }
  })

  it('★ HGX vs DGX：DGX 源只出现在明确标注为参照的 note 里，不当 HGX 规格', () => {
    // 内容包里凡是引用 DGX 页的 Claim，value 必须为 null（只借它的措辞做参照说明）
    const dgxBacked = FACTORY_PACK.components
      .filter((c) => c.id.startsWith('cmp.hgx.'))
      .flatMap((c) => Object.entries(c.specs).map(([k, v]) => ({ where: `${c.id}.${k}`, claim: v })))
      .filter((x) => x.claim.sourceId === 'src.nvidia-dgx-b300-page')
    for (const { where, claim } of dgxBacked) {
      expect(claim.value, `${where} 拿 DGX 的数字当了 HGX 的规格`).toBeNull()
    }
    // ★ 现状比上面的规则更严：DGX 源目前**根本不出现在任何 Claim.sourceId 里**（只进
    //   sourceIds 清单与 note 正文）。把这一点显式钉住，免得上面的循环因集合为空而恒真、
    //   读起来像在防守而实际没防守（v1.4 QA 建议 6）；日后若真要用 DGX 源建 value:null
    //   的参照 Claim，把这行改成新的预期数并说明。
    expect(dgxBacked.length, 'DGX 源开始出现在 Claim 里了——确认是 value:null 参照并更新此断言').toBe(0)
    // 系统的 presalesNote 要把这个混淆点讲明白
    expect(systemById(HGX)!.presalesNote).toContain('DGX')
  })

  it('★ H200/B200 沿革以 specs 对照 + 比较 summary 呈现，不建旧代系统（PLAN-v1.4 W-C）', () => {
    // RA Table 1 三代同表并列是官方自己给的对照——世代变化落在基板 specs 的两条 Claim 里
    const board = FACTORY_PACK.components.find((c) => c.id === 'cmp.hgx.baseboard')!
    for (const key of ['generationalMemoryPerGpu', 'generationalBandwidthPerGpu'] as const) {
      const c = board.specs[key]
      expect(c, `cmp.hgx.baseboard.specs.${key} 缺失`).toBeDefined()
      expect(c!.sourceId, key).toBe('src.nvidia-hgx-ra')
      expect(c!.locator, `${key} 应指向 RA Table 1`).toContain('Table 1')
      expect(String(c!.value), key).toContain('H200')
    }
    const def = FACTORY_PACK.comparisons.find((d) => d.id === 'cmpdef.gb300-to-hgx-b300')!
    const summary = def.summary.join('\n')
    expect(summary).toContain('H200')
    expect(summary).toContain('B200')
    // 「降级为沿革叙事」说到做到：系统集合里不得出现 H200/B200 系统
    expect(FACTORY_PACK.systems.some((s) => /h200|b200/i.test(`${s.id} ${s.name}`))).toBe(false)
  })

  it('★ 三个导览场景覆盖「服务器解剖 / 机架没有 NVLink / 两种域怎么选」三级视角', () => {
    const scenes = scenesOfSystem(HGX)
    expect(scenes.map((s) => s.id)).toEqual([
      'scene.hgx.server-anatomy',
      'scene.hgx.rack-no-nvlink',
      'scene.hgx.two-domains',
    ])
    expect(scenes.map((s) => s.lodLevel)).toEqual(['board', 'rack', 'cluster'])
    for (const s of scenes) {
      expect(s.presalesNote, `${s.id} 缺售前话术`).not.toBeNull()
      expect(s.narration.length, `${s.id} 导览词过短`).toBeGreaterThan(120)
    }
    // 第二站必须真的把 nvlink 平面打开——「一条线都没有」得让用户亲眼看到
    const noNvlink = scenes.find((s) => s.id === 'scene.hgx.rack-no-nvlink')!
    expect(noNvlink.planes).toContain('nvlink')
    expect(noNvlink.narration).toContain('一条线都没有')
  })

  it('★ GB300 → HGX 的比较定义存在，且把域大小、冷却方式、选型讲清楚了', () => {
    const def = FACTORY_PACK.comparisons.find((c) => c.id === 'cmpdef.gb300-to-hgx-b300')!
    expect(def).toBeDefined()
    expect(def.leftSystemId).toBe(SYSTEM_ID)
    expect(def.rightSystemId).toBe(HGX)
    const summary = def.summary.join(' ')
    expect(summary).toContain('72')
    expect(summary).toContain('8 卡')
    expect(summary).toContain('风冷')
    expect(summary).toContain('MoE')
    // gpu-server（added）与 compute-tray（removed）是最容易被误读的两行，必须有 narrative
    for (const key of ['gpu-server', 'compute-tray', 'nvswitch-asic', 'room-air-handler']) {
      const row = def.rows.find((r) => r.roleKey === key)
      expect(row, `${key} 行缺失`).toBeDefined()
      expect(row!.narrative, `${key} 行缺 narrative`).not.toBeNull()
    }
  })
})

// ═══════════════════════════ v1.6 W-A：切面与技术注册表事实锁 ═══════════════════════════

/**
 * 这一组锁住的是切面/技术注册表里「说错了客户就不信你」的数字与纪律：
 * - Model Streamer 4.88s 的对照对象是 **Tensorizer**（不是 Safetensors loader）；
 * - Mooncake 只用 FAST 25 正式版数字（与 arXiv 版不同）；
 * - WEKA/VAST/Mooncake/Model Streamer 的数字只能待在 figures 里，绝不流入组件规格；
 * - 对象存储是建模描述（specs 全 null），六平面不扩。
 */
describe('v1.6 切面与技术注册表：事实锁', () => {
  const techById = new Map(FACTORY_PACK.techniques.map((t) => [t.id, t]))
  const lensByIdMap = new Map(FACTORY_PACK.lenses.map((l) => [l.id, l]))

  it('★ 9 条技术 id 清单锁（顺序与 PLAN-v1.6 第二节一致）', () => {
    expect(FACTORY_PACK.techniques.map((t) => t.id)).toEqual([
      'tech.nixl',
      'tech.kvbm',
      'tech.model-streamer',
      'tech.gds',
      'tech.sharp',
      'tech.pd-disagg',
      'tech.ep-alltoall',
      'tech.rail-routing',
      'tech.adaptive-routing',
    ])
  })

  it('★ Model Streamer 事实锁：S3 直读 4.88s，对照对象是 Tensorizer 37.36s（不是 Safetensors loader）', () => {
    const t = techById.get('tech.model-streamer')!
    const s3 = t.figures.find((f) => f.key === 's3LoadSeconds')!
    expect(s3.claim.value).toBe(4.88)
    expect(s3.claim.evidence).toBe('benchmark')
    // locator 必带盘型/实例/模型配置（计划硬要求）
    expect(s3.claim.locator).toContain('S3')
    expect(s3.claim.locator).toContain('g5.12xlarge')
    expect(s3.claim.locator).toContain('Llama-3-8B')
    const tensorizer = t.figures.find((f) => f.key === 's3TensorizerSeconds')!
    expect(tensorizer.claim.value).toBe(37.36)
    expect(tensorizer.claim.note).toContain('Tensorizer')
    expect(tensorizer.claim.note).toContain('不是 Safetensors Loader')
  })

  it('★ SHARP 14.4 TFLOPS 一致锁：切面章节 keyFigure 与 NVLink 6 交换托盘的组件 spec 同源同值', () => {
    const spec = componentById('cmp.rubin.nvlink6-switch-tray')!.specs.sharpFp8Tflops!
    const ch = lensByIdMap
      .get('lens.network')!
      .chapters.find((c) => c.id === 'lens.network.sharp-innetwork')!
    const fig = ch.keyFigures.find((f) => f.key === 'sharpFp8Tflops')!
    expect(spec.value).toBe(14.4)
    expect(fig.claim.value).toBe(spec.value)
    expect(fig.claim.sourceId).toBe(spec.sourceId)
    // GB300 代的 SHARP 算力官方未公布 → value:null（不从 14.4 倒推）
    const gb300Fig = ch.keyFigures.find((f) => f.key === 'gb300SharpTflops')!
    expect(gb300Fig.claim.value).toBeNull()
  })

  it('★ 40 GB/s 一致锁：存储切面冷启动章 keyFigure = con.gb300.converged-storage.bandwidth', () => {
    const conn = FACTORY_PACK.connections.find((c) => c.id === 'con.gb300.converged-storage')!
    const ch = lensByIdMap
      .get('lens.storage')!
      .chapters.find((c) => c.id === 'lens.storage.cold-start')!
    const fig = ch.keyFigures.find((f) => f.key === 'perNodeStorage')!
    expect(conn.bandwidth!.value).toBe(40)
    expect(fig.claim.value).toBe(conn.bandwidth!.value)
    expect(fig.claim.sourceId).toBe(conn.bandwidth!.sourceId)
  })

  it('★ KV offload 官方原句一致锁：存储切面 KV 章与 cmp.hgx.local-nvme 同源同句', () => {
    const spec = componentById('cmp.hgx.local-nvme')!.specs.kvCacheOffloadNote!
    const ch = lensByIdMap
      .get('lens.storage')!
      .chapters.find((c) => c.id === 'lens.storage.kv-runtime')!
    const fig = ch.keyFigures.find((f) => f.key === 'kvOffloadNote')!
    expect(fig.claim.value).toBe(spec.value)
    expect(fig.claim.sourceId).toBe(spec.sourceId)
    expect(fig.claim.locator).toContain('KV cache offloads to highspeed, network attached storage')
  })

  it('★ Mooncake 只用 FAST 25 正式版数字（59%~498% 与 115%/107%），并留痕 arXiv 版不同', () => {
    const ch = lensByIdMap
      .get('lens.storage')!
      .chapters.find((c) => c.id === 'lens.storage.kv-runtime')!
    const capacity = ch.keyFigures.find((f) => f.key === 'mooncakeCapacityGain')!
    expect(capacity.claim.value).toBe('+59% ~ +498%')
    expect(capacity.claim.locator).toContain('59%~498%')
    expect(capacity.claim.note).toContain('arXiv')
    const prod = ch.keyFigures.find((f) => f.key === 'mooncakeProdGain')!
    expect(prod.claim.value).toContain('115%')
    expect(prod.claim.value).toContain('107%')
    // 命中率没有通用数字 → value:null
    expect(ch.keyFigures.find((f) => f.key === 'kvHitRate')!.claim.value).toBeNull()
  })

  it('★ lens.storage 章节顺序 = 业务动线（分发 → 加载 → 运行时 KV → 归档 → RAG）', () => {
    expect(lensByIdMap.get('lens.storage')!.chapters.map((c) => c.id)).toEqual([
      'lens.storage.model-distribution',
      'lens.storage.cold-start',
      'lens.storage.kv-runtime',
      'lens.storage.archive-mirror',
      'lens.storage.rag-l4',
    ])
  })

  it('★ 网络切面 6 章齐全，计算器分发按计划落位（网络 ch6 kv-transfer、存储 ch2/ch3）', () => {
    const network = lensByIdMap.get('lens.network')!
    expect(network.chapters.map((c) => c.id)).toEqual([
      'lens.network.nvlink-domain',
      'lens.network.rail-planes',
      'lens.network.sharp-innetwork',
      'lens.network.storage-fabric',
      'lens.network.mgmt-mttr',
      'lens.network.domain-size-hgx',
    ])
    expect(network.chapters.map((c) => c.calculatorId)).toEqual([
      null,
      null,
      null,
      null,
      null,
      'kv-transfer',
    ])
    expect(lensByIdMap.get('lens.storage')!.chapters.map((c) => c.calculatorId)).toEqual([
      null,
      'model-load',
      'kv-restore',
      null,
      null,
    ])
  })

  it('★ 六平面不扩：对象存储走 business 平面，全包 plane 集合仍是既有六个', () => {
    const planes = new Set(FACTORY_PACK.connections.map((c) => c.plane))
    expect([...planes].sort()).toEqual(['business', 'cooling', 'mgmt', 'nvlink', 'power', 'scaleout'])
    for (const id of ['con.gb300.objstore-converged', 'con.hgx.objstore-converged']) {
      const conn = FACTORY_PACK.connections.find((c) => c.id === id)!
      expect(conn, `${id} 不存在`).toBeDefined()
      expect(conn.plane, id).toBe('business')
      expect(conn.bandwidth, `${id} 的带宽官方无数，必须为 null`).toBeNull()
    }
  })

  it('★ 对象存储是建模描述：specs 全 null 带说明，两代各有装配节点（示意数量、无 countClaim）', () => {
    const comp = componentById('cmp.shared.object-storage')!
    expect(comp.kind).toBe('storage')
    expect(Object.keys(comp.specs).length).toBeGreaterThan(0)
    for (const [k, c] of Object.entries(comp.specs)) {
      expect(c.value, `${k} 不应有数值（官方未公布不编数）`).toBeNull()
      expect(c.note, `${k} 缺「为什么没数」的说明`).not.toBeNull()
    }
    expect(comp.summary).toContain('建模')
    for (const id of ['asm.gb300.object-storage', 'asm.hgx.object-storage']) {
      const node = assemblyById(id)!
      expect(node, `${id} 不存在`).toBeDefined()
      expect(node.roleKey).toBe('object-storage')
      expect(node.lodLevel).toBe('cluster')
      expect(node.countClaim, `${id} 是建模示意，不该有 countClaim`).toBeNull()
      expect(node.note, `${id} 缺「为什么是示意」的说明`).not.toBeNull()
    }
  })

  it('★ 厂商数字纪律：WEKA/VAST 恒 vendor_claim、Mooncake/Model Streamer 恒 benchmark（figures 内）', () => {
    const vendorOnly = new Set(['src.weka-materials', 'src.vast-materials'])
    const benchOnly = new Set(['src.mooncake-fast25', 'src.runai-model-streamer'])
    const figures = [
      ...FACTORY_PACK.techniques.flatMap((t) => t.figures.map((f) => ({ where: `${t.id}.${f.key}`, claim: f.claim }))),
      ...FACTORY_PACK.lenses.flatMap((l) =>
        l.chapters.flatMap((ch) => ch.keyFigures.map((f) => ({ where: `${ch.id}.${f.key}`, claim: f.claim }))),
      ),
    ]
    let checked = 0
    for (const { where, claim } of figures) {
      if (vendorOnly.has(claim.sourceId)) {
        checked += 1
        expect(claim.evidence, `${where} 引 WEKA/VAST 却不是 vendor_claim`).toBe('vendor_claim')
      }
      if (benchOnly.has(claim.sourceId)) {
        checked += 1
        expect(claim.evidence, `${where} 引 Mooncake/Model Streamer 却不是 benchmark`).toBe('benchmark')
      }
    }
    // 防止规则被静默架空：这四个源必须真的有 figure 被检查到
    expect(checked).toBeGreaterThanOrEqual(6)
  })

  it('★★ WEKA/VAST/Mooncake/Model Streamer 的 sourceId 绝不出现在任何组件规格/系统规格/数量/带宽 Claim 上', () => {
    const banned = new Set([
      'src.weka-materials',
      'src.vast-materials',
      'src.mooncake-fast25',
      'src.runai-model-streamer',
    ])
    const offenders: string[] = []
    for (const s of FACTORY_PACK.systems) {
      for (const [k, c] of Object.entries(s.keySpecs)) {
        if (banned.has(c.sourceId)) offenders.push(`${s.id}.keySpecs.${k}`)
      }
    }
    for (const c of FACTORY_PACK.components) {
      for (const [k, cl] of Object.entries(c.specs)) {
        if (banned.has(cl.sourceId)) offenders.push(`${c.id}.specs.${k}`)
      }
    }
    for (const a of FACTORY_PACK.assemblies) {
      if (a.countClaim && banned.has(a.countClaim.sourceId)) offenders.push(`${a.id}.countClaim`)
    }
    for (const conn of FACTORY_PACK.connections) {
      if (conn.bandwidth && banned.has(conn.bandwidth.sourceId)) offenders.push(`${conn.id}.bandwidth`)
    }
    expect(offenders, `厂商/论文数字流入了硬件证据层：${offenders.join('、')}`).toEqual([])
  })

  it('★ L4 纯叙事锁：RAG 章不动 3D（focus/highlight 全空），叙事行不经硬件', () => {
    const ch = lensByIdMap.get('lens.storage')!.chapters.find((c) => c.id === 'lens.storage.rag-l4')!
    expect(ch.focusAssemblyId).toBeNull()
    expect(ch.highlightAssemblyIds).toEqual([])
    expect(ch.highlightConnectionIds).toEqual([])
    expect(ch.chain[0]!.hardwareRoleKeys).toEqual([])
    expect(ch.chain[0]!.techniqueId).toBeNull()
    // WEKA/VAST 数字在这一章必须全是 vendor_claim（营销口径徽章）
    for (const f of ch.keyFigures) {
      expect(f.claim.evidence, `${ch.id}.${f.key}`).toBe('vendor_claim')
    }
  })

  it('★ 双向/单向口径纪律：并排对比的 keyFigures 在 note/label 里写明口径', () => {
    const network = lensByIdMap.get('lens.network')!
    const ch1 = network.chapters.find((c) => c.id === 'lens.network.nvlink-domain')!
    expect(ch1.keyFigures.find((f) => f.key === 'nvlinkPerGpu')!.claim.note).toContain('双向')
    const ch6 = network.chapters.find((c) => c.id === 'lens.network.domain-size-hgx')!
    expect(ch6.keyFigures.find((f) => f.key === 'baseboardNvlink')!.claim.note).toContain('双向')
    const crossNode = ch6.keyFigures.find((f) => f.key === 'crossNodeScaleout')!
    expect(crossNode.claim.note).toContain('单向')
    expect(crossNode.claim.note).toContain('不可直接相除')
  })
})

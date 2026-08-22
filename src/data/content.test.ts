import { describe, expect, it } from 'vitest'
import {
  FACTORY_PACK,
  assemblyById,
  componentById,
  connectionsOfPlane,
  descendantsOf,
  modelById,
  systemById,
  totalInstances,
} from './index'
import { kvBytesPerToken } from '../lib/roofline'
import type { NetworkPlane } from './types'

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

import { describe, expect, it } from 'vitest'
import type { ModelSpec } from '../data/types'
import { estTTFTms, kvBytesPerToken } from './roofline'
import { MFU_BAND } from './capacity'
import {
  STORAGE_CALC_HEADLINE_CAVEAT,
  STORAGE_CALC_NOT_MODELED,
  kvRestoreTiersOf,
  kvRestoreVsRecompute,
  modelLoadBreakdown,
  storageLadderOf,
  toUnidirGBps,
} from './storagePath'
import type { LinkRate } from './storagePath'

const DEEPSEEK_V3: ModelSpec = {
  id: 'deepseek-v3',
  name: 'DeepSeek-V3',
  vendor: 'DeepSeek',
  year: 2024,
  totalParamsB: 671,
  activeParamsB: 37,
  moe: { experts: 256, activePerToken: 8, shared: 1 },
  attentionType: 'MLA',
  kvSpec: { kind: 'mla', numLayers: 61, kvLatentDim: 576 },
  contextK: 128,
  license: 'MIT',
  sourceUrl: 'https://arxiv.org/abs/2412.19437',
  asOf: '2024-12',
  note: null,
}

const UNSUPPORTED_MODEL: ModelSpec = {
  ...DEEPSEEK_V3,
  id: 'test-unsupported',
  kvSpec: { kind: 'unsupported', note: '新型稀疏注意力，无公开公式参数' },
}

function rate(partial: Partial<LinkRate> & { value: number | null }): LinkRate {
  return { unit: 'GBps', direction: 'unidirectional', label: 'x', ...partial }
}

describe('toUnidirGBps：口径换算', () => {
  it('单位换算：TB/s ×1000、Gb/s ÷8 一律折算成 GB/s', () => {
    expect(toUnidirGBps(rate({ value: 1, unit: 'TBps', label: 't' })).gbps).toBe(1000)
    expect(toUnidirGBps(rate({ value: 800, unit: 'Gbps', label: 'g' })).gbps).toBe(100)
  })

  it('1.8 TB/s 双向 ≠ 1800 GB/s 单向可用：按 ÷2 折算为 900 GB/s，且 note 非空并提示口径', () => {
    const r = toUnidirGBps(rate({ value: 1.8, unit: 'TBps', direction: 'bidirectional', label: 'NVLink' }))
    expect(r.gbps).toBe(900)
    expect(r.gbps).not.toBe(1800)
    expect(r.note.length).toBeGreaterThan(0)
    expect(r.note).toContain('双向')
  })

  it('单向口径（如 800 Gb/s 端口速率）不做方向折算，直接使用', () => {
    const r = toUnidirGBps(rate({ value: 800, unit: 'Gbps', direction: 'unidirectional', label: 'CX-8' }))
    expect(r.gbps).toBe(100)
  })

  it('value: null（官方未公布）→ gbps: null，note 说明原因，不当 0', () => {
    const r = toUnidirGBps(rate({ value: null, label: '缺数段' }))
    expect(r.gbps).toBeNull()
    expect(r.note.length).toBeGreaterThan(0)
  })
})

describe('modelLoadBreakdown：串行分段耗时', () => {
  it('全部已知：总时长=各段之和，瓶颈段=耗时最长的一段', () => {
    const result = modelLoadBreakdown(100, [
      { id: 'a', label: 'A', rate: rate({ value: 10, label: 'A' }) }, // 10s
      { id: 'b', label: 'B', rate: rate({ value: 50, label: 'B' }) }, // 2s
    ])
    expect(result.segments.map((s) => s.seconds)).toEqual([10, 2])
    expect(result.totalSeconds).toBe(12)
    expect(result.bottleneckId).toBe('a')
  })

  it('任一段带宽 null → total 与 bottleneck 一并为 null（不当 0）', () => {
    const result = modelLoadBreakdown(100, [
      { id: 'a', label: 'A', rate: rate({ value: 10, label: 'A' }) },
      { id: 'b', label: 'B', rate: rate({ value: null, label: 'B' }) },
    ])
    expect(result.segments[0]!.seconds).toBe(10)
    expect(result.segments[1]!.seconds).toBeNull()
    expect(result.totalSeconds).toBeNull()
    expect(result.bottleneckId).toBeNull()
  })

  it('空分段数组：total/bottleneck 为 null，不是 0', () => {
    const result = modelLoadBreakdown(100, [])
    expect(result.totalSeconds).toBeNull()
    expect(result.bottleneckId).toBeNull()
  })
})

describe('kvRestoreVsRecompute：恢复 vs 重算', () => {
  const tiers = [
    { id: 'l1', label: 'L1', rate: rate({ value: 20, label: 'L1' }) },
    { id: 'l2', label: 'L2', rate: rate({ value: 40, label: 'L2' }) },
  ]

  it('KV 字节量与 roofline 交叉核对：DeepSeek-V3 MLA = 576 × 61 × 2 B/token', () => {
    const expected = kvBytesPerToken(DEEPSEEK_V3.kvSpec)
    expect(expected).toBe(576 * 61 * 2)
    const result = kvRestoreVsRecompute(DEEPSEEK_V3, 100_000, 5000, 72, tiers)
    expect(result.kvBytesPerTokenValue).toBe(expected)
    expect(result.kvTotalGB).toBeCloseTo((expected! * 100_000) / 1e9, 10)
  })

  it('恢复侧：单点耗时 = KV 总量 ÷ 该层级单向带宽（不同层级互不影响）', () => {
    const result = kvRestoreVsRecompute(DEEPSEEK_V3, 100_000, 5000, 72, tiers)
    const kvGB = result.kvTotalGB!
    expect(result.restoreByTier[0]!.seconds).toBeCloseTo(kvGB / 20, 10)
    expect(result.restoreByTier[1]!.seconds).toBeCloseTo(kvGB / 40, 10)
  })

  it('重算侧：透出 MFU 低/中/高三档，与 roofline.estTTFTms 直接调用结果一致（低=高利用率=更快）', () => {
    const result = kvRestoreVsRecompute(DEEPSEEK_V3, 100_000, 5000, 72, tiers)
    const band = result.recomputeTtftMsBand!
    expect(band.low).toBeCloseTo(estTTFTms(DEEPSEEK_V3.activeParamsB, 100_000, 5000, 72, MFU_BAND.high)!, 10)
    expect(band.mid).toBeCloseTo(estTTFTms(DEEPSEEK_V3.activeParamsB, 100_000, 5000, 72, MFU_BAND.mid)!, 10)
    expect(band.high).toBeCloseTo(estTTFTms(DEEPSEEK_V3.activeParamsB, 100_000, 5000, 72, MFU_BAND.low)!, 10)
    expect(band.low).toBeLessThan(band.high)
  })

  it('gpuTflops: null → 重算侧 null，恢复侧仍可用各自层级带宽独立出数', () => {
    const result = kvRestoreVsRecompute(DEEPSEEK_V3, 100_000, null, 72, tiers)
    expect(result.recomputeTtftMsBand).toBeNull()
    expect(result.restoreByTier[0]!.seconds).not.toBeNull()
  })

  it('kvSpec unsupported → 重算与恢复全线 null，不做伪精确估算', () => {
    const result = kvRestoreVsRecompute(UNSUPPORTED_MODEL, 100_000, 5000, 72, tiers)
    expect(result.kvBytesPerTokenValue).toBeNull()
    expect(result.kvTotalGB).toBeNull()
    expect(result.recomputeTtftMsBand).toBeNull()
    expect(result.restoreByTier.every((t) => t.seconds === null)).toBe(true)
    expect(result.unsupportedReason).not.toBeNull()
  })
})

describe('storageLadderOf：model-load 数据适配（GB300 pin）', () => {
  const gb300 = storageLadderOf('sys.gb300-nvl72')

  it('四段齐全：L3→L2 / L2→节点 / 本地缓存 / →HBM', () => {
    expect(gb300.segments.map((s) => s.id)).toEqual([
      'object-to-shared',
      'shared-to-node',
      'local-cache',
      'hbm-inject',
    ])
  })

  it('L2→节点段取自官方 40 GB/s（con.gb300.converged-storage.bandwidth）', () => {
    const seg = gb300.segments.find((s) => s.id === 'shared-to-node')!
    expect(seg.rate.value).toBe(40)
    expect(seg.rate.unit).toBe('GBps')
  })

  it('HBM 注入段取自该系统 GPU 组件的 mathSpecs.bandwidthTBs（GB300 = 8 TB/s）', () => {
    const seg = gb300.segments.find((s) => s.id === 'hbm-inject')!
    expect(seg.rate.value).toBe(8)
    expect(seg.rate.unit).toBe('TBps')
  })

  it('官方没有的段（对象存储吞吐、本地缓存盘带宽）value: null', () => {
    expect(gb300.segments.find((s) => s.id === 'object-to-shared')!.rate.value).toBeNull()
    expect(gb300.segments.find((s) => s.id === 'local-cache')!.rate.value).toBeNull()
  })

  it('inputClaims 每条都有非空 sourceId', () => {
    expect(gb300.inputClaims.length).toBeGreaterThan(0)
    for (const c of gb300.inputClaims) {
      expect(typeof c.claim.sourceId).toBe('string')
      expect(c.claim.sourceId.length).toBeGreaterThan(0)
    }
  })

  it('HGX 代际 L2→节点段官方未给数字 → value: null（不编数）', () => {
    const hgx = storageLadderOf('sys.hgx-b300')
    expect(hgx.segments.find((s) => s.id === 'shared-to-node')!.rate.value).toBeNull()
  })
})

describe('kvRestoreTiersOf：kv-restore 数据适配（HGX pin）', () => {
  const hgx = kvRestoreTiersOf('sys.hgx-b300')

  it('两档齐全：L1 本地缓存盘 / L2 共享存储', () => {
    expect(hgx.tiers.map((t) => t.id)).toEqual(['l1-local-cache', 'l2-shared-storage'])
  })

  it('两档在 HGX 代际都官方未给数字（KV 卸载到网络存储是官方点名的未来负载）', () => {
    expect(hgx.tiers[0]!.rate.value).toBeNull()
    expect(hgx.tiers[1]!.rate.value).toBeNull()
  })

  it('inputClaims 每条都有非空 sourceId', () => {
    for (const c of hgx.inputClaims) {
      expect(typeof c.claim.sourceId).toBe('string')
      expect(c.claim.sourceId.length).toBeGreaterThan(0)
    }
  })
})

describe('caveat 常量', () => {
  it('STORAGE_CALC_HEADLINE_CAVEAT 恒为非空固定首条', () => {
    expect(STORAGE_CALC_HEADLINE_CAVEAT.length).toBeGreaterThan(0)
  })

  it('STORAGE_CALC_NOT_MODELED 覆盖协议开销/并发争用/条带化/排队', () => {
    expect(STORAGE_CALC_NOT_MODELED).toEqual(
      expect.arrayContaining(['协议开销', '并发争用', '条带化/多流并发', '排队']),
    )
  })
})

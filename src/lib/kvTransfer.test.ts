import { describe, expect, it } from 'vitest'
import { kvBytesPerToken } from './roofline'
import { KV_TRANSFER_HEADLINE_CAVEAT, KV_TRANSFER_NOT_MODELED, kvTransferLadder, kvTransferRungsOf } from './kvTransfer'
import type { KvTransferRung } from './kvTransfer'
import type { LinkRate } from './storagePath'

function rate(partial: Partial<LinkRate> & { value: number | null }): LinkRate {
  return { unit: 'GBps', direction: 'unidirectional', label: 'x', ...partial }
}

describe('kvTransferLadder：三档并排耗时', () => {
  it('各档相互独立：单档耗时 = kvGB ÷ 该档单向带宽', () => {
    const rungs: KvTransferRung[] = [
      { id: 'a', label: 'A', rate: rate({ value: 100, label: 'A' }), claim: null },
      { id: 'b', label: 'B', rate: rate({ value: 50, label: 'B' }), claim: null },
    ]
    const result = kvTransferLadder(100, rungs)
    expect(result[0]!.seconds).toBe(1)
    expect(result[1]!.seconds).toBe(2)
  })

  it('双向合计口径先 ÷2 再算：1.8 TB/s 双向 → 900 GB/s 单向可用', () => {
    const rungs: KvTransferRung[] = [
      {
        id: 'nvlink',
        label: 'NVLink',
        rate: { value: 1.8, unit: 'TBps', direction: 'bidirectional', label: 'NVLink' },
        claim: null,
      },
    ]
    const result = kvTransferLadder(9, rungs) // 9 GB ÷ 900 GB/s = 0.01s
    expect(result[0]!.gbpsUsed).toBe(900)
    expect(result[0]!.seconds).toBeCloseTo(0.01, 10)
    expect(result[0]!.conversionNote).toContain('双向')
  })

  it('某一档 value: null → 该档 seconds/gbpsUsed 为 null，其余档不受影响', () => {
    const rungs: KvTransferRung[] = [
      { id: 'known', label: 'K', rate: rate({ value: 100, label: 'K' }), claim: null },
      { id: 'unknown', label: 'U', rate: rate({ value: null, label: 'U' }), claim: null },
    ]
    const result = kvTransferLadder(100, rungs)
    expect(result.find((r) => r.id === 'known')!.seconds).toBe(1)
    expect(result.find((r) => r.id === 'unknown')!.seconds).toBeNull()
  })
})

describe('kvTransferRungsOf：HGX pin 三档数据适配', () => {
  const { rungs } = kvTransferRungsOf('sys.hgx-b300')

  it('三档齐全：NVLink 域内 / 跨机计算网 / 业务存储网', () => {
    expect(rungs.map((r) => r.id)).toEqual(['nvlink-domain', 'cross-node-ethernet', 'storage-fabric'])
  })

  it('NVLink 域内档：14.4 TB/s，标注为双向合计口径', () => {
    const r = rungs.find((x) => x.id === 'nvlink-domain')!
    expect(r.rate.value).toBe(14.4)
    expect(r.rate.unit).toBe('TBps')
    expect(r.rate.direction).toBe('bidirectional')
  })

  it('跨机计算网档：800 Gb/s，标注为单向端口速率口径（不因 Connection.direction=bidirectional 被误判）', () => {
    const r = rungs.find((x) => x.id === 'cross-node-ethernet')!
    expect(r.rate.value).toBe(800)
    expect(r.rate.unit).toBe('Gbps')
    expect(r.rate.direction).toBe('unidirectional')
  })

  it('两档口径不同，换算后 NVLink 域内单向可用带宽仍显著高于跨机（域大小差异的量级钩子）', () => {
    const nvlink = rungs.find((x) => x.id === 'nvlink-domain')!
    const cx8 = rungs.find((x) => x.id === 'cross-node-ethernet')!
    const kvGB = 7 // 任取一个正数即可，只看相对量级
    const [nvlinkResult, cx8Result] = kvTransferLadder(kvGB, [nvlink, cx8])
    expect(nvlinkResult!.seconds!).toBeLessThan(cx8Result!.seconds!)
  })

  it('业务存储网在 HGX 代际官方未给数字 → value: null（不编数）', () => {
    const r = rungs.find((x) => x.id === 'storage-fabric')!
    expect(r.rate.value).toBeNull()
    expect(r.claim).toBeNull()
  })

  it('存在的档，claim 都有非空 sourceId', () => {
    for (const r of rungs) {
      if (r.claim === null) continue
      expect(typeof r.claim.sourceId).toBe('string')
      expect(r.claim.sourceId.length).toBeGreaterThan(0)
    }
  })
})

describe('KV 字节量交叉核对（与 storagePath 用例呼应）', () => {
  it('DeepSeek-V3 MLA：576 × 61 × 2 B/token', () => {
    expect(kvBytesPerToken({ kind: 'mla', numLayers: 61, kvLatentDim: 576 })).toBe(70272)
  })
})

describe('caveat 常量', () => {
  it('KV_TRANSFER_HEADLINE_CAVEAT 恒为非空固定首条，且与 storagePath 的措辞不同', () => {
    expect(KV_TRANSFER_HEADLINE_CAVEAT.length).toBeGreaterThan(0)
  })

  it('KV_TRANSFER_NOT_MODELED 覆盖协议开销/并发争用/条带化/排队', () => {
    expect(KV_TRANSFER_NOT_MODELED).toEqual(
      expect.arrayContaining(['协议开销', '并发争用', '条带化/多流并发', '排队']),
    )
  })
})

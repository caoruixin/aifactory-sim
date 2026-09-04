import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import { SPEC_LABELS, hasSpecLabel, specLabel } from './specLabel'

/**
 * 内容包里所有会被 UI 当成「规格行」渲染的键：
 * - `components[].specs`（详情面板「官方规格」区块、比较模式的规格对照）
 * - `systems[].keySpecs`（`/report` §02 的 KeySpecTable）
 */
function packSpecKeys(): string[] {
  const keys = new Set<string>()
  for (const c of FACTORY_PACK.components) for (const k of Object.keys(c.specs)) keys.add(k)
  for (const s of FACTORY_PACK.systems) for (const k of Object.keys(s.keySpecs)) keys.add(k)
  return [...keys].sort()
}

describe('specLabel：规格键 → 中文显示名', () => {
  it('★ 覆盖内容包里出现的全部规格键——新增键漏写标签时这条会红', () => {
    const missing = packSpecKeys().filter((k) => !hasSpecLabel(k))
    expect(
      missing,
      `以下规格键还没有中文标签，请在 src/lib/specLabel.ts 里补上（照该键在组件里的实际 Claim 写口径，别望文生义）：\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('★ 没有多余条目：标签表里的键都真的出现在内容包里（防拼错键名 / 删数据后留下死条目）', () => {
    const inPack = new Set(packSpecKeys())
    const stale = Object.keys(SPEC_LABELS).filter((k) => !inPack.has(k))
    expect(stale, `以下键在内容包里已经不存在了：\n${stale.join('\n')}`).toEqual([])
  })

  it('标签非空、不是键名本身、也不重复写单位', () => {
    for (const [key, label] of Object.entries(SPEC_LABELS)) {
      expect(label.length, key).toBeGreaterThan(0)
      expect(label, key).not.toBe(key)
      // 单位由 `claim.unit` 单独渲染，标签里再写一遍会出现「显存带宽 TB/s 22 TB/s」。
      expect(label, key).not.toMatch(/(TB\/s|GB\/s|Gb\/s|PFLOPS|TFLOPS|kW\b|（W）)$/)
    }
  })

  it('查不到的键原样返回，不抛错也不返回空串', () => {
    expect(specLabel('someBrandNewKeyFromTheFuture')).toBe('someBrandNewKeyFromTheFuture')
    expect(specLabel('')).toBe('')
    expect(hasSpecLabel('someBrandNewKeyFromTheFuture')).toBe(false)
  })

  it('抽查几条关键口径：标签讲的是该键在内容包里的实际含义', () => {
    // 汇报页 §02 那张表用到的键（缺陷 2 的实测现场）
    expect(specLabel('gpuCount')).toBe('GPU 数量')
    expect(specLabel('rackPowerKW')).toBe('整机架功率')
    expect(specLabel('nvlinkAggregateBandwidthTBs')).toContain('NVLink 聚合带宽')
    // 详情面板里最容易被当成英文标识符的三个
    expect(specLabel('powerCapacityKW')).toBe('机房总供电容量')
    expect(specLabel('perNodeStorageBandwidthGBs')).toContain('每计算节点')
    // 同名不同层级的一组：口径必须写进标签，否则会被读成同一个数
    expect(specLabel('aggregateBandwidthPerNodeTBs')).toContain('每台服务器')
    expect(specLabel('aggregateBandwidthPerRackTBs')).toContain('每机架')
  })
})

import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import { PLANE_LABEL, PLANE_ORDER } from './palette'
import { hasPlaneLabelOverride, planeLabel } from './planeLabel'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'
const LPX = 'sys.groq3-lpx'
const HGX = 'sys.hgx-b300'

describe('planeLabel：按系统取平面显示名', () => {
  it('NVLink 域三代用通用名（与 PLANE_LABEL 逐条相同）', () => {
    for (const systemId of [GB300, VERA_RUBIN, NVL576]) {
      for (const plane of PLANE_ORDER) {
        expect(planeLabel(systemId, plane), `${systemId} / ${plane}`).toBe(PLANE_LABEL[plane])
      }
    }
  })

  it('★ Groq 3 LPX 的 nvlink 显示为「C2C scale-up」——那一代没有 NVLink 也没有交换层', () => {
    expect(planeLabel(LPX, 'nvlink')).toContain('C2C scale-up')
    expect(planeLabel(LPX, 'nvlink')).not.toContain('NVLink')
    // 通用名反过来必须仍是 NVLink（覆写没有污染基表）
    expect(PLANE_LABEL.nvlink).toContain('NVLink')
  })

  it('★ Groq 3 LPX 的 scaleout 显示为 AFD 配对语义', () => {
    expect(planeLabel(LPX, 'scaleout')).toContain('AFD')
    expect(planeLabel(GB300, 'scaleout')).toBe(PLANE_LABEL.scaleout)
  })

  it('LPX 未覆写的平面回落到通用名', () => {
    for (const plane of ['business', 'mgmt', 'power', 'cooling'] as const) {
      expect(planeLabel(LPX, plane), plane).toBe(PLANE_LABEL[plane])
    }
  })

  it('未知 / null / undefined 系统一律回落到通用名（调用方不必先判空）', () => {
    for (const plane of PLANE_ORDER) {
      expect(planeLabel('sys.nope', plane)).toBe(PLANE_LABEL[plane])
      expect(planeLabel(null, plane)).toBe(PLANE_LABEL[plane])
      expect(planeLabel(undefined, plane)).toBe(PLANE_LABEL[plane])
    }
  })

  it('★ 持久化键不受影响：覆写只改显示名，六个枚举值本身没有变', () => {
    expect([...PLANE_ORDER]).toEqual(['nvlink', 'scaleout', 'business', 'mgmt', 'power', 'cooling'])
    // 内容包里 LPX 的连接仍然用 `nvlink` 这个键（否则 store.planes 与 ?planes= 会对不上）
    const lpxPlanes = new Set(
      FACTORY_PACK.connections.filter((c) => c.systemId === LPX).map((c) => c.plane),
    )
    expect(lpxPlanes.has('nvlink')).toBe(true)
  })

  it('每个系统 × 每个平面都能拿到非空名字（UI 不会渲染出 undefined）', () => {
    for (const sys of FACTORY_PACK.systems) {
      for (const plane of PLANE_ORDER) {
        const label = planeLabel(sys.id, plane)
        expect(typeof label, `${sys.id} / ${plane}`).toBe('string')
        expect(label.length, `${sys.id} / ${plane}`).toBeGreaterThan(0)
      }
    }
  })

  it('hasPlaneLabelOverride 只对真正被覆写的组合为真', () => {
    expect(hasPlaneLabelOverride(LPX, 'nvlink')).toBe(true)
    expect(hasPlaneLabelOverride(LPX, 'scaleout')).toBe(true)
    expect(hasPlaneLabelOverride(LPX, 'power')).toBe(false)
    expect(hasPlaneLabelOverride(GB300, 'nvlink')).toBe(false)
    expect(hasPlaneLabelOverride(null, 'nvlink')).toBe(false)
  })

  // ── v1.4 W-C QA 返工点 2：HGX 的两处覆写 ──

  it('★ HGX 的 nvlink 保留「NVLink」字样但限定词改「服务器内」——域止步单服务器，「机架内」是事实错误', () => {
    // 保留 NVLink 是刻意的：它的 scale-up 真的是 NVLink，改名判据是「不是 NVLink」
    // 而不是「域多大」（factory.spec.ts 五代扫查断言 toContainText('NVLink') 依赖这一点）。
    expect(planeLabel(HGX, 'nvlink')).toContain('NVLink')
    expect(planeLabel(HGX, 'nvlink')).toContain('服务器内')
    expect(planeLabel(HGX, 'nvlink')).not.toContain('机架内')
  })

  it('★ HGX 的 cooling 显示为「风冷」——这一代没有液冷回路（medium airflow 就是为它加的）', () => {
    expect(planeLabel(HGX, 'cooling')).toContain('风冷')
    expect(planeLabel(HGX, 'cooling')).not.toContain('液冷')
    // 覆写没有污染基表与机架域三代
    expect(PLANE_LABEL.cooling).toBe('液冷')
    expect(planeLabel(GB300, 'cooling')).toBe(PLANE_LABEL.cooling)
  })

  it('HGX 未覆写的平面回落到通用名', () => {
    for (const plane of ['scaleout', 'business', 'mgmt', 'power'] as const) {
      expect(planeLabel(HGX, plane), plane).toBe(PLANE_LABEL[plane])
    }
    expect(hasPlaneLabelOverride(HGX, 'nvlink')).toBe(true)
    expect(hasPlaneLabelOverride(HGX, 'cooling')).toBe(true)
    expect(hasPlaneLabelOverride(HGX, 'scaleout')).toBe(false)
  })
})

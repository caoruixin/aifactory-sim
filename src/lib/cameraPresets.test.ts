import { describe, expect, it } from 'vitest'
import { CAMERA_FOV, cameraPresetFor, distanceOf, fitBoxFor, fitDistance } from './cameraPresets'
import { initialDrillState, nextState } from './drill'
import { resolveLayout } from './layout'
import type { LodLevel } from '../data/types'

const SYSTEM_ID = 'sys.gb300-nvl72'
const layout = resolveLayout(SYSTEM_ID)

const s0 = initialDrillState(SYSTEM_ID)
const sRack = nextState(s0, { type: 'drillTo', assemblyId: 'asm.gb300.rack' })
const sTray = nextState(sRack, { type: 'drillTo', assemblyId: 'asm.gb300.compute-tray' })
const sBoard = nextState(sTray, { type: 'drillTo', assemblyId: 'asm.gb300.b300-gpu' })

const CASES: Array<[LodLevel, string[]]> = [
  ['cluster', s0.focusPath],
  ['rack', sRack.focusPath],
  ['tray', sTray.focusPath],
  ['board', sBoard.focusPath],
]

describe('fitDistance', () => {
  it('包围盒越大，所需距离越远（单调）', () => {
    const small = fitDistance([1, 1, 1])
    const big = fitDistance([2, 2, 2])
    expect(big).toBeCloseTo(small * 2, 9)
  })

  it('距离足够把包围球装进竖直视场', () => {
    const extent: [number, number, number] = [7.2, 2.13, 1.2]
    const d = fitDistance(extent, CAMERA_FOV, 16 / 9, 1)
    const radius = 0.5 * Math.hypot(...extent)
    const halfV = Math.atan(radius / d)
    expect(halfV).toBeLessThanOrEqual(((CAMERA_FOV / 2) * Math.PI) / 180 + 1e-9)
  })

  it('窄屏（aspect < 1）需要更远的距离', () => {
    const extent: [number, number, number] = [4, 2, 2]
    expect(fitDistance(extent, CAMERA_FOV, 0.5)).toBeGreaterThan(fitDistance(extent, CAMERA_FOV, 1.8))
  })
})

describe('fitBoxFor', () => {
  it('cluster 框住整排机架，而不是整个机房地面（否则机架会小成一条线）', () => {
    const box = fitBoxFor('cluster', s0.focusPath, layout)
    // 8 机架 × 0.9 m 间距 ≈ 7.2 m，放宽后仍应远小于机房的 28 m
    expect(box.extent[0]).toBeGreaterThan(7)
    expect(box.extent[0]).toBeLessThan(15)
  })

  it('rack 框住单个机架外形', () => {
    const box = fitBoxFor('rack', sRack.focusPath, layout)
    expect(box.extent).toEqual(layout.get('asm.gb300.rack')!.size)
  })

  it('tray 框住单个托盘外形', () => {
    const box = fitBoxFor('tray', sTray.focusPath, layout)
    expect(box.extent).toEqual(layout.get('asm.gb300.compute-tray')!.size)
  })

  it('board 框住单个板级件并留 4 倍上下文（不是它的全部兄弟实例）', () => {
    const box = fitBoxFor('board', sBoard.focusPath, layout)
    const gpu = layout.get('asm.gb300.b300-gpu')!
    expect(box.extent[0]).toBeCloseTo(gpu.size[0] * 4, 9)
    expect(box.extent[0]).toBeLessThan(gpu.extent[0]) // 4 张 GPU 排开的跨度更大
    expect(box.extent[0]).toBeLessThan(layout.get('asm.gb300.compute-tray')!.size[0])
  })
})

describe('cameraPresetFor', () => {
  it.each(CASES)('%s 级：相机距离 ≥ fit 距离且落在 clamp 区间内', (level, focusPath) => {
    const p = cameraPresetFor(level, focusPath, layout)
    const d = distanceOf(p)
    expect(d).toBeGreaterThanOrEqual(p.fitDistance - 1e-9)
    expect(d).toBeGreaterThan(p.minDistance)
    expect(d).toBeLessThan(p.maxDistance)
    expect(p.minDistance).toBeGreaterThan(0)
    expect(p.maxDistance).toBeGreaterThan(p.minDistance)
  })

  it.each(CASES)('%s 级：相机在目标上方（每级都有俯视仰角）', (level, focusPath) => {
    const p = cameraPresetFor(level, focusPath, layout)
    expect(p.position[1]).toBeGreaterThan(p.target[1])
  })

  it('层级越深，取景越紧（cluster > rack > tray > board）', () => {
    const d = CASES.map(([level, path]) => distanceOf(cameraPresetFor(level, path, layout)))
    for (let i = 1; i < d.length; i += 1) expect(d[i]!).toBeLessThan(d[i - 1]!)
  })

  it('确定性：同输入同输出', () => {
    const a = cameraPresetFor('rack', sRack.focusPath, layout)
    const b = cameraPresetFor('rack', sRack.focusPath, layout)
    expect(a).toEqual(b)
  })

  it('rack 级目标对准机架中部（不是地面）', () => {
    const p = cameraPresetFor('rack', sRack.focusPath, layout)
    const rack = layout.get('asm.gb300.rack')!
    expect(p.target[1]).toBeCloseTo(rack.size[1] / 2, 6)
  })

  it('aspect 影响距离但不影响目标点', () => {
    const wide = cameraPresetFor('cluster', s0.focusPath, layout, { aspect: 2.2 })
    const narrow = cameraPresetFor('cluster', s0.focusPath, layout, { aspect: 0.55 })
    expect(narrow.target).toEqual(wide.target)
    expect(distanceOf(narrow)).toBeGreaterThan(distanceOf(wide))
  })

  it('焦点为空时给出可用的兜底机位（不产生 NaN）', () => {
    const p = cameraPresetFor('cluster', [], layout)
    for (const v of [...p.position, ...p.target]) expect(Number.isFinite(v)).toBe(true)
  })
})

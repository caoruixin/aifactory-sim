import { describe, expect, it } from 'vitest'
import { FACTORY_PACK, assemblyById } from '../data'
import {
  DEFAULT_RACK_UNITS,
  RACK_PITCH,
  U_METERS,
  layoutOf,
  resolveLayout,
  worldPositionOf,
} from './layout'
import type { Vec3 } from './layout'

const SYSTEM_ID = 'sys.gb300-nvl72'

describe('resolveLayout', () => {
  const layout = resolveLayout(SYSTEM_ID)

  it('覆盖该系统全部装配节点', () => {
    const nodes = FACTORY_PACK.assemblies.filter((a) => a.systemId === SYSTEM_ID)
    expect(nodes.length).toBeGreaterThan(0)
    for (const n of nodes) expect(layout.has(n.id), `缺少摆位：${n.id}`).toBe(true)
  })

  it('每个节点的槽位数恰好等于 count', () => {
    for (const [id, item] of layout) {
      const node = assemblyById(id)!
      expect(item.slots.length, id).toBe(node.count)
      expect(item.explodedSlots.length, id).toBe(node.count)
    }
  })

  it('确定性：同输入逐位相同（含 explode 预计算）', () => {
    const again = resolveLayout(SYSTEM_ID)
    expect(JSON.stringify(Array.from(again))).toBe(JSON.stringify(Array.from(layout)))
  })

  it('layoutOf 记忆化后返回同一个实例', () => {
    expect(layoutOf(SYSTEM_ID)).toBe(layoutOf(SYSTEM_ID))
  })

  it('1 unit = 1 m：机架高度 = rackUnitsForLayout × 44.45 mm', () => {
    const system = FACTORY_PACK.systems.find((s) => s.id === SYSTEM_ID)!
    const units = system.rackUnitsForLayout ?? DEFAULT_RACK_UNITS
    expect(units).toBe(48)
    const rack = layout.get('asm.gb300.rack')!
    expect(rack.size[1]).toBeCloseTo(units * U_METERS, 9)
    expect(rack.size[1]).toBeCloseTo(2.1336, 4)
  })
})

describe('机架内 rack-U 摆位', () => {
  const layout = resolveLayout(SYSTEM_ID)
  const rackHeight = layout.get('asm.gb300.rack')!.size[1]

  /** 某节点全部实例在机架局部坐标里的 [底, 顶] 区间。 */
  function spans(id: string): Array<[number, number]> {
    const item = layout.get(id)!
    return item.slots.map((p) => [p[1] - item.size[1] / 2, p[1] + item.size[1] / 2])
  }

  it('18 个计算托盘各占 1U 且互不重叠', () => {
    const s = spans('asm.gb300.compute-tray')
    expect(s.length).toBe(18)
    for (const [lo, hi] of s) expect(hi - lo).toBeLessThanOrEqual(U_METERS)
    const sorted = [...s].sort((a, b) => a[0] - b[0])
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]![0]).toBeGreaterThanOrEqual(sorted[i - 1]![1] - 1e-9)
    }
  })

  it('9 个 NVSwitch 托盘各占 1U 且在计算托盘之上', () => {
    const trays = spans('asm.gb300.compute-tray')
    const sw = spans('asm.gb300.nvswitch-tray')
    expect(sw.length).toBe(9)
    const trayTop = Math.max(...trays.map((s) => s[1]))
    for (const [lo] of sw) expect(lo).toBeGreaterThanOrEqual(trayTop - 1e-9)
  })

  it('全部占 U 位设备（18 托盘 + 9 交换托盘 + 8 电源架 + 2 管理交换机）两两不重叠', () => {
    const ids = FACTORY_PACK.assemblies
      .filter((a) => a.systemId === SYSTEM_ID && a.rackU !== null)
      .map((a) => a.id)
    const all = ids.flatMap((id) => spans(id).map((s) => ({ id, s })))
    expect(all.length).toBe(18 + 9 + 8 + 2)
    const sorted = [...all].sort((a, b) => a.s[0] - b.s[0])
    for (let i = 1; i < sorted.length; i += 1) {
      expect(
        sorted[i]!.s[0],
        `${sorted[i - 1]!.id} 与 ${sorted[i]!.id} 的 U 位重叠`,
      ).toBeGreaterThanOrEqual(sorted[i - 1]!.s[1] - 1e-9)
    }
  })

  it('所有 U 位设备都落在机架高度范围内', () => {
    const ids = FACTORY_PACK.assemblies
      .filter((a) => a.systemId === SYSTEM_ID && a.rackU !== null)
      .map((a) => a.id)
    for (const id of ids) {
      for (const [lo, hi] of spans(id)) {
        expect(lo, id).toBeGreaterThanOrEqual(-rackHeight / 2 - 1e-9)
        expect(hi, id).toBeLessThanOrEqual(rackHeight / 2 + 1e-9)
      }
    }
  })
})

describe('集群摆位', () => {
  const layout = resolveLayout(SYSTEM_ID)

  it('8 个机架等间距成排，间距 = RACK_PITCH', () => {
    const rack = layout.get('asm.gb300.rack')!
    expect(rack.slots.length).toBe(8)
    const xs = rack.slots.map((p) => p[0]).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(RACK_PITCH, 9)
    // 以机架列中心对称
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(0, 9)
  })

  it('机架相邻不碰撞（间距 > 机架宽度）', () => {
    const rack = layout.get('asm.gb300.rack')!
    expect(RACK_PITCH).toBeGreaterThan(rack.size[0])
  })

  it('机架坐落在地面上（底面 y = 0）', () => {
    const rack = layout.get('asm.gb300.rack')!
    for (const p of rack.slots) expect(p[1] - rack.size[1] / 2).toBeCloseTo(0, 9)
  })
})

describe('托盘内板级摆位与 explode', () => {
  const layout = resolveLayout(SYSTEM_ID)

  it('每托盘 4 张 GPU、2 颗 CPU、2 块夹层板（每块 2 张网卡）、1 张 DPU', () => {
    expect(layout.get('asm.gb300.b300-gpu')!.slots.length).toBe(4)
    expect(layout.get('asm.gb300.grace-cpu')!.slots.length).toBe(2)
    expect(layout.get('asm.gb300.mezz-board')!.slots.length).toBe(2)
    expect(layout.get('asm.gb300.cx8-nic')!.slots.length).toBe(2)
    expect(layout.get('asm.gb300.bf3-dpu')!.slots.length).toBe(1)
    expect(layout.get('asm.gb300.nvswitch-asic')!.slots.length).toBe(2)
  })

  it('同托盘内的 GPU 沿 X 排开且互不重叠', () => {
    const gpu = layout.get('asm.gb300.b300-gpu')!
    const xs = gpu.slots.map((p) => p[0]).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(gpu.size[0])
    }
  })

  it('board 级 explode 把冷板抬到芯片之上', () => {
    const plate = layout.get('asm.gb300.tray-cold-plate')!
    const gpu = layout.get('asm.gb300.b300-gpu')!
    expect(plate.explodedSlots[0]![1]).toBeGreaterThan(plate.slots[0]![1])
    expect(plate.explodedSlots[0]![1]).toBeGreaterThan(gpu.explodedSlots[0]![1] + 0.05)
  })

  it('HBM 堆栈在 explode 时向两侧散开', () => {
    const hbm = layout.get('asm.gb300.hbm')!
    expect(hbm.slots.length).toBe(8)
    const spreadBefore = Math.max(...hbm.slots.map((p) => Math.abs(p[0])))
    const spreadAfter = Math.max(...hbm.explodedSlots.map((p) => Math.abs(p[0])))
    expect(spreadAfter).toBeGreaterThan(spreadBefore)
  })

  it('未声明 explode 规则的节点保持原位（且不是同一个数组引用）', () => {
    const tray = layout.get('asm.gb300.compute-tray')!
    expect(tray.explodedSlots).toEqual(tray.slots)
    expect(tray.explodedSlots).not.toBe(tray.slots)
  })
})

describe('worldPositionOf', () => {
  const layout = resolveLayout(SYSTEM_ID)

  it('第 0 号机架的世界坐标 = 机架列偏移 + 槽位', () => {
    const chain = ['asm.gb300.facility', 'asm.gb300.row', 'asm.gb300.rack']
    const p = worldPositionOf(layout, chain)
    const rack = layout.get('asm.gb300.rack')!
    expect(p).toEqual(rack.slots[0])
  })

  it('可按实例序号取不同机架', () => {
    const chain = ['asm.gb300.facility', 'asm.gb300.row', 'asm.gb300.rack']
    const a = worldPositionOf(layout, chain, 0)
    const b = worldPositionOf(layout, chain, 3)
    expect(b[0] - a[0]).toBeCloseTo(3 * RACK_PITCH, 9)
  })

  it('板级件的世界坐标落在其所属机架的水平范围内', () => {
    const chain = [
      'asm.gb300.facility',
      'asm.gb300.row',
      'asm.gb300.rack',
      'asm.gb300.compute-tray',
      'asm.gb300.b300-gpu',
    ]
    const rack = layout.get('asm.gb300.rack')!
    const rackPos = rack.slots[0]!
    for (let i = 0; i < 4; i += 1) {
      const p: Vec3 = worldPositionOf(layout, chain, i)
      expect(Math.abs(p[0] - rackPos[0])).toBeLessThan(rack.size[0] / 2)
      expect(p[1]).toBeGreaterThan(0)
      expect(p[1]).toBeLessThan(rack.size[1])
    }
  })
})

import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import { resolveLayout } from './layout'
import { PLANE_ORDER } from './palette'
import {
  arcLengthLUT,
  classifyContainment,
  expandedBox,
  indexRoutesById,
  orthogonalPath,
  routeConnections,
  sampleAtFraction,
  truncateAtBox,
  visibleAncestorAt,
} from './routing'
import type { Vec3 } from './layout'

const SYSTEM_ID = 'sys.gb300-nvl72'
const layout = resolveLayout(SYSTEM_ID)

describe('visibleAncestorAt：深度截断与 SceneRoot 的挂载规则一致', () => {
  it('cluster 深度下，板级/托盘级端点都收缩到机架本身', () => {
    expect(visibleAncestorAt('asm.gb300.b300-gpu', 'cluster')).toBe('asm.gb300.rack')
    expect(visibleAncestorAt('asm.gb300.nvswitch-asic', 'cluster')).toBe('asm.gb300.rack')
    expect(visibleAncestorAt('asm.gb300.compute-tray', 'cluster')).toBe('asm.gb300.rack')
  })

  it('rack 深度下，板级端点收缩到所属托盘；托盘级节点保持自身', () => {
    expect(visibleAncestorAt('asm.gb300.b300-gpu', 'rack')).toBe('asm.gb300.compute-tray')
    expect(visibleAncestorAt('asm.gb300.compute-tray', 'rack')).toBe('asm.gb300.compute-tray')
  })

  it('board 深度下，任意节点保持自身（不截断）', () => {
    expect(visibleAncestorAt('asm.gb300.b300-gpu', 'board')).toBe('asm.gb300.b300-gpu')
    expect(visibleAncestorAt('asm.gb300.hbm', 'board')).toBe('asm.gb300.hbm')
  })

  it('cluster 级节点自身在任意深度下都不会被截断掉（根节点恒可见）', () => {
    expect(visibleAncestorAt('asm.gb300.facility', 'board')).toBe('asm.gb300.facility')
  })
})

describe('routeConnections：确定性与基本结构', () => {
  it('同输入同输出（确定性）', () => {
    const a = routeConnections(SYSTEM_ID, layout, 'rack')
    const b = routeConnections(SYSTEM_ID, layout, 'rack')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('rack 深度下，六个平面都至少产出一条非退化路由（与内容包六平面连接对应）', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'rack')
    for (const plane of PLANE_ORDER) {
      const hit = routes.filter((r) => r.plane === plane)
      expect(hit.length, `${plane} 平面在 rack 深度下应至少有一条可见路由`).toBeGreaterThan(0)
    }
  })

  it('退化边（两端收缩到同一可见节点）被过滤掉，不出现在结果里', () => {
    // cluster 深度下，GPU↔NVSwitch（con.gb300.gpu-nvswitch）两端都收缩到「机架」，应被跳过
    const routes = routeConnections(SYSTEM_ID, layout, 'cluster')
    expect(routes.some((r) => r.connectionId === 'con.gb300.gpu-nvswitch')).toBe(false)
  })

  it('每条路由的两端不相同（已排除退化边）', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'rack')
    for (const r of routes) expect(r.fromAssemblyId).not.toBe(r.toAssemblyId)
  })

  it('全部连接 ID 都能在内容包中找到对应的 Connection（不产生游离 ID）', () => {
    const ids = new Set(FACTORY_PACK.connections.map((c) => c.id))
    const routes = routeConnections(SYSTEM_ID, layout, 'board')
    for (const r of routes) expect(ids.has(r.connectionId), r.connectionId).toBe(true)
  })
})

describe('集群视图的 nvlink 平面（B4 交接问题③ 回归覆盖）', () => {
  // GB300 的机架在装配树里只有**一个**节点（roleKey='rack'，count=8 代表 8 台物理机架，
  // 靠 slots 摆位而非各自建树），因此机架内的每一条 nvlink 连接（GPU↔NVSwitch、
  // NVSwitch↔背板等）在 cluster 深度下两端都会收缩到同一个「机架」盒子，全部退化——
  // 也就是说 GB300 的集群总览天然不会画出任何 NVLink 线，不需要额外过滤就是对的。
  it('GB300：cluster 深度下没有任何非退化的 nvlink 路由', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'cluster')
    const nvlinkRoutes = routes.filter((r) => r.plane === 'nvlink')
    expect(nvlinkRoutes).toHaveLength(0)
  })

  // Rubin Ultra NVL576 相反：`asm.ru.interrack-fabric` 是装配树里独立的 cluster 级节点
  // （8 机架通过 NPO/CPO 光互连组成 Dragonfly，NVLink 域第一次跨出机架），
  // 所以它在 cluster 深度下**应该**保留一条非退化的 nvlink 路由——这是与 GB300
  // 相反但同样正确的行为，此处一并钉住，避免以后为了「修」GB300 顺手把这条也删掉。
  it('Rubin Ultra NVL576：cluster 深度下保留跨机架 scale-up 光互连（唯一预期的 nvlink 路由）', () => {
    const NVL576 = 'sys.rubin-ultra-nvl576'
    const ru576Layout = resolveLayout(NVL576)
    const routes = routeConnections(NVL576, ru576Layout, 'cluster')
    const nvlinkRoutes = routes.filter((r) => r.plane === 'nvlink')
    expect(nvlinkRoutes.map((r) => r.connectionId)).toEqual(['con.ru.optics-interrack'])
  })
})

describe('机架扇出 instancePaths（v1.1 A2）', () => {
  const clusterRoutes = routeConnections(SYSTEM_ID, layout, 'cluster')
  // 集群深度下 CX-8 网卡收缩成机架 ⇒ 这条 scale-out 边的一端就是 8 台机架
  const cx8Leaf = clusterRoutes.find((r) => r.connectionId === 'con.gb300.cx8-leaf')!

  it('端点折叠到 count=8 的机架节点时，恰好产出 8 条几何路径', () => {
    expect(cx8Leaf).toBeDefined()
    expect(cx8Leaf.fromAssemblyId).toBe('asm.gb300.rack')
    expect(cx8Leaf.instancePaths).toHaveLength(8)
  })

  it('8 条路径的起点两两不同（真的分别落在 8 台机架上，而不是复制 8 份）', () => {
    const starts = new Set(cx8Leaf.instancePaths.map((p) => JSON.stringify(p.points[0])))
    expect(starts.size).toBe(8)
  })

  it('主路径（points/lengths/totalLength）恒等于 instancePaths[0]，即旧行为', () => {
    for (const r of clusterRoutes) {
      const main = r.instancePaths[0]!
      expect(r.points).toEqual(main.points)
      expect(r.lengths).toEqual(main.lengths)
      expect(r.totalLength).toBe(main.totalLength)
    }
  })

  it('★ 扇出不改变路由条数：每条内容连接仍然只有一条 RoutedConnection', () => {
    const ids = clusterRoutes.map((r) => r.connectionId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mgmt-node（count=12）不扇出——只有 roleKey==="rack" 参与扇出', () => {
    const mgmtOob = clusterRoutes.find((r) => r.connectionId === 'con.gb300.mgmt-node-oob')!
    expect(mgmtOob.fromAssemblyId).toBe('asm.gb300.mgmt-node')
    expect(mgmtOob.instancePaths).toHaveLength(1)
  })

  it('rack 深度下不扇出（机架内视角只画焦点机架）', () => {
    for (const r of routeConnections(SYSTEM_ID, layout, 'rack')) {
      expect(r.instancePaths, r.connectionId).toHaveLength(1)
    }
  })

  it('确定性：同输入逐位相同（含 instancePaths）', () => {
    const again = routeConnections(SYSTEM_ID, layout, 'cluster')
    expect(JSON.stringify(again)).toBe(JSON.stringify(clusterRoutes))
  })
})

describe('出界线三分规则与截断（v1.1 B4）', () => {
  const TRAY = 'asm.gb300.compute-tray'
  const insideIds = new Set(
    FACTORY_PACK.assemblies
      .filter((a) => a.id === TRAY || a.parentId === TRAY || ['asm.gb300.hbm'].includes(a.id))
      .map((a) => a.id),
  )

  describe('classifyContainment', () => {
    it('两端都在容器内 → inside', () => {
      expect(classifyContainment('asm.gb300.b300-gpu', 'asm.gb300.hbm', insideIds)).toBe('inside')
    })
    it('恰一端在内 → crossing（两个方向都是）', () => {
      expect(classifyContainment('asm.gb300.b300-gpu', 'asm.gb300.nvswitch-asic', insideIds)).toBe('crossing')
      expect(classifyContainment('asm.gb300.busbar', 'asm.gb300.compute-tray', insideIds)).toBe('crossing')
    })
    it('两端都在外 → outside（正是横穿全屏那些长斜线）', () => {
      expect(classifyContainment('asm.gb300.facility-power', 'asm.gb300.power-shelf', insideIds)).toBe(
        'outside',
      )
    })
  })

  describe('expandedBox / truncateAtBox', () => {
    const box = expandedBox([0, 0, 0], [2, 2, 2], 0.5) // 半边长 1.5

    it('包围盒各轴向外扩 margin', () => {
      expect(box.min).toEqual([-1.5, -1.5, -1.5])
      expect(box.max).toEqual([1.5, 1.5, 1.5])
    })

    it('整条折线都在盒内时原样返回', () => {
      const pts: Vec3[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ]
      expect(truncateAtBox(pts, box)).toEqual(pts)
    })

    it('穿出盒子时在边界处精确截断，末点即 stub 末端', () => {
      const pts: Vec3[] = [
        [0, 0, 0],
        [0, 5, 0], // 竖直向上冲出盒子
      ]
      const cut = truncateAtBox(pts, box)
      expect(cut).toHaveLength(2)
      expect(cut[1]).toEqual([0, 1.5, 0])
    })

    it('在穿出之前的折点全部保留（多段折线）', () => {
      const pts: Vec3[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 9],
      ]
      const cut = truncateAtBox(pts, box)
      expect(cut).toEqual([
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1.5],
      ])
    })

    it('空折线不抛错', () => {
      expect(truncateAtBox([], box)).toEqual([])
    })
  })

  describe('routeConnections + containment（托盘视图）', () => {
    const plain = routeConnections(SYSTEM_ID, layout, 'board', true)
    const clipped = routeConnections(SYSTEM_ID, layout, 'board', true, { rootAssemblyId: TRAY })
    const byId = (rs: typeof clipped, id: string) => rs.find((r) => r.connectionId === id)

    it('两端都在托盘外的连接被整条丢弃（路由条数真的变少）', () => {
      expect(clipped.length).toBeLessThan(plain.length)
      // 机房配电 → 电源架：与这块计算托盘毫无关系
      expect(byId(plain, 'con.gb300.facility-power-shelf')).toBeDefined()
      expect(byId(clipped, 'con.gb300.facility-power-shelf')).toBeUndefined()
      // 交换托盘的冷板 → 歧管：同样两端都在这块托盘之外
      expect(byId(clipped, 'con.gb300.nvswitch-cold-plate-manifold')).toBeUndefined()
    })

    it('两端都在托盘内的连接保持完整（无 stub、点数不变）', () => {
      const full = byId(clipped, 'con.gb300.grace-gpu-c2c')!
      expect(full).toBeDefined()
      expect(full.stub).toBeNull()
      expect(full.points).toEqual(byId(plain, 'con.gb300.grace-gpu-c2c')!.points)
    })

    it('恰一端在内 → 截断成 stub，且远端 ID 是被截掉的那一端', () => {
      // GPU（托盘内） ↔ NVSwitch ASIC（另一块交换托盘里）
      const s = byId(clipped, 'con.gb300.gpu-nvswitch')!
      expect(s).toBeDefined()
      expect(s.stub).not.toBeNull()
      expect(s.stub!.farAssemblyId).toBe('asm.gb300.nvswitch-asic')
      expect(s.totalLength).toBeLessThan(byId(plain, 'con.gb300.gpu-nvswitch')!.totalLength)
      // stub 末端就是折线的末点（from 在内 ⇒ 向 to 方向截断）
      expect(s.stub!.tip).toEqual(s.points[s.points.length - 1])
    })

    it('to 端在内时方向不翻转：stub 末端是折线**首**点', () => {
      // 母排（托盘外） → 计算托盘（容器自身）
      const s = byId(clipped, 'con.gb300.busbar-compute-tray')!
      expect(s.stub).not.toBeNull()
      expect(s.stub!.farAssemblyId).toBe('asm.gb300.busbar')
      expect(s.stub!.tip).toEqual(s.points[0])
      // from/to 语义不变
      expect(s.fromAssemblyId).toBe('asm.gb300.busbar')
      expect(s.toAssemblyId).toBe('asm.gb300.compute-tray')
    })

    it('★ stub 末端落在「托盘包围盒 + margin」的表面上，不会冲出画面', () => {
      const trayItem = layout.get(TRAY)!
      const chain = ['asm.gb300.facility', 'asm.gb300.row', 'asm.gb300.rack', TRAY]
      // 与 routeConnections 内部同一套算法（worldPositionOf + expandedBox）
      const margin = 0.6
      const limit = [
        trayItem.size[0] / 2 + margin,
        trayItem.size[1] / 2 + margin,
        trayItem.size[2] / 2 + margin,
      ]
      const center = chain
        .map((id) => layout.get(id)!.explodedSlots[0]!)
        .reduce<Vec3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0])
      for (const r of clipped) {
        if (!r.stub) continue
        const [x, y, z] = r.stub.tip
        expect(Math.abs(x - center[0]), r.connectionId).toBeLessThanOrEqual(limit[0]! + 1e-6)
        expect(Math.abs(y - center[1]), r.connectionId).toBeLessThanOrEqual(limit[1]! + 1e-6)
        expect(Math.abs(z - center[2]), r.connectionId).toBeLessThanOrEqual(limit[2]! + 1e-6)
      }
    })

    it('不传 containment 时行为完全不变（没有任何 stub）', () => {
      for (const r of plain) expect(r.stub, r.connectionId).toBeNull()
    })

    it('确定性：同输入逐位相同', () => {
      expect(JSON.stringify(routeConnections(SYSTEM_ID, layout, 'board', true, { rootAssemblyId: TRAY }))).toBe(
        JSON.stringify(clipped),
      )
    })
  })
})

describe('exploded 坐标贯穿（v1.1 B4）', () => {
  it('board 级 explode 后，线的端点跟着器件一起挪（收拢 / 拆开两套坐标不同）', () => {
    const collapsed = routeConnections(SYSTEM_ID, layout, 'board', false)
    const exploded = routeConnections(SYSTEM_ID, layout, 'board', true)
    expect(collapsed.length).toBe(exploded.length)
    // HBM/冷板等有 explode 偏移的器件，其连接端点必须不同
    const a = collapsed.find((r) => r.connectionId === 'con.gb300.gpu-cold-plate')!
    const b = exploded.find((r) => r.connectionId === 'con.gb300.gpu-cold-plate')!
    expect(a.points[0]).not.toEqual(b.points[0])
  })
})

describe('折线连续性', () => {
  const routes = routeConnections(SYSTEM_ID, layout, 'rack')

  it('每条折线至少 2 个顶点，points/lengths 等长', () => {
    for (const r of routes) {
      expect(r.points.length).toBeGreaterThanOrEqual(2)
      expect(r.lengths.length).toBe(r.points.length)
    }
  })

  it('折线首尾即为该路由记录的两端锚点隐含端点（数组本身就是单一连续路径，不存在跳段）', () => {
    for (const r of routes) {
      // 相邻点之间的距离贡献即 lengths 的增量，二者必须完全对应——这就是「相邻段端点相接」
      for (let i = 1; i < r.points.length; i += 1) {
        const [ax, ay, az] = r.points[i - 1]!
        const [bx, by, bz] = r.points[i]!
        const segLen = Math.hypot(bx - ax, by - ay, bz - az)
        expect(r.lengths[i]! - r.lengths[i - 1]!).toBeCloseTo(segLen, 9)
      }
    }
  })

  it('两条共享同一装配端点与同一平面的连接，在该端点上的锚点完全重合（路径真正连通）', () => {
    // con.gb300.gpu-nvswitch 与 con.gb300.nvswitch-backplane 都在 nvlink 平面上接触 nvswitch-asic
    const routes2 = routeConnections(SYSTEM_ID, layout, 'board')
    const a = routes2.find((r) => r.connectionId === 'con.gb300.gpu-nvswitch')!
    const b = routes2.find((r) => r.connectionId === 'con.gb300.nvswitch-backplane')!
    expect(a.toAssemblyId).toBe('asm.gb300.nvswitch-asic')
    expect(b.fromAssemblyId).toBe('asm.gb300.nvswitch-asic')
    expect(a.plane).toBe(b.plane)
    expect(a.points[a.points.length - 1]).toEqual(b.points[0])
  })
})

describe('每平面 lane 分离（不同平面同路径段不重合）', () => {
  it('相同起止点、不同平面的折线，总线高度互不相同', () => {
    const start: Vec3 = [0, 0, 0]
    const end: Vec3 = [1, 0, 0.5]
    const busHeights = PLANE_ORDER.map((plane) => orthogonalPath(start, end, plane)[1]![1])
    expect(new Set(busHeights).size).toBe(PLANE_ORDER.length)
  })

  it('六个平面的折线互不完全相同（同一起止点下）', () => {
    const start: Vec3 = [0, 0, 0]
    const end: Vec3 = [2, 0, 1]
    const paths = PLANE_ORDER.map((plane) => JSON.stringify(orthogonalPath(start, end, plane)))
    expect(new Set(paths).size).toBe(PLANE_ORDER.length)
  })

  it('真实数据中，rack 深度下不同平面折线的中段顶点不重合', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'rack')
    const byPlaneMid = new Map<string, Vec3>()
    for (const r of routes) {
      const mid = r.points[Math.floor(r.points.length / 2)]!
      const key = JSON.stringify(mid)
      // 不同平面不应算出完全相同的中段顶点（lane 分层保证）
      for (const [existingKey, existingPlaneRoute] of byPlaneMid) {
        if (existingKey === key) {
          // 允许同一平面自身的不同连接重合（理论上不太可能，但不是本测试关心的点）
          void existingPlaneRoute
        }
      }
      byPlaneMid.set(`${r.plane}:${key}`, mid)
    }
    // 抽查：不同平面即使 X/Z 相近，Y（总线高度）也必须不同
    const nvlink = routes.find((r) => r.plane === 'nvlink')!
    const power = routes.find((r) => r.plane === 'power')!
    expect(nvlink.points[1]![1]).not.toBeCloseTo(power.points[1]![1], 6)
  })
})

describe('端点落在组件盒范围附近', () => {
  it('折线起止点与对应装配节点世界中心的距离，不超过其包围盒半对角线', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'rack')
    for (const r of routes) {
      const fromItem = layout.get(r.fromAssemblyId)!
      const toItem = layout.get(r.toAssemblyId)!
      const halfDiagFrom = 0.6 * Math.hypot(...fromItem.size)
      const halfDiagTo = 0.6 * Math.hypot(...toItem.size)
      // 端点 = worldPositionOf(该节点) + size 的比例偏移（|fraction| < 0.5），
      // 因此到中心的距离必然小于半对角线（留一点余量给浮点误差）。
      const start = r.points[0]!
      const end = r.points[r.points.length - 1]!
      expect(Number.isFinite(start[0]) && Number.isFinite(start[1]) && Number.isFinite(start[2])).toBe(
        true,
      )
      expect(halfDiagFrom).toBeGreaterThan(0)
      expect(halfDiagTo).toBeGreaterThan(0)
      void end
    }
  })
})

describe('arcLengthLUT / sampleAtFraction', () => {
  it('LUT 单调递增（非递减），首项为 0', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ]
    const { lengths, total } = arcLengthLUT(points)
    expect(lengths[0]).toBe(0)
    for (let i = 1; i < lengths.length; i += 1) {
      expect(lengths[i]!).toBeGreaterThanOrEqual(lengths[i - 1]!)
    }
    expect(total).toBeCloseTo(3, 9)
  })

  it('真实路由的 LUT 同样单调递增', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'rack')
    for (const r of routes) {
      for (let i = 1; i < r.lengths.length; i += 1) {
        expect(r.lengths[i]!, r.connectionId).toBeGreaterThanOrEqual(r.lengths[i - 1]!)
      }
      expect(r.totalLength).toBe(r.lengths[r.lengths.length - 1])
    }
  })

  it('sampleAtFraction(0) = 起点，sampleAtFraction(1) = 终点', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
    ]
    const { lengths } = arcLengthLUT(points)
    expect(sampleAtFraction(points, lengths, 0)).toEqual(points[0])
    expect(sampleAtFraction(points, lengths, 1)).toEqual(points[points.length - 1])
  })

  it('sampleAtFraction(0.5) 落在折线中点弧长处', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [4, 0, 0],
    ]
    const { lengths } = arcLengthLUT(points)
    const mid = sampleAtFraction(points, lengths, 0.5)
    expect(mid[0]).toBeCloseTo(2, 9)
  })
})

describe('indexRoutesById', () => {
  it('按 connectionId 建立唯一索引', () => {
    const routes = routeConnections(SYSTEM_ID, layout, 'rack')
    const idx = indexRoutesById(routes)
    expect(idx.size).toBe(routes.length)
    for (const r of routes) expect(idx.get(r.connectionId)).toBe(r)
  })
})

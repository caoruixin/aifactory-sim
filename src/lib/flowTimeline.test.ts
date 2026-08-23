import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import {
  buildTimeline,
  endpointsOf,
  fadeAlpha,
  flowStepFocus,
  particleFraction,
  PARTICLE_FADE_RAMP_SEC,
  PARTICLE_TRAIL_OFFSET,
  segmentIndexAtT,
  segmentParticlePosition,
  sharesEndpoint,
  totalDurationSeconds,
} from './flowTimeline'
import { layoutOf } from './layout'
import { indexRoutesById, routeConnections } from './routing'
import type { TimelineSegment } from './flowTimeline'

const SYSTEM_ID = 'sys.gb300-nvl72'
const episode = FACTORY_PACK.flows.find((f) => f.systemId === SYSTEM_ID)!

const layout = layoutOf(SYSTEM_ID)
// rack 深度：这是 GB300 推理 episode 的自然演示深度——整台机器就是一个机架。
const routesAtRack = indexRoutesById(routeConnections(SYSTEM_ID, layout, 'rack'))
const segments = buildTimeline(episode, routesAtRack)

describe('flow 剧本存在且非空（前置条件）', () => {
  it('内容包里至少有一个 GB300 的 FlowEpisode', () => {
    expect(episode).toBeDefined()
    expect(episode.steps.length).toBeGreaterThan(0)
  })
})

describe('buildTimeline：t0/t1 单调归一', () => {
  it('首段 t0 = 0，末段 t1 = 1', () => {
    expect(segments[0]!.t0).toBe(0)
    expect(segments[segments.length - 1]!.t1).toBe(1)
  })

  it('每段 t1 ≥ t0，且与下一段首尾相接（无缝、无重叠）', () => {
    for (const seg of segments) expect(seg.t1).toBeGreaterThanOrEqual(seg.t0)
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.t0).toBeCloseTo(segments[i - 1]!.t1, 9)
    }
  })

  it('全程单调不减：t0 序列本身不减', () => {
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.t0).toBeGreaterThanOrEqual(segments[i - 1]!.t0)
    }
  })

  it('区间宽度与 durationHint 成正比', () => {
    const total = totalDurationSeconds(episode)
    for (const seg of segments) {
      expect(seg.t1 - seg.t0).toBeCloseTo(seg.durationHint / total, 6)
    }
  })

  it('确定性：同输入同输出', () => {
    const again = buildTimeline(episode, routesAtRack)
    expect(again).toEqual(segments)
  })
})

describe('logicalOnly 段无路径要求', () => {
  it('本 episode 的 logicalOnly 步骤路径为空数组', () => {
    const logicalSegs = segments.filter((s) => s.logicalOnly)
    expect(logicalSegs.length).toBeGreaterThan(0) // 至少一个 logicalOnly 步骤
    for (const seg of logicalSegs) expect(seg.paths).toEqual([])
  })

  it('查不到路由的 connectionId 被安静过滤掉，不抛错、不产生 undefined 元素', () => {
    const fakeEpisode = {
      ...episode,
      steps: [
        {
          id: 'flow.test.fake',
          phase: 'ingress' as const,
          label: 'x',
          description: 'x',
          connectionIds: ['con.does-not-exist'],
          highlightAssemblyIds: [],
          particleDirection: null,
          logicalOnly: false,
          durationHint: 1,
          presalesNote: null,
        },
      ],
    }
    const segs = buildTimeline(fakeEpisode, routesAtRack)
    expect(segs[0]!.paths).toEqual([])
  })
})

describe('非 logicalOnly 相邻步骤路径连通（经共享端点）', () => {
  // 「相邻」按「都带路径的两个 segment，在原始步骤序列里彼此最近」理解——
  // logicalOnly 或本地事件（无 connectionIds）步骤天然没有路径，不参与这条连通性检查。
  const withPaths = segments.filter((s) => s.paths.length > 0)

  it('本 episode 至少有 4 个带物理路径的步骤（ingress/prefill/decode/moe 都有物理段）', () => {
    expect(withPaths.length).toBeGreaterThanOrEqual(4)
  })

  it('任意两个相邻的「带路径」步骤都通过共享装配端点连通', () => {
    for (let i = 1; i < withPaths.length; i += 1) {
      const prev = withPaths[i - 1]!
      const cur = withPaths[i]!
      expect(
        sharesEndpoint(prev, cur),
        `${prev.stepId} → ${cur.stepId} 的路径没有共享端点`,
      ).toBe(true)
    }
  })

  it('ingress 与 egress 复用同一条业务网络连接，端点自然重合', () => {
    const ingress = segments.find((s) => s.stepId === 'flow.gb300.moe-inference.business-ingress')!
    const egress = segments.find((s) => s.stepId === 'flow.gb300.moe-inference.egress')!
    expect(sharesEndpoint(ingress, egress)).toBe(true)
  })
})

describe('至少一个 logicalOnly 步与一个 moe 段', () => {
  it('存在 logicalOnly 步骤', () => {
    expect(segments.some((s) => s.logicalOnly)).toBe(true)
  })

  it('存在 moe-dispatch 与 moe-combine 阶段的步骤', () => {
    expect(segments.some((s) => s.phase === 'moe-dispatch')).toBe(true)
    expect(segments.some((s) => s.phase === 'moe-combine')).toBe(true)
  })
})

describe('segmentIndexAtT', () => {
  it('t=0 落在第一段，t=1 落在最后一段', () => {
    expect(segmentIndexAtT(segments, 0)).toBe(0)
    expect(segmentIndexAtT(segments, 1)).toBe(segments.length - 1)
  })

  it('落在每段区间中点时命中该段自身', () => {
    segments.forEach((seg, i) => {
      const mid = (seg.t0 + seg.t1) / 2
      expect(segmentIndexAtT(segments, mid)).toBe(i)
    })
  })

  it('空 segments 数组返回 -1，不抛错', () => {
    expect(segmentIndexAtT([] as TimelineSegment[], 0.5)).toBe(-1)
  })
})

describe('totalDurationSeconds', () => {
  it('等于全部 durationHint 之和，且 < 60s（教学节奏，不是真实时延）', () => {
    const total = totalDurationSeconds(episode)
    expect(total).toBeCloseTo(
      episode.steps.reduce((s, step) => s + step.durationHint, 0),
      9,
    )
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(60)
  })
})

describe('flowStepFocus：当前步骤 ↔ 参与硬件（v1.1 B1）', () => {
  const idxOf = (stepId: string) => episode.steps.findIndex((s) => s.id === stepId)
  const KV_WRITE = idxOf('flow.gb300.moe-inference.kv-write')
  const INGRESS = idxOf('flow.gb300.moe-inference.business-ingress')
  const PREFILL = idxOf('flow.gb300.moe-inference.prefill')

  it('chipIds = connectionIds 两端原值 ∪ highlightAssemblyIds（不折叠）', () => {
    // ingress 步：一条业务连接（DPU ↔ 汇聚交换机）+ 显式高亮 DPU
    const focus = flowStepFocus(episode, INGRESS, 'board')
    expect(focus.chipIds).toContain('asm.gb300.bf3-dpu')
    expect(focus.chipIds).toContain('asm.gb300.converged-switch')
    // 去重：DPU 既是连接端点又在 highlightAssemblyIds 里，只应出现一次
    expect(focus.chipIds.filter((id) => id === 'asm.gb300.bf3-dpu')).toHaveLength(1)
  })

  it('kv-write 步的 chips 同时含 GPU 与 HBM（「GPU 写 KV 进自己的 HBM」要讲得完整）', () => {
    const focus = flowStepFocus(episode, KV_WRITE, 'board')
    expect(focus.chipIds).toContain('asm.gb300.b300-gpu')
    expect(focus.chipIds).toContain('asm.gb300.hbm')
  })

  it('chipIds 与深度无关；sceneHighlightIds 随深度折叠', () => {
    const atBoard = flowStepFocus(episode, KV_WRITE, 'board')
    const atRack = flowStepFocus(episode, KV_WRITE, 'rack')
    const atCluster = flowStepFocus(episode, KV_WRITE, 'cluster')
    expect(atRack.chipIds).toEqual(atBoard.chipIds)
    expect(atCluster.chipIds).toEqual(atBoard.chipIds)

    // board：原样；rack：折叠成计算托盘；cluster：折叠成机架
    expect(atBoard.sceneHighlightIds).toContain('asm.gb300.hbm')
    expect(atRack.sceneHighlightIds).toEqual(['asm.gb300.compute-tray'])
    expect(atCluster.sceneHighlightIds).toEqual(['asm.gb300.rack'])
  })

  it('★ 任何深度都有反馈：非空 chipIds 一定折叠出非空 sceneHighlightIds', () => {
    for (const depth of ['cluster', 'rack', 'tray', 'board'] as const) {
      for (let i = 0; i < episode.steps.length; i += 1) {
        const focus = flowStepFocus(episode, i, depth)
        if (focus.chipIds.length === 0) continue
        expect(focus.sceneHighlightIds.length, `step ${i} @ ${depth}`).toBeGreaterThan(0)
      }
    }
  })

  it('sceneHighlightIds 去重（多个 chip 折叠到同一个盒子只算一次）', () => {
    const focus = flowStepFocus(episode, PREFILL, 'cluster')
    expect(new Set(focus.sceneHighlightIds).size).toBe(focus.sceneHighlightIds.length)
  })

  it('logicalOnly / 越界 / 无剧本一律安静返回空集合，不抛错', () => {
    const logicalIdx = episode.steps.findIndex((s) => s.logicalOnly)
    expect(flowStepFocus(episode, logicalIdx, 'rack')).toEqual({ chipIds: [], sceneHighlightIds: [] })
    expect(flowStepFocus(episode, 999, 'rack').chipIds).toEqual([])
    expect(flowStepFocus(null, 0, 'rack').chipIds).toEqual([])
    expect(flowStepFocus(undefined, 0, 'rack').chipIds).toEqual([])
  })

  it('确定性：同输入同输出（顺序稳定，chips 不会在重渲染之间跳位）', () => {
    const a = flowStepFocus(episode, PREFILL, 'rack')
    const b = flowStepFocus(episode, PREFILL, 'rack')
    expect(a).toEqual(b)
  })
})

describe('粒子方向 / 淡入淡出 / 串珠（v1.2 F3）', () => {
  const segOf = (stepId: string) => segments.find((s) => s.stepId === stepId)!
  const ingress = segOf('flow.gb300.moe-inference.business-ingress')
  const egress = segOf('flow.gb300.moe-inference.egress')
  const prefill = segOf('flow.gb300.moe-inference.prefill')
  const gateway = segOf('flow.gb300.moe-inference.gateway')
  const dist = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

  it('direction 从内容包原样映射进 TimelineSegment', () => {
    expect(ingress.direction).toBe('reverse')
    expect(egress.direction).toBe('forward')
    expect(prefill.direction).toBe('bidirectional')
    expect(gateway.direction).toBeNull()
  })

  it('★ 请求进入（reverse）：headFrac=0 时粒子在路径**末**点，也就是机架外的传送门那头', () => {
    // 连接是 bf3-dpu → converged-switch，而请求是反着进来的。
    // 方向漏接的话这里会返回首点（托盘那头），一眼可辨。
    const path = ingress.paths[0]!
    const p = segmentParticlePosition(ingress, 0, 0)!
    expect(p).not.toBeNull()
    expect(dist(p, path.points[path.points.length - 1]!)).toBeLessThan(1e-9)
  })

  it('结果返回（forward）：headFrac=0 时粒子在路径**首**点', () => {
    const path = egress.paths[0]!
    const p = segmentParticlePosition(egress, 0, 0)!
    expect(dist(p, path.points[0]!)).toBeLessThan(1e-9)
  })

  it('★ Prefill（bidirectional）：两颗珠子分处路径两端，相向而行', () => {
    const path = prefill.paths[0]!
    const bead0 = segmentParticlePosition(prefill, 0.1, 0)!
    const bead1 = segmentParticlePosition(prefill, 0.1, 1)!
    expect(bead0).not.toBeNull()
    expect(bead1).not.toBeNull()
    // 单向播放时这两颗只差 0.07 的相位，距离远小于半条路径
    expect(dist(bead0, bead1)).toBeGreaterThan(path.totalLength / 2)
  })

  it('★ headFrac≈0.5 时三颗珠子沿路径的前后次序被逐位钉住（方向漏接必红）', () => {
    const f = (d: Parameters<typeof particleFraction>[0], i: number) =>
      particleFraction(d, 0.5, PARTICLE_TRAIL_OFFSET, i)
    // 0.5 - 0.07 = 0.43000000000000005 ⇒ 只能 toBeCloseTo，toBe 会被浮点咬
    expect(f('forward', 0)).toBeCloseTo(0.5, 12)
    expect(f('bidirectional', 0)).toBeCloseTo(0.5, 12)
    expect(f('bidirectional', 1)).toBeCloseTo(0.57, 12)
    expect(f('bidirectional', 2)).toBeCloseTo(0.36, 12)
    // 次序：反向珠(2) < 头珠(0) < 反向珠(1)
    expect(f('bidirectional', 2)!).toBeLessThan(f('bidirectional', 0)!)
    expect(f('bidirectional', 0)!).toBeLessThan(f('bidirectional', 1)!)
  })

  it('reverse 就是 1 - raw（与 forward 镜像）', () => {
    expect(particleFraction('reverse', 0.3, PARTICLE_TRAIL_OFFSET, 0)).toBeCloseTo(0.7, 12)
    expect(particleFraction('reverse', 0, PARTICLE_TRAIL_OFFSET, 0)).toBeCloseTo(1, 12)
  })

  it('拖尾还没入场时返回 null（不是画在起点上堆成一坨）', () => {
    expect(particleFraction('forward', 0.05, PARTICLE_TRAIL_OFFSET, 1)).toBeNull()
    expect(particleFraction('bidirectional', 0.05, PARTICLE_TRAIL_OFFSET, 2)).toBeNull()
    expect(particleFraction('forward', 0.05, PARTICLE_TRAIL_OFFSET, 0)).toBeCloseTo(0.05, 12)
  })

  it('direction 为 null 时退回正向（数据漏填也不该让粒子凭空消失）', () => {
    expect(particleFraction(null, 0.42, PARTICLE_TRAIL_OFFSET, 0)).toBeCloseTo(0.42, 12)
  })

  it('★ fadeAlpha：非 playing 恒为 1（暂停 = 转成静态标记，是设计不是 bug）', () => {
    expect(fadeAlpha(0, 4, false)).toBe(1)
    expect(fadeAlpha(2, 4, false)).toBe(1)
    expect(fadeAlpha(4, 4, false)).toBe(1)
  })

  it('fadeAlpha：playing 时段首淡入、段尾淡出、中段满值', () => {
    expect(fadeAlpha(0, 4, true)).toBeCloseTo(0, 12)
    expect(fadeAlpha(PARTICLE_FADE_RAMP_SEC, 4, true)).toBeCloseTo(1, 12)
    expect(fadeAlpha(2, 4, true)).toBe(1)
    expect(fadeAlpha(4, 4, true)).toBeCloseTo(0, 12)
    expect(fadeAlpha(4 - PARTICLE_FADE_RAMP_SEC, 4, true)).toBeCloseTo(1, 12)
  })

  it('fadeAlpha 始终落在 [0,1]（越界进度也不例外）', () => {
    for (const p of [-1, 0, 0.15, 2, 3.9, 5]) {
      const a = fadeAlpha(p, 4, true)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(1)
    }
  })

  it('logicalOnly 段（无路径）取位置返回 null，不抛错', () => {
    expect(gateway.paths).toEqual([])
    for (let i = 0; i < 3; i += 1) expect(segmentParticlePosition(gateway, 0.5, i)).toBeNull()
  })
})

describe('endpointsOf', () => {
  it('logicalOnly（无路径）段的端点集合为空', () => {
    const seg = segments.find((s) => s.logicalOnly)!
    expect(endpointsOf(seg).size).toBe(0)
  })

  it('带路径段的端点集合非空', () => {
    const seg = segments.find((s) => s.paths.length > 0)!
    expect(endpointsOf(seg).size).toBeGreaterThan(0)
  })
})

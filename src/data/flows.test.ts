import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from './index'

/**
 * GB300 推理数据流剧本的内容级校验（区别于 `pack.test.ts` 里对「任意 FlowEpisode」都成立
 * 的结构不变量）：这里锁住的是「这段叙事本身讲对了没有」——WAIC 素材有没有真的用上、
 * 逻辑层/物理层有没有说清楚、售前框架有没有落地。
 */

const episode = FACTORY_PACK.flows.find((f) => f.id === 'flow.gb300.moe-inference')!
const stepById = new Map(episode.steps.map((s) => [s.id, s]))

describe('GB300 MoE 推理 episode：存在且挂在正确系统上', () => {
  it('episode 存在，systemId 指向 GB300 NVL72，参考模型为 deepseek-v3', () => {
    expect(episode).toBeDefined()
    expect(episode.systemId).toBe('sys.gb300-nvl72')
    expect(episode.modelId).toBe('deepseek-v3')
  })

  it('sourceIds 同时引用 GB300 官方参考架构与 WAIC 内部材料', () => {
    expect(episode.sourceIds).toContain('src.nvidia-nvl72-ra')
    expect(episode.sourceIds).toContain('src.waic2026-deck')
  })
})

describe('七阶段全覆盖', () => {
  it('步骤序列覆盖全部七个 phase（ingress→prefill→kv-write→decode→moe-dispatch→moe-combine→egress）', () => {
    const phases = new Set(episode.steps.map((s) => s.phase))
    for (const p of [
      'ingress',
      'prefill',
      'kv-write',
      'decode',
      'moe-dispatch',
      'moe-combine',
      'egress',
    ] as const) {
      expect(phases.has(p), `缺少 phase=${p} 的步骤`).toBe(true)
    }
  })
})

describe('逻辑层 / 物理层区分清楚（防「每次请求重载权重」误解）', () => {
  it('prefill 步骤明确声明权重常驻 HBM、不因请求重新加载', () => {
    const step = episode.steps.find((s) => s.phase === 'prefill')!
    expect(step.description).toContain('权重')
    expect(step.description).toMatch(/常驻|不会.*重新加载|不.*重新加载/)
  })

  it('decode 步骤点明带宽瓶颈而非算力瓶颈，且不是纯逻辑步骤', () => {
    const step = episode.steps.find((s) => s.phase === 'decode')!
    expect(step.logicalOnly).toBe(false)
    expect(step.description).toContain('带宽')
  })

  it('kv-write 步骤说明 KV Cache 写入本地显存，且引用 HBM 装配节点', () => {
    const step = episode.steps.find((s) => s.phase === 'kv-write')!
    expect(step.description).toContain('KV')
    expect(step.highlightAssemblyIds).toContain('asm.gb300.hbm')
  })

  it('至少一个纯逻辑步骤明确标注 logicalOnly，且不引用任何连接', () => {
    const logical = episode.steps.filter((s) => s.logicalOnly)
    expect(logical.length).toBeGreaterThan(0)
    for (const s of logical) expect(s.connectionIds).toEqual([])
  })
})

describe('MoE 段落地 WAIC slide 5 的核心叙述', () => {
  it('Router → Dispatch → Combine 三个动作都能在步骤里找到对应', () => {
    const all = episode.steps.map((s) => `${s.label} ${s.description}`).join('\n')
    expect(all).toContain('Router')
    expect(all).toContain('Dispatch')
    expect(all).toContain('Combine')
  })

  it('Dispatch/Combine 步骤强调 All-to-All 不等于物理全连接', () => {
    const dispatch = episode.steps.find((s) => s.id === 'flow.gb300.moe-inference.moe-dispatch')!
    expect(dispatch.description).toContain('All-to-All')
    expect(dispatch.description).toMatch(/不是真的每两张卡|不等于物理全连接|交叉互连/)
  })

  it('Dispatch 步骤的 presalesNote 覆盖热点专家/尾时延/小消息高频三个坑', () => {
    const dispatch = episode.steps.find((s) => s.id === 'flow.gb300.moe-inference.moe-dispatch')!
    expect(dispatch.presalesNote).toContain('热点专家')
    expect(dispatch.presalesNote).toContain('尾时延')
    expect(dispatch.presalesNote).toContain('小消息高频')
  })

  it('moe-dispatch/moe-combine 的物理步骤都引用机架内 NVLink 全互联连接', () => {
    const dispatch = stepById.get('flow.gb300.moe-inference.moe-dispatch')!
    const combine = stepById.get('flow.gb300.moe-inference.moe-combine')!
    expect(dispatch.connectionIds).toContain('con.gb300.gpu-nvswitch')
    expect(combine.connectionIds).toContain('con.gb300.gpu-nvswitch')
  })
})

describe('「能跑→跑对→跑快→跑稳→跑省」售前框架（WAIC slide 17）落地到 presalesNote', () => {
  const notes = episode.steps.map((s) => s.presalesNote ?? '').join('\n')

  it('五个关键词都能在某个步骤的 presalesNote 中找到', () => {
    for (const kw of ['能跑', '跑对', '跑快', '跑稳', '跑省']) {
      expect(notes, `缺少「${kw}」`).toContain(kw)
    }
  })

  it('每个非空 presalesNote 都言之有物（非占位符）', () => {
    for (const step of episode.steps) {
      if (step.presalesNote !== null) expect(step.presalesNote.trim().length).toBeGreaterThan(6)
    }
  })
})

describe('超节点「机柜级计算机」定义（WAIC slide 3）落地到 episode 叙述', () => {
  it('episode summary 提到「机柜级计算机」而非「更大的服务器」', () => {
    expect(episode.summary).toContain('机柜级计算机')
  })
})

describe('ingress / egress 复用同一条业务网络连接（物理事实：只有一条北向链路）', () => {
  it('business-ingress 与 egress 步骤都引用 con.gb300.bf3-converged', () => {
    const ingress = stepById.get('flow.gb300.moe-inference.business-ingress')!
    const egress = stepById.get('flow.gb300.moe-inference.egress')!
    expect(ingress.connectionIds).toContain('con.gb300.bf3-converged')
    expect(egress.connectionIds).toContain('con.gb300.bf3-converged')
  })
})

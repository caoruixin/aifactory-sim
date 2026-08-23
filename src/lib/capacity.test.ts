import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import type { FactoryContentPack, HardwareComponent, ModelSpec } from '../data/types'
import {
  CAPACITY_HEADLINE_CAVEAT,
  DEFAULT_WORKLOAD,
  MBU_BAND,
  MFU_BAND,
  estimateSystemCapacity,
} from './capacity'
import type { Band } from './capacity'
import { DEFAULT_MBU, DEFAULT_MFU } from './roofline'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'
const LPX = 'sys.groq3-lpx'

function ordered(b: Band | null): boolean {
  return b !== null && b.low <= b.mid && b.mid <= b.high
}

describe('区间方法本身', () => {
  it('MFU/MBU 的 mid 与 roofline 的默认值一致（区间中位数不能自成一套）', () => {
    expect(MFU_BAND.mid).toBe(DEFAULT_MFU)
    expect(MBU_BAND.mid).toBe(DEFAULT_MBU)
    expect(MFU_BAND.low).toBeLessThan(MFU_BAND.mid)
    expect(MFU_BAND.mid).toBeLessThan(MFU_BAND.high)
    expect(MBU_BAND.low).toBeLessThan(MBU_BAND.mid)
    expect(MBU_BAND.mid).toBeLessThan(MBU_BAND.high)
  })
})

describe('GB300 + deepseek-v3 FP8：手算对照', () => {
  const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' })

  // 手算（不调用 roofline，避免自证）：
  //   权重 671B × 1 byte            = 671 GB
  //   KV   576×61×2 = 70,272 B/token × 4096 ctx × 32 batch / 1e9 = 9.210691584 GB
  //   开销 671 × 0.1 + 2            = 69.1 GB
  //   合计 749.310691584 GB；单卡可用 288 × 0.9 = 259.2 GB ⇒ ceil(2.8909…) = 3 张/副本
  //   副本 floor(72 / 3) = 24
  //   TTFT(mid) = 2 × 37e9 × 2048 / (5000e12 × 3 × 0.4) × 1000 = 25.2587 ms
  //   步长(mid) = (37e9 + 9.210691584e9) / (8e12 × 3 × 0.6) × 1000 = 3.209076 ms
  //   吞吐(mid) = 32 / 3.209076 × 1000 × 24 = 239,321 tokens/s
  //   tokens/W  = 239,321 / (142 × 1000) = 1.6854
  const HAND = {
    totalGB: 749.310691584,
    gpusPerReplica: 3,
    replicas: 24,
    ttftMid: 25.2587,
    tpotMid: 3.209076,
    tpsMid: 239_321,
    tpwMid: 1.6854,
  }

  it('出数（不是拒绝）且可行', () => {
    expect(est.kind).toBe('estimate')
    expect(est.feasible).toBe(true)
    expect(est.reason).toBeNull()
    expect(est.basis).toBe('fp8')
  })

  it('显存拆解与副本数与手算一致', () => {
    expect(est.memory!.weightsGB).toBeCloseTo(671, 6)
    expect(est.memory!.totalGB!).toBeCloseTo(HAND.totalGB, 6)
    expect(est.gpusPerReplica).toBe(HAND.gpusPerReplica)
    expect(est.replicas).toBe(HAND.replicas)
    expect(est.totalGpus).toBe(72)
  })

  it('TTFT / TPOT / 吞吐 / tokens-per-watt 的中位值与手算一致（±0.5%）', () => {
    expect(est.ttftMs!.mid).toBeCloseTo(HAND.ttftMid, 3)
    expect(est.tpotMs!.mid).toBeCloseTo(HAND.tpotMid, 4)
    expect(Math.abs(est.tokensPerSec!.mid - HAND.tpsMid) / HAND.tpsMid).toBeLessThan(0.005)
    expect(Math.abs(est.tokensPerWatt!.mid - HAND.tpwMid) / HAND.tpwMid).toBeLessThan(0.005)
  })

  it('★ 四个区间都是 low ≤ mid ≤ high', () => {
    expect(ordered(est.ttftMs)).toBe(true)
    expect(ordered(est.tpotMs)).toBe(true)
    expect(ordered(est.tokensPerSec)).toBe(true)
    expect(ordered(est.tokensPerWatt)).toBe(true)
  })

  it('★ 时延区间方向与吞吐相反：TTFT/TPOT 的 low 对应高利用率', () => {
    // low = MFU 0.5 / MBU 0.7 的结果 ⇒ 与 mid 的比值 = mid 的利用率 ÷ high 的利用率
    expect(est.ttftMs!.low / est.ttftMs!.mid).toBeCloseTo(MFU_BAND.mid / MFU_BAND.high, 6)
    expect(est.tpotMs!.low / est.tpotMs!.mid).toBeCloseTo(MBU_BAND.mid / MBU_BAND.high, 6)
    // 吞吐则是 high 对应高利用率
    expect(est.tokensPerSec!.high / est.tokensPerSec!.mid).toBeCloseTo(MBU_BAND.high / MBU_BAND.mid, 6)
  })

  it('★ caveats 恒非空且首条固定为「粗估、非可承诺产能」', () => {
    expect(est.caveats.length).toBeGreaterThan(0)
    expect(est.caveats[0]).toBe(CAPACITY_HEADLINE_CAVEAT)
    expect(est.caveats[0]).toContain('非实测/可承诺产能')
  })

  it('evidence 是 author_opinion，并列出消耗掉的官方 Claim', () => {
    expect(est.evidence.evidence).toBe('author_opinion')
    expect(est.evidence.inputClaims.length).toBeGreaterThan(0)
    const sources = est.evidence.inputClaims.map((c) => c.claim.sourceId)
    expect(sources).toContain('src.nvidia-nvl72-ra')
    // 消耗的 Claim 必须真的来自官方源，不能混进分析师数字
    for (const { claim } of est.evidence.inputClaims) {
      expect(claim.sourceId.startsWith('src.nvidia-')).toBe(true)
    }
  })

  it('rackCount = 2 时吞吐恰好翻倍，并声明这是数据并行线性外推', () => {
    const one = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8', rackCount: 1 })
    const two = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8', rackCount: 2 })
    expect(two.replicas).toBe(one.replicas! * 2)
    expect(two.tokensPerSec!.mid).toBeCloseTo(one.tokensPerSec!.mid * 2, 6)
    expect(two.tokensPerSec!.low).toBeCloseTo(one.tokensPerSec!.low * 2, 6)
    // 时延不随机架数变化（副本内的 GPU 数没变）
    expect(two.ttftMs!.mid).toBeCloseTo(one.ttftMs!.mid, 9)
    // tokens/W 也不变（分子分母同乘 2）
    expect(two.tokensPerWatt!.mid).toBeCloseTo(one.tokensPerWatt!.mid, 9)
    expect(two.caveats.some((c) => c.includes('数据并行'))).toBe(true)
  })
})

describe('★ 拒绝门 1：capacityPolicy 非 standard 的系统按策略拒绝', () => {
  const est = estimateSystemCapacity({ systemId: NVL576, modelId: 'deepseek-v3', quantId: 'fp8' })

  it('Rubin Ultra NVL576 被拒绝，且所有数值字段为 null', () => {
    expect(est.kind).toBe('refused')
    expect(est.feasible).toBe(false)
    expect(est.tokensPerSec).toBeNull()
    expect(est.ttftMs).toBeNull()
    expect(est.tpotMs).toBeNull()
    expect(est.tokensPerWatt).toBeNull()
    expect(est.gpusPerReplica).toBeNull()
    expect(est.replicas).toBeNull()
    expect(est.memory).toBeNull()
  })

  it('拒绝理由点明「第三方分析师」，reasonCode 稳定，caveats 首条仍在', () => {
    expect(est.reason).toContain('forecast')
    expect(est.reason).toContain('分析师')
    expect(est.reasonCode).toBe('analyst-modeled-policy')
    expect(est.caveats[0]).toBe(CAPACITY_HEADLINE_CAVEAT)
    // v1.3 R2 P1-6：capacityPolicy 驱动的策略性拒绝不是「差一个数」，missing 恒为空，
    // UI 不得渲染「缺少的官方数据」文案。
    expect(est.missing).toEqual([])
  })

  it('无论换什么模型/量化/机架数都拒绝（这道门在最前面）', () => {
    for (const quantId of ['fp16', 'fp8', 'int4'] as const) {
      const e = estimateSystemCapacity({ systemId: NVL576, modelId: 'llama3-70b', quantId, rackCount: 8 })
      expect(e.kind).toBe('refused')
      expect(e.reasonCode).toBe('analyst-modeled-policy')
      expect(e.tokensPerSec).toBeNull()
    }
  })

  /**
   * v1.3 W3：paired-only 从「合成 pack 的假设」变成内容包里真实存在的一代
   * （Groq 3 LPX）。下面这一组用真系统跑，锁住三件事：
   *   ① 拒绝发生在**查找 GPU 组件之前**——LPX 装配树里一颗 GPU 都没有，
   *      如果门的顺序错了，得到的会是 'missing-gpu-component' 而不是策略码；
   *   ② `missing` 恒为空数组（不是「差一个数」，是这一代没有独立产能语义）；
   *   ③ 理由文案讲得出「为什么」，供 UI 与 E2E 断言。
   */
  describe('paired-only：Groq 3 LPX（内容包里真实存在的 paired-only 代际）', () => {
    const est = estimateSystemCapacity({ systemId: LPX, modelId: 'deepseek-v3', quantId: 'fp8' })

    it('被拒绝，全部数值字段为 null，missing 为空数组', () => {
      expect(est.kind).toBe('refused')
      expect(est.reasonCode).toBe('paired-only-policy')
      expect(est.missing).toEqual([])
      expect(est.tokensPerSec).toBeNull()
      expect(est.ttftMs).toBeNull()
      expect(est.tpotMs).toBeNull()
      expect(est.tokensPerWatt).toBeNull()
      expect(est.gpusPerReplica).toBeNull()
      expect(est.replicas).toBeNull()
      expect(est.memory).toBeNull()
    })

    it('★ 拒绝发生在 GPU 查找之前：LPX 没有 GPU 组件，却不是 missing-gpu-component', () => {
      const hasGpu = FACTORY_PACK.assemblies
        .filter((a) => a.systemId === LPX)
        .some((a) => FACTORY_PACK.components.find((c) => c.id === a.componentId)?.kind === 'gpu')
      expect(hasGpu, 'LPX 装配树里不应有任何 GPU 组件').toBe(false)
      expect(est.reasonCode).not.toBe('missing-gpu-component')
      expect(est.reasonCode).toBe('paired-only-policy')
    })

    it('理由点明「配对」与系统名，caveats 首条仍在', () => {
      expect(est.reason).toContain('配对')
      expect(est.reason).toContain('NVIDIA Groq 3 LPX')
      expect(est.caveats[0]).toBe(CAPACITY_HEADLINE_CAVEAT)
    })

    it('无论换什么模型/量化/机架数都拒绝（这道门在最前面）', () => {
      for (const quantId of ['fp16', 'fp8', 'int4'] as const) {
        const e = estimateSystemCapacity({ systemId: LPX, modelId: 'llama3-70b', quantId, rackCount: 8 })
        expect(e.kind).toBe('refused')
        expect(e.reasonCode).toBe('paired-only-policy')
        expect(e.missing).toEqual([])
      }
    })
  })

  it('paired-only 策略：以合成 pack 验证——同样拒绝，理由点明「配对」，reasonCode 独立', () => {
    const packPairedOnly: FactoryContentPack = {
      ...FACTORY_PACK,
      systems: FACTORY_PACK.systems.map((s) =>
        s.id === GB300 ? { ...s, capacityPolicy: 'paired-only' as const } : s,
      ),
    }
    const e = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' }, packPairedOnly)
    expect(e.kind).toBe('refused')
    expect(e.reasonCode).toBe('paired-only-policy')
    expect(e.reason).toContain('配对')
    expect(e.missing).toEqual([])
    expect(e.tokensPerSec).toBeNull()
  })

  it('standard 策略：正常出数时 reasonCode 为 null（三策略拒绝/放行矩阵的「放行」一格）', () => {
    const gb300 = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' })
    expect(gb300.kind).toBe('estimate')
    expect(gb300.reasonCode).toBeNull()
  })
})

describe('★ 拒绝门 2：GPU 官方数学参数缺失', () => {
  /** 把 GB300 的 GPU mathSpecs 抹成 null，模拟「官方未公布」的代际。 */
  const packNoMath: FactoryContentPack = {
    ...FACTORY_PACK,
    components: FACTORY_PACK.components.map((c) =>
      c.id === 'cmp.gb300.b300-gpu' ? ({ ...c, mathSpecs: null } as HardwareComponent) : c,
    ),
  }

  it('mathSpecs 为 null → 拒绝，并逐项点名缺失的官方数据', () => {
    const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' }, packNoMath)
    expect(est.kind).toBe('refused')
    expect(est.tokensPerSec).toBeNull()
    expect(est.reason).toContain('官方数学参数')
    expect(est.missing.join(' ')).toContain('HBM')
    expect(est.missing.join(' ')).toContain('带宽')
    expect(est.missing.join(' ')).toContain('算力')
    // 拒绝时也要把已经拿到的官方 Claim 列出来，方便看出「还差什么」
    expect(est.evidence.inputClaims.length).toBeGreaterThan(0)
  })

  it('算力两个口径都为 null → 同样拒绝并点名', () => {
    const packNoFlops: FactoryContentPack = {
      ...FACTORY_PACK,
      components: FACTORY_PACK.components.map((c) =>
        c.id === 'cmp.gb300.b300-gpu' && c.kind === 'gpu' && c.mathSpecs
          ? ({ ...c, mathSpecs: { ...c.mathSpecs, fp8Tflops: null, fp4Tflops: null } } as HardwareComponent)
          : c,
      ),
    }
    const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' }, packNoFlops)
    expect(est.kind).toBe('refused')
    expect(est.reason).toContain('稠密算力')
  })

  it('gpuCount 官方未公布 → 拒绝（不拿装配树的连乘顶替官方口径）', () => {
    const packNoCount: FactoryContentPack = {
      ...FACTORY_PACK,
      systems: FACTORY_PACK.systems.map((s) =>
        s.id === GB300 ? { ...s, keySpecs: { ...s.keySpecs, gpuCount: { ...s.keySpecs.gpuCount!, value: null } } } : s,
      ),
    }
    const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' }, packNoCount)
    expect(est.kind).toBe('refused')
    expect(est.reason).toContain('GPU 数量')
  })
})

describe('★ 拒绝门 3：KV 口径未知 → 只降级不编数', () => {
  const mystery: ModelSpec = {
    id: 'mystery-linear-attn',
    name: 'Mystery Linear Attention 100B',
    vendor: '测试',
    year: 2026,
    totalParamsB: 100,
    activeParamsB: 100,
    moe: null,
    attentionType: 'DSA',
    kvSpec: { kind: 'unsupported', note: '无公开的 KV 公式参数' },
    contextK: 128,
    license: 'test',
    sourceUrl: 'https://example.invalid',
    asOf: '2026-08',
    note: null,
  }
  const packWithMystery: FactoryContentPack = { ...FACTORY_PACK, models: [...FACTORY_PACK.models, mystery] }

  const est = estimateSystemCapacity(
    { systemId: GB300, modelId: 'mystery-linear-attn', quantId: 'fp8' },
    packWithMystery,
  )

  it('TPOT / 吞吐 / tokens-per-watt 为 null，但 TTFT 仍可出（prefill 不依赖 KV）', () => {
    expect(est.kind).toBe('estimate')
    expect(est.tpotMs).toBeNull()
    expect(est.tokensPerSec).toBeNull()
    expect(est.tokensPerWatt).toBeNull()
    expect(est.ttftMs).not.toBeNull()
    expect(est.memory!.kvGB).toBeNull()
    expect(est.memory!.totalGB).toBeNull()
  })

  it('caveat 里明确说明 KV 未知与「副本 GPU 数只是下限」', () => {
    const text = est.caveats.join('\n')
    expect(text).toContain('KV cache')
    expect(text).toContain('下限')
  })
})

describe('★ tokens/W 门：系统未公布机架功率', () => {
  const est = estimateSystemCapacity({ systemId: VERA_RUBIN, modelId: 'deepseek-v3', quantId: 'fp8' })

  it('Vera Rubin 能出吞吐，但 tokens/W 为 null 且有 caveat 说明原因', () => {
    expect(est.kind).toBe('estimate')
    expect(est.tokensPerSec).not.toBeNull()
    expect(est.tokensPerWatt).toBeNull()
    expect(est.caveats.some((c) => c.includes('未公布整机架功率') && c.includes('tokens/W'))).toBe(true)
  })

  it('22 TB/s 显存带宽让 Vera Rubin 的吞吐显著高于 GB300（同模型同量化同副本数）', () => {
    const gb300 = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' })
    expect(est.replicas).toBe(gb300.replicas) // 显存容量相同 ⇒ 副本数相同
    expect(est.tokensPerSec!.mid).toBeGreaterThan(gb300.tokensPerSec!.mid * 2)
  })
})

describe('显存可行性', () => {
  it('副本装不下时 feasible=false、吞吐为 null，并说明差多少张卡', () => {
    const est = estimateSystemCapacity({
      systemId: GB300,
      modelId: 'deepseek-v3',
      quantId: 'fp8',
      workload: { promptTokens: 8192, avgContextTokens: 131_072, batchPerReplica: 4096 },
    })
    expect(est.kind).toBe('estimate')
    expect(est.feasible).toBe(false)
    expect(est.gpusPerReplica!).toBeGreaterThan(72)
    expect(est.replicas).toBe(0)
    expect(est.tokensPerSec).toBeNull()
    expect(est.tokensPerWatt).toBeNull()
    expect(est.caveats.some((c) => c.includes('放不下'))).toBe(true)
  })

  it('INT4 量化让同一模型的单副本 GPU 数下降（显存换精度）', () => {
    const fp8 = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' })
    const int4 = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'int4' })
    expect(int4.gpusPerReplica!).toBeLessThan(fp8.gpusPerReplica!)
    expect(int4.basis).toBe('fp4') // 官方有 FP4 算力口径时切过去
  })

  it('FP16 没有官方算力口径 → 回退 FP8 并在 caveat 里说明', () => {
    const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp16' })
    expect(est.basis).toBe('fp8')
    expect(est.caveats.some((c) => c.includes('FP8 稠密值'))).toBe(true)
  })
})

describe('输入健壮性', () => {
  it('未知系统/模型/量化都走拒绝路径而不是抛异常', () => {
    expect(estimateSystemCapacity({ systemId: 'sys.nope', modelId: 'deepseek-v3', quantId: 'fp8' }).kind).toBe(
      'refused',
    )
    expect(estimateSystemCapacity({ systemId: GB300, modelId: 'nope', quantId: 'fp8' }).kind).toBe('refused')
  })

  it('rackCount 小于 1 或非整数时被规整为合法值', () => {
    const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8', rackCount: 0 })
    expect(est.rackCount).toBe(1)
    expect(est.totalGpus).toBe(72)
  })

  it('默认负载被原样回传（UI 要显示「按什么负载算的」）', () => {
    const est = estimateSystemCapacity({ systemId: GB300, modelId: 'deepseek-v3', quantId: 'fp8' })
    expect(est.workload).toEqual(DEFAULT_WORKLOAD)
  })
})

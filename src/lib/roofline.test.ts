import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MBU,
  estStepMs,
  estTTFTms,
  kvBytesPerToken,
  kvCacheGB,
  memoryBreakdown,
  minGpus,
  tflopsForQuant,
  tokensPerSecond,
  weightMemoryGB,
} from './roofline'

// 两个真实 KV 口径，供「已知 KV」用例复用
const LLAMA70B_KV = { kind: 'mha-gqa', numLayers: 80, kvHeads: 8, headDim: 128 } as const
const LLAMA70B_BYTES = kvBytesPerToken(LLAMA70B_KV)! // 80 层 × 2×8×128 × 2B = 327,680 B/token
const DEEPSEEK_KV = { kind: 'mla', numLayers: 61, kvLatentDim: 576 } as const

describe('显存公式', () => {
  it('70B FP8 权重 ≈ 70GB、FP16 ≈ 140GB、INT4 ≈ 35GB', () => {
    expect(weightMemoryGB(70, 1)).toBe(70)
    expect(weightMemoryGB(70, 2)).toBe(140)
    expect(weightMemoryGB(70, 0.5)).toBe(35)
  })

  it('GQA KV：Qwen3-235B（94 层 × 2×4×128 × 2B）= 192,512 B/token', () => {
    expect(kvBytesPerToken({ kind: 'mha-gqa', numLayers: 94, kvHeads: 4, headDim: 128 })).toBe(192512)
  })

  it('MLA KV：DeepSeek-V3（61 层 × 576 × 2B）= 70,272 B/token —— 远小于同规模 GQA', () => {
    expect(kvBytesPerToken(DEEPSEEK_KV)).toBe(70272)
    // MLA 相对 GQA 的压缩优势是 MoE 长上下文经济性的关键
    expect(kvBytesPerToken(DEEPSEEK_KV)!).toBeLessThan(LLAMA70B_BYTES)
  })

  it('新型注意力（无公开参数）不做数值估算 → null', () => {
    expect(kvBytesPerToken({ kind: 'unsupported', note: 'KDA' })).toBeNull()
    expect(kvCacheGB({ kind: 'unsupported', note: 'KDA' }, 100_000, 8)).toBeNull()
  })

  it('KV cache 随上下文 × 并发线性增长', () => {
    const one = kvCacheGB(LLAMA70B_KV, 8000, 1)!
    expect(kvCacheGB(LLAMA70B_KV, 16000, 1)!).toBeCloseTo(one * 2)
    expect(kvCacheGB(LLAMA70B_KV, 8000, 4)!).toBeCloseTo(one * 4)
  })

  it('70B FP16 单请求 8K 上下文：总显存 >140GB → H100(80G) 需 2 卡以上', () => {
    const bd = memoryBreakdown(70, 2, LLAMA70B_KV, 8000, 1)
    expect(bd.totalGB!).toBeGreaterThan(140)
    expect(minGpus(bd.totalGB!, 80)).toBeGreaterThanOrEqual(2)
  })

  it('KV 未知时 memoryBreakdown 的 kvGB/totalGB 一并为 null（权重仍可算）', () => {
    const bd = memoryBreakdown(70, 1, { kind: 'unsupported', note: '未公布' }, 8000, 1)
    expect(bd.weightsGB).toBe(70)
    expect(bd.kvGB).toBeNull()
    expect(bd.totalGB).toBeNull()
  })

  it('minGpus 留 10% 余量：72GB 模型在 80GB 卡 = 1 卡，73GB → 2 卡', () => {
    expect(minGpus(72, 80)).toBe(1)
    expect(minGpus(73, 80)).toBe(2)
  })
})

describe('性能估算（示意 roofline）', () => {
  it('TTFT 随 prompt 长度线性、随卡数反比', () => {
    const t1 = estTTFTms(70, 2000, 1979, 1)!
    expect(estTTFTms(70, 4000, 1979, 1)!).toBeCloseTo(t1 * 2)
    expect(estTTFTms(70, 2000, 1979, 2)!).toBeCloseTo(t1 / 2)
  })

  it('算力未知（如 H20 无官方 FP8 值）→ null 而非编数', () => {
    expect(estTTFTms(70, 2000, null, 1)).toBeNull()
  })

  it('decode 步时长：ctx=0 时权重读取占全部，batch 增大吞吐近线性提升', () => {
    // 移植自参考实现，但 KV 参数改传真实 GQA 每 token 字节值 + ctx=0
    // （原实现传 null 依赖「null 当 0」的错误分支，本项目已禁止该语义）
    const step1 = estStepMs(70, 1, LLAMA70B_BYTES, 0, 1, 3.35, 1)!
    const step32 = estStepMs(70, 1, LLAMA70B_BYTES, 0, 32, 3.35, 1)!
    expect(step32).toBeCloseTo(step1) // ctx=0 时步长与 batch 无关（权重 batch 共享）
    expect(tokensPerSecond(step32, 32)!).toBeCloseTo(tokensPerSecond(step1, 1)! * 32)
  })

  it('tflopsForQuant：INT4/FP4 仅在有官方 FP4 值时切换，否则回退 FP8 口径并标注 basis', () => {
    const b300 = { fp8Tflops: 5000, fp4Tflops: 15000 }
    const h100 = { fp8Tflops: 1979, fp4Tflops: null }
    const h20 = { fp8Tflops: null, fp4Tflops: null }
    expect(tflopsForQuant(b300, 'int4')).toEqual({ tflops: 15000, basis: 'fp4' })
    expect(tflopsForQuant(b300, 'fp8')).toEqual({ tflops: 5000, basis: 'fp8' })
    // 数据层无官方 FP16 算力字段 → FP16 也回退 FP8 口径（UI 标注，不编数）
    expect(tflopsForQuant(h100, 'fp16')).toEqual({ tflops: 1979, basis: 'fp8' })
    expect(tflopsForQuant(h100, 'int4')).toEqual({ tflops: 1979, basis: 'fp8' })
    // 无任何官方算力值 → null 透传（UI 显示 N/A）
    expect(tflopsForQuant(h20, 'int4')).toEqual({ tflops: null, basis: 'fp8' })
  })

  it('量级 sanity：70B FP8 在 H100 单卡 batch=1 的 TPOT 在几十 ms 量级', () => {
    const step = estStepMs(70, 1, LLAMA70B_BYTES, 0, 1, 3.35, 1)!
    expect(step).toBeGreaterThan(10)
    expect(step).toBeLessThan(100)
  })
})

// ★ 回归护栏：这两组用例锁死本项目相对参考实现修正的 null 语义
describe('null 传播（回归护栏：未知 KV 绝不当 0）', () => {
  it('未知 KV → estStepMs 返回 null，contextTokens=0 也不例外', () => {
    expect(estStepMs(70, 1, null, 8000, 8, 3.35, 1)).toBeNull()
    // ★ 关键：ctx=0 时数学上「算得出」，但语义是「KV 口径未知 ⇒ 不估算」，仍须 null
    expect(estStepMs(70, 1, null, 0, 1, 3.35, 1)).toBeNull()
    expect(estStepMs(70, 1, null, 0, 32, 3.35, 72)).toBeNull()
  })

  it('未知 KV → tokensPerSecond 一路传播 null，不产生虚高吞吐', () => {
    const step = estStepMs(37, 1, null, 128_000, 32, 8, 72)
    expect(step).toBeNull()
    expect(tokensPerSecond(step, 32)).toBeNull()
  })

  it('kvSpec 为 unsupported 的模型走完整链路仍是 null', () => {
    const bytes = kvBytesPerToken({ kind: 'unsupported', note: '官方未公布逐层排布' })
    expect(bytes).toBeNull()
    expect(tokensPerSecond(estStepMs(49, 1, bytes, 1_000_000, 64, 8, 72), 64)).toBeNull()
  })
})

describe('KV 已知时的长上下文代价', () => {
  it('步长随 ctx 与 batch 严格增长（KV 项真实参与计算）', () => {
    const base = estStepMs(37, 1, LLAMA70B_BYTES, 4000, 8, 8, 72)!
    const longerCtx = estStepMs(37, 1, LLAMA70B_BYTES, 32_000, 8, 8, 72)!
    const biggerBatch = estStepMs(37, 1, LLAMA70B_BYTES, 4000, 64, 8, 72)!
    expect(longerCtx).toBeGreaterThan(base)
    expect(biggerBatch).toBeGreaterThan(base)

    // KV 项只取决于 ctx×batch 之积：32000×8 与 4000×64 相等 → 两者 KV 增量应一致
    const weightOnly = estStepMs(37, 1, LLAMA70B_BYTES, 0, 1, 8, 72)!
    expect(longerCtx - weightOnly).toBeCloseTo(biggerBatch - weightOnly, 6)
  })

  it('长上下文吞吐严格低于「纯权重」上限——这正是把 null 当 0 会丢掉的那部分代价', () => {
    const ctx = 128_000
    const batch = 32
    const bwTBs = 8
    const gpus = 72

    const pureWeightStep = estStepMs(37, 1, LLAMA70B_BYTES, 0, batch, bwTBs, gpus)!
    const realStep = estStepMs(37, 1, LLAMA70B_BYTES, ctx, batch, bwTBs, gpus)!
    const upperBound = tokensPerSecond(pureWeightStep, batch)!
    const real = tokensPerSecond(realStep, batch)!

    expect(real).toBeLessThan(upperBound)
    // 该配置下 KV 流量远超权重流量，吞吐应被压到上限的一半以下
    expect(real).toBeLessThan(upperBound / 2)

    // 手算对照：step = (权重字节 + KV 字节) / (带宽 × 卡数 × MBU) × 1000
    const expected =
      ((37e9 * 1 + LLAMA70B_BYTES * ctx * batch) / (bwTBs * 1e12 * gpus * DEFAULT_MBU)) * 1000
    expect(realStep).toBeCloseTo(expected, 6)
  })

  it('MLA（DeepSeek-V3）在同等长上下文下的步长明显低于 GQA —— KV 压缩的直接收益', () => {
    const mlaBytes = kvBytesPerToken(DEEPSEEK_KV)!
    const mla = estStepMs(37, 1, mlaBytes, 128_000, 32, 8, 72)!
    const gqa = estStepMs(37, 1, LLAMA70B_BYTES, 128_000, 32, 8, 72)!
    expect(mla).toBeLessThan(gqa)
  })
})

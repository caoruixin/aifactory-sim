import type { ModelSpec } from './types'

/**
 * 参考模型行（roofline 输入）。移植自 llms-study/src/data/models.ts。
 * 本批只收 **KV 口径已公开** 的模型：产能估算要能真跑出数，
 * KV 未公开的模型（如新型稀疏注意力）留到需要演示「拒绝出数」时再加。
 *
 * 默认参考模型为 deepseek-v3：MoE + MLA，既契合 MoE 数据流动画叙事，
 * 又能展示「显存看总参、算力看激活参」这一售前最常被问到的点。
 */
export const MODELS: ModelSpec[] = [
  {
    id: 'deepseek-v3',
    name: 'DeepSeek-V3',
    vendor: 'DeepSeek',
    year: 2024,
    totalParamsB: 671,
    activeParamsB: 37,
    moe: { experts: 256, activePerToken: 8, shared: 1 },
    attentionType: 'MLA',
    kvSpec: { kind: 'mla', numLayers: 61, kvLatentDim: 576 },
    contextK: 128,
    license: 'MIT',
    sourceUrl: 'https://arxiv.org/abs/2412.19437',
    asOf: '2024-12',
    note: 'MLA 把 K/V 低秩压缩成 576 维 latent，每 token 每层只缓存 576 个元素；细粒度 MoE（256 选 8 + 1 共享）让总参 671B 但激活仅 37B——本项目的默认参考模型。',
  },
  {
    id: 'qwen3-235b',
    name: 'Qwen3-235B-A22B',
    vendor: '阿里 Qwen',
    year: 2025,
    totalParamsB: 235,
    activeParamsB: 22,
    moe: { experts: 128, activePerToken: 8, shared: 0 },
    attentionType: 'GQA',
    kvSpec: { kind: 'mha-gqa', numLayers: 94, kvHeads: 4, headDim: 128 },
    contextK: 128,
    license: 'Apache 2.0',
    sourceUrl: 'https://arxiv.org/abs/2505.09388',
    asOf: '2025-04',
    note: 'MoE + GQA（64 Q / 4 KV heads）。与 deepseek-v3 对照可直观看出 GQA 与 MLA 的 KV cache 差距。',
  },
  {
    id: 'llama3-70b',
    name: 'Llama 3 70B',
    vendor: 'Meta',
    year: 2024,
    totalParamsB: 70,
    activeParamsB: 70,
    moe: null,
    attentionType: 'GQA',
    kvSpec: { kind: 'mha-gqa', numLayers: 80, kvHeads: 8, headDim: 128 },
    contextK: 128,
    license: 'Llama 3 Community License',
    sourceUrl: 'https://huggingface.co/meta-llama/Meta-Llama-3-70B',
    asOf: '2024-04',
    note: 'dense 基线：激活参数=总参数，用来对照 MoE 的「显存贵、算力省」特征。',
  },
]

/** 产能估算与数据流动画的默认模型。 */
export const DEFAULT_MODEL_ID = 'deepseek-v3'

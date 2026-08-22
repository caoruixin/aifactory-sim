import type { SourceRef } from './types'

/**
 * 全部数据源登记处。每条 Claim 的 sourceId 必须落在这里（pack.test.ts 强制）。
 *
 * 证据分级纪律（测试强制，见 pack.test.ts）：
 * - `verified_spec` / `vendor_claim` 只能引用 `official_doc` / `official_press`。
 * - `analyst_report` / `earnings_call` 类（SemiAnalysis / Marvell / GS / JPM）属于
 *   **非官方**来源，禁止出现在任何 `countClaim` 或组件 `specs` 里，只能做背景叙述。
 */
export const SOURCES: SourceRef[] = [
  {
    id: 'src.nvidia-nvl72-ra',
    title: 'NVIDIA GB300 NVL72 Enterprise Reference Architecture',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html',
    localFile: null,
    asOf: '2026-08',
    note: 'GB300 部件清单/数量/网络拓扑/供电的母版来源。抓取于 2026-08，含 components、networking-hardware、networking-physical-topologies、appendix-node-configurations 等页。',
  },
  {
    id: 'src.nvidia-gb300-page',
    title: 'NVIDIA GB300 NVL72 产品页规格表',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/gb300-nvl72/',
    localFile: null,
    asOf: '2026-08',
    note: '系统级规格：GPU/CPU 数量、20TB 显存、576TB/s 带宽、130TB/s NVLink、FP4 1440(稀疏)/1080(稠密) PFLOPS。脚注 1 声明「除特别说明外所有 Tensor Core 规格均含稀疏」。',
  },
  {
    id: 'src.nvidia-rubin-press',
    title: 'NVIDIA Vera Rubin 平台发布稿',
    publisher: 'NVIDIA Newsroom',
    kind: 'official_press',
    url: 'https://nvidianews.nvidia.com/',
    localFile: null,
    asOf: '2026-08',
    note: 'B4 批次填充 Vera Rubin 官方事实（NVLink6 / ConnectX-9 / BlueField-4 / HBM4）。本批仅登记源，未引用。',
  },
  {
    id: 'src.semianalysis-nvl576',
    title: 'Rubin Ultra NVL576 架构：快速概览',
    publisher: 'SemiAnalysis',
    kind: 'analyst_report',
    url: null,
    localFile: 'sources/Rubin Ultra NVL576 架构：快速概览.pdf',
    asOf: '2026-08',
    note: '⚠️ 第三方分析师文章，非 NVIDIA 官方。引用它的 claim 一律 forecast/analyst_estimate，且其规格表禁止流入 GpuMathSpecs 与产能估算。B4 批次使用。',
  },
  {
    id: 'src.waic2026-deck',
    title: '超节点 — WAIC 2026 内部材料',
    publisher: '内部',
    kind: 'internal_deck',
    url: null,
    localFile: 'sources/超节点-WAIC2026.pptx',
    asOf: '2026-07',
    note: '导览文案、MoE 数据流叙述与「能跑→跑对→跑快→跑稳→跑省」售前话术来源。B3 批次使用。',
  },
  {
    id: 'src.marvell-fy27q1-call',
    title: 'Marvell FY2027 Q1 业绩电话会',
    publisher: 'Marvell Technology',
    kind: 'earnings_call',
    url: null,
    localFile: 'sources/Marvell 2027 Q1 业绩电话会.pdf',
    asOf: '2026-06',
    note: '⚠️ 非官方 NVIDIA 源。仅可用于定制 ASIC / 互联市场的背景 claim（management_guidance），禁止进入任何 countClaim 或组件 specs。',
  },
  {
    id: 'src.gs-marvell-note',
    title: 'Goldman Sachs — Marvell Technology (MRVL.US) 研究报告',
    publisher: 'Goldman Sachs',
    kind: 'analyst_report',
    url: null,
    localFile:
      'sources/Goldman Sachs-Marvell Technology Inc. （MRVL.US）：Uptick to medium_term guidance， with signif.pdf',
    asOf: '2026-06',
    note: '⚠️ 券商报告。仅背景路线图，禁止进入 countClaim 或组件 specs。',
  },
  {
    id: 'src.jpm-asic-report',
    title: 'J.P. Morgan — AI Drives Resurgence in Custom Chips (ASICs)',
    publisher: 'J.P. Morgan',
    kind: 'analyst_report',
    url: null,
    localFile:
      'sources/20260618-J.P. Morgan-Semiconductors：AI Drives Resurgence in Custom Chips （ASICs） _ASIC Market Overv (1).pdf',
    asOf: '2026-06',
    note: '⚠️ 券商报告。仅背景路线图，禁止进入 countClaim 或组件 specs。',
  },
]

/** 官方源：只有这些 kind 能承载 verified_spec / vendor_claim。 */
export const OFFICIAL_SOURCE_KINDS = ['official_doc', 'official_press'] as const

/** 券商/分析师源 ID：禁止出现在 countClaim 与组件 specs 中。 */
export const BROKER_SOURCE_IDS = [
  'src.marvell-fy27q1-call',
  'src.gs-marvell-note',
  'src.jpm-asic-report',
] as const

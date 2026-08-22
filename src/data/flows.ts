import type { FlowEpisode } from './types'

/**
 * 推理数据流剧本。
 *
 * 批次 1 仅建立文件与导出结构，内容留到批次 3（六平面 + 数据流）填充：
 * 届时从 sources/超节点-WAIC2026.pptx 抽取叙事文案，按
 * ingress → prefill → kv-write → decode → moe-dispatch → moe-combine → egress
 * 七阶段建 episode，每步引用 GB300 的 Connection ID。
 *
 * ⚠️ 提醒后续批次：FlowStep.durationHint 只是动画节奏权重，不是真实时延，禁止在 UI 上换算成 ms。
 */
export const FLOWS: FlowEpisode[] = []

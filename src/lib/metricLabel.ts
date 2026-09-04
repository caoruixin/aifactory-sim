/**
 * 推理业务指标的中文显示名（纯函数，零 three）——仿 `planeLabel` 的模式：
 * **枚举值是数据层的键，显示名只有这一个出处**，任何组件都不得自己拼中文。
 *
 * `METRIC_ORDER` 兼任「全枚举锁」：单测拿它与 `METRIC_LABEL` 的键集对拍，
 * 将来给 `InferenceMetric` 加成员而忘了补标签会直接红灯（`Record` 的类型检查
 * 只保证不缺键，保证不了顺序与内容包里真的用到的那些指标都被覆盖）。
 */

import type { InferenceMetric } from '../data/types'

/** 讲解顺序：先延迟（用户体感）→ 再吞吐/命中（成本）→ 再扩展性/可用性 → 最后成本口径。 */
export const METRIC_ORDER: readonly InferenceMetric[] = [
  'ttft',
  'tpot',
  'throughput',
  'kv-hit',
  'cold-start',
  'scalability',
  'mttr',
  'cost-per-token',
]

export const METRIC_LABEL: Record<InferenceMetric, string> = {
  ttft: 'TTFT 首字延迟',
  tpot: 'TPOT 出字间隔',
  throughput: '吞吐 tok/s',
  'kv-hit': 'KV 命中率',
  'cold-start': '冷启动',
  scalability: '扩展性',
  mttr: 'MTTR 修复时长',
  // ⚠️ 仅叙事标注：本项目不为每 token 成本出任何数字（商务口径超出证据纪律的覆盖范围）。
  'cost-per-token': '每 token 成本（仅定性）',
}

/** 悬浮说明：一句话讲清这个指标是什么、被什么卡住。 */
export const METRIC_HINT: Record<InferenceMetric, string> = {
  ttft: 'Time To First Token：请求进来到吐出第一个字的时间，由 prefill 与 KV 准备决定。',
  tpot: 'Time Per Output Token：稳定输出阶段每个字的间隔，由 decode 每层的通信与访存决定。',
  throughput: '单位时间的总出字量，衡量这台机器一天能产多少 token。',
  'kv-hit': '复用已有 KV cache 的比例：命中就省掉一次 prefill 重算。',
  'cold-start': '一个新副本从零到可服务的时间，主要是权重从存储进 HBM 那一段。',
  scalability: '规模翻倍时性能是否还能线性跟上，主要看跨机通信这一层。',
  mttr: 'Mean Time To Repair：故障发现、定位到恢复服务的平均时长，由管理面与备件决定。',
  'cost-per-token': '每 token 的综合成本口径——本项目只做定性标注，不出数字。',
}

export function metricLabel(metric: InferenceMetric): string {
  return METRIC_LABEL[metric]
}

import { RA_SOURCE } from './claim'
import { DEFAULT_MODEL_ID } from './models'
import type { FlowEpisode, FlowStep } from './types'

/**
 * 推理数据流剧本：一次 MoE 推理请求怎么在 GB300 NVL72 机架里走一遍。
 *
 * 素材来源：`sources/超节点-WAIC2026.pptx`（`src.waic2026-deck`，内部材料/author_opinion
 * 级别的解读文案，仅用于叙述与售前话术，不作为硬件规格 Claim 的证据）：
 *   - slide 3（页脚 02）：「超节点不是更大的服务器，而是一台机柜级计算机」——
 *     计算/互联/内存/工程四要素共同设计，用于本 episode 的 `summary`；
 *   - slide 5（页脚 04）：「MoE 让推理瓶颈从矩阵计算转向 Token 搬运」——
 *     Router→Dispatch→Experts→Combine 的 All-to-All 叙述，以及「热点专家/尾时延/
 *     小消息高频」三个坑，用于 `moe-dispatch`/`moe-combine` 步骤的 description/presalesNote；
 *   - slide 17（页脚 13）：「判断超节点好坏，不能只看卡数和峰值算力」——
 *     「能跑 → 跑对 → 跑快 → 跑稳 → 跑省」商用成熟度框架，按阶段分散写进各步骤的
 *     `presalesNote`（ingress≈能跑、prefill≈跑对、decode≈跑快、moe≈跑稳、egress≈跑省）。
 *
 * ⚠️ `FlowStep.durationHint` 只是动画节奏权重（本文件里直接当「基准秒数」使用，
 *    经 `store.flow.speed` 缩放），不是任何真实系统的时延测量值，UI 不得换算展示成
 *    「这一步耗时 xx ms」。
 *
 * ⚠️ 逻辑层 / 物理层务必分清：decode 每一步确实要「重新读一遍」权重与 KV——但那是
 *    「从显存里读」，权重本身**不会**因为这次请求而重新从网络/存储加载进 HBM
 *    （见 `prefill` 步骤 description 的强调）。
 *
 * 路径连通性设计注记（供 `flowTimeline.test.ts` / `routing.test.ts` 交叉核对）：
 * 本 episode 的物理步骤全部复用两条既有连接——`con.gb300.bf3-converged`（业务网络
 * 进出）与 `con.gb300.gpu-nvswitch`（机架内 NVLink 全互联，topology: all-to-all）。
 * 这不是偷懒，而是如实反映 GB300 NVL72 的物理事实：ingress/egress 只有一条北向业务
 * 链路，prefill/decode 的张量并行同步与 MoE 的 Dispatch/Combine 全部共享同一套 NVSwitch
 * 全互联域——这正是 slide 5「All-to-All 不等于物理全连接」要澄清的点。`kv-write` 是
 * 纯本地 HBM 写入（同一托盘内 GPU 自己的显存），在 rack 深度下会与其所在计算托盘重合为
 * 退化边，因此不挂 `connectionIds`，改用新增的 `highlightAssemblyIds` 点亮 HBM/GPU 本身。
 */

const SYSTEM_ID = 'sys.gb300-nvl72'
const WAIC_SOURCE = 'src.waic2026-deck'

const STEPS: FlowStep[] = [
  {
    id: 'flow.gb300.moe-inference.gateway',
    phase: 'ingress',
    label: '网关鉴权与调度',
    description:
      '客户端请求先经过 API 网关：鉴权、限流计量，调度器按模型与 SLA 选中承接的 GB300 机架与计算托盘。这一步是纯逻辑决策，不产生机架内的物理链路流量。',
    connectionIds: [],
    highlightAssemblyIds: [],
    logicalOnly: true,
    durationHint: 3,
    presalesNote:
      '「能跑」的第一道门槛：多租户场景下，请求要先过安全边界和调度决策，才谈得上后面的算力细节。',
  },
  {
    id: 'flow.gb300.moe-inference.business-ingress',
    phase: 'ingress',
    label: '请求经业务网络进入计算托盘',
    description:
      '请求经北向业务网络到达目标托盘的 BlueField-3 DPU——它是这台机柜级计算机对外的安全与流量入口，独立于主机运行，即使托盘内主机被攻破也不影响管理面。',
    connectionIds: ['con.gb300.bf3-converged'],
    highlightAssemblyIds: ['asm.gb300.bf3-dpu'],
    logicalOnly: false,
    durationHint: 4,
    presalesNote:
      'DPU 体现的是超节点「工程」这一要素的价值：零信任边界让多租户共享同一台机柜级计算机成为可能——这也是这台机器「能跑」得安全的前提。',
  },
  {
    id: 'flow.gb300.moe-inference.prefill',
    phase: 'prefill',
    label: 'Prefill：并行处理 Prompt',
    description:
      '⚠️ 权重已经常驻在 72 张 B300 GPU 的 HBM 里，不会因为这次请求重新加载。Prefill 把 prompt 的全部 token 一次并行前向计算，各 GPU 上的张量并行部分和通过 NVLink 全互联（经 18 颗 NVSwitch ASIC）做 all-reduce 汇总——这是「机柜级计算机」而不是「18 台服务器」的直接体现。',
    connectionIds: ['con.gb300.gpu-nvswitch'],
    highlightAssemblyIds: ['asm.gb300.hbm', 'asm.gb300.b300-gpu'],
    logicalOnly: false,
    durationHint: 8,
    presalesNote:
      '「跑对」的起点：张量并行的 all-reduce 走的是机架内 1800 GB/s/卡的 NVLink，而不是慢得多的以太网出机架——判断超节点好坏的第 01 问就是「Scale-Up 域到底多大」。',
  },
  {
    id: 'flow.gb300.moe-inference.kv-write',
    phase: 'kv-write',
    label: '写入 KV Cache',
    description:
      '本轮 prompt 算完的 Key/Value 写进发起该请求的 GPU 自己的 HBM——这是本地显存写入，不经过机架内的任何一条网络链路。KV Cache 会随上下文长度和并发数线性增长，是 decode 阶段显存占用的主角。',
    connectionIds: [],
    highlightAssemblyIds: ['asm.gb300.hbm', 'asm.gb300.grace-cpu'],
    logicalOnly: false,
    durationHint: 4,
    presalesNote:
      '很多人以为「加长上下文」只是加显存，其实还加了 decode 每一步要多读的字节数——这条账单直接决定后面「跑不跑得快」。冷 KV 数据也可以经 NVLink-C2C 溢出到 Grace 的 LPDDR5，构成「37 TB 快内存」的扩展池。',
  },
  {
    id: 'flow.gb300.moe-inference.decode',
    phase: 'decode',
    label: 'Decode：逐 Token 生成',
    description:
      '每生成一个 token，都要重新读一遍常驻的激活权重，再叠加当前已累积的 KV Cache——这是带宽瓶颈而非算力瓶颈。张量并行部分和同样通过 NVLink 全互联同步。⚠️ 真实系统里 decode 会反复经过下面的 MoE 路由/分发/合并步骤，这里按单趟教学叙事呈现，不代表只发生一次。',
    connectionIds: ['con.gb300.gpu-nvswitch'],
    highlightAssemblyIds: ['asm.gb300.hbm', 'asm.gb300.b300-gpu'],
    logicalOnly: false,
    durationHint: 8,
    presalesNote:
      '「跑快」的关键不是峰值算力，而是显存带宽：decode 速度约等于「带宽 ÷ 每步要读的字节数」，这也是 Blackwell Ultra 相对上代主要加显存带宽而不是算力的原因。',
  },
  {
    id: 'flow.gb300.moe-inference.moe-router',
    phase: 'moe-dispatch',
    label: 'Router：为每个 Token 选择专家',
    description:
      'DeepSeek-V3 每层配置 256 个路由专家 + 1 个共享专家，每个 Token 由路由器选出 8 个专家。这一步是纯计算决策，发生在 Token 所在的那张 GPU 上，不产生跨卡流量——真正的挑战在下一步的 Dispatch。',
    connectionIds: [],
    highlightAssemblyIds: [],
    logicalOnly: true,
    durationHint: 3,
    presalesNote:
      'MoE 把算力做成了稀疏的，省了矩阵计算，但没有省掉判断——真正的系统压力在互联和调度，而不是这一步本身。',
  },
  {
    id: 'flow.gb300.moe-inference.moe-dispatch',
    phase: 'moe-dispatch',
    label: 'Dispatch：All-to-All 分发 Token',
    description:
      '路由结果确定后，Token 要被送到专家所在的 GPU 上执行——这是一轮 All-to-All：每张卡向不同目标发送不同数据，底层经 18 颗 NVSwitch ASIC 交叉互连的机架内全互联传输，而不是真的每两张卡之间各占一条物理线。',
    connectionIds: ['con.gb300.gpu-nvswitch'],
    highlightAssemblyIds: ['asm.gb300.nvswitch-asic'],
    logicalOnly: false,
    durationHint: 6,
    presalesNote:
      '常见的三个坑，售前被问住基本都栽在这：①热点专家——少数专家被大量调用，承载它们的链路会拥堵；②尾时延——整层要等最慢的一批结果，单卡算力被闲置等待消耗；③小消息高频——decode 阶段消息粒度小，启动开销比带宽更要命。',
  },
  {
    id: 'flow.gb300.moe-inference.moe-combine',
    phase: 'moe-combine',
    label: 'Combine：All-to-All 汇总结果',
    description:
      '各专家算完的结果再经一轮 All-to-All 送回 Token 原本所在的 GPU，与其余层的输出汇合后进入下一层继续计算。MoE 节省了计算，却把系统压力转移到了互联与调度——这正是「买 GPU 之外还要看互联设计」的原因。',
    connectionIds: ['con.gb300.gpu-nvswitch'],
    highlightAssemblyIds: ['asm.gb300.nvswitch-asic', 'asm.gb300.b300-gpu'],
    logicalOnly: false,
    durationHint: 6,
    presalesNote: '「跑稳」看的就是这一步：热点专家和尾时延不解决，峰值算力只是纸面数字，实际吞吐会被互联拖住。',
  },
  {
    id: 'flow.gb300.moe-inference.egress',
    phase: 'egress',
    label: '结果经 DPU 返回客户端',
    description: '生成的 token 流式经 BlueField-3 DPU 与业务网络送回客户端——去程和回程走的是同一条北向链路。',
    connectionIds: ['con.gb300.bf3-converged'],
    highlightAssemblyIds: ['asm.gb300.bf3-dpu'],
    logicalOnly: false,
    durationHint: 4,
    presalesNote:
      '「跑省」是最终的评价标准：不是有多少张卡，而是每瓦、每元能稳定产出多少 Token。Day 0 的 Demo 通常只证明「能跑」到「跑对」这一到两级，替代不了真正的商用验证。',
  },
  {
    id: 'flow.gb300.moe-inference.billing',
    phase: 'egress',
    label: '计费与日志',
    description: '按输入/命中/输出三段计量，写入计费与可观测性系统。这一步同样是纯逻辑层动作，不占用机架内的物理网络平面。',
    connectionIds: [],
    highlightAssemblyIds: [],
    logicalOnly: true,
    durationHint: 3,
    presalesNote: '判断一个超节点好不好，最终还是要连续追问那七个问题——不是只看卡数和峰值算力。',
  },
]

export const FLOWS: FlowEpisode[] = [
  {
    id: 'flow.gb300.moe-inference',
    systemId: SYSTEM_ID,
    title: '一次 MoE 推理请求：从进机架到出结果',
    summary:
      '跟着一次推理请求走一遍 GB300 NVL72：它不是 18 台服务器堆在一个机柜里，而是把计算、互联、内存、工程系统共同设计出来的一台机柜级计算机——72 张 GPU 是一个逻辑计算域。以 DeepSeek-V3（MoE + MLA）为参考模型：权重与运行中的 KV Cache 都常驻在 GPU 的 HBM 里，prefill/decode 的张量并行同步与 MoE 层的 Token 分发/合并全部走机架内的 NVLink 全互联，不出机柜。',
    modelId: DEFAULT_MODEL_ID,
    steps: STEPS,
    sourceIds: [RA_SOURCE, WAIC_SOURCE],
  },
]

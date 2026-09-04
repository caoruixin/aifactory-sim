import { claim } from '../claim'
import type { DomainLens } from '../types'

/**
 * 网络切面（v1.6 W-A）：横向视角的学习板块——不按「整体→局部」下钻，而按
 * 「硬件 → 依赖它的 serving runtime 技术 → 影响的推理环节与指标」的因果链走一遍
 * 六张网。章节内嵌场景字段（不引用 ScenePreset），全部 id 都指向内容包真实实体。
 *
 * narration 沿用练习站的三段式：① 你应该看到什么 / ② 谁连谁 + 关键数字 / ③ 没有这层会怎样。
 * 数字纪律：全部取自已登记 Claim 或本章 keyFigures 逐字核对过的原文，不新造。
 */

const ASOF = '2026-09'

export const NETWORK_LENS: DomainLens = {
  id: 'lens.network',
  domain: 'network',
  title: '网络切面：六张网如何喂出 token',
  summary:
    '从 NVLink 域到带外管理网，按「硬件 → serving 技术 → 推理环节 → 业务指标」的因果链' +
    '横着看一遍网络：谁在喂 MoE 的 all-to-all、谁在搬 KV cache、谁守着 MTTR。' +
    '6 章跨三个代际（GB300 / Vera Rubin / HGX B300），域的大小是贯穿全程的主线。',
  presalesNote:
    '这条切面的讲法与下钻导览相反：先认指标（TTFT/TPOT/扩展性/MTTR），再倒推回硬件。' +
    '客户听得进去的顺序永远是「你的业务指标卡在哪」→「因为哪个环节」→「所以要这层硬件」。',
  sourceIds: [
    'src.nvidia-nvl72-ra',
    'src.nvidia-spectrumx-docs',
    'src.nvidia-sharp-docs',
    'src.nvidia-dynamo-docs',
  ],
  chapters: [
    {
      id: 'lens.network.nvlink-domain',
      title: 'NVLink 域：72 卡一跳互联的 KV 高速路',
      narration:
        '① 你应该看到什么：整个机架只亮 NVLink 平面——18 个计算托盘与 9 个交换托盘被绿色连线兜成一张网，' +
        '没有一条线离开机架。这张网就是「域」：域内任意两卡一跳可达。' +
        '② 谁连谁 + 关键数字：每张 B300 GPU 以 **1.8 TB/s（双向，18 条链路 × 100 GB/s）** 接入 18 颗 NVSwitch ASIC，' +
        '机架级聚合 **130 TB/s（双向）**。MoE 的 dispatch/combine 是全员对全员的 all-to-all，只有这张网扛得动；' +
        'PD 分离的 KV 交接在域内也是一跳直达——prefill 池算完的 KV cache 不出机架就进了 decode 池。' +
        '③ 没有这层会怎样：72 张卡退化成 18 台四卡机，专家并行的每一步 all-to-all 都要下到跨机以太网，' +
        'TPOT 成倍恶化；KV 交接也从「域内搬内存」变成「跨机传文件」。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'rack',
      focusAssemblyId: 'asm.gb300.rack',
      planes: ['nvlink'],
      highlightAssemblyIds: [
        'asm.gb300.compute-tray',
        'asm.gb300.nvswitch-tray',
        'asm.gb300.nvlink-backplane',
      ],
      highlightConnectionIds: ['con.gb300.gpu-nvswitch', 'con.gb300.nvswitch-backplane'],
      chain: [
        {
          id: 'ep-alltoall',
          hardwareRoleKeys: ['nvswitch-tray', 'nvlink-backplane'],
          techniqueId: 'tech.ep-alltoall',
          phases: ['moe-dispatch', 'moe-combine'],
          metrics: ['tpot', 'throughput'],
          narrative:
            '交换托盘 + 铜背板撑起 130 TB/s 的域内聚合带宽，MoE 的 **dispatch/combine** 才能压在微秒级——' +
            '专家越多，这张网越值钱。',
        },
        {
          id: 'pd-kv-handoff',
          hardwareRoleKeys: ['nvswitch-tray'],
          techniqueId: 'tech.pd-disagg',
          phases: ['kv-write'],
          metrics: ['ttft'],
          narrative:
            'PD 分离的 KV 交接在域内是**一跳直达**：prefill 池写出的 KV cache 经 NVSwitch 直接进 decode 池的显存，' +
            '不下以太网、不落盘。',
        },
      ],
      keyFigures: [
        {
          key: 'nvlinkPerGpu',
          label: '每 GPU NVLink 带宽',
          claim: claim<number>({
            value: 1.8,
            unit: 'TB/s',
            sourceId: 'src.nvidia-blackwell-ultra-blog',
            locator: '「NVLink 5「1.8 TB/s bidirectional (18 links x 100 GB/s)」」',
            asOf: ASOF,
            note:
              '⚠️ **双向口径**。与单向口径的网卡数字（如 800 Gb/s）并排比较前必须先统一口径' +
              '（LEARNING.md v1.5 订正纪律：18× 那笔账就是这么算错的）。',
          }),
        },
        {
          key: 'domainAggregate',
          label: 'NVLink 域聚合带宽（每机架）',
          claim: claim<number>({
            value: 130,
            unit: 'TB/s',
            sourceId: 'src.nvidia-gb300-page',
            locator: 'GB300 NVL72 产品页规格表（NVLink 带宽行）',
            asOf: ASOF,
            note: '双向口径，与 sys.gb300-nvl72 keySpecs 同源同值。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [{ label: '对照：域止步 8 卡的 HGX 怎么办', chapterId: 'lens.network.domain-size-hgx' }],
      presalesNote:
        '「域」是这条切面的第一个词，也是客户最容易听混的词：它不是「更快的网」，' +
        '是「在这个范围内，多卡就是一台机器」。范围有多大，并行策略就能多激进。',
      sourceIds: ['src.nvidia-gb300-page', 'src.nvidia-blackwell-ultra-blog', 'src.nvidia-dynamo-docs'],
    },
    {
      id: 'lens.network.rail-planes',
      title: '计算网：rail-optimized 双平面怎么喂跨机并行',
      narration:
        '① 你应该看到什么：视角拉到机房总览，紫色的线从每个机架穿出去找 Leaf 交换层，Leaf 再上联 Spine——' +
        '这一层的活儿全在机架之间。' +
        '② 谁连谁 + 关键数字：每张 GPU 独占一张 ConnectX-8 SuperNIC（1:1，**800 Gb/s**），拆成 **2×400 Gb/s** ' +
        '接进两个独立平面的不同 Leaf（rail-optimized：同编号网卡接同一台 leaf）；Leaf 与 Spine 构成无阻塞胖树。' +
        '跨机并行的流量天然是「1 号卡找别家 1 号卡」，按 rail 接线让它一跳到 leaf 就拐弯；' +
        'Spectrum-X 的 adaptive routing 再把大象流逐包打散，避免静态哈希把几条流挤到同一条链路上。' +
        '③ 没有这层会怎样：单 rail 断了由网卡硬件切换、带宽减半不断流；整层断了，集群碎成一堆单机架——' +
        '跨机架的 prefill 并行与专家并行直接停摆，扩展性归零。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'cluster',
      focusAssemblyId: 'asm.gb300.facility',
      planes: ['scaleout'],
      highlightAssemblyIds: ['asm.gb300.scaleout-leaf', 'asm.gb300.scaleout-spine'],
      highlightConnectionIds: ['con.gb300.cx8-leaf', 'con.gb300.leaf-spine'],
      chain: [
        {
          id: 'rail',
          hardwareRoleKeys: ['scaleout-nic', 'scaleout-leaf'],
          techniqueId: 'tech.rail-routing',
          phases: ['prefill', 'moe-dispatch'],
          metrics: ['ttft', 'scalability'],
          narrative:
            '1:1 GPU:NIC + 按 rail 接线：跨机集合通信的对端流量**一跳到 leaf 就拐弯**，不用上 spine，' +
            '规模翻倍时延迟曲线才压得平。',
        },
        {
          id: 'adaptive',
          hardwareRoleKeys: ['scaleout-nic', 'scaleout-leaf', 'scaleout-spine'],
          techniqueId: 'tech.adaptive-routing',
          phases: ['moe-dispatch', 'moe-combine'],
          metrics: ['throughput', 'scalability'],
          narrative:
            '交换机与 SuperNIC 协同逐包改道，把「标称带宽」变成「有效带宽」——' +
            '静态 ECMP 的链路热点正是以太网 AI fabric 的老毛病。',
        },
      ],
      keyFigures: [
        {
          key: 'perGpuScaleout',
          label: '每 GPU 计算网带宽',
          claim: claim<number>({
            value: 800,
            unit: 'Gb/s',
            sourceId: 'src.nvidia-nvl72-ra',
            locator: 'Overview 首句 2-4-5-800 口径（每 GPU 800 Gb/s）',
            asOf: ASOF,
            note: '⚠️ 端口速率（单向口径惯例），与 NVLink 的双向 TB/s 数字不可直接并排相除。',
          }),
        },
        {
          key: 'dualPlane',
          label: '双平面拆分',
          claim: claim<string>({
            value: '2×400 Gb/s 接入两个独立平面的不同 Leaf（rail-optimized）',
            unit: null,
            sourceId: 'src.nvidia-nvl72-ra',
            locator: 'Networking Physical Topologies，Multi-Plane / Dual Plane Topology 两节',
            asOf: ASOF,
            note: '双平面负载均衡由谁做官方两说并存（NCCL 主机侧 vs ConnectX-8 硬件侧），见源 note。',
          }),
        },
        {
          key: 'adaptiveGain',
          label: 'Spectrum-X 对比现成以太网（营销口径）',
          claim: claim<number>({
            value: 1.6,
            unit: '倍',
            evidence: 'vendor_claim',
            sourceId: 'src.nvidia-spectrumx-docs',
            locator: '「Accelerate AI network performance by 1.6x over off-the-shelf (OTS) Ethernet」',
            asOf: ASOF,
            confidence: 'medium',
            note: '对比对象是现成以太网整体方案；adaptive routing 单项收益官方未拆分出数。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [],
      presalesNote:
        '客户把计算网和业务网混为一谈是常态。一句话切开：**计算网是 GPU 之间说话，业务网是集群对外界说话**；' +
        '这一章只讲前者。',
      sourceIds: ['src.nvidia-nvl72-ra', 'src.nvidia-spectrumx-docs'],
    },
    {
      id: 'lens.network.sharp-innetwork',
      title: '在网计算：SHARP 把 all-reduce 搬进交换芯片',
      narration:
        '① 你应该看到什么：代际切到 Vera Rubin NVL72——机架骨架与 GB300 相同（18 计算托盘 + 9 交换托盘），' +
        '但交换托盘里是 4 颗 NVLink 6 芯片（GB300 是 2 颗 NVLink 5），亮起的正是这 9 个交换托盘。' +
        '② 谁连谁 + 关键数字：张量并行的每一层都要做 all-reduce——把 72 份部分和加成一份再发回去。' +
        'SHARP 让这个「加」发生在交换芯片里：数据上行途中逐级聚合，不再全员往返。NVLink 6 交换托盘' +
        '单托盘 **14.4 TFLOPS FP8** 的在网规约算力、**28.8 TB/s** 托盘带宽，就是给这件事配的。' +
        '③ 没有这层会怎样：all-reduce 退回端点执行——同一份数据在网里多跑一轮，prefill 与 decode ' +
        '的每一层都多付一次通信往返，TTFT 与 TPOT 一起变差。',
      systemId: 'sys.vera-rubin-nvl72',
      lodLevel: 'rack',
      focusAssemblyId: 'asm.rubin.rack',
      planes: ['nvlink'],
      highlightAssemblyIds: ['asm.rubin.nvswitch-tray'],
      highlightConnectionIds: ['con.rubin.gpu-nvswitch', 'con.rubin.nvswitch-midplane'],
      chain: [
        {
          id: 'sharp-allreduce',
          hardwareRoleKeys: ['nvswitch-tray'],
          techniqueId: 'tech.sharp',
          phases: ['prefill', 'decode'],
          metrics: ['ttft', 'tpot'],
          narrative:
            'TP 并行的 all-reduce 在 prefill 和 decode 里**每层都发生**。加法搬进交换芯片，' +
            '等于每一层都省一轮全员往返——这不是把网络变快，是让一部分通信干脆不发生。',
        },
      ],
      keyFigures: [
        {
          key: 'sharpFp8Tflops',
          label: 'SHARP 在网规约算力（每交换托盘，NVLink 6 代）',
          claim: claim<number>({
            value: 14.4,
            unit: 'TFLOPS',
            sourceId: 'src.nvidia-rubin-chips-blog',
            locator:
              'NVLink switch tray 图注，「14.4 TFLOPS of FP8 in-network compute enabled by NVLink 6 SHARP acceleration」',
            asOf: ASOF,
            note: '与 cmp.rubin.nvswitch-tray.specs.sharpFp8Tflops 同源同值（content.test 有一致锁）。',
          }),
        },
        {
          key: 'gb300SharpTflops',
          label: 'GB300 代 NVLink 交换的 SHARP 算力',
          claim: claim<number>({
            value: null,
            unit: 'TFLOPS',
            sourceId: 'src.nvidia-gb300-page',
            asOf: ASOF,
            confidence: 'low',
            note:
              '官方未公布 GB300 代（NVLink 5 交换托盘）的 SHARP 在网算力数字——' +
              '「上一代有没有/有多少」不能从 NVLink 6 的 14.4 倒推，本项目不编数。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [],
      presalesNote:
        '客户问「交换机里为什么要有算力」，用一句话接住：**TP 每层都要把 72 份部分和加成一份，' +
        '加法在网里做，往返就省了**。数字只咬 14.4 TFLOPS/托盘（NVLink 6 代），上一代别报数。',
      sourceIds: ['src.nvidia-rubin-chips-blog', 'src.nvidia-sharp-docs'],
    },
    {
      id: 'lens.network.storage-fabric',
      title: '业务存储网：KV 卸载与模型拉取的物理通道',
      narration:
        '① 你应该看到什么：机房总览里只亮蓝色的业务网——每个托盘的 BlueField-3 接到汇聚交换层，' +
        '汇聚层再连到 L2 共享存储与更外圈的 L3 对象存储，这条路径与计算网完全不重叠。' +
        '② 谁连谁 + 关键数字：每个计算托盘经 BF-3 的**双 400 Gb/s** 端口接入两台汇聚交换机；' +
        '每计算节点的存储带宽上限 **40 GB/s**。KV cache 分层（KVBM）与模型权重拉取（Model Streamer）' +
        '的每一个字节都走这条物理通道，搬运接口是 NIXL。HGX 那份参考架构还把话挑明了：' +
        '**「分布式推理把 KV cache 卸载到高速网络存储」是官方点名的未来负载**。' +
        '③ 没有这层会怎样：GPU 之间还能通，但 KV 卸载层退化成「只有显存一层」、命中不了的前缀全部重算，' +
        '新副本拉不到权重、冷启动无限长——业务网断了，token 工厂断的是原料和成品两头。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'cluster',
      focusAssemblyId: 'asm.gb300.facility',
      planes: ['business'],
      highlightAssemblyIds: [
        'asm.gb300.converged-switch',
        'asm.gb300.storage',
        'asm.gb300.object-storage',
      ],
      highlightConnectionIds: [
        'con.gb300.bf3-converged',
        'con.gb300.converged-storage',
        'con.gb300.objstore-converged',
      ],
      chain: [
        {
          id: 'kvbm-offload',
          hardwareRoleKeys: ['north-south-dpu', 'converged-switch'],
          techniqueId: 'tech.kvbm',
          phases: ['kv-write'],
          metrics: ['ttft', 'kv-hit'],
          narrative:
            'KVBM 把装不进显存的 KV 块推到远端层级；下次同前缀请求进来，**从存储网捞回来比重算便宜**——' +
            '40 GB/s 的存储带宽就是这笔账的分母。',
        },
        {
          id: 'nixl-transfer',
          hardwareRoleKeys: ['north-south-dpu'],
          techniqueId: 'tech.nixl',
          phases: ['kv-write'],
          metrics: ['ttft'],
          narrative:
            'NIXL 是搬运的统一接口：KV 块去 DRAM、本地盘还是共享存储，**业务代码不改**，' +
            '底下自动选 RDMA/GDS/对象插件。',
        },
        {
          id: 'model-pull',
          hardwareRoleKeys: ['converged-switch', 'object-storage'],
          techniqueId: 'tech.model-streamer',
          phases: [],
          metrics: ['cold-start'],
          narrative:
            '模型权重从 L3 货仓经这条网直接流进显存（S3 直读，不先落盘）——' +
            '冷启动的物理通道与 KV 卸载是同一张网。',
        },
      ],
      keyFigures: [
        {
          key: 'perNodeStorage',
          label: '存储带宽上限（每计算节点）',
          claim: claim<number>({
            value: 40,
            unit: 'GB/s',
            sourceId: 'src.nvidia-nvl72-ra',
            locator: 'Networking Physical Topologies，「per-node storage bandwidth of up to 40 GB/s」',
            asOf: ASOF,
            note: '与 con.gb300.converged-storage.bandwidth 同源同值。up to 口径，不是承诺值。',
          }),
        },
        {
          key: 'bf3DualPort',
          label: 'BlueField-3 接入带宽（每托盘）',
          claim: claim<string>({
            value: '双 400 Gb/s 端口，分别接入两台汇聚交换机',
            unit: null,
            sourceId: 'src.nvidia-nvl72-ra',
            locator:
              'Networking Physical Topologies 节 CPU Converged (Node North/South) Network，「Each compute tray connects to two separate switches using dual 400 Gb/s ports」',
            asOf: ASOF,
            note: null,
          }),
        },
        {
          key: 'kvOffloadNote',
          label: 'KV 卸载到网络存储（HGX RA 官方原句）',
          claim: claim<string>({
            value:
              '官方点名的未来负载：分布式推理把 KV cache 卸载到高速网络存储，需要更高的每 GPU 突发 I/O 能力',
            unit: null,
            sourceId: 'src.nvidia-hgx-ra',
            locator:
              'Components 节 Converged (Node North/South) Ethernet Networking 的 Note，「For HGX B300 deployments, it can be helpful to consider future workloads such as distributed inference that may use KV cache offloads to highspeed, network attached storage. In these cases, having higher burst I/O capacity per GPU can be advantageous, even if the average bandwidth needs for typical training workloads are not very high.」',
            asOf: ASOF,
            note: '与 cmp.hgx.local-nvme.specs.kvCacheOffloadNote 同源同句（content.test 有一致锁）。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [],
      presalesNote:
        '把这一章跟存储切面连着卖：网络侧看到的是「通道」，存储侧看到的是「层级」，' +
        '两边说的是同一条 40 GB/s 的链路。',
      sourceIds: ['src.nvidia-nvl72-ra', 'src.nvidia-hgx-ra', 'src.nvidia-dynamo-docs', 'src.nvidia-nixl-repo'],
    },
    {
      id: 'lens.network.mgmt-mttr',
      title: '管理网：带宽最小的网守着 MTTR',
      narration:
        '① 你应该看到什么：机房总览里只剩灰色细线——机架内的管理交换机把托盘 BMC、电源架、DPU 全部收拢，' +
        '再上联到机架外的带外管理汇聚。这是六张网里带宽最小、存在感最低的一张。' +
        '② 谁连谁 + 关键数字：机架内 2 台 SN2201（**48 口**）收所有部件的 BMC 口（**1 Gb/s**，走 Redfish ' +
        '做带外上电、刷固件、收日志）；BlueField-3 自带独立 BMC 与信任根；这张网与数据面物理隔离。' +
        '它不出现在任何一个推理环节里——它守的不是 token，是 **MTTR**：故障发现、定位、远程处置的每一步都走这里。' +
        '③ 没有这层会怎样：业务不会立刻停，但你「看不见也够不着」——坏一个托盘从「远程隔离 + 热替换」' +
        '变成「派人进机房逐台排查」，MTTR 从分钟级涨到小时级。官方不给 MTTR 数字，这笔账要拿客户自己的' +
        '运维基线来算。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'cluster',
      focusAssemblyId: 'asm.gb300.facility',
      planes: ['mgmt'],
      highlightAssemblyIds: ['asm.gb300.oob-fabric-switch', 'asm.gb300.inrack-mgmt-switch'],
      highlightConnectionIds: ['con.gb300.inrack-oob-uplink', 'con.gb300.mgmt-node-oob'],
      chain: [
        {
          id: 'oob-mttr',
          hardwareRoleKeys: ['oob-mgmt-switch', 'inrack-mgmt-switch'],
          techniqueId: null,
          phases: [],
          metrics: ['mttr'],
          narrative:
            '硬件直达指标、中间没有 serving 技术：带外网让「机器挂了还能救回来」——' +
            '**数据面全瘫时仍能上电、刷固件、看日志**，MTTR 的下限由它决定。',
        },
      ],
      keyFigures: [
        {
          key: 'sn2201Ports',
          label: 'SN2201 管理交换机端口数',
          claim: claim<number>({
            value: 48,
            unit: '端口',
            sourceId: 'src.nvidia-nvl72-ra',
            locator: 'Networking Hardware，「NVIDIA SN2201 Switch … 48 ports」',
            asOf: ASOF,
            note: '与 cmp.shared.sn2201.specs.ports 同源同值。',
          }),
        },
        {
          key: 'bmcPortSpeed',
          label: 'BMC 带外口速率',
          claim: claim<number>({
            value: 1,
            unit: 'Gb/s',
            sourceId: 'src.nvidia-nvl72-ra',
            locator:
              'Network Logical Architecture 节 Enterprise RA Scalable Unit (SU)，「For the Out-of-band Management fabric, 18 trays, each with 3x 1Gb/s connections providing 54 x 1Gb/s for management」',
            asOf: ASOF,
            note: '与 con.gb300.tray-bmc-mgmt.bandwidth 同源同值（每托盘 3 个 1 Gb/s 带外口）。',
          }),
        },
        {
          key: 'mttrNumber',
          label: 'MTTR 参考值',
          claim: claim<number>({
            value: null,
            unit: '分钟',
            sourceId: 'src.nvidia-nvl72-ra',
            asOf: ASOF,
            confidence: 'low',
            note:
              '官方未公布任何 MTTR 目标或统计——修复时长取决于客户的备件、流程与人力，' +
              '本项目不编数；讲解时用客户自己的运维基线做对比。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [],
      presalesNote:
        '安全与运维的对话都从这张网接住：「主机被攻破也不丢管理面」（BlueField 独立 BMC + 信任根）、' +
        '「数据面全瘫也能远程处置」。它不产 token，但它决定停产多久。',
      sourceIds: ['src.nvidia-nvl72-ra'],
    },
    {
      id: 'lens.network.domain-size-hgx',
      title: '域的大小决定并行方式（HGX 对照）+ KV 交接计算器',
      narration:
        '① 你应该看到什么：代际切到 HGX B300——同样开着 NVLink 平面，这个机架里却**一条绿线都没有**。' +
        '不是坏了：这一代的 NVLink 域装在服务器**里面**（板载 NVSwitch ASIC），出了 8 卡就没有域了。' +
        '② 谁连谁 + 关键数字：板内 8 卡经 NVSwitch 互联，**板内聚合 14.4 TB/s（双向）**；跨机只有计算网的' +
        '**每 GPU 800 Gb/s（端口速率，单向口径）**。⚠️ 这两个数字口径不同（双向聚合 vs 单向端口），' +
        '并排放是为了立刻看出「域内域外不是一个量级」，不是拿来相除算倍数的。对 PD 分离意味着：' +
        'GB300 的 KV 交接是域内一跳，HGX 的跨机交接必须走以太网 + NIXL——同一套软件，成本结构完全不同。' +
        '③ 没有这层对照会怎样：只看单价会选错机器——决策变量不是「有没有 NVLink」，' +
        '是**你的并行方式需要多大的域**。用下面的 KV 交接计算器把三档链路的耗时摆到一张表上。',
      systemId: 'sys.hgx-b300',
      lodLevel: 'rack',
      focusAssemblyId: 'asm.hgx.rack',
      planes: ['nvlink', 'scaleout'],
      highlightAssemblyIds: ['asm.hgx.gpu-server'],
      highlightConnectionIds: ['con.hgx.cx8-leaf'],
      chain: [
        {
          id: 'pd-cross-node',
          hardwareRoleKeys: ['nvswitch-asic', 'scaleout-nic'],
          techniqueId: 'tech.pd-disagg',
          phases: ['kv-write', 'decode'],
          metrics: ['tpot', 'scalability'],
          narrative:
            '域止步 8 卡：prefill 池和 decode 池一旦分属两台服务器，**KV 交接就下了以太网**——' +
            '并行方式从「域内随便切」变成「先看网络预算」。',
        },
        {
          id: 'nixl-ethernet',
          hardwareRoleKeys: ['scaleout-nic'],
          techniqueId: 'tech.nixl',
          phases: ['kv-write'],
          metrics: ['ttft'],
          narrative:
            '跨机 KV 靠 NIXL 走 RDMA 以太网搬运——接口与 GB300 域内交接**相同**，' +
            '带宽预算差一个量级，这正是「同一套软件、不同硬件形态」的分界线。',
        },
      ],
      keyFigures: [
        {
          key: 'baseboardNvlink',
          label: '板内 NVLink 聚合带宽（8 卡基板）',
          claim: claim<number>({
            value: 14.4,
            unit: 'TB/s',
            sourceId: 'src.nvidia-hgx-page',
            locator: 'HGX 平台页规格表「Total NVLink Bandwidth 14.4 TB/s」',
            asOf: ASOF,
            note: '⚠️ 双向聚合口径（8 卡合计）。',
          }),
        },
        {
          key: 'crossNodeScaleout',
          label: '跨机计算网带宽（每 GPU）',
          claim: claim<number>({
            value: 800,
            unit: 'Gb/s',
            sourceId: 'src.nvidia-hgx-ra',
            locator: 'Abstract，2-8-9-800 口径「9 NICs at 800 Gb/s bandwidth per GPU」',
            asOf: ASOF,
            note:
              '⚠️ 端口速率（单向口径惯例）。与板内 14.4 TB/s 并排是为了看量级差，' +
              '**两个口径不同，不可直接相除**（v1.5 订正纪律的代码化）。',
          }),
        },
      ],
      calculatorId: 'kv-transfer',
      crossRefs: [{ label: '回看：机架级 NVLink 域（GB300）', chapterId: 'lens.network.nvlink-domain' }],
      presalesNote:
        '选型对话的落点：**互动延迟敏感 + MoE 大模型 → 要大域（NVL72）；' +
        '风冷机房 + 中等模型推理 → HGX 够用**。计算器给的是理论下限，用它讲量级、别拿它报 SLA。',
      sourceIds: ['src.nvidia-hgx-page', 'src.nvidia-hgx-ra', 'src.nvidia-dynamo-docs'],
    },
  ],
}

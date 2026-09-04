import { claim } from './claim'
import type { RuntimeTechnique } from './types'

/**
 * serving runtime 技术注册表（v1.6 W-A 首批 9 条）。
 *
 * 定位：切面因果链（ChainLink.techniqueId）与技术卡的唯一数据源。跨代实体，
 * 不属于任何系统文件；3D 侧**不建软件层实体**（PLAN-v1.6 已确认）。
 *
 * 纪律（pack.test / content.test 强制）：
 * - `requiresRoleKeys` 必须是仓库装配树里真实存在的 roleKey（至少存在于一个系统）；
 * - figures 只放**逐字核对过原文**的数字/原句：官方架构描述 verified_spec、
 *   厂商营销倍数 vendor_claim、厂商自测数据 benchmark；核不到的一律不建行；
 * - WEKA / VAST / Mooncake / Model Streamer 的数字只能出现在这里与 lens 的
 *   keyFigures 里，永不进 `components[].specs`（content.test 有锁）。
 */

const ASOF = '2026-09'

export const TECHNIQUES: RuntimeTechnique[] = [
  {
    id: 'tech.nixl',
    name: 'NIXL',
    fullName: 'NVIDIA Inference Xfer Library',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'transport',
    summary:
      '推理框架的点对点传输库：把「KV cache 从 A 搬到 B」这件事从具体介质里抽象出来——' +
      'GPU 显存、主机内存、本地盘、对象存储之间的搬运走同一套接口，底下按可达性自动选 ' +
      'RDMA / NVLink / GDS / 对象存储插件。Dynamo 的 PD 分离与 KV 分层都踩在它上面。',
    presalesNote:
      '跟客户讲 NIXL 别讲成「又一个网络库」：它的价值是**让 KV cache 的物理位置成为调度决策**' +
      '而不是架构约束——今天在 HBM、明天挤到本地盘、后天去共享存储，业务代码不改。' +
      '这直接决定了 PD 分离和长上下文缓存能不能落地。',
    requiresRoleKeys: ['north-south-dpu', 'scaleout-nic', 'external-storage'],
    planes: ['business', 'scaleout'],
    affectsPhases: ['prefill', 'kv-write', 'decode'],
    affectsMetrics: ['ttft', 'cold-start', 'kv-hit'],
    figures: [
      {
        key: 'positioning',
        label: '官方定位（README 原句）',
        claim: claim<string>({
          value:
            'targeted for accelerating point to point communications in AI inference frameworks such as NVIDIA Dynamo, while providing an abstraction over various types of memory (e.g., CPU and GPU) and storage (e.g., file, block and object store) through a modular plug-in architecture',
          unit: null,
          sourceId: 'src.nvidia-nixl-repo',
          locator: 'README 首段',
          asOf: ASOF,
          note: '能力描述；README 无任何硬性能数字，本项目因此不为 NIXL 建任何数值 Claim。',
        }),
      },
      {
        key: 'plugins',
        label: '传输/存储插件清单（2026-09 时点）',
        claim: claim<string>({
          value: 'UCX、GDS、POSIX、OBJ（对象存储）、AZURE_BLOB、HF3FS、MOONCAKE、GUSLI、UCCL、GPUNETIO、LIBFABRIC、NVSHMEM',
          unit: null,
          sourceId: 'src.nvidia-nixl-repo',
          locator: 'README 插件列表',
          asOf: ASOF,
          note: '插件化后端即「同一接口、介质可换」的证据：网络（UCX/RDMA）与存储（GDS/对象）在同一抽象下。',
        }),
      },
    ],
    docUrl: 'https://github.com/ai-dynamo/nixl',
    sourceIds: ['src.nvidia-nixl-repo', 'src.nvidia-dynamo-docs'],
  },
  {
    id: 'tech.kvbm',
    name: 'KVBM',
    fullName: 'Dynamo KV Block Manager',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'kv-management',
    summary:
      'Dynamo 的 KV 块管理器：把 KV cache 当作分层内存里的「块」统一管理——查表、分配、' +
      '生命周期、复用/驱逐策略都在这一层，数据搬运交给 NIXL。层级覆盖 GPU 显存、锁页主机内存、' +
      '远端 RDMA 可达内存、本地/池化 SSD、远端文件/对象/云存储。',
    presalesNote:
      '客户的痛点是「显存装不下更长的上下文」。KVBM 的回答是**显存只是第一层**：命中远端层' +
      '虽然慢于 HBM，但比重算 prefill 便宜得多。售前讲这条时把「层级来凑」和 40 GB/s 存储网' +
      '带宽挂在一起讲，账才算得出来。',
    requiresRoleKeys: ['gpu-hbm', 'cache-storage', 'external-storage'],
    planes: ['business'],
    affectsPhases: ['kv-write', 'decode'],
    affectsMetrics: ['ttft', 'kv-hit'],
    figures: [
      {
        key: 'definition',
        label: '官方定义（文档原句）',
        claim: claim<string>({
          value:
            'a scalable runtime component designed to handle memory allocation, management, and remote sharing of Key-Value (KV) blocks for inference tasks across heterogeneous and distributed environments',
          unit: null,
          sourceId: 'src.nvidia-dynamo-docs',
          locator: 'docs.nvidia.com/dynamo/v-0-8-1/components/kvbm/overview（latest 路径已改版，见源 note）',
          asOf: ASOF,
          note: null,
        }),
      },
      {
        key: 'tiers',
        label: '统一内存 API 覆盖的层级（文档原句）',
        claim: claim<string>({
          value:
            'GPU memory (in future), pinned host memory, remote RDMA-accessible memory, local or distributed pool of SSDs and remote file/object/cloud storage systems',
          unit: null,
          sourceId: 'src.nvidia-dynamo-docs',
          locator: 'docs.nvidia.com/dynamo/v-0-8-1/components/kvbm/overview',
          asOf: ASOF,
          note: '「显存不够、层级来凑」的官方层级清单；各层带宽官方未给统一数字，本项目不编。',
        }),
      },
    ],
    docUrl: 'https://docs.nvidia.com/dynamo/v-0-8-1/components/kvbm/overview',
    sourceIds: ['src.nvidia-dynamo-docs', 'src.nvidia-nixl-repo'],
  },
  {
    id: 'tech.model-streamer',
    name: 'Model Streamer',
    fullName: 'Run:ai Model Streamer',
    vendor: 'NVIDIA（Run:ai）',
    status: 'shipping',
    category: 'model-loading',
    summary:
      '开源模型加载器：多线程并发把 Safetensors 权重从存储（本地盘 / 共享存储 / S3 对象存储）' +
      '直接流进 GPU 显存，边读边传、无需先落盘转格式。vLLM 已内置集成。',
    presalesNote:
      '冷启动是弹性扩容的隐形成本：扩一个副本要等权重加载完才能接流量。官方基准里同一个 ' +
      'Llama-3-8B 从 S3 加载，Model Streamer 4.88 秒、Tensorizer 37.36 秒——**分钟级到秒级**' +
      '的差距就是「高峰期敢不敢自动扩容」的差距。⚠️ 对照对象是 Tensorizer：' +
      'Safetensors 原生 loader 不支持 S3 直读，没资格进这一局。',
    requiresRoleKeys: ['external-storage', 'object-storage', 'cache-storage'],
    planes: ['business'],
    // ⚠️ 刻意为空：模型加载发生在七阶段推理流之外（裁决①，见 types.ts 注释）
    affectsPhases: [],
    affectsMetrics: ['cold-start'],
    figures: [
      {
        key: 's3LoadSeconds',
        label: 'S3 直读加载耗时（官方基准最优值）',
        claim: claim<number>({
          value: 4.88,
          unit: '秒',
          evidence: 'benchmark',
          sourceId: 'src.runai-model-streamer',
          locator:
            'benchmarks.md Experiment #3（Amazon S3，同区）：Meta-Llama-3-8B（15 GB Safetensors）× AWS g5.12xlarge（A10G）× vLLM 0.5.5，Model Streamer concurrency 32',
          asOf: ASOF,
          confidence: 'medium',
          note: '厂商自测 benchmark。对照：Tensorizer 同实验最优 37.36 秒（16 workers）。',
        }),
      },
      {
        key: 's3TensorizerSeconds',
        label: 'S3 对照组 Tensorizer 耗时（同一基准）',
        claim: claim<number>({
          value: 37.36,
          unit: '秒',
          evidence: 'benchmark',
          sourceId: 'src.runai-model-streamer',
          locator:
            'benchmarks.md Experiment #3（Amazon S3）：Tensorizer 2.9.0 最优 16 workers，模型/实例配置同上',
          asOf: ASOF,
          confidence: 'medium',
          note:
            '⚠️ 37.36s 是 **Tensorizer** 的成绩，不是 Safetensors Loader——后者不支持 S3，' +
            '未参与该实验（v1.6 实访逐字核对订正）。',
        }),
      },
      {
        key: 'gp3SafetensorsSeconds',
        label: '本地 GP3 SSD 上 Safetensors Loader 耗时（对照）',
        claim: claim<number>({
          value: 47.99,
          unit: '秒',
          evidence: 'benchmark',
          sourceId: 'src.runai-model-streamer',
          locator:
            'benchmarks.md Experiment #1（GP3 SSD，1,000 MiB/s 上限）：Safetensors Loader 47.99s vs Model Streamer 14.34s（concurrency 16）',
          asOf: ASOF,
          confidence: 'medium',
          note: '同一块盘、同一个模型：单线程顺序读 vs 并发流式读的差距，与存储介质无关。',
        }),
      },
    ],
    docUrl: 'https://github.com/run-ai/runai-model-streamer',
    sourceIds: ['src.runai-model-streamer'],
  },
  {
    id: 'tech.gds',
    name: 'GPUDirect Storage',
    fullName: 'NVIDIA Magnum IO GPUDirect Storage（GDS）',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'transport',
    summary:
      '存储与 GPU 显存之间的 DMA 直达路径：数据不再经过 CPU 内存反弹缓冲（bounce buffer），' +
      '由 NVMe/网卡直接 DMA 进显存。权重加载与 KV 分层的底层通道，NIXL 的 GDS 插件即用它。',
    presalesNote:
      '一句话讲清 GDS：**「数据进显存不再绕道 CPU 内存」**。客户能感知的是两件事——' +
      '加载大文件时 CPU 占用不再飙高、部分平台上吞吐能翻倍（官方原话带限定：' +
      '「在某些系统上……至少两倍峰值带宽」，别把限定语吃掉）。',
    requiresRoleKeys: ['gpu-hbm', 'cache-storage', 'external-storage'],
    planes: ['business'],
    affectsPhases: ['kv-write'],
    affectsMetrics: ['cold-start', 'ttft'],
    figures: [
      {
        key: 'directPath',
        label: '官方定义（文档原句）',
        claim: claim<string>({
          value:
            'GPUDirect Storage (GDS) enables a direct data path for direct memory access (DMA) transfers between GPU memory and storage, which avoids a bounce buffer through the CPU',
          unit: null,
          sourceId: 'src.nvidia-gds-docs',
          locator: 'Overview Guide v1.18 首节',
          asOf: ASOF,
          note: null,
        }),
      },
      {
        key: 'bandwidthGain',
        label: '直达路径的峰值带宽收益（官方限定口径）',
        claim: claim<number>({
          value: 2,
          unit: '倍（≥）',
          evidence: 'vendor_claim',
          sourceId: 'src.nvidia-gds-docs',
          locator:
            'Overview Guide：「a direct path … through a PCIe switch or a NIC acting as a PCIe switch offers at least twice the peak bandwidth as compared to taking a data path through the CPU」',
          asOf: ASOF,
          confidence: 'medium',
          note:
            '⚠️ 官方原句带限定：仅指经 PCIe switch（或充当 PCIe switch 的网卡）的**部分系统**，' +
            '且比较对象是经 CPU 的路径峰值带宽——不是任意平台的普适倍数。另有定性结论' +
            '「latency improvements are most apparent with small transfers」。',
        }),
      },
    ],
    docUrl: 'https://docs.nvidia.com/gpudirect-storage/overview-guide/index.html',
    sourceIds: ['src.nvidia-gds-docs'],
  },
  {
    id: 'tech.sharp',
    name: 'SHARP',
    fullName: 'Scalable Hierarchical Aggregation and Reduction Protocol',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'collective',
    summary:
      '在网计算：把 all-reduce 这类集合通信的规约运算从 GPU/CPU 搬进交换芯片——数据在网络里' +
      '逐级聚合，不再在端点之间来回倒腾同一份数据。NVLink 交换托盘的 SHARP 算力' +
      '（NVLink 6 代每托盘 14.4 TFLOPS FP8）就是给张量并行的 all-reduce 省往返用的。',
    presalesNote:
      '客户问「交换机里为什么要有算力」，答案是：TP 并行每层都要 all-reduce，把加法搬进交换芯片，' +
      '等于**每一层都省一轮全员往返**。这不是把网络变快，是让一部分通信干脆不发生。',
    requiresRoleKeys: ['nvswitch-tray', 'nvswitch-asic'],
    planes: ['nvlink'],
    affectsPhases: ['prefill', 'decode'],
    affectsMetrics: ['ttft', 'tpot'],
    figures: [
      {
        key: 'offload',
        label: '官方定义（文档原句）',
        claim: claim<string>({
          value:
            'improves the performance of MPI and Machine Learning collective operation, by offloading collective operations from CPUs and GPUs to the network and eliminating the need to send data multiple times between endpoints',
          unit: null,
          sourceId: 'src.nvidia-sharp-docs',
          locator: 'SHARP 文档 Rev 3.0.0 概述',
          asOf: ASOF,
          note: 'SHARP 文档本身无硬数字；NVLink 6 代的 14.4 TFLOPS FP8 见切面章节引用的 Rubin 芯片博客。',
        }),
      },
    ],
    docUrl: 'https://networking-docs.nvidia.com/sharpum/300',
    sourceIds: ['src.nvidia-sharp-docs', 'src.nvidia-rubin-chips-blog'],
  },
  {
    id: 'tech.pd-disagg',
    name: 'PD 分离',
    fullName: 'Prefill/Decode Disaggregation（Dynamo disaggregated serving）',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'orchestration',
    summary:
      '把 prefill（算力吃紧）与 decode（显存带宽吃紧）拆到两组独立扩缩的 GPU 池，' +
      '中间交接一次 KV cache。交接走哪条路由域大小决定：NVLink 域内直达，跨域走计算网/存储网。',
    presalesNote:
      '这是「域的大小决定并行方式」的最好案例：GB300 一个机架 72 卡全在 NVLink 域里，' +
      'KV 交接是**域内一跳**；HGX 的域止步 8 卡，跨机交接只能走以太网——同一套软件，' +
      '硬件形态直接改变了成本结构。给客户算 TTFT 账时先问「KV 从哪儿到哪儿」。',
    requiresRoleKeys: ['accelerator', 'scaleout-nic'],
    planes: ['nvlink', 'scaleout', 'business'],
    affectsPhases: ['prefill', 'kv-write', 'decode'],
    affectsMetrics: ['ttft', 'tpot', 'throughput', 'scalability'],
    figures: [
      {
        key: 'definition',
        label: '官方描述（Dynamo README 原句）',
        claim: claim<string>({
          value: 'Separates prefill and decode into independently scalable GPU pools',
          unit: null,
          sourceId: 'src.nvidia-dynamo-docs',
          locator: 'github.com/ai-dynamo/dynamo README（disaggregated serving 一节）',
          asOf: ASOF,
          note:
            'README/营销页上另有各类吞吐倍数，本项目 2026-09 实访未逐字核到稳定口径，' +
            '按纪律不建数值 Claim。',
        }),
      },
    ],
    docUrl: 'https://docs.nvidia.com/dynamo/latest/',
    sourceIds: ['src.nvidia-dynamo-docs'],
  },
  {
    id: 'tech.ep-alltoall',
    name: 'EP All-to-All',
    fullName: 'Expert Parallelism All-to-All（MoE dispatch/combine）',
    vendor: 'NVIDIA / 社区',
    status: 'shipping',
    category: 'collective',
    summary:
      'MoE 模型的专家并行通信模式：每个 token 要被派发到它命中的专家（dispatch）、算完再收回来' +
      '（combine），两步都是全员对全员的 all-to-all。通信量随专家数与 token 数乘性增长，' +
      '是 NVLink 域内 130 TB/s 聚合带宽最主要的消费者之一。',
    presalesNote:
      '讲 MoE 为什么非要 NVLink 域：all-to-all 的流量模式没有局部性可言，谁跟谁都要通。' +
      '域内 1.8 TB/s/卡（双向）能把 dispatch/combine 压在微秒级；掉到跨机以太网，' +
      '这两步就成了 decode 的主要延迟项——**专家越多，域越值钱**。',
    requiresRoleKeys: ['nvswitch-tray', 'nvlink-backplane'],
    planes: ['nvlink'],
    affectsPhases: ['moe-dispatch', 'moe-combine'],
    affectsMetrics: ['tpot', 'throughput'],
    figures: [
      {
        key: 'nvlinkDomainBandwidthTBs',
        label: 'NVLink 域聚合带宽（GB300 机架，all-to-all 的通道上限）',
        claim: claim<number>({
          value: 130,
          unit: 'TB/s',
          sourceId: 'src.nvidia-gb300-page',
          locator: 'GB300 NVL72 产品页规格表（NVLink 带宽行）',
          asOf: ASOF,
          note:
            '双向口径（与内容包 sys.gb300-nvl72 keySpecs 同源同值）。每卡 1.8 TB/s 亦为双向——' +
            '与单向口径的网卡数字并排比较时必须先统一口径（LEARNING.md v1.5 订正纪律）。',
        }),
      },
    ],
    docUrl: null,
    sourceIds: ['src.nvidia-gb300-page', 'src.nvidia-dynamo-docs'],
  },
  {
    id: 'tech.rail-routing',
    name: 'Rail-Optimized 组网',
    fullName: 'Rail-optimized dual-plane scale-out fabric',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'routing',
    summary:
      '计算网的接线纪律：每机架同编号的网卡接同一台 leaf（同一条 rail），GPU 的 800 Gb/s 拆成 ' +
      '2×400 接进两个独立平面。跨机集合通信的对端流量走同编号 rail，一跳可达、互不抢道。',
    presalesNote:
      '客户看机房照片会问「为什么线要这么绕」。rail-optimized 的回答：并行训练/推理的流量' +
      '天然是「1 号卡找别家 1 号卡」，按 rail 接线让这类流量**一跳到 leaf 就拐弯**，' +
      '不用上 spine。双平面则是韧性设计——单平面故障时网卡硬件自动切换、带宽减半但不断流。',
    requiresRoleKeys: ['scaleout-nic', 'scaleout-leaf'],
    planes: ['scaleout'],
    affectsPhases: ['prefill', 'moe-dispatch'],
    affectsMetrics: ['scalability', 'throughput'],
    figures: [
      {
        key: 'dualPlane',
        label: '双平面拆分（参考架构口径）',
        claim: claim<string>({
          value: '每 GPU 800 Gb/s 拆成 2×400 Gb/s，分别接入两个独立平面的不同 leaf（rail-optimized）',
          unit: null,
          sourceId: 'src.nvidia-nvl72-ra',
          locator: 'Networking Physical Topologies，Multi-Plane / Dual Plane Topology 两节',
          asOf: ASOF,
          note:
            '双平面负载均衡由谁做，RA 同页两说并存（NCCL 主机侧 vs ConnectX-8 硬件侧），' +
            '见 src.nvidia-nvl72-ra 的源 note ④，引用时如实并存。',
        }),
      },
    ],
    docUrl: 'https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html',
    sourceIds: ['src.nvidia-nvl72-ra', 'src.nvidia-spectrumx-docs'],
  },
  {
    id: 'tech.adaptive-routing',
    name: 'Adaptive Routing',
    fullName: 'Spectrum-X RoCE Adaptive Routing',
    vendor: 'NVIDIA',
    status: 'shipping',
    category: 'routing',
    summary:
      'Spectrum-X 交换机与 SuperNIC 协同的动态选路：逐包感知拥塞、在等价路径间实时改道，' +
      '把大象流打散避免单链路热点，提升以太网 AI fabric 的有效带宽与韧性。',
    presalesNote:
      '客户拿 InfiniBand 比以太网时，adaptive routing 是以太网侧的核心答辩点：静态 ECMP 会把' +
      '几条大象流哈希到同一条链路上，交换机+网卡协同改道才把「标称带宽」变成「有效带宽」。' +
      '官方给的 1.6x 是对比现成以太网（OTS）的营销口径，讲的时候带上对比对象。',
    requiresRoleKeys: ['scaleout-nic', 'scaleout-leaf', 'scaleout-spine'],
    planes: ['scaleout'],
    affectsPhases: ['moe-dispatch', 'moe-combine'],
    affectsMetrics: ['throughput', 'scalability'],
    figures: [
      {
        key: 'definition',
        label: '官方定义（产品页原句）',
        claim: claim<string>({
          value:
            'Adaptive routing is a feature where the Spectrum-X Ethernet switch and SuperNIC work in tight coordination to dynamically route traffic, enabling the highest effective bandwidth and network resiliency for AI fabrics',
          unit: null,
          sourceId: 'src.nvidia-spectrumx-docs',
          locator: 'Spectrum-X 产品页 Adaptive Routing 一节',
          asOf: ASOF,
          note: null,
        }),
      },
      {
        key: 'perfVsOts',
        label: '对比现成以太网的性能倍数（营销口径）',
        claim: claim<number>({
          value: 1.6,
          unit: '倍',
          evidence: 'vendor_claim',
          sourceId: 'src.nvidia-spectrumx-docs',
          locator: 'Spectrum-X 产品页：「Accelerate AI network performance by 1.6x over off-the-shelf (OTS) Ethernet」',
          asOf: ASOF,
          confidence: 'medium',
          note: '⚠️ 对比对象是 off-the-shelf 以太网整体方案，不是单指 adaptive routing 一个特性的收益。',
        }),
      },
    ],
    docUrl: 'https://www.nvidia.com/en-us/networking/spectrumx/',
    sourceIds: ['src.nvidia-spectrumx-docs'],
  },
]

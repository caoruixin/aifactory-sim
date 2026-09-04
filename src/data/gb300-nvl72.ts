import { notPublished, pageSpec, raCount, raSpec, vendorClaim, GB300_PAGE_SOURCE, RA_SOURCE } from './claim'
import type {
  AssemblyNode,
  Connection,
  FactorySystem,
  HardwareComponent,
  ScenePreset,
} from './types'

/**
 * GB300 NVL72 全深度内容包（本项目的「母版」代际）。
 *
 * 数据来源纪律：本文件中每一个数字都来自 NVIDIA 官方参考架构文档（src.nvidia-nvl72-ra）
 * 或 GB300 NVL72 官方产品页（src.nvidia-gb300-page），locator 精确到表号/段落原文。
 * 官方未公布的一律 `notPublished(...)`（value: null），不用记忆或第三方数字补齐。
 *
 * ⚠️ 已发现的官方文档内部冲突（四处，均已在对应 Claim 的 note 中标注）：
 *   1. 每托盘 HBM 容量：components.html Table 1 写 “1,152 GB aggregated HBM3”，
 *      appendix-node-configurations.html Table 10 写 “720 GB of aggregated HBM3”。
 *      本项目取 1,152 GB（÷4 = 288 GB/GPU）；另有第三个官方数字——Blackwell Ultra 数据手册
 *      GB300 NVL72 列写 “279 GB HBM3E”。详见 cmp.gb300.b300-gpu.specs.hbmPerGpuGB 的 note。
 *   2. 每托盘 E1.S 缓存盘数量：components.html 正文写 “4 E1.S NVMe storage devices”，
 *      Table 10 写 “8 x 4 TB E1.S”。本项目取正文的 4，并在 note 中记录冲突。
 *   3. 交换机型号：network-logical-architecture.html Table 5 与 appendix Table 11 写 SN5600
 *      （“NVIDIA SN5600 128-port 400 Gb/s switches”），networking-hardware.html 写 SN5610
 *      （“The NVIDIA SN5610 switch both offer 64 total ports of 800 Gbps”）。见 cmp.gb300.sn5610。
 *   4. 双平面负载均衡由谁做：networking-physical-topologies.html 同一页，Multi-Plane Topology
 *      Approach 说 “handled by the NCCL on the host”，Dual Plane Topology 说 “handled by the
 *      ConnectX-8 SuperNIC on the hardware level”。见 con.gb300.cx8-leaf。
 *
 * ⚠️ 本参考架构**不涉及**的范围（全篇零命中，别把通用工程常识挂到它头上）：
 *   CDU / manifold / cold plate / coolant / quick disconnect / Oberon 六个词一次都没出现。
 *   液冷只写到 “the GB300 NVL72 rack is liquid cooled, based on the MGX architecture” 与
 *   “Integrated tray-level and rack-level liquid leakage detection” 两句。
 */

const SYSTEM_ID = 'sys.gb300-nvl72'

/**
 * ★ 跨文件统一口径（hgx-b300.ts 里说的是同一句话）：
 * **NVLink 与以太网的带宽比是 9 倍，不是 18 倍。**
 *
 * 根因是 NVIDIA 给 NVLink 的数字默认是**双向合计**——参考架构原文：
 * 「all 72 GPUs are interconnected in a single NVLink domain … with a bandwidth of
 * 900GB/s (1800 GB/s bi-directional)」。拿 1800（双向）去除以 100 GB/s
 * （800 Gb/s 网卡按单向折算）得到的 18，是把双向和单向两种口径混着用。
 *
 * 同方向口径下两种算法都得 9：
 *   单向 900 GB/s ÷ 100 GB/s = 9；双向 1800 GB/s ÷ 200 GB/s（2 × 800 Gb/s）= 9。
 * 独立佐证：HGX 平台页规格表相邻两行「Total NVLink Bandwidth | 14.4 TB/s」与
 * 「Networking Bandwidth | 1.6 TB/s」同表同口径，14.4 ÷ 1.6 = 9。
 *
 * ⚠️ NVIDIA 从未发布过 NVLink vs 以太网的「18×」对比，讲的时候不要说这个数。
 */
const NVLINK_VS_ETHERNET_NOTE =
  '★ 同口径对照：机架内 NVLink 每卡 900 GB/s（单向）/ 1800 GB/s（双向），' +
  '跨机架以太网每卡 800 Gb/s（= 100 GB/s 单向 / 200 GB/s 双向）——**同方向下差 9 倍**。' +
  '（拿 1800 双向去比 100 单向会算出 18 倍，那是双向/单向口径混用；' +
  '官方原文写的是「a bandwidth of 900GB/s (1800 GB/s bi-directional)」。）'

// ─────────────────────────── 系统 ───────────────────────────

export const GB300_SYSTEM: FactorySystem = {
  id: SYSTEM_ID,
  name: 'NVIDIA GB300 NVL72',
  vendor: 'NVIDIA',
  status: 'shipping',
  capacityPolicy: 'standard',
  architecture: 'nvlink-rack-domain',
  generation: 'blackwell-ultra',
  referenceUrl: 'https://www.nvidia.com/en-us/data-center/gb300-nvl72/',
  summary:
    '把 72 张 Blackwell Ultra GPU 与 36 颗 Grace CPU 用第五代 NVLink 连成一台机器的液冷机架系统，是当前「机架即计算机」的量产标准形态。',
  presalesNote:
    '讲 GB300 NVL72 只要抓住一句话：18 个托盘既可以各自当独立服务器用，也能被 NVLink 合成**一台机器**' +
    '——官方原话是「While each tray (single server or node) can still operate independently as needed, ' +
    'the NVLink interconnect enables GPUs to be dynamically combined」。' +
    '对客户的直接意义是：万亿参数模型的张量并行/专家并行可以整个装在机架内，不必出机架走以太网。' +
    `${NVLINK_VS_ETHERNET_NOTE}`,
  sourceIds: [RA_SOURCE, GB300_PAGE_SOURCE],
  keySpecs: {
    gpuCount: raSpec<number>(72, '张', 'Overview，「72 NVIDIA Blackwell Ultra GPUs」'),
    cpuCount: raSpec<number>(36, '颗', 'Overview，「36 NVIDIA® Grace CPUs」'),
    computeTrayCount: raSpec<number>(
      18,
      '个',
      'Overview，「18 compute trays connected via the fifth generation of NVLink」',
    ),
    nvswitchTrayCount: raSpec<number>(
      9,
      '个',
      'System Hardware & Components，「9 NVSwitch trays for full non-blocking P2P connectivity of all 72 Blackwell Ultra GPUs」',
    ),
    rackPowerKW: raSpec<number>(
      142,
      'kW',
      'System Hardware & Components，「Full rack requiring up to 142 kW」',
      '官方口径为「最高（up to）142 kW」，不是典型工况功率；用于 tokens/W 估算时须在 caveat 中声明。',
    ),
    nvlinkAggregateBandwidthTBs: raSpec<number>(
      130,
      'TB/s',
      'System Hardware & Components，「a total aggregated bandwidth of 130 TB/s」（产品页规格表同值）',
    ),
    gpuMemoryTotalTB: pageSpec<number>(20, 'TB', '产品页规格表 GPU Memory | Bandwidth，「20 TB」'),
    gpuMemoryBandwidthTBs: pageSpec<number>(
      576,
      'TB/s',
      '产品页规格表 GPU Memory | Bandwidth，「Up to 576 TB/s」',
    ),
    cpuMemoryTB: pageSpec<number>(17, 'TB', '产品页规格表 CPU Memory | Bandwidth，「17 TB LPDDR5X」'),
    fastMemoryTB: pageSpec<number>(37, 'TB', '产品页规格表 Fast Memory，「37 TB」'),
    fp4DensePflops: pageSpec<number>(
      1080,
      'PFLOPS',
      '产品页规格表 FP4 Tensor Core，「1440 | 1080」+ 脚注 2「Without sparsity」',
      '1440 为含稀疏口径，1080 为稠密口径。产能估算只用稠密值。',
    ),
    fp8SparsePflops: pageSpec<number>(
      720,
      'PFLOPS',
      '产品页规格表 FP8/FP6 Tensor Core，「720 PFLOPS」+ 脚注 1「All Tensor Core specifications are with sparsity unless otherwise noted」',
      '该值含稀疏；稠密口径为 360 PFLOPS。',
    ),
    cpuCoreCount: pageSpec<number>(
      2592,
      '核',
      '产品页规格表 CPU Core Count，「2,592 Arm Neoverse V2 cores」',
    ),
    maxScalableUnits: raSpec<number>(
      8,
      '个 SU',
      'Overview，「A fully tested system scales up to 8 SUs (Scalable Units)」',
      '一个 SU = 一个 NVL72 机架。8 SU 是官方完整验证过的规模上限，不是物理上限。',
    ),
    aiFactoryOutputVsHopper: vendorClaim<number>(
      50,
      '倍',
      RA_SOURCE,
      'System Hardware & Components，「can deliver up to a 50x overall increase in AI factory output performance compared to NVIDIA Hopper-based platforms」',
      '⚠️ 厂商营销口径，不是单卡算力比，不可直接换算成 token 产能。' +
        '★ 官方自己给了拆解（GB300 NVL72 产品页）：「Compared to Hopper, the GB300 NVL72 delivers an ' +
        'impressive 10x boost in user responsiveness (TPS per user) and a 5x improvement in throughput ' +
        '(TPS per megawatt (MW)). Together, these advancements translate into a remarkable 50x leap in ' +
        'overall AI factory output.」——即 50 = 10（每用户 TPS）× 5（每兆瓦 TPS）。' +
        '**因子里有功耗（TPS/MW），没有成本**；讲的时候别加「成本」二字。' +
        '另：数据手册第 3 页把它画成帕累托前沿的最优交点（DeepSeek-R1，ISL 32K / OSL 8K，' +
        'GB300 NVL72 用 FP4 Dynamo disaggregation vs H100 用 FP8 in-flight batching，' +
        '标注「Projected performance subject to change」）。',
    ),
  },
  // 48U 为 3D 摆位用的示意值：官方未公布机架 U 高与逐 U 布局
  rackUnitsForLayout: 48,
}

// ─────────────────────────── 组件 ───────────────────────────

export const GB300_COMPONENTS: HardwareComponent[] = [
  {
    id: 'cmp.gb300.b300-gpu',
    kind: 'gpu',
    name: 'NVIDIA B300（Blackwell Ultra）GPU',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '整个系统里真正做矩阵乘法的算力核心，自带 HBM3e 高带宽显存并通过 NVLink 与其余 71 张卡直连。',
    presalesNote:
      '客户问「买卡到底买什么」，答案是三件事：算力（FP4 稠密 15 PFLOPS）、显存容量（288 GB，决定装得下多大模型）、' +
      '显存带宽（8 TB/s，决定 decode 有多快）。推理场景里后两项往往比第一项更卡脖子。' +
      '★ 但**不要说「Blackwell Ultra 主要加的是显存而不是算力」**——官方口径是两头一起加：' +
      'GB300 NVL72 产品页原话「The system delivers 1.5x more dense FP4 Tensor Core FLOPS and 2x higher ' +
      'attention performance compared to NVIDIA Blackwell GPUs.」，即**稠密 FP4 算力 1.5×、注意力层 2×**，' +
      '算力与显存是同幅提升，不是「只加显存」。真正的差异化卖点是那个 2× 的注意力性能' +
      '（芯片博客：SFU 吞吐翻倍），长上下文推理里 softmax 常常就是时延瓶颈。',
    visual: { shape: 'chip', colorToken: 'accent' },
    imageUrl: 'https://www.nvidia.com/en-us/data-center/gb300-nvl72/',
    sourceIds: [RA_SOURCE, GB300_PAGE_SOURCE],
    mathSpecs: {
      memoryGB: 288,
      bandwidthTBs: 8,
      fp8Tflops: 5000,
      fp4Tflops: 15000,
      tdpW: null,
      derivation:
        '显存 288 GB = 参考架构 Table 1「每托盘 4 张 B300 合计 1,152 GB HBM3」÷ 4；' +
        '带宽 8 TB/s = 产品页「576 TB/s」÷ 72 卡；' +
        'FP4 稠密 15 PFLOPS = 产品页稠密值 1080 PFLOPS ÷ 72 卡；' +
        'FP8 稠密 5 PFLOPS = 产品页「720 PFLOPS」（脚注 1 声明含稀疏）÷ 2 ÷ 72 卡；' +
        'TDP 官方未公布单卡值，保持 null。' +
        '⚠️ 显存另有两个官方数字：Blackwell Ultra 数据手册 GB300 NVL72 列写 279 GB HBM3E（SKU 实配口径，' +
        '× 72 ≈ 20.1 TB，更贴近产品页的「20 TB」），参考架构 Appendix B Table 10 写 720 GB/托盘（= 180 GB/卡）。' +
        '本项目产能数学取参考架构 Table 1 的 288 GB（本文件母版表），差异见该 Claim 的 note。',
    },
    specs: {
      hbmPerGpuGB: raSpec<number>(
        288,
        'GB',
        'System Hardware & Components Table 1，「NVIDIA B300 GPU, with 1,152 GB aggregated HBM3 memory」（每托盘 4 张，÷4 得单卡值）',
        '⚠️ 官方**三个数字并存**，本项目全部登记、不互相覆盖：' +
          '① 参考架构 Table 1「1,152 GB aggregated HBM3」÷ 4 = **288 GB/卡**（本条取值，也是芯片技术博客的' +
          '架构上限口径「up to 160 SMs and 288GB HBM3E Memory」）；' +
          '② Blackwell Ultra 数据手册第 5 页 GB300 NVL72 列「GPU Memory | Bandwidth 279 GB HBM3E | 8 TB/s」' +
          '（正文亦写「With 279 GB of HBM3E memory per Blackwell Ultra chip」）——这是 GB300 平台的 **SKU 实配**；' +
          '③ 参考架构 Appendix B Table 10 同一配置写「720 GB of aggregated HBM3」= **180 GB/卡**。' +
          '官方对①②的差异自己给了解释：博客图 1 脚注「Available SM count and HBM capacity varies by SKU.」' +
          '——288 是架构上限，279 是本平台 SKU。③ 与前两者差一半，官方无解释，本项目视为该表的残留错误。' +
          '⚠️ 换算参照：产品页整机「20 TB」÷ 72 ≈ 278 GB，更贴近 279；288 × 72 = 20,736 GB ≈ 20.7 TB。' +
          '本条仍取 288 是因为它来自本文件的母版表（参考架构 Table 1，逐托盘部件清单），' +
          '产能数学的 derivation 里已写明来源，报数时请连同 279 一起讲。' +
          '⚠️ 另一处措辞细节：参考架构 Table 1 与 Table 10 写的都是「HBM3」而**不是** HBM3e；' +
          '产品页、数据手册与芯片博客写的是 HBM3E。本项目按后者理解为 HBM3e，但引用参考架构原文时须照抄「HBM3」。',
      ),
      nvlinkPerGpuGBs: raSpec<number>(
        1800,
        'GB/s',
        'NVIDIA NVLink 节，「fifth-generation NVLink, delivering up to 1800 GB/s per GPU – doubling the bandwidth of the previous generation」',
        '★★ **1800 GB/s 是双向合计**，单向是 900 GB/s。同一份参考架构在 Network Logical Architecture 节' +
          '把两个方向都写了出来：「all 72 GPUs are interconnected in a single NVLink domain, allowing them ' +
          'to function as a single multi-GPU unit of compute with a bandwidth of 900GB/s (1800 GB/s ' +
          'bi-directional)」。' +
          `这是全项目最容易引发口径事故的一个数字——${NVLINK_VS_ETHERNET_NOTE}`,
      ),
      nvlinkPerGpuUnidirectionalGBs: raSpec<number>(
        900,
        'GB/s',
        'Network Logical Architecture 节 Enterprise RA Scalable Unit (SU)，「all 72 GPUs are interconnected in a single NVLink domain, allowing them to function as a single multi-GPU unit of compute with a bandwidth of 900GB/s (1800 GB/s bi-directional)」',
        '★ 与上一条 1800 GB/s 是同一件事的两个方向口径：900 单向 / 1800 双向。' +
          '与以太网做对比时**必须**先对齐方向，否则会算出并不存在的「18 倍」。',
      ),
      nvlinkLinksPerGpu: raSpec<number>(
        18,
        '条',
        'NVIDIA NVLink Switch Tray 节，「Each GPU has 18 NVLink Fifth-Generation links, one per in-rack NVSwitch via the copper backplane」',
        '18 条链路恰好对应机架内 9 托盘 × 2 = 18 颗 NVSwitch ASIC，每颗一条——这就是「全互联无阻塞」的物理实现。' +
          '⚠️ 这个 18 与「NVLink 比以太网快几倍」毫无关系，别把两个 18 联想到一起（后者的正确答案是 9 倍）。',
      ),
      denseFp4UpliftVsBlackwell: vendorClaim<number>(
        1.5,
        '倍',
        GB300_PAGE_SOURCE,
        '产品页，「The system delivers 1.5x more dense FP4 Tensor Core FLOPS and 2x higher attention performance compared to NVIDIA Blackwell GPUs.」',
        '★ 官方对比基准是 **NVIDIA Blackwell GPUs**（即 B200 一代），不是 Hopper。稠密口径。',
      ),
      attentionUpliftVsBlackwell: vendorClaim<number>(
        2,
        '倍',
        GB300_PAGE_SOURCE,
        '产品页，「The system delivers 1.5x more dense FP4 Tensor Core FLOPS and 2x higher attention performance compared to NVIDIA Blackwell GPUs.」',
        '与 HGX 平台页规格表的「Attention Performance | 2x」（脚注 3「vs. NVIDIA Blackwell.」）是同一件事。',
      ),
      tdpW: notPublished('W', GB300_PAGE_SOURCE, 'NVIDIA 未在产品页或参考架构中公布 B300 单卡 TDP。'),
      fp4DenseTflopsPerGpu: pageSpec<number>(
        15000,
        'TFLOPS',
        '产品页规格表 FP4 Tensor Core 稠密值 1080 PFLOPS ÷ 72 卡',
        '由官方整机稠密值折算，非官方单卡规格表数字。',
      ),
    },
  },
  {
    id: 'cmp.gb300.grace-cpu',
    kind: 'cpu',
    name: 'NVIDIA Grace CPU',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: 'Arm 架构主机 CPU，负责调度、数据预处理与 I/O，通过 NVLink-C2C 与 GPU 共享内存空间。',
    presalesNote:
      'Grace 的价值不在跑业务逻辑，而在它与 GPU 之间的 NVLink-C2C：CPU 的 LPDDR5 内存对 GPU 来说是「可直接访问的扩展内存池」。整机 17 TB CPU 内存 + 20 TB HBM = 37 TB「快内存」，这是超大 MoE 模型能把冷专家放在 CPU 侧的基础。',
    visual: { shape: 'chip', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE, GB300_PAGE_SOURCE],
    specs: {
      coresPerTray: raSpec<number>(
        72,
        '核',
        'System Hardware & Components Table 1，「NVIDIA Grace Processor, with a total of 72 ARM Neoverse V2 cores」（每托盘 2 颗合计）',
      ),
      lpddr5PerTrayTB: raSpec<number>(
        1,
        'TB',
        'System Hardware & Components Table 1，「1TB aggregated LPDDR5 CPU main memory」（每托盘 2 颗合计）',
      ),
      c2cInterconnect: raSpec<string>(
        'NVLink C2C',
        null,
        'System Hardware & Components Table 1，「connected via NVLink C2C」',
      ),
      tdpW: notPublished('W', RA_SOURCE, '参考架构未公布 Grace CPU 单颗 TDP。'),
    },
  },
  {
    id: 'cmp.gb300.hbm3e',
    kind: 'hbm',
    name: 'HBM3e 高带宽显存堆栈',
    vendor: 'NVIDIA / 存储厂商',
    status: 'shipping',
    summary:
      '与 GPU 芯片封装在一起的 3D 堆叠显存，提供 decode 阶段最稀缺的资源——显存带宽。它同时装着两样东西：常驻的模型权重，以及每个在途请求的 KV Cache。',
    presalesNote:
      '这是整场演示里最该强调的一块：模型权重是**常驻**在 HBM 里的，不随每个请求加载。推理时每生成一个 token 就要把激活权重完整读一遍 HBM，所以 decode 速度基本等于「带宽 ÷ 要读的字节数」。另一半容量归 KV Cache——prefill 算完的 Key/Value 就写在这里，随上下文长度与并发数线性增长，decode 每一步还要把它一起读回来。客户想提升并发，第一优先级往往是显存（容量装得下 KV、带宽读得动权重）而不是算力。',
    visual: { shape: 'chip-stack', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE, GB300_PAGE_SOURCE],
    specs: {
      totalPerRackTB: pageSpec<number>(20, 'TB', '产品页规格表 GPU Memory，「20 TB」'),
      bandwidthPerRackTBs: pageSpec<number>(
        576,
        'TB/s',
        '产品页规格表 GPU Memory | Bandwidth，「Up to 576 TB/s」',
      ),
      stacksPerGpu: notPublished(
        '个',
        GB300_PAGE_SOURCE,
        'NVIDIA 未公布 B300 的 HBM 堆栈数量；3D 场景中围绕芯片摆放的堆栈数为视觉示意，不代表实际封装。',
      ),
    },
  },
  {
    id: 'cmp.gb300.compute-tray',
    kind: 'tray',
    name: 'GB300 NVL 计算托盘',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '机架的计算基本单元：2 颗 Grace CPU + 4 张 B300 GPU + 4 张 ConnectX-8 + 1 张 BlueField-3 + 本地 NVMe，全液冷。',
    presalesNote:
      '这是最容易讲错的一层，务必记准 GB300 的口径：**每托盘 2 CPU + 4 GPU**。' +
      '18 个这样的托盘 × 4 = 72 张卡，就是 NVL72 名字的来源。' +
      '★ 官方给了一句极好记的口诀，Overview 首句就是：**2-4-5-800**' +
      '（2 CPU、4 GPU、5 张网卡 = 4 张 ConnectX-8 + 1 张 BlueField-3、每 GPU 800 Gb/s）。' +
      '这一句最适合和 HGX B300 的 **2-8-9-800** 摆在一起讲两代对照——' +
      '同一套记法，差别一眼可见：GB300 的托盘是 4 卡（NVLink 域在机架上），HGX 的服务器是 8 卡（域到基板为止）。',
    visual: { shape: 'tray-slab', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      nodeArchitectureCode: raSpec<string>(
        '2-4-5-800（dual plane）',
        null,
        'Overview 首句，「The NVIDIA Enterprise RA using 2-4-5-800 (dual plane) node architecture with NVIDIA GB300 NVL72 and NVIDIA Spectrum-X Networking offers a fully integrated, rack-scale solution optimized for the most demanding AI workloads.」',
        '★ 官方对「一个节点长什么样」的四位口诀：2 CPU / 4 GPU / 5 网卡 / 每 GPU 800 Gb/s。' +
          '⚠️ 参考架构只给了这个代号本身，**没有**在同一句里逐位解释；' +
          '四位的拆解依据是同文档的部件表（Table 1：2 Grace + 4 B300 + 2 夹层板 × 2 CX-8 + 1 BF-3）' +
          '与 Compute (Node East/West) Ethernet Networking 节的「Each ConnectX-8 SuperNIC offers up to ' +
          '800 Gb/s」，与 HGX RA 的「2-8-9-800 infrastructure configuration (2 CPUs, 8 GPUs, 9 NICs at ' +
          '800 Gb/s bandwidth per GPU)」逐位对齐——HGX RA 那一处**是**官方逐位写明的，可作交叉印证。',
      ),
      gpusPerTray: raCount(4, 'System Hardware & Components Table 1，「NVIDIA B300 GPU … | 4」'),
      cpusPerTray: raCount(2, 'System Hardware & Components Table 1，「NVIDIA Grace Processor … | 2」'),
      connectx8PerTray: raCount(
        4,
        'System Hardware & Components，「2 Mezzanine Network Boards with 2 ConnectX-8 silicon chips in each, for a total of 4 ConnectX-8 Host Channel Adapters (HCA)」',
      ),
      bluefield3PerTray: raCount(
        1,
        'System Hardware & Components Table 1，「Dual-port QSFP112 NVIDIA BlueField-3 B3240 DPU | 1」',
      ),
      nvlinkScaleUp: raSpec<string>(
        '托盘内每张 GPU 经铜背板与机架内全部 GPU 直连',
        null,
        'System Hardware & Components，「The compute tray is a fully integrated NVLink scale-out architecture, so that each GPU in the entire rack is directly connected to every other GPU via NVLink」',
      ),
      trayPowerW: notPublished('W', RA_SOURCE, '参考架构未公布单托盘功耗，仅给出整机架最高 142 kW。'),
    },
  },
  {
    id: 'cmp.gb300.nvswitch-tray',
    kind: 'tray',
    name: 'NVLink 第五代交换托盘',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '容纳 2 颗 NVSwitch ASIC 的 1U 交换托盘，与另外 8 个同类托盘一起构成机架内的 NVLink 全互联交换层。',
    presalesNote:
      '★ 这里是最容易被写错的高风险事实：**9 个交换托盘，每托盘 2 颗 NVSwitch ASIC，合计 18 颗**。不是 9 颗，也不是 18 个托盘。记住 18 这个数字的意义——每张 GPU 恰好有 18 条 NVLink，每颗 NVSwitch 分一条，这才凑成无阻塞全互联。',
    visual: { shape: 'tray-slab', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      asicsPerTray: raCount(
        2,
        'NVIDIA NVLink Switch Tray 节，「9 NVLink Fifth-Generation switch trays, with 2 NVSwitch ASICs per tray」',
      ),
      traysPerRack: raCount(
        9,
        'System Hardware & Components，「9 NVSwitch trays for full non-blocking P2P connectivity of all 72 Blackwell Ultra GPUs」',
      ),
      networkOs: raSpec<string>(
        'NVOS',
        null,
        'NVIDIA NVLink Switch Tray 节，「The NVLink Switch is a managed switch running the NVOS networking operating system」',
      ),
    },
  },
  {
    id: 'cmp.gb300.nvswitch-asic',
    kind: 'switch',
    name: 'NVSwitch ASIC（第五代）',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: 'NVLink 交换芯片，把来自 72 张 GPU 的链路交叉互连，实现任意两卡间的无阻塞点对点通信。',
    presalesNote:
      '类比一下最好懂：NVSwitch 之于 NVLink，就像以太网交换机之于网线。有了它，72 张卡才是「全连接」而不是「串成一串」。全互联意味着张量并行的 all-reduce 不会因为拓扑而出现慢边。',
    visual: { shape: 'chip', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      aggregateBandwidthPerRackTBs: raSpec<number>(
        130,
        'TB/s',
        'System Hardware & Components，「9 NVSwitch trays … with a total aggregated bandwidth of 130 TB/s」',
      ),
      linksFromEachGpu: raSpec<number>(
        1,
        '条',
        'NVIDIA NVLink Switch Tray 节，「Each GPU has 18 NVLink Fifth-Generation links, one per in-rack NVSwitch」',
        '每张 GPU 对每颗 NVSwitch 各出一条链路。',
      ),
      portCount: notPublished('端口', RA_SOURCE, '参考架构未公布 NVSwitch ASIC 的端口数与单芯片吞吐。'),
    },
  },
  {
    id: 'cmp.gb300.nvlink-backplane',
    kind: 'rack',
    name: 'NVLink 铜背板',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '机架背部的无源铜互连背板，承载计算托盘与 NVSwitch 托盘之间的全部 NVLink 链路。',
    presalesNote:
      '为什么是铜不是光？因为机架内距离够短，铜连接省掉了光模块的功耗和故障率——这在 72 张卡 × 18 条链路的规模下是巨大的可靠性与能耗收益。这也解释了 NVLink 域为什么天然被限制在一个机架内。',
    visual: { shape: 'backplane', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      medium: raSpec<string>(
        '铜背板（copper backplane）',
        null,
        'NVIDIA NVLink Switch Tray 节，「one per in-rack NVSwitch via the copper backplane」',
      ),
      cableCount: notPublished('根', RA_SOURCE, '参考架构未公布背板内铜缆总数与总长度。'),
    },
  },
  {
    id: 'cmp.gb300.sn5610',
    kind: 'switch',
    name: 'NVIDIA Spectrum-X SN5610 以太网交换机',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary:
      '64 端口 800 Gb/s 的 Spectrum-X 交换机，同一型号按接线角色分饰三层：作为 Leaf 交换层承担计算网（East/West）的机架接入，作为 Spine 交换层承担计算网的跨机架主干，作为汇聚交换层则切到完全独立的另一张网——业务与存储（North/South，经 BlueField-3 DPU）。⚠️ 型号有官方两说，见 modelNameConflict。',
    presalesNote:
      '同一款交换机，讲清楚靠这套对照框架：Leaf 管接入——每机架的 CX-8 网卡按 rail 上联到 leaf（同编号网卡接同一台 leaf，即 rail-optimized），是 GPU 跨机架东西向流量的第一跳；Spine 管互联——只连 leaf、不直连服务器，与 leaf 构成两级 fat-tree，把多台机架拼成一个训练/推理集群。「Leaf 管接入，Spine 管互联，它们是同一张计算网的两级」，而「NVLink 负责机架内 72 GPU 一跳互联，leaf/spine 负责机架之间」。汇聚交换层则完全不同：南北向客户请求与存储读写经 BlueField-3 DPU 接入，与计算网物理隔离，避免业务流量抢占东西向带宽——「leaf/spine 是 GPU 之间说话的网，汇聚层是集群对外界与存储说话的网」。' +
      '⚠️ **型号别说死**：同一份参考架构里 SN5600 与 SN5610 两种写法并存（详见 modelNameConflict），' +
      '对客户说「Spectrum-X 交换机，64 × 800G / 等效 128 × 400G 那一档」最安全，具体型号以订单 BOM 为准。' +
      '★ 台数官方是给了的，别说「参考架构没给」：每机架 2 台跑 CPU 与存储、最多 12 台跑双平面 GPU 网；' +
      '按 SU 规模的 leaf/spine 台数见 switchCountBySu。',
    visual: { shape: 'switch-box', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      ports: raSpec<number>(
        64,
        '端口',
        'Networking Hardware，「The NVIDIA SN5610 switch both offer 64 total ports of 800 Gbps to provide connectivity for Compute (East/West), Customer and Storage (North/South), in-band management, and storage in the Enterprise RA.」',
        '⚠️ 同一份文档的 Table 5 与 Appendix Table 11 写的是「SN5600 128-port 400 Gb/s」。' +
          '两种写法的端口总容量相同（128 × 400 = 64 × 800 = 51,200 Gb/s），但**参考架构自己没说它们是同一款**，' +
          '也没给过任何交换芯片代际标注——不要替官方补这句。详见 modelNameConflict。',
      ),
      portSpeedGbs: raSpec<number>(
        800,
        'Gb/s',
        'Networking Hardware，「The NVIDIA SN5610 switch both offer 64 total ports of 800 Gbps」',
        '⚠️ Table 5 / Appendix Table 11 的写法是 400 Gb/s × 128 口。见 modelNameConflict。',
      ),
      sfp28Ports: raSpec<number>(
        2,
        '端口',
        'Networking Hardware，「The NVIDIA SN5610 adds two SFP28 ports and makes switch testing easier since the ports are in pairs.」',
      ),
      roles: raSpec<string>(
        'Compute (East/West)、Customer 与 Storage (North/South)、带内管理与存储',
        null,
        'Networking Hardware，「to provide connectivity for Compute (East/West), Customer and Storage (North/South), in-band management, and storage in the Enterprise RA」',
      ),
      modelNameConflict: raSpec<string>(
        '官方两种写法并存：SN5610（64 × 800 Gbps）/ SN5600（128 端口 400 Gb/s）',
        null,
        'Networking Hardware，「The NVIDIA SN5610 switch both offer 64 total ports of 800 Gbps」；Network Logical Architecture Table 5，「Compute (East/West) Spine-Leaf Fabric | NVIDIA SN5600 128-port 400 Gb/s switches」（Appendix B Table 11 同样写「SN5600 Ethernet switch, compute core fabric」）',
        '★★ 这是参考架构自身的内部矛盾，本项目**两说并存、不做「修正」**（与 HGX RA 的同类处理一致）。' +
          '本项目取 **SN5610** 作组件主值，理由有二：' +
          '① Networking Hardware 是这份文档专门定义网络硬件的一章，SN5610 出现在那里并带完整端口规格；' +
          '② Network Logical Architecture 自己的设计点正文三次描述为「64-port switch design」/' +
          '「non-blocking using 64-port switches」，与 SN5610 的端口数一致、与 Table 5 的「128-port」不一致。' +
          '⚠️ 但要如实告诉读者：**按出现次数 SN5600 更多**（Table 5 两行 + Appendix Table 11 两行），' +
          '所以对外只说端口档位、不说死型号。',
      ),
      switchesPerRack: raSpec<string>(
        '每机架 2 台（CPU 与存储）+ 最多 12 台（双平面 GPU 网）',
        null,
        'Network Logical Architecture 节 2 Racks, 36 Trays with 144 Blackwell Ultra GPUs，「Each rack requires 2x SN5600 switches for CPU and storage connectivity and up to 12x SN5600 switches for the dual-plane GPU network」',
        '★ 参考架构**是**给了每机架台数的（此前本项目误记为「未公布」）。' +
          '注意官方在这句里用的型号写法是 SN5600，见 modelNameConflict。' +
          '「up to 12」是上限措辞，实际台数随 SU 规模与端口填充率变化——按 SU 的口径见 switchCountBySu。',
      ),
      switchCountBySu: raSpec<string>(
        '计算网（双平面合计）2 SU：8 leaf + 4 spine；4 SU：16 + 8；8 SU：32 + 12。汇聚网 2 SU：2 leaf（无 spine）；4 SU：4 + 2；8 SU：7 + 4',
        null,
        'Network Logical Architecture 节 Table 6（Nodes 36/72/144 行「Leaf | 8 / 16 / 32」「Spine | 4 / 8 / 12」）与 Table 7（Nodes 36/72/144 行「Leaf | 2 / 4 / 7」「Spine | N/A / 2 / 4」）',
        '★ Table 6/7 的「Nodes」是**托盘数**（36 / 72 / 144），对应 2 / 4 / 8 个 SU（机架），' +
          '即 144 / 288 / 576 张 GPU。' +
          '⚠️ Appendix B Table 11 是另一套按 1~8 SU 逐列的口径：compute core fabric 12/12/24/24/32/32/44/44、' +
          'converged core fabric 2/2/5/6/9/10/11/11——与 Table 6/7 **不是同一个切分**（Table 11 含核心层，' +
          '且逐 SU 给值），两表并存，本项目两处都登记不互推。',
      ),
    },
  },
  {
    id: 'cmp.gb300.mezzanine-board',
    kind: 'nic',
    name: 'ConnectX-8 夹层网卡板（Mezzanine Board）',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '承载 2 颗 ConnectX-8 芯片的夹层板，每颗 Grace CPU 配一块，保证 CPU 与网络出口的均衡。',
    presalesNote:
      '夹层卡而不是标准 PCIe 插卡，是高密托盘的必然选择：省空间、走液冷、免线缆。客户如果问「网卡能不能换成别家的」，答案通常是不能——它是托盘基板设计的一部分。',
    visual: { shape: 'nic-card', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      boardsPerTray: raCount(
        2,
        'System Hardware & Components Table 1，「NVIDIA ConnectX-8 Mezzanine Boards, with 2 ConnectX-8 network adapters each | 2」',
      ),
      nicsPerBoard: raCount(
        2,
        'System Hardware & Components Table 1，「with 2 ConnectX-8 network adapters each」',
      ),
      cpuPairing: raSpec<string>(
        '每颗 Grace CPU 配一块夹层板',
        null,
        'System Hardware & Components，「each CPU is paired with a NVIDIA ConnectX-8 Mezzanine Board」',
      ),
    },
  },
  {
    id: 'cmp.gb300.connectx-8',
    kind: 'nic',
    name: 'NVIDIA ConnectX-8 SuperNIC',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '800 Gb/s 双端口 SuperNIC，负责跨机架的 GPU-to-GPU（East/West）RDMA 通信。',
    presalesNote:
      '★ 代际口径务必说准：GB300 配的是 **ConnectX-8**（不是上一代的 CX-7）。关键设计是 **1:1 GPU:NIC** ——每张 GPU 独占一张 800 Gb/s 网卡，跨机架集合通信不会在网卡侧先堵住。',
    visual: { shape: 'nic-card', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      bandwidthGbs: raSpec<number>(
        800,
        'Gb/s',
        'Compute (Node East/West) Ethernet Networking，「Each ConnectX-8 SuperNIC offers up to 800 Gb/s」',
      ),
      gpuToNicRatio: raSpec<string>(
        '1:1',
        null,
        'Compute (Node East/West) Ethernet Networking，「maintaining a 1:1 GPU-to-NIC ratio」',
      ),
      nicsPerTray: raCount(
        4,
        'Compute (Node East/West) Ethernet Networking，「Each tray within the GB300 NVL72 rack has four dual-port ConnectX-8 SuperNICs」',
      ),
      dualPlaneSplit: raSpec<string>(
        '800 Gb/s 拆成 2×400 Gb/s，两个接口分别连到不同 leaf 交换机',
        null,
        'Networking Physical Topologies 节 Dual Plane Topology，「With each GPU generating 800 Gb/s bandwidth through the ConnectX-8 SuperNICs, dual plane topology involves breaking the interface to 2x400 Gb/s interfaces.」＋「Every such interface is then connected to a different leaf switch, and every such leaf switch is part of an independent fabric that scales to 1024 interfaces of 400 Gb/s as part of this reference architecture.」',
        '⚠️ locator 是原文**两句相邻的完整句**，用「＋」分隔——不要把它们合并改写成一句。',
      ),
      trayAggregateBandwidthGbs: raSpec<number>(
        3200,
        'Gb/s',
        'Network Logical Architecture 节 Enterprise RA Scalable Unit (SU)，「For the Compute (East/West) fabric: 18 trays, each with 4 x single-port NVIDIA ConnectX-8 NICs and a total aggregate bandwidth of 3200 Gb/s」',
        '★★ 这才是 **GB300 计算托盘**的官方计算网聚合带宽：3200 Gb/s = 400 GB/s ' +
          '（4 张 GPU × 800 Gb/s，或 8 个 400 Gb/s breakout 接口）。' +
          '⚠️ 别把它和下面 recommendedComputeBandwidthGBs 的 800 GB/s 搞混——那一行是 **8 GPU 节点**的口径。' +
          '⚠️ 同一句里的「4 x single-port」与 Compute (Node East/West) Ethernet Networking 节的' +
          '「Each tray within the GB300 NVL72 rack has four dual-port ConnectX-8 SuperNICs」' +
          '及 Table 5 的「Four NVIDIA ConnectX-8 SuperNICs dual-port 800 Gb/s. The adapters operate at ' +
          '2x400 Gb/s per port」措辞不同（单口 vs 双口 2×400 breakout），但 4 × 800 Gb/s = 3200 Gb/s ' +
          '这个总量三处一致——差别只在「一张卡算 1 个 800G 口还是 2 个 400G 口」。',
      ),
      minComputeBandwidthGBs: raSpec<number>(
        400,
        'GB/s',
        'Compute (Node East/West) Ethernet Networking，「Total Minimum Compute Network Bandwidth」＋「400 GB/s (8x 400 Gb/s Ethernet NICs)」',
        'GB300 计算托盘（4 GPU × 2×400 Gb/s breakout = 8 个 400 Gb/s 接口 = 3200 Gb/s）恰好落在这一档。',
      ),
      recommendedComputeBandwidthGBs: raSpec<number>(
        800,
        'GB/s',
        'Compute (Node East/West) Ethernet Networking，「Total Recommended Compute Network Bandwidth」＋「800 GB/s (16x 400 Gb/s Ethernet NICs using breakout)」',
        '⚠️★ **这不是 GB300 计算托盘的值**（此前本项目误记为「每节点（托盘）的推荐计算网总带宽」）。' +
          '两条理由：① 这张表的引导句写的是「Multi-node deployments with an NVIDIA B300 platform should ' +
          'adhere to the following total compute network bandwidth **per GPU** recommendations:」——官方标题' +
          '说的是 per GPU；② 16 × 400 Gb/s = 6400 Gb/s = 800 GB/s 对应的是 **8 GPU 节点**' +
          '（正是 HGX B300 的 2-8-9-800 口径），而 GB300 的计算托盘只有 4 张 GPU、官方给的聚合值是 ' +
          '3200 Gb/s = 400 GB/s（见 trayAggregateBandwidthGbs）。' +
          '★ 也就是说这一段官方原文**自身口径不闭合**：标题写 per GPU，数值给的却是节点合计。' +
          '按 per GPU 读，正确的说法是「每 GPU 推荐 800 Gb/s」（与「Each ConnectX-8 SuperNIC offers up to ' +
          '800 Gb/s」+ 1:1 GPU:NIC 一致）；按节点合计读，800 GB/s 只适用于 8 卡节点。' +
          '本项目原样登记官方那一行、不改数字，但引用时必须带上这条口径说明。',
      ),
    },
  },
  {
    id: 'cmp.gb300.bluefield-3',
    kind: 'dpu',
    name: 'NVIDIA BlueField-3 B3240 DPU',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '双端口数据处理单元，接管 North/South 的存储与带内管理流量，并作为零信任安全边界独立于主机运行。',
    presalesNote:
      '★ 代际口径务必说准：GB300 配的是 **BlueField-3**（不是 BF-2）。它的价值讲三点：一是把存储访问卸载掉，GPU 不用等 CPU 搬数据；二是 SNAP 让远端存储看起来像本地盘；三是它独立于主机运行，主机被攻破也不影响管理面——多租户 GPU 云必备。',
    visual: { shape: 'nic-card', colorToken: 'plane-business' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      aggregateBandwidthGbs: raSpec<number>(
        480,
        'Gb/s',
        'Converged (Node North/South) Ethernet Networking，「can handle an aggregate bandwidth of approximately 480 Gb/s」',
        '⚠️ 官方对「这张卡到底多少带宽」有**三个并存的写法**，讲的时候别让客户自己去相加：' +
          '① 本条 480 Gb/s——卡的实际聚合能力上限，措辞是「approximately」' +
          '（Networking Hardware 节说得更明白：「Even though the B3240 DPU supports 400Gb/s per port, ' +
          'the card only supports an aggregate bandwidth across both its ports of approximately 480Gb/s.」）；' +
          '② 端口标称 2 × 400 Gb/s——Network Logical Architecture 的 SU 一节据此写「18 trays, each with ' +
          '1x B3240 DPU providing 2x 400Gb/s connections and a total aggregate bandwidth of 800 Gb/s」，' +
          '这里的 800 Gb/s 是**端口标称相加**，不是卡的实际吞吐；' +
          '③ Appendix B Table 10 写「1x Dual-port QSFP112 NVIDIA BlueField-3 DPU operating at 400 GB/s」' +
          '（单位 GB/s 疑为 Gb/s 笔误）。' +
          '★ 售前口径：**按 480 Gb/s 算容量、按双 400 Gb/s 讲连线**，不要说「每托盘 800 Gb/s 南北向带宽」。',
      ),
      portType: raSpec<string>(
        'Dual-port QSFP112',
        null,
        'System Hardware & Components Table 1，「Dual-port QSFP112 NVIDIA BlueField-3 B3240 DPU」',
      ),
      operatingMode: raSpec<string>(
        'Embedded Function (ECPF) / DPU 模式',
        null,
        'Converged (Node North/South) Ethernet Networking，「the Embedded Function (ECPF) or DPU mode used in this Enterprise RA」',
      ),
      oobPortGbs: raSpec<number>(
        1,
        'Gb/s',
        'Converged (Node North/South) Ethernet Networking，「a 1Gb/s out-of-band management port」',
        'BlueField 板载 BMC 的带外管理口。',
      ),
    },
  },
  {
    id: 'cmp.gb300.m2-nvme',
    kind: 'storage',
    name: 'M.2 NVMe 系统盘',
    vendor: 'OEM',
    status: 'shipping',
    summary: '每个计算托盘一块，用于安装操作系统。',
    presalesNote:
      '不起眼但别漏讲：计算托盘是有本地操作系统盘的，不是无盘启动。做集群运维方案时，OS 盘的镜像分发与固件版本一致性是实际工作量所在。',
    visual: { shape: 'ssd-stick', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      capacityTB: raSpec<number>(
        2,
        'TB',
        'Appendix B Table 10，「1 x 2 TB Gen4 M.2 for OS SSD」',
      ),
      countPerTray: raCount(
        1,
        'System Hardware & Components，「Each tray also includes 1 M.2 NVMe device for Operating System (OS) storage」',
      ),
      interface: raSpec<string>('PCIe Gen4 M.2', null, 'Appendix B Table 10，「1 x 2 TB Gen4 M.2 for OS SSD」'),
    },
  },
  {
    id: 'cmp.gb300.e1s-nvme',
    kind: 'storage',
    name: 'E1.S NVMe 本地缓存盘',
    vendor: 'OEM',
    status: 'shipping',
    summary: '托盘内的高速本地暂存盘，典型用途是数据集与检查点的本地缓存层。',
    presalesNote:
      '本地缓存是「让 GPU 有饭吃」的最后一道保险：热数据落在托盘里，不必每次都去外部存储拉。客户做数据流水线设计时，这一层的容量规划直接影响 GPU 利用率。',
    visual: { shape: 'ssd-stick', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      countPerTray: raCount(
        4,
        'System Hardware & Components，「Each tray also includes … 4 E1.S NVMe storage devices typically used as a fast, local cache」',
        '⚠️ 官方文档内部冲突：Appendix B Table 10 写作「8 x 4 TB E1.S for Data Cache SSD」。本项目取正文的 4，两处均已记录以便回查。',
      ),
      capacityPerDriveTB: raSpec<number>(
        4,
        'TB',
        'Appendix B Table 10，「8 x 4 TB E1.S for Data Cache SSD」',
        '容量取自 Table 10；同表的数量（8）与正文（4）冲突，见 countPerTray 的备注。',
      ),
    },
  },
  {
    id: 'cmp.gb300.power-shelf',
    kind: 'power',
    name: '电源架（Power Shelf）',
    vendor: 'NVIDIA / OEM',
    status: 'shipping',
    summary: '每架 33 kW、内含 6 个 5.5 kW 电源模块，把机房交流电整流成直流后送上母排。',
    presalesNote:
      '算一笔账客户就懂了：8 架 × 33 kW = 264 kW 的供电能力，服务的是最高 142 kW 的机架负载，' +
      '**容量余量约 1.86 倍**。高密机架的供电设计不是「够用就行」，而是要撑住 AI 负载剧烈的功率波动。' +
      '⚠️ 但**不要把它说成 2N**：264/142 是容量余量，2N 说的是供电路径级的冗余架构，两回事；' +
      '参考架构自始至终没有声明冗余模式（N+1 / 2N）与掉电保持策略，' +
      '真要谈冗余等级，得看 OEM 整机与客户机房的配电设计。',
    visual: { shape: 'psu-brick', colorToken: 'plane-power' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      shelvesPerRack: raCount(
        8,
        'System Hardware & Components，「8 power shelves of 33 kW, with each shelf having six 5.5 kW PSUs」',
      ),
      shelfPowerKW: raSpec<number>(
        33,
        'kW',
        'System Hardware & Components，「8 power shelves of 33 kW」',
      ),
      psusPerShelf: raCount(
        6,
        'System Hardware & Components，「each shelf having six 5.5 kW PSUs」',
      ),
      psuPowerKW: raSpec<number>(5.5, 'kW', 'System Hardware & Components，「six 5.5 kW PSUs」'),
      redundancyMode: notPublished('', RA_SOURCE, '参考架构未声明冗余模式（N+1 / 2N）与掉电保持策略。'),
    },
  },
  {
    id: 'cmp.gb300.mgmt-node',
    kind: 'tray',
    name: '控制面管理节点',
    vendor: 'OEM（x86 或 Grace 两种配置）',
    status: 'shipping',
    summary: '运行集群编排、调度与监控软件栈的管理服务器，参考架构按 12 台做高可用配置。',
    presalesNote:
      '客户常忽略这块预算：72 卡机架再多，也得有一组管理节点跑 Slurm/K8s、监控与镜像仓库。参考架构给的是 12 台 HA 配置，x86 与 Grace 两种都行——这是方案报价里必须单列的一项。',
    visual: { shape: 'tray-slab', colorToken: 'plane-mgmt' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      nodeCount: raCount(
        12,
        'Control Plane/Management Nodes，「we assume a control plane composed of 12 management nodes」',
      ),
      x86Memory: raSpec<string>(
        '512 GB（8×DDR5 64GB）',
        null,
        'Table 2: Management Node Components (x86 control node)，System Memory',
      ),
      armMemory: raSpec<string>(
        '480 GB LPDDR5X（板载）',
        null,
        'Table 3: Management Node Components (ARM control node)，System Memory',
      ),
      nics: raSpec<string>(
        '4× ConnectX-7 200G 单端口',
        null,
        'Table 2，Storage/in-band Network Adapter，「4x ConnectX-7 200G single-port」',
        '注意：管理节点用的是 ConnectX-7，与计算托盘的 ConnectX-8 不是同一代——这是两类节点定位不同所致。',
      ),
    },
  },
]

// ─────────────────────────── 装配树 ───────────────────────────

/**
 * ⚠️ 所有 `rackU` 均为 3D 摆位用的**示意占位**：NVIDIA 未公布 GB300 NVL72 的逐 U 布局。
 * 它们只保证「同层兄弟互不重叠且不超过 rackUnitsForLayout」，不代表真实机架立面。
 */
const RACK_U_PLACEHOLDER = '机架内 U 位为 3D 摆位示意占位，官方未公布逐 U 布局。'

/**
 * ⚠️★ 液冷链路的溯源边界（G5）。
 *
 * 对 GB300 NVL72 参考架构全部页面做过全文检索：`CDU` / `manifold` / `cold plate` /
 * `coolant` / `quick disconnect` 五个词的**命中数均为 0**。RA 关于液冷只有两句：
 *   - “To accommodate the massive compute power within a limited space, the GB300 NVL72 rack is
 *     liquid cooled, based on the MGX architecture.”
 *   - “Integrated tray-level and rack-level liquid leakage detection”
 *
 * 因此：机架**是**液冷的（有官方出处，见 cmp.shared.oberon-rack.specs.liquidCooled），
 * 但「冷板 → 歧管 → CDU → 一次侧水」这条二次侧回路的**结构与部件**是本项目按通用液冷工程
 * 做的建模，RA 没有描述。这些节点/连接仍挂 RA 源（它是「机架为液冷」这一前提的出处），
 * 但每一处都必须带上本条说明，不得让读者以为部件细节也是官方写过的。
 */
const COOLING_MODEL_NOTE =
  '⚠️ 通用液冷工程建模，非参考架构原文：RA 全篇只写了「the GB300 NVL72 rack is liquid cooled, ' +
  'based on the MGX architecture」与「Integrated tray-level and rack-level liquid leakage detection」，' +
  'CDU / manifold / cold plate / coolant / quick disconnect 五个词一次都没出现。'

export const GB300_ASSEMBLIES: AssemblyNode[] = [
  // ── cluster 层 ──
  {
    id: 'asm.gb300.facility',
    systemId: SYSTEM_ID,
    parentId: null,
    componentId: 'cmp.shared.facility-room',
    roleKey: 'facility',
    label: '机房',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '装配树根节点。',
  },
  {
    id: 'asm.gb300.facility-water',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.shared.facility-water-loop',
    roleKey: 'facility-water-loop',
    label: '机房一次侧冷却水回路',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: null,
  },
  {
    // v1.1 A3：`con.*.facility-power-shelf` 原本从**装配树根**（机房）出发，而 ClusterScene
    // 只画 `childrenOf(root)`，根节点自己从不渲染 —— 那条线于是从空气里长出来。
    // 补上一个真实存在的「机房配电」盒子，线才有出发点。
    id: 'asm.gb300.facility-power',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.shared.facility-power',
    roleKey: 'facility-power',
    label: '机房配电（列头柜 / 母线）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '参考架构不涉及机房侧配电设备，数量与形态为示意（每列 1 套列头柜 + 母线）。',
  },
  {
    id: 'asm.gb300.cdu',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.shared.cdu',
    roleKey: 'cdu',
    label: 'CDU 冷量分配单元',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: `参考架构未指定 CDU 数量与型号，此处按每部署 1 台示意。${COOLING_MODEL_NOTE}`,
  },
  {
    id: 'asm.gb300.scaleout-spine',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.gb300.sn5610',
    roleKey: 'scaleout-spine',
    label: 'Spine 交换层（计算网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '★ 3D 里画 1 个盒子只是**代表这一层**，不是台数。官方给了台数：Table 6 的双平面合计 spine ' +
      '为 2 SU → 4 台、4 SU → 8 台、8 SU → 12 台（见 cmp.gb300.sn5610.specs.switchCountBySu）。' +
      '因为 `countClaim.value` 必须等于 `count`（pack.test 强制），此处不填 countClaim，' +
      '把官方台数放在组件规格里，避免 3D 摆位需求污染证据层。',
  },
  {
    id: 'asm.gb300.scaleout-leaf',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.gb300.sn5610',
    roleKey: 'scaleout-leaf',
    label: 'Leaf 交换层（计算网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '双平面设计下每张 GPU 的 2×400 Gb/s 接口分别连到不同 leaf。' +
      '★ 3D 里画 1 个盒子只是代表这一层：官方 Table 6 的双平面合计 leaf 为 2 SU → 8 台、' +
      '4 SU → 16 台、8 SU → 32 台，另有「Each rack requires ... up to 12x SN5600 switches for the ' +
      'dual-plane GPU network」的每机架口径（见 cmp.gb300.sn5610）。',
  },
  {
    id: 'asm.gb300.converged-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.gb300.sn5610',
    roleKey: 'converged-switch',
    label: '汇聚交换层（业务与存储网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '承载 North/South 客户业务、存储与带内管理流量。' +
      '★ 3D 里画 1 个盒子只是代表这一层：官方 Table 7 给的汇聚网台数为 2 SU → 2 台 leaf（无 spine）、' +
      '4 SU → 4 + 2、8 SU → 7 + 4，另有每机架「2x SN5600 switches for CPU and storage connectivity」。',
  },
  {
    id: 'asm.gb300.oob-fabric-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'oob-mgmt-switch',
    label: '带外管理汇聚交换机',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '机架外的 SN2201 使用交流供电（机架内的走母排直流）。',
  },
  {
    id: 'asm.gb300.mgmt-node',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.gb300.mgmt-node',
    roleKey: 'control-plane-node',
    label: '控制面管理节点',
    count: 12,
    countClaim: raCount(
      12,
      'Control Plane/Management Nodes，「we assume a control plane composed of 12 management nodes」',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.gb300.storage',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.shared.storage-array',
    roleKey: 'external-storage',
    label: '外部存储集群',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '参考架构不指定存储厂商与规模。',
  },
  {
    id: 'asm.gb300.row',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.facility',
    componentId: 'cmp.shared.rack-row',
    roleKey: 'rack-row',
    label: '机架列',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.gb300.rack',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.row',
    componentId: 'cmp.shared.oberon-rack',
    roleKey: 'rack',
    label: 'GB300 NVL72 机架（1 SU）',
    count: 8,
    countClaim: raCount(
      8,
      'Overview，「A fully tested system scales up to 8 SUs (Scalable Units)」',
      '一个 SU = 一个 NVL72 机架；8 是官方完整验证的规模上限。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note: null,
  },

  // ── rack 层 ──
  {
    id: 'asm.gb300.inrack-mgmt-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'inrack-mgmt-switch',
    label: '机架内管理交换机',
    count: 2,
    countClaim: raCount(
      2,
      'System Hardware & Components，「2 SN2201 OOB switches for integrated management access of rack components」',
    ),
    lodLevel: 'rack',
    rackU: { start: 1, height: 2 },
    note: RACK_U_PLACEHOLDER,
  },
  {
    id: 'asm.gb300.power-shelf',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.gb300.power-shelf',
    roleKey: 'power-shelf',
    label: '电源架',
    count: 8,
    countClaim: raCount(8, 'System Hardware & Components，「8 power shelves of 33 kW」'),
    lodLevel: 'rack',
    rackU: { start: 3, height: 8 },
    note: RACK_U_PLACEHOLDER,
  },
  {
    id: 'asm.gb300.compute-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.gb300.compute-tray',
    roleKey: 'compute-tray',
    label: '计算托盘',
    count: 18,
    countClaim: raCount(
      18,
      'Overview，「18 compute trays connected via the fifth generation of NVLink」',
    ),
    lodLevel: 'rack',
    rackU: { start: 11, height: 18 },
    note: RACK_U_PLACEHOLDER,
  },
  {
    id: 'asm.gb300.nvswitch-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.gb300.nvswitch-tray',
    roleKey: 'nvswitch-tray',
    label: 'NVLink 交换托盘',
    count: 9,
    countClaim: raCount(
      9,
      'System Hardware & Components，「9 NVSwitch trays for full non-blocking P2P connectivity of all 72 Blackwell Ultra GPUs」',
    ),
    lodLevel: 'rack',
    rackU: { start: 29, height: 9 },
    note: RACK_U_PLACEHOLDER,
  },
  {
    id: 'asm.gb300.busbar',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.shared.busbar',
    roleKey: 'dc-busbar',
    label: '直流母排',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '纵向贯穿机架背部，不占用 U 位。',
  },
  {
    id: 'asm.gb300.manifold',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.shared.manifold',
    roleKey: 'liquid-manifold',
    label: '分液歧管',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: `纵向贯穿机架，不占用 U 位。${COOLING_MODEL_NOTE}`,
  },
  {
    id: 'asm.gb300.nvlink-backplane',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.rack',
    componentId: 'cmp.gb300.nvlink-backplane',
    roleKey: 'nvlink-backplane',
    label: 'NVLink 铜背板',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '位于机架背部，不占用 U 位。',
  },

  // ── tray / board 层 ──
  {
    id: 'asm.gb300.tray-cold-plate',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.shared.cold-plate',
    roleKey: 'cold-plate',
    label: '计算托盘冷板',
    count: 1,
    countClaim: null,
    lodLevel: 'tray',
    rackU: null,
    note: `按托盘内一套冷板回路建模；官方未公布逐器件冷板数量。${COOLING_MODEL_NOTE}`,
  },
  {
    id: 'asm.gb300.grace-cpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.gb300.grace-cpu',
    roleKey: 'host-cpu',
    label: 'Grace CPU',
    count: 2,
    countClaim: raCount(2, 'System Hardware & Components Table 1，「NVIDIA Grace Processor … | 2」'),
    lodLevel: 'board',
    rackU: null,
    note: '18 托盘 × 2 = 全机架 36 颗，与 Overview 口径一致。',
  },
  {
    id: 'asm.gb300.b300-gpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.gb300.b300-gpu',
    roleKey: 'accelerator',
    label: 'B300 GPU',
    count: 4,
    countClaim: raCount(4, 'System Hardware & Components Table 1，「NVIDIA B300 GPU … | 4」'),
    lodLevel: 'board',
    rackU: null,
    note: '18 托盘 × 4 = 全机架 72 张，即 NVL72 之名的由来。',
  },
  {
    id: 'asm.gb300.hbm',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.b300-gpu',
    componentId: 'cmp.gb300.hbm3e',
    roleKey: 'gpu-hbm',
    label: 'HBM3e 显存堆栈',
    count: 8,
    countClaim: null,
    lodLevel: 'board',
    rackU: null,
    note: '⚠️ 堆栈数量 8 为 3D 视觉示意，NVIDIA 未公布 B300 的 HBM 堆栈数；官方公布的是单卡 288 GB 这一容量口径。',
  },
  {
    id: 'asm.gb300.mezz-board',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.gb300.mezzanine-board',
    roleKey: 'nic-mezzanine',
    label: 'ConnectX-8 夹层板',
    count: 2,
    countClaim: raCount(
      2,
      'System Hardware & Components Table 1，「NVIDIA ConnectX-8 Mezzanine Boards … | 2」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.gb300.cx8-nic',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.mezz-board',
    componentId: 'cmp.gb300.connectx-8',
    roleKey: 'scaleout-nic',
    label: 'ConnectX-8 SuperNIC',
    count: 2,
    countClaim: raCount(
      2,
      'System Hardware & Components Table 1，「NVIDIA ConnectX-8 Mezzanine Boards, with 2 ConnectX-8 network adapters each」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '2 块夹层板 × 2 = 每托盘 4 张，与官方「for a total of 4 ConnectX-8 HCA」一致；全机架 72 张，对应 1:1 GPU:NIC。',
  },
  {
    id: 'asm.gb300.bf3-dpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.gb300.bluefield-3',
    roleKey: 'north-south-dpu',
    label: 'BlueField-3 DPU',
    count: 1,
    countClaim: raCount(
      1,
      'System Hardware & Components Table 1，「Dual-port QSFP112 NVIDIA BlueField-3 B3240 DPU | 1」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.gb300.os-nvme',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.gb300.m2-nvme',
    roleKey: 'os-storage',
    label: 'M.2 系统盘',
    count: 1,
    countClaim: raCount(
      1,
      'System Hardware & Components，「Each tray also includes 1 M.2 NVMe device for Operating System (OS) storage」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.gb300.cache-nvme',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.compute-tray',
    componentId: 'cmp.gb300.e1s-nvme',
    roleKey: 'cache-storage',
    label: 'E1.S 缓存盘',
    count: 4,
    countClaim: raCount(
      4,
      'System Hardware & Components，「4 E1.S NVMe storage devices typically used as a fast, local cache」',
      '⚠️ 与 Appendix B Table 10 的「8 x 4 TB E1.S」冲突，本项目取正文值 4。',
    ),
    lodLevel: 'board',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.gb300.nvswitch-asic',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.nvswitch-tray',
    componentId: 'cmp.gb300.nvswitch-asic',
    roleKey: 'nvswitch-asic',
    label: 'NVSwitch ASIC',
    count: 2,
    countClaim: raCount(
      2,
      'NVIDIA NVLink Switch Tray 节，「9 NVLink Fifth-Generation switch trays, with 2 NVSwitch ASICs per tray」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '★ 高风险事实：9 托盘 × 2 ASIC = 18 颗，恰好对应每张 GPU 的 18 条 NVLink。',
  },
  {
    id: 'asm.gb300.nvswitch-cold-plate',
    systemId: SYSTEM_ID,
    parentId: 'asm.gb300.nvswitch-tray',
    componentId: 'cmp.shared.cold-plate',
    roleKey: 'nvswitch-cold-plate',
    label: '交换托盘冷板',
    count: 1,
    countClaim: null,
    lodLevel: 'tray',
    rackU: null,
    note: COOLING_MODEL_NOTE,
  },
]

// ─────────────────────────── 连接（按类型，不按实例） ───────────────────────────

export const GB300_CONNECTIONS: Connection[] = [
  // ── nvlink 平面（scale-up，机架内） ──
  {
    id: 'con.gb300.gpu-nvswitch',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.b300-gpu',
    toAssemblyId: 'asm.gb300.nvswitch-asic',
    plane: 'nvlink',
    topology: 'all-to-all',
    medium: 'copper-backplane',
    protocol: 'NVLink 第五代',
    bandwidth: raSpec<number>(
      1800,
      'GB/s',
      'NVIDIA NVLink 节，「delivering up to 1800 GB/s per GPU」',
    ),
    direction: 'bidirectional',
    label: 'GPU ↔ NVSwitch 全互联',
    summary:
      '每张 GPU 引出 18 条 NVLink，机架内 18 颗 NVSwitch ASIC 各接一条，从而 72 张卡两两之间都有无阻塞直连路径。这一条边代表的是 72×18 的完整链路集合。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.nvswitch-backplane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.nvswitch-asic',
    toAssemblyId: 'asm.gb300.nvlink-backplane',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'copper-backplane',
    protocol: 'NVLink 第五代',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NVSwitch → 铜背板',
    summary: 'NVSwitch ASIC 的链路全部落在机架背部的无源铜背板上，无需光模块。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.tray-backplane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.compute-tray',
    toAssemblyId: 'asm.gb300.nvlink-backplane',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'copper-backplane',
    protocol: 'NVLink 第五代',
    bandwidth: null,
    direction: 'bidirectional',
    label: '计算托盘 → 铜背板',
    summary: '计算托盘像插卡一样推入机架并盲插到铜背板，这是「免线缆」高密设计的关键。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.grace-gpu-c2c',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.grace-cpu',
    toAssemblyId: 'asm.gb300.b300-gpu',
    plane: 'nvlink',
    topology: 'point-to-point',
    medium: 'pcb-trace',
    protocol: 'NVLink-C2C',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'Grace ↔ B300（C2C）',
    summary:
      'CPU 与 GPU 之间不是走 PCIe 而是 NVLink-C2C，因此 CPU 侧的 LPDDR5 对 GPU 是一致可寻址的扩展内存——「37 TB 快内存」由此而来。参考架构未公布 C2C 带宽数值。',
    sourceIds: [RA_SOURCE],
  },

  // ── scaleout 平面（East/West 计算网，跨机架） ──
  {
    id: 'con.gb300.gpu-cx8',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.b300-gpu',
    toAssemblyId: 'asm.gb300.cx8-nic',
    plane: 'scaleout',
    topology: 'point-to-point',
    medium: 'pcb-trace',
    protocol: 'GPUDirect RDMA',
    bandwidth: raSpec<number>(
      800,
      'Gb/s',
      'Compute (Node East/West) Ethernet Networking，「Each ConnectX-8 SuperNIC offers up to 800 Gb/s」',
    ),
    direction: 'bidirectional',
    label: 'GPU ↔ ConnectX-8（1:1）',
    summary: '每张 GPU 独占一张 800 Gb/s SuperNIC，官方明确的 1:1 GPU:NIC 比例保证跨机架通信不在网卡侧收敛。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.cx8-mezz',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.cx8-nic',
    toAssemblyId: 'asm.gb300.mezz-board',
    plane: 'scaleout',
    topology: 'point-to-point',
    medium: 'pcb-trace',
    protocol: '夹层板板级互连',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'ConnectX-8 → 夹层板',
    summary: '2 颗 ConnectX-8 芯片焊在一块夹层板上，每颗 Grace CPU 配一块。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.cx8-leaf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.cx8-nic',
    toAssemblyId: 'asm.gb300.scaleout-leaf',
    plane: 'scaleout',
    topology: 'rail-optimized',
    medium: 'optical-fiber',
    protocol: 'Ethernet RoCE（Spectrum-X）',
    bandwidth: raSpec<number>(
      400,
      'Gb/s',
      'Networking Physical Topologies 节 Dual Plane Topology，「With each GPU generating 800 Gb/s bandwidth through the ConnectX-8 SuperNICs, dual plane topology involves breaking the interface to 2x400 Gb/s interfaces.」＋「Every such interface is then connected to a different leaf switch, and every such leaf switch is part of an independent fabric that scales to 1024 interfaces of 400 Gb/s as part of this reference architecture.」',
      '每个接口 400 Gb/s，两个接口分属两个平面。⚠️ locator 是原文两句相邻完整句，不要合并改写。',
    ),
    direction: 'bidirectional',
    label: 'ConnectX-8 → Leaf（双平面 rail-optimized）',
    summary:
      '每张网卡的 800 Gb/s 拆成 2×400 Gb/s，分别接到两个独立平面的不同 leaf 交换机；' +
      '每个平面可扩展到 1024 个 400 Gb/s 接口。' +
      '⚠️ 双平面的负载均衡与故障切换由谁做，官方**同一页里有两说**：' +
      'Dual Plane Topology 节写「Tracking of each plane, load balancing, and failure handling is handled ' +
      'by the ConnectX-8 SuperNIC on the hardware level」（网卡硬件），' +
      'Multi-Plane Topology Approach 节写「the resiliency and the load balancing between the two planes ' +
      'is handled by the NCCL on the host」（主机上的 NCCL）。两说并存，不要单向断言。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.leaf-spine',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.scaleout-leaf',
    toAssemblyId: 'asm.gb300.scaleout-spine',
    plane: 'scaleout',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: 'Ethernet RoCE（Spectrum-X）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'Leaf ↔ Spine',
    summary: '计算网采用完全无阻塞的胖树（leaf-spine）拓扑，保证任意两个机架间带宽不收敛。',
    sourceIds: [RA_SOURCE],
  },

  // ── business 平面（North/South 业务与存储） ──
  {
    id: 'con.gb300.bf3-converged',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.bf3-dpu',
    toAssemblyId: 'asm.gb300.converged-switch',
    plane: 'business',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'Ethernet（North/South）',
    bandwidth: raSpec<number>(
      400,
      'Gb/s',
      'Networking Physical Topologies 节 CPU Converged (Node North/South) Network，「Each compute tray connects to two separate switches using dual 400 Gb/s ports, while each management connects to the same switches with four 200 Gb/s ports.」',
      '双端口各 400 Gb/s，分别接到两台交换机。' +
        '⚠️ Network Logical Architecture 节 Spine-Leaf Networking 的写法略有不同：' +
        '「Each compute and management node are connected with two 400 Gb/s ports to two separate switches」' +
        '——那里把管理节点也写成 400 Gb/s，与本条原文的「four 200 Gb/s ports」不一致，两说并存。',
    ),
    direction: 'bidirectional',
    label: 'BlueField-3 → 汇聚交换机',
    summary: '每个计算托盘用 BlueField-3 的双 400 Gb/s 端口接入两台汇聚交换机，承载存储与客户业务流量。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.converged-storage',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.converged-switch',
    toAssemblyId: 'asm.gb300.storage',
    plane: 'business',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: 'Ethernet（存储 fabric）',
    bandwidth: raSpec<number>(
      40,
      'GB/s',
      'Networking Physical Topologies，「per-node storage bandwidth of up to 40 GB/s」',
      '这是每计算节点的存储带宽上限。',
    ),
    direction: 'bidirectional',
    label: '汇聚交换机 ↔ 外部存储',
    summary: '训练数据、模型权重与检查点经这条路径进出机架，是「喂饱 GPU」的关键链路。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.mgmt-node-converged',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.mgmt-node',
    toAssemblyId: 'asm.gb300.converged-switch',
    plane: 'business',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'Ethernet（带内）',
    bandwidth: raSpec<number>(
      200,
      'Gb/s',
      'Table 2: Management Node Components，Storage/in-band Network Adapter，「4x ConnectX-7 200G single-port」',
      '管理节点单端口 200 Gb/s，共 4 口。',
    ),
    direction: 'bidirectional',
    label: '管理节点 ↔ 汇聚交换机',
    summary: '控制面节点通过带内网下发调度指令、拉取镜像与采集指标。',
    sourceIds: [RA_SOURCE],
  },

  // ── mgmt 平面（带外/带内管理） ──
  {
    id: 'con.gb300.tray-bmc-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.compute-tray',
    toAssemblyId: 'asm.gb300.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish（BMC）',
    bandwidth: raSpec<number>(
      1,
      'Gb/s',
      'Network Logical Architecture 节 Enterprise RA Scalable Unit (SU)，「For the Out-of-band Management fabric, 18 trays, each with 3x 1Gb/s connections providing 54 x 1Gb/s for management」',
      '★ 官方**是**公布了托盘侧带外口的（此前本项目误记为「未单独公布」）：' +
        '每托盘 3 条 1 Gb/s，全机架 18 × 3 = 54 条。' +
        '（管理节点侧另有 Table 2「Management Network | 2 x 1 Gb/s In-band port」，是另一类节点的口径，别混用。）',
    ),
    direction: 'bidirectional',
    label: '计算托盘 BMC → 机架管理交换机',
    summary:
      '每个托盘的主机 BMC 接入机架内 SN2201，支持 Redfish 带外上电、刷固件与日志采集。' +
      '官方口径是每托盘 3 条 1 Gb/s、全机架 54 条。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.nvswitch-tray-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.nvswitch-tray',
    toAssemblyId: 'asm.gb300.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / NVOS 管理',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NVLink 交换托盘 → 机架管理交换机',
    summary: 'NVLink 交换托盘是运行 NVOS 的受管交换机，同样纳入带外管理域。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.bf3-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.bf3-dpu',
    toAssemblyId: 'asm.gb300.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish（BlueField BMC）',
    bandwidth: raSpec<number>(
      1,
      'Gb/s',
      'Converged (Node North/South) Ethernet Networking，「a 1Gb/s out-of-band management port that connects to the data center and management network」',
    ),
    direction: 'bidirectional',
    label: 'BlueField-3 板载 BMC → 机架管理交换机',
    summary: 'BlueField 自带 BMC 与外部信任根，可独立于主机被管理——主机被攻破也不丢管理面。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.power-shelf-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.power-shelf',
    toAssemblyId: 'asm.gb300.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet（电源遥测）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '电源架 → 机架管理交换机',
    summary: '电源架的功率遥测数据纳入统一管理，是做功率封顶与能耗计量的数据源。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.inrack-oob-uplink',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.inrack-mgmt-switch',
    toAssemblyId: 'asm.gb300.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'Ethernet（OOB 上联）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '机架管理交换机 → 带外管理汇聚',
    summary: '机架内 SN2201 上联到机架外的带外管理汇聚层，形成整个集群统一的管理平面。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.mgmt-node-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.mgmt-node',
    toAssemblyId: 'asm.gb300.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish',
    bandwidth: null,
    direction: 'bidirectional',
    label: '管理节点 → 带外管理汇聚',
    summary: '控制面节点自身也接入带外网，保证管理软件挂掉时仍可远程恢复。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.leaf-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.scaleout-leaf',
    toAssemblyId: 'asm.gb300.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet（交换机管理口）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'Leaf 交换机管理口 → 带外管理汇聚',
    summary: '计算网交换机的管理口同样归入带外平面，与数据面物理隔离。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.converged-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.converged-switch',
    toAssemblyId: 'asm.gb300.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet（交换机管理口）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '汇聚交换机管理口 → 带外管理汇聚',
    summary: '业务/存储网交换机的管理口同样归入带外平面。',
    sourceIds: [RA_SOURCE],
  },

  // ── power 平面 ──
  {
    id: 'con.gb300.facility-power-shelf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.facility-power',
    toAssemblyId: 'asm.gb300.power-shelf',
    plane: 'power',
    topology: 'bus',
    medium: 'ac-feed',
    protocol: '机房交流配电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '机房配电 → 电源架',
    summary: '机房交流电经列头柜进入机架的 8 个电源架整流。整机架最高负载 142 kW。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.power-shelf-busbar',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.power-shelf',
    toAssemblyId: 'asm.gb300.busbar',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排',
    bandwidth: raSpec<number>(
      33,
      'kW',
      'System Hardware & Components，「8 power shelves of 33 kW, with each shelf having six 5.5 kW PSUs」',
      '单个电源架输出能力；8 架合计 264 kW，服务最高 142 kW 的机架负载。',
    ),
    direction: 'unidirectional',
    label: '电源架 → 直流母排',
    summary: '8 个 33 kW 电源架把整流后的直流电并联送上母排，形成机架级统一供电干路。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.busbar-compute-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.busbar',
    toAssemblyId: 'asm.gb300.compute-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → 计算托盘',
    summary: '计算托盘盲插即取电，无独立电源线。参考架构未公布单托盘功耗。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.busbar-nvswitch-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.busbar',
    toAssemblyId: 'asm.gb300.nvswitch-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → NVLink 交换托盘',
    summary: '交换托盘与计算托盘共用同一条直流母排。',
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.busbar-mgmt-switch',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.busbar',
    toAssemblyId: 'asm.gb300.inrack-mgmt-switch',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → 机架内管理交换机',
    summary:
      '官方明确：机架内的 SN2201 走母排直流供电，机架外的 SN2201 才用交流——这是「机架即一台机器」在供电上的体现。',
    sourceIds: [RA_SOURCE],
  },

  // ── cooling 平面 ──
  {
    id: 'con.gb300.gpu-cold-plate',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.b300-gpu',
    toAssemblyId: 'asm.gb300.tray-cold-plate',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'B300 GPU → 冷板',
    summary:
      '冷板直接压在 GPU 顶盖上带走热量，这是高密机架能做到 142 kW 的前提。' + COOLING_MODEL_NOTE,
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.cpu-cold-plate',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.grace-cpu',
    toAssemblyId: 'asm.gb300.tray-cold-plate',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'Grace CPU → 冷板',
    summary: 'CPU 与 GPU 共用托盘内同一套冷板回路。' + COOLING_MODEL_NOTE,
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.tray-cold-plate-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.tray-cold-plate',
    toAssemblyId: 'asm.gb300.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '计算托盘冷板 ↔ 分液歧管',
    summary:
      '托盘冷板经快接头挂上机架歧管，支持单托盘维护而不停整机架。' + COOLING_MODEL_NOTE,
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.nvswitch-cold-plate-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.nvswitch-cold-plate',
    toAssemblyId: 'asm.gb300.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '交换托盘冷板 ↔ 分液歧管',
    summary:
      'NVSwitch 同样是液冷器件——18 颗交换芯片的功耗不容忽视。' + COOLING_MODEL_NOTE,
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.manifold-cdu',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.manifold',
    toAssemblyId: 'asm.gb300.cdu',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '分液歧管 ↔ CDU',
    summary:
      '机架歧管与 CDU 之间构成二次侧闭环，CDU 负责恒温恒压与流量分配。' + COOLING_MODEL_NOTE,
    sourceIds: [RA_SOURCE],
  },
  {
    id: 'con.gb300.cdu-facility-water',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.gb300.cdu',
    toAssemblyId: 'asm.gb300.facility-water',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '一次侧冷却水回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'CDU ↔ 机房一次侧水',
    summary:
      'CDU 在这里把机架的热量换给机房冷冻水系统，完成整条散热链。' + COOLING_MODEL_NOTE,
    sourceIds: [RA_SOURCE],
  },
]

// ─────────────────────────── 导览场景 ───────────────────────────

export const GB300_SCENES: ScenePreset[] = [
  {
    id: 'scene.gb300.cluster-overview',
    systemId: SYSTEM_ID,
    title: '一座 AI 工厂长什么样',
    narration:
      '先看全景：一列机架、机房供配电与冷却水、外部存储与两层以太网交换。官方完整验证的规模是 8 个 SU（即 8 个 NVL72 机架）。这一层要建立的直觉是——AI Factory 是「机房 + 电 + 水 + 网」四件事凑齐才成立，不是买一堆卡。',
    lodLevel: 'cluster',
    focusAssemblyId: 'asm.gb300.facility',
    planes: ['scaleout', 'power', 'cooling'],
    highlightAssemblyIds: ['asm.gb300.rack', 'asm.gb300.cdu', 'asm.gb300.scaleout-spine'],
    presalesNote:
      '开场用这一屏定调：客户最先要回答的不是「买几张卡」，而是「机房能给多少电、冷却水接不接得住、网络怎么出机架」。',
  },
  {
    id: 'scene.gb300.rack-anatomy',
    systemId: SYSTEM_ID,
    title: '拆开一个机架：18 + 9 的结构',
    narration:
      '聚焦单个机架：18 个计算托盘提供 72 张 GPU，9 个 NVLink 交换托盘（每个 2 颗 NVSwitch ASIC，合计 18 颗）把它们连成全互联；8 个电源架经直流母排供电；2 台 SN2201 做带外管理。每张 GPU 的 18 条 NVLink 恰好一颗 NVSwitch 一条——这就是「无阻塞」的物理含义。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['nvlink', 'power'],
    highlightAssemblyIds: [
      'asm.gb300.compute-tray',
      'asm.gb300.nvswitch-tray',
      'asm.gb300.nvswitch-asic',
      'asm.gb300.busbar',
    ],
    presalesNote:
      '这一屏是全场最容易讲错的地方，务必咬准数字：18 个计算托盘、9 个交换托盘、18 颗 NVSwitch ASIC、72 张 GPU、36 颗 Grace。说错一个数字，懂行的客户就不信后面的了。',
  },
  {
    id: 'scene.gb300.tray-teardown',
    systemId: SYSTEM_ID,
    title: '一个计算托盘里有什么',
    narration:
      '进到板级：2 颗 Grace CPU + 4 张 B300 GPU（每张 288 GB HBM3e）+ 2 块夹层板承载 4 张 ConnectX-8 SuperNIC + 1 张 BlueField-3 DPU + 本地 M.2 系统盘与 E1.S 缓存盘，整托盘液冷。GPU 与 NIC 是 1:1，CPU 与夹层板也是 1:1——处处均衡是这套设计的核心思路。',
    lodLevel: 'board',
    focusAssemblyId: 'asm.gb300.compute-tray',
    planes: ['nvlink', 'scaleout', 'business', 'cooling'],
    highlightAssemblyIds: [
      'asm.gb300.b300-gpu',
      'asm.gb300.grace-cpu',
      'asm.gb300.cx8-nic',
      'asm.gb300.bf3-dpu',
    ],
    presalesNote:
      '记准代际口径：ConnectX-8 与 BlueField-3（不是 CX-7 / BF-2）。客户里的老手常拿这个试探你是不是真看过参考架构。',
  },

  // ─── 练习站（v1.3 W2）：学习手册环节 2.1 的六平面任务卡 + 交换层对照卡 ───
  //
  // ★ 一律**追加在数组尾部**，绝不插到头部/中部：`store.applyScene` 用的是「系统内序号」，
  //   `store.test.ts` 与移动端导览截图都锁着前三站的序号（前 3 站 = 讲解站，是主菜）。
  //
  // ★ narration 统一三段式「① 你应该看到什么 / ② 谁连谁 + 关键数字 / ③ 断了会怎样」，
  //   数字**全部取自本文件里已登记的 Claim**（参考架构原文），不新造、不外部补齐。
  {
    id: 'scene.gb300.learn-plane-nvlink',
    systemId: SYSTEM_ID,
    title: '练习 · NVLink 平面：机架内的 scale-up',
    narration:
      '① 你应该看到什么：整架只剩机架内的绿色连线，18 个计算托盘与 9 个交换托盘被一张网兜住，没有一条线离开机架。' +
      '② 谁连谁 + 关键数字：每张 B300 GPU 引出 18 条第五代 NVLink，机架内 18 颗 NVSwitch ASIC 各接一条，每卡 1.8 TB/s（1800 GB/s）；' +
      '托盘盲插到无源铜背板，不用一根线缆；机架级聚合带宽 130 TB/s，72 张卡两两之间都有无阻塞直连路径。' +
      '③ 断了会怎样：NVLink 域一断，72 张卡就不再是「一台机器」——张量并行与 MoE 的 All-to-All 只能退回跨机架以太网，Decode 时延成倍恶化。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['nvlink'],
    highlightAssemblyIds: [
      'asm.gb300.compute-tray',
      'asm.gb300.nvswitch-tray',
      'asm.gb300.nvlink-backplane',
    ],
    presalesNote:
      '这一屏用来回答「NVLink 到底是什么」：它是机架内的一跳全连，不是「更快的以太网」。数字咬准 1.8 TB/s / 18 条 / 18 颗 / 130 TB/s。',
  },
  {
    id: 'scene.gb300.learn-plane-scaleout',
    systemId: SYSTEM_ID,
    title: '练习 · Scale-Out 平面：机架之间的计算网',
    narration:
      '① 你应该看到什么：紫色的线从托盘里的网卡出发、穿出机架去找 Leaf 交换层——与上一站正好相反，这一层的活儿全在机架外。' +
      '② 谁连谁 + 关键数字：每张 GPU 独占一张 ConnectX-8 SuperNIC（1:1，800 Gb/s），这 800 Gb/s 拆成 2×400 Gb/s 分别接到两个独立平面的不同 Leaf 交换机（rail-optimized），每个平面可扩展到 1024 个 400 Gb/s 接口；Leaf 与 Spine 构成完全无阻塞的胖树。' +
      '③ 断了会怎样：单个 rail 断了由网卡硬件做故障切换与负载均衡，跨机架带宽减半；整层断了则集群退化成一堆互不相干的单机架，多机架训练/推理直接停摆。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['scaleout'],
    highlightAssemblyIds: ['asm.gb300.cx8-nic', 'asm.gb300.compute-tray'],
    presalesNote:
      '与上一站连着讲效果最好：「NVLink 管机架内 72 卡一跳互联，Leaf/Spine 管机架之间」。1:1 GPU:NIC 是这一代的卖点，别说成「每托盘一张网卡」。',
  },
  {
    id: 'scene.gb300.learn-plane-business',
    systemId: SYSTEM_ID,
    title: '练习 · 业务与存储平面：南北向的另一张网',
    narration:
      '① 你应该看到什么：蓝色的线从托盘里的 BlueField-3 出发接到汇聚交换层，再从汇聚交换层连到外部存储——这条路径与上一站的计算网完全不重叠。' +
      '② 谁连谁 + 关键数字：每个计算托盘用 BlueField-3 的双 400 Gb/s 端口接入两台汇聚交换机；汇聚交换层与外部存储之间，每计算节点的存储带宽上限 40 GB/s；控制面的管理节点也走这张网下发调度、拉镜像（单端口 200 Gb/s、共 4 口）。' +
      '③ 断了会怎样：GPU 之间还能通，但「喂不进数据」——训练数据、模型权重与检查点进不来出不去，客户请求也到不了机架，产能等于零。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['business'],
    highlightAssemblyIds: [
      'asm.gb300.bf3-dpu',
      'asm.gb300.converged-switch',
      'asm.gb300.storage',
    ],
    presalesNote:
      '客户常把这张网和计算网混为一谈。一句话切开：「计算网是 GPU 之间说话，业务网是集群对外界和存储说话」，物理隔离的目的就是别让业务流量抢东西向带宽。',
  },
  {
    id: 'scene.gb300.learn-plane-mgmt',
    systemId: SYSTEM_ID,
    title: '练习 · 管理平面：带外那张「小网」',
    narration:
      '① 你应该看到什么：灰色的细线把机架里几乎每一类部件都串了一遍——托盘、交换托盘、电源架、DPU，全部汇到机架内的管理交换机，再上联到机架外的带外管理汇聚。' +
      '② 谁连谁 + 关键数字：每个托盘的主机 BMC 以 1 Gb/s 接入机架内的 2 台 SN2201（走 Redfish 做带外上电、刷固件、收日志）；BlueField-3 自带独立 BMC 与信任根，同样有一个 1 Gb/s 带外口；电源架的功率遥测也走这张网；计算网/业务网交换机的管理口一并归入带外，与数据面物理隔离。' +
      '③ 断了会怎样：业务不会立刻停，但你「看不见也够不着」——没法远程上电、没法刷固件、没法做功率封顶与能耗计量，故障处置只能派人进机房。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['mgmt'],
    highlightAssemblyIds: [
      'asm.gb300.inrack-mgmt-switch',
      'asm.gb300.oob-fabric-switch',
      'asm.gb300.bf3-dpu',
    ],
    presalesNote:
      '带宽最小、存在感最低，却是运维方案里第一个被问到的。抓住「主机被攻破也不丢管理面」（BlueField 独立 BMC + 信任根）这个点，安全侧的对话就能接住。',
  },
  {
    id: 'scene.gb300.learn-plane-power',
    systemId: SYSTEM_ID,
    title: '练习 · 供电平面：从列头柜到托盘',
    narration:
      '① 你应该看到什么：橙色的线自上而下走成一条主干——机房配电柜进来，穿过 8 个电源架，落到一条贯穿机架背部的直流母排，再分给每一个托盘。' +
      '② 谁连谁 + 关键数字：整机架最高负载 142 kW（官方口径是 up to，不是典型工况）；8 个电源架每架 33 kW、合计 264 kW 的输出能力来服务它；托盘盲插即取电、没有独立电源线；连机架内的管理交换机也走母排直流（机架外那台才用交流）。' +
      '③ 断了会怎样：单个电源架掉了靠 8 架并联的冗余顶住；母排或列头柜出问题就是整架掉电——这也是为什么客户的第一个问题永远是「机房一个机位能给多少电」。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['power'],
    highlightAssemblyIds: [
      'asm.gb300.power-shelf',
      'asm.gb300.busbar',
      'asm.gb300.facility-power',
    ],
    presalesNote:
      '142 kW 一定要带上「up to」讲。拿它去算 tokens/W 时也必须声明这是峰值口径，否则数字会被客户当成承诺。',
  },
  {
    id: 'scene.gb300.learn-plane-cooling',
    systemId: SYSTEM_ID,
    title: '练习 · 液冷平面：热量怎么离开机架',
    narration:
      '① 你应该看到什么：青色的回路从芯片一路往外——冷板贴着 GPU/CPU，托盘冷板挂上机架歧管，歧管接 CDU，CDU 再接机房一次侧水。' +
      '② 谁连谁 + 关键数字：冷板直接压在 GPU 顶盖上，这是 142 kW 高密机架成立的前提；NVSwitch 同样是液冷器件（18 颗交换芯片的功耗不容忽视）；托盘冷板经快接头挂歧管，支持单托盘维护而不停整机架；CDU 负责二次侧的恒温恒压与流量分配，并在这里把热量换给机房冷冻水。' +
      '③ 断了会怎样：二次侧失流几十秒内就会触发降频甚至停机——液冷不是「更安静的风扇」，它是这台机器能不能开机的前提条件。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.gb300.rack',
    planes: ['cooling'],
    highlightAssemblyIds: ['asm.gb300.tray-cold-plate', 'asm.gb300.manifold', 'asm.gb300.cdu'],
    presalesNote:
      '一次侧/二次侧是最容易讲混的一对词。记法：CDU 以内（机架侧）是二次侧，CDU 以外（机房侧）是一次侧，CDU 就是那台换热器。',
  },
  {
    id: 'scene.gb300.learn-switch-layers',
    systemId: SYSTEM_ID,
    title: '练习 · 三个交换层各管什么（leaf / spine / 汇聚）',
    narration:
      '① 你应该看到什么：机房总览里同时亮着三处交换层——Leaf、Spine、汇聚，同开计算网（紫）与业务网（蓝）两个平面，一眼看出前两者串在一起、第三者自成一路。' +
      '② 谁连谁 + 关键数字：三层用的是同一款 Spectrum-X 交换机（参考架构两种写法并存：Networking Hardware 章写 SN5610「64 个 800 Gbps 端口」，Table 5 与 Appendix Table 11 写 SN5600「128 端口 400 Gb/s」，端口总容量相同；对客户说端口档位、不说死型号），差别只在接线角色。九字框架：leaf = 接入（每机架的 ConnectX-8 按 rail 上联，同编号网卡接同一台 leaf，是 GPU 东西向流量的第一跳）；spine = 主干（只连 leaf、不直连服务器，与 leaf 构成两级无阻塞胖树）；汇聚 = 另一张网（南北向客户请求与存储读写经 BlueField-3 接入，与计算网物理隔离）。台数官方给了：每机架 2 台跑 CPU 与存储、最多 12 台跑双平面 GPU 网；按规模看，8 个 SU 时计算网 32 leaf + 12 spine、汇聚网 7 leaf + 4 spine。' +
      '③ 断了会怎样：leaf 断 = 那一机架从计算网上掉线；spine 断 = 机架之间不通、集群碎成一堆单机架；汇聚断 = 计算网还好好的，但数据与请求进不来，照样产不出 token。',
    lodLevel: 'cluster',
    focusAssemblyId: 'asm.gb300.facility',
    planes: ['scaleout', 'business'],
    highlightAssemblyIds: [
      'asm.gb300.scaleout-leaf',
      'asm.gb300.scaleout-spine',
      'asm.gb300.converged-switch',
    ],
    presalesNote:
      '「同一款交换机分饰三层」是这一屏的钩子。先说三层职责，再点出型号相同——客户会立刻明白「网络设计的关键不是买什么盒子，是怎么接」。' +
      '⚠️ 型号别说死：参考架构自己就有 SN5610（64 × 800 Gbps，Networking Hardware 章）与 ' +
      'SN5600（128 端口 400 Gb/s，Table 5 / Appendix Table 11）两种写法。' +
      '被懂行的人追问时，如实说「官方文档里两种写法都有，端口总容量一致，以订单 BOM 为准」' +
      '——比咬定一个型号更专业。',
  },
]

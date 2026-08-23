import { claim } from './claim'
import type {
  AssemblyNode,
  Claim,
  ClaimValue,
  Connection,
  EvidenceType,
  FactorySystem,
  HardwareComponent,
  ScenePreset,
} from './types'

/**
 * Rubin Ultra NVL576 内容包（`v1.3` 起：系统 `status: 'announced'`，
 * `capacityPolicy: 'analyst-modeled'`——**两级证据混用，务必读完再改**）。
 *
 * ★★ 来源纪律（v1.3 重构：本文件现在是「官方拓扑事实 + 分析师结构细节」两层叠加）★★
 *
 * NVIDIA 官方在 2026-03 的 POD 博客（`src.nvidia-rubin-pod-blog`）里首次亲口证实了
 * NVL576 的存在与骨架：8 个独立 MGX NVL 机架、每机架 72 张 Rubin Ultra GPU、机架内铜
 * 背板 + 机架间「direct optical connections」组成**一个** 576-GPU NVLink 域、内部原型
 * 代号 Polyphe、以及 NVL72/NVL144(Kyber)/NVL576 三档 scale-up 域选项——这些是**官方事实**，
 * `evidence: 'vendor_claim'`、`status: 'announced'`。
 *
 * 但机架内部具体怎么排布（9+18+9 托架分层、0.75U 交换托架、PHD2→PHD3 连接器、
 * NPO/CPO 光模块细节、「Dragonfly」这个拓扑名字本身）通通只出现在本地 PDF
 * 《Rubin Ultra NVL576 架构：快速概览》——**SemiAnalysis 2026-08-10 的第三方分析师
 * 文章，不是 NVIDIA 官方材料**。这一层内容仍然一刀切按分析师口径对待：
 *
 * 1. 引用 SemiAnalysis 的每条 Claim，`evidence` 只能是 `analyst_estimate`（文中作为
 *    事实陈述的结构/图纸数据）或 `forecast`（文中明确写「我们认为/预计/尚在变动中」
 *    的判断），`status` 恒为 `forecast`，`sourceId` 恒为 `src.semianalysis-nvl576`，
 *    `locator` 必须带页码——`content.test.ts` 里专门只对 SemiAnalysis 源 Claim 强制这几点。
 * 2. **规格表数字禁止流入 `GpuMathSpecs` 与产能估算**：Rubin Ultra GPU 的
 *    `mathSpecs` 显式为 `null`；`capacity.ts` 的第一道拒绝门现在直接读
 *    `capacityPolicy === 'analyst-modeled'`（不再依赖 `status`）——这一代在工具里
 *    只能看结构，不能算 token 产能，这是设计意图，不是缺陷。
 * 3. 文中**没有**的内容不要凭印象补：scale-out 网络（ConnectX/BlueField/Spectrum-X）、
 *    CDU 与冷板、机架总功率、系统总算力——全文一个字都没有。**出货日期同样不建
 *    带年份的 Claim**：GTC 2025 keynote 的「2027 下半年」与媒体报道的「可能延期」
 *    都各自独立登记为 Claim（分见 `announceTimeline` / `delayOutlook`），互不相等、
 *    互不推导。
 *
 * ⚠️ 三处必须随数据一起说出口的冲突/限制：
 * - 表①把 Rubin Ultra 的显存写作 **192 GB HBM4**（低于 Rubin 的 288 GB，且不是 HBM4e），
 *   与市场上流传的说法相反。本项目原样记录并标注冲突，不做「修正」。
 * - 表①把 Rubin Ultra 归到 **2027** 列，同页表②却把它放在 **2026** 跨度下；两者矛盾，
 *   本项目取表①并留痕。
 * - 媒体报道里的「延至 2028」说的是**另一个产品** Kyber NVL144，不是 NVL576；
 *   对 NVL576 原文只说「likely delayed or limited to small volumes」，没有年份。
 */

const SYSTEM_ID = 'sys.rubin-ultra-nvl576'
const SA = 'src.semianalysis-nvl576'
const SA_ASOF = '2026-08'
/** 官方三源：POD 博客（拓扑事实）、GTC 2025 keynote 博客（时间点原话）、OCP 博客（命名沿革）。 */
const POD = 'src.nvidia-rubin-pod-blog'
const GTC25 = 'src.nvidia-gtc25-keynote-blog'
const OCP = 'src.nvidia-ocp-vera-rubin-blog'
/** 媒体源：CNBC 转引 SemiAnalysis 的延期报道（非官方，`media_report`）。 */
const CNBC = 'src.cnbc-kyber-delay'

/** 分析师文章里作为事实陈述的结构数据（图纸/表格读数）。 */
function sa<T extends ClaimValue>(
  value: T,
  unit: string | null,
  locator: string,
  note: string | null = null,
  evidence: EvidenceType = 'analyst_estimate',
): Claim<T> {
  return claim<T>({
    value,
    unit,
    sourceId: SA,
    locator,
    evidence,
    status: 'forecast',
    asOf: SA_ASOF,
    confidence: 'low',
    note,
  })
}

/** 文中明确带「我们认为 / 预计 / 尚在变动中」的判断。 */
function saForecast<T extends ClaimValue>(
  value: T,
  unit: string | null,
  locator: string,
  note: string | null = null,
): Claim<T> {
  return sa<T>(value, unit, locator, note, 'forecast')
}

/** 该源没有覆盖到的字段——一律 null，不拿另一代的数字顶替。 */
function saNull(unit: string | null, note: string): Claim {
  return claim({
    value: null,
    unit,
    sourceId: SA,
    locator: null,
    evidence: 'analyst_estimate',
    status: 'forecast',
    asOf: SA_ASOF,
    confidence: 'low',
    note,
  })
}

/** NVIDIA 官方（POD/GTC25/OCP 博客）亲口证实的事实：`vendor_claim` + `status: 'announced'`。 */
function official<T extends ClaimValue>(
  value: T,
  unit: string | null,
  sourceId: string,
  asOf: string,
  locator: string,
  note: string | null = null,
): Claim<T> {
  return claim<T>({
    value,
    unit,
    sourceId,
    locator,
    evidence: 'vendor_claim',
    status: 'announced',
    asOf,
    confidence: 'medium',
    note,
  })
}

/** 媒体报道（CNBC，转引 SemiAnalysis）：定性判断，无具体年份，`forecast` 状态。 */
function mediaForecast<T extends ClaimValue>(value: T, unit: string | null, locator: string, note: string): Claim<T> {
  return claim<T>({
    value,
    unit,
    sourceId: CNBC,
    locator,
    evidence: 'forecast',
    status: 'forecast',
    asOf: '2026-07',
    confidence: 'low',
    note,
  })
}

const NOT_IN_SOURCE = '该 SemiAnalysis 文章未涉及此项，本项目不从其他代际推测。'

// ─────────────────────────── 系统 ───────────────────────────

export const RUBIN_ULTRA_SYSTEM: FactorySystem = {
  id: SYSTEM_ID,
  name: 'NVIDIA Vera Rubin Ultra NVL576',
  vendor: 'NVIDIA',
  status: 'announced',
  capacityPolicy: 'analyst-modeled',
  architecture: 'nvlink-rack-domain',
  generation: 'rubin-ultra',
  referenceUrl:
    'https://developer.nvidia.com/blog/nvidia-vera-rubin-pod-seven-chips-five-rack-scale-systems-one-ai-supercomputer/',
  summary:
    'NVIDIA 官方确认的下一档 scale-up 形态：8 个独立 MGX NVL 机架、每机架 72 张 Rubin Ultra GPU，机架内铜背板 + 机架间直接光连接组成**单一 576-GPU NVLink 域**（内部原型代号 Polyphe），是 Vera Rubin Ultra 三档 NVLink 域（NVL72 / NVL144「Kyber」/ 旗舰 NVL576）里最大的一档。',
  presalesNote:
    '这一代要把「官方说了什么」和「分析师推测了什么」分开讲：**官方**（POD 博客）证实的只有拓扑骨架——8 个机架、576 张 GPU、机架内铜/机架间光、一个 NVLink 域、三档 scale-up 域可选（NVL72/NVL144/NVL576）；机架内部具体怎么排布（9+18+9 托架分层、0.75U 交换托架、PHD3 连接器、NPO/CPO 光模块细节、「Dragonfly」这个拓扑名字）通通来自 SemiAnalysis 一篇分析师文章，官方从未证实这些具体数字。因此本工具对这一代**只能讲结构、不能讲产能**——凡是有人报给你 NVL576 的 PFLOPS 或 token 产能数字，先问一句出处，目前没有官方规格表能支撑那些数字。出货节奏也要小心：2025-03 GTC 现场说过「2027 下半年」，但 2026 年的官方材料已经不再给日期；2026-07 有媒体报道说 NVL576「可能延期或仅限小批量」（没给年份，报道里的「2028」说的是另一个产品 Kyber NVL144），NVIDIA 对该报道的回应是「我们的路线图没有问题」——这句话是媒体转述的官方回应，讲给客户听时务必带上这层来源，不要当成独立声明。',
  sourceIds: [POD, OCP, GTC25, CNBC, SA],
  keySpecs: {
    gpuCount: official<number>(
      576,
      '张',
      POD,
      '2026-03',
      'NVIDIA Vera Rubin Ultra NVL576 节，「Vera Rubin Ultra NVL576 will combine eight separate MGX NVL racks, each with 72 Rubin Ultra GPUs, all in a single 576-GPU NVLink domain with copper and direct optical connections.」',
      'SemiAnalysis p.3 表①按「逻辑 GPU（封装）」给出同一数字并独立佐证，另给 GPU die 数 1,152（每封装 2 颗 reticle 尺寸 GPU die，见 gpuDieCount）。',
    ),
    gpuDieCount: sa<number>(
      1152,
      '颗',
      'p.3 表①，Vera Rubin Ultra NVL576 列 # of GPU dies = 1,152',
    ),
    cpuSocketCount: sa<number>(288, '个', 'p.3 表①，# of CPU Sockets = 288（CPU 型号列为 Vera）'),
    rackCount: official<number>(
      8,
      '个',
      POD,
      '2026-03',
      'NVIDIA Vera Rubin Ultra NVL576 节，「combine eight separate MGX NVL racks」；SemiAnalysis p.3 表①独立佐证 Form Factor =「8x Oberon Racks」，p.4 机架立面图逐个标注为 VRU NVL576 (Rack 1) … (Rack 8)',
      '★ 与 GB300/Vera Rubin 的「8 个机架 = 8 个互相独立的 NVLink 域」不同：这 8 个机架合起来才是**一个** NVL576 域（官方原话：「all in a single 576-GPU NVLink domain」）。',
    ),
    rackPowerKW: saNull(
      'kW',
      '官方与分析师文章都未给出机架级或系统级总功率。SemiAnalysis 立面图上每机架有 4 个 3U 110 kW 电源架（4 × 110 = 440 kW 是本项目的算术推论，不是文中数字），因此本项目取 null，产能估算的 tokens/W 一律不出数。',
    ),
    computeTrayCount: sa<number>(
      18,
      '个',
      'p.5「机架高度」节：Rubin Ultra 的 Oberon 系统为 (9+18+9)，计算托架总数仍为 18 个，均匀分布于机架顶部和底部（各 9 个）',
    ),
    nvswitchTrayCount: sa<number>(
      18,
      '个',
      'p.5：NVLink Switch 托架数量翻倍至每机架 18 个，单托架高度缩减至 0.75U',
    ),
    nvlinkGeneration: sa<string>(
      'NVLink 7',
      null,
      'p.3 表②「Nvidia Roadmap – Scale-Up Networking」，NVLink Generation = NVLink 7',
    ),
    nvlinkPerGpuGBs: sa<number>(
      1800,
      'GB/s',
      'p.3 表②，Bandwidth per Logical GPU (GB/s uni-directional) = 1,800',
      '单向口径，与同表 Vera Rubin NVL72 相同（表中两列合并）。',
    ),
    scaleUpTopology: sa<string>(
      'Direct Connect NPO（机架内铜背板 + 机架间 NPO/CPO Dragonfly）',
      null,
      'p.3 表②，Scale-Up Topology =「Direct Connect NPO」；Within Rack =「Copper Backplane」；Between Racks =「NPO/CPO」（表中黄色高亮）',
      '官方口径只到「机架内铜、机架间直接光连接」这一层（POD 博客原话「with copper and direct optical connections」）；「NPO/CPO」「Dragonfly」是 SemiAnalysis 自己的说法，NVIDIA 官方材料没有用过这两个词。',
    ),
    nvlinkDomainOptions: official<string>(
      'NVL72 / NVL144（Kyber，单机架）/ NVL576（旗舰，本代）',
      null,
      POD,
      '2026-03',
      'NVIDIA Kyber NVL1152 节，「providing customers with three options for Vera Rubin Ultra NVLink scale-up domains: NVL72, NVL144, and the flagship NVL576.」',
      'Kyber 是独立于本代机架壳（MGX NVL/Oberon）的另一款更高密度单机架设计（144 GPU/机架），NVL576 由 8 个标准 MGX NVL 机架组成——两者是并列的产品线，不是同一硬件的两种叫法（也不要把「Kyber」当成 NVL576 机架的代号）。',
    ),
    prototypeCodename: official<string>(
      'Polyphe',
      null,
      POD,
      '2026-03',
      'NVIDIA Vera Rubin Ultra NVL576 节，「Polyphe is the NVIDIA internal fully functional GB200-based prototype of the multirack NVL576 scale-up architecture.」',
    ),
    announceTimeline: official<string>(
      '2027 下半年（2025-03 GTC 现场原话）',
      null,
      GTC25,
      '2025-03',
      'Vera Rubin 一节，「Systems built on Rubin Ultra, including the Vera Rubin NVL 144, will arrive in the second half of next year. And due for the second half of 2027: systems built on Rubin Ultra.」',
      '⚠️ 这是 2025-03 GTC 现场原话，原话没有点名 NVL576（只泛指「systems built on Rubin Ultra」）；2026 年的官方材料（POD/OCP 博客）都不再给出具体交付日期。',
    ),
    delayOutlook: mediaForecast<string>(
      '可能延期或仅限小批量（媒体报道，无具体年份）',
      null,
      '「NVL576 — a larger system linking eight racks via optical connections — is also likely delayed or limited to small volumes, the research firm said.」',
      '⚠️ 同一篇报道里明确写的「延至 2028」说的是另一个产品 **Kyber NVL144**（PCB 中板良率问题），不是 NVL576；对 NVL576 原文没有给出具体年份。文中记录 NVIDIA 对整篇报道的回应「Our roadmap is intact」——这是媒体转述的官方回应，不是独立声明，讲给客户听时要说明这层转述关系。',
    ),
    analystStructuralDetail: sa<string>(
      'Oberon 机架重排为 9+18+9（计算/交换/计算）、0.75U NVLink 交换托架、PHD3 背板连接器、NPO/CPO 光互连模块、「Dragonfly」跨机架拓扑命名——均为 SemiAnalysis 的结构细节推测，NVIDIA 官方材料未证实这些具体实现。',
      null,
      'p.4–p.5（机架立面图与机架高度节），p.10（NPO/CPO 与 Dragonfly 拓扑描述）',
      '这条 Claim 的作用是把「分析师推测的具体实现」与上面几条官方事实（gpuCount/rackCount/nvlinkDomainOptions/prototypeCodename）显式分开，避免两者被当成同一置信等级引用——3D 组件层的官方壳体（机架、机架内背板、跨机架光互连）与分析师规格件（GPU/HBM/托盘细节/交换芯片）也按这条线分层，见组件定义里的 status 字段。',
    ),
    year: sa<string>(
      '2027（表①）',
      null,
      'p.3 表①年份表头 2024 | 2025 | 2026 | 2027，Rubin Ultra 归于 2027 列',
      '⚠️ 同页表②的年份表头只到 2026，却把 Rubin Ultra 的 NVL72/NVL576 放在 2026 跨度下。两表矛盾，本项目取表①——这是 SemiAnalysis 文中自己的表格冲突，与上面 announceTimeline 的官方口径是两条独立记录，不互相印证也不互相推翻。',
    ),
  },
  // 立面图 U 轴刻度到 48.5（p.4）；取 49 作为 3D 摆位的示意高度
  rackUnitsForLayout: 49,
}

// ─────────────────────────── 组件 ───────────────────────────

export const RUBIN_ULTRA_COMPONENTS: HardwareComponent[] = [
  {
    id: 'cmp.rubin-ultra.gpu',
    kind: 'gpu',
    name: 'Rubin Ultra GPU（预测规格）',
    vendor: 'NVIDIA（第三方分析）',
    status: 'forecast',
    summary:
      '分析师预期的 Rubin Ultra 封装：2 颗 reticle 尺寸 GPU die + 1 颗 NVLink I/O die，192 GB HBM4、21 TB/s，TDP 1.8–2.6 kW。',
    presalesNote:
      '⚠️ 这一整张卡的规格都来自第三方分析师，且文中自己就写着「规格与架构设计尚处于变动中」。能拿来跟客户讨论的只有趋势：**单卡功率上到 1.8–2.6 kW**（GB300 一代是 1.1–1.4 kW 量级），这意味着机柜供电与液冷都要按翻倍准备。至于算力和显存的具体数字，等 NVIDIA 官方规格表出来再说——本工具刻意不让这些数字进产能计算。',
    visual: { shape: 'chip', colorToken: 'amber', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    // ★ 硬规则：分析师数字禁止进入 roofline 数学 → 整体 null（产能估算会因此拒绝出数）
    mathSpecs: null,
    specs: {
      packageConfiguration: sa<string>(
        '2 × reticle 尺寸 GPU die + 1 × NVLink I/O die',
        null,
        'p.3 表①，Logic Die Configuration（Rubin Ultra 列）',
        '对照 Rubin 封装为「2 × reticle GPU die + 1 × C2C I/O die + 1 × NVLink I/O die」——Rubin Ultra 少了 C2C I/O die。',
      ),
      memoryPerPackageGB: sa<number>(
        192,
        'GB',
        'p.3 表①，Memory (per Package) =「192GB HBM4」',
        '⚠️ 冲突留痕：该值**低于**同表 Rubin 的 288 GB HBM4，且写的是 HBM4 而非市场常说的 HBM4e。已按原表逐字核对（1200 dpi 放大），本项目不做「修正」。',
      ),
      hbmStacks: sa<number>(8, '个', 'p.3 表①，HBM Stacks = 8'),
      memoryBandwidthTBs: sa<number>(21, 'TB/s', 'p.3 表①，Memory Bandwidth = 21TB/s'),
      fp4DensePflopsPerPackage: sa<number>(
        35,
        'PFLOPS',
        'p.3 表①，FP4 PFLOPs - Dense (per Package) = 35',
        '⚠️ 分析师表格数字，**不进 mathSpecs、不进产能估算**。与同表 Rubin 的 35 相同。',
      ),
      fp8DensePflopsPerPackage: sa<number>(
        17.5,
        'PFLOPS',
        'p.3 表①，FP8 PFLOPs - Dense (per Package) = 17.5',
        '⚠️ 同上，不进产能估算。',
      ),
      tdpW: sa<string>(
        '1,800 / 2,600',
        'W',
        'p.3 表①，GPU TDP (W) = 1,800/2,600',
        'p.4 正文：「支持单颗 Rubin Ultra GPU 最高 2.6 kW，尽管我们认为主流将是 1.8 kW」——后半句是分析师判断。',
      ),
      mainstreamTdpKW: saForecast<number>(
        1.8,
        'kW',
        'p.4：「尽管我们认为主流将是 1.8KW」',
        '文中明确的分析师预期（非事实陈述）。',
      ),
      foundryNode: sa<string>('N3P (3NP)', null, 'p.3 表①，Foundry Node = N3P (3NP)'),
      packaging: sa<string>('CoWoS-L', null, 'p.3 表①，Packaging = CoWoS-L'),
      serdesSpeed: sa<string>('224G Bi-di', null, 'p.3 表①，SerDes speed (Gb/s uni-di) = 224G Bi-di'),
    },
  },
  {
    id: 'cmp.rubin-ultra.hbm4',
    kind: 'hbm',
    name: 'Rubin Ultra HBM 堆栈（预测规格）',
    vendor: 'NVIDIA / 存储厂商（第三方分析）',
    status: 'forecast',
    summary: '分析师预期的每封装 8 个 HBM4 堆栈，合计 192 GB、21 TB/s。',
    presalesNote:
      '这里有个值得留意的反常识点：分析师表格里 Rubin Ultra 的单封装显存是 **192 GB，比 Rubin 的 288 GB 还少**，但带宽略高（21 vs 20 TB/s，同表口径）。如果这个预测成立，Rubin Ultra 走的是「更多卡、更小单卡显存」的路线。⚠️ 但这只是分析师表格，不要当结论讲。',
    visual: { shape: 'chip-stack', colorToken: 'amber', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    specs: {
      totalPerPackageGB: sa<number>(192, 'GB', 'p.3 表①，Memory (per Package) =「192GB HBM4」'),
      stacksPerGpu: sa<number>(8, '个', 'p.3 表①，HBM Stacks = 8'),
      bandwidthPerPackageTBs: sa<number>(21, 'TB/s', 'p.3 表①，Memory Bandwidth = 21TB/s'),
      generation: sa<string>(
        'HBM4',
        null,
        'p.3 表①，Memory (per Package) =「192GB HBM4」',
        '⚠️ 原表写 HBM4（不是 HBM4e）；全文未出现「HBM4e」字样。',
      ),
    },
  },
  {
    id: 'cmp.rubin-ultra.compute-tray',
    kind: 'tray',
    name: 'Rubin Ultra 计算托架（1U，预测）',
    vendor: 'NVIDIA（第三方分析）',
    status: 'forecast',
    summary: '1U 计算托架，含 2 颗 Vera CPU 与 4 张 Rubin Ultra GPU；每机架 18 个，分列机架顶部与底部各 9 个。',
    presalesNote:
      '结构上这一层几乎没变（还是 1U、2 CPU + 4 GPU、每机架 18 个），文中说计算托架设计「与 Rubin 大致相同」，唯一被点名的升级是 Tachyon HPM 板从 26 层 PCB 加到 30 层、LPDDR5X SOCAMM 挪到板背面——都是为了扛住更高的 TDP。真正变的是**位置**：18 个托架被拆成上下两组各 9 个，中间让给了翻倍的交换托架。',
    visual: { shape: 'tray-slab', colorToken: 'amber', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    specs: {
      gpusPerTray: sa<number>(
        4,
        '张',
        'p.4 机架立面图内文，「1U Compute Tray (2 Vera CPU, 4 Rubin Ultra GPU)」（图中重复 18 处）',
      ),
      cpusPerTray: sa<number>(
        2,
        '颗',
        'p.4 机架立面图内文，「1U Compute Tray (2 Vera CPU, 4 Rubin Ultra GPU)」',
      ),
      trayHeightU: sa<number>(1, 'U', 'p.4 立面图，计算托架标注为 1U（底部 U8–16、顶部 U30.5–38.5）'),
      hpmPcbLayers: sa<string>(
        '26 层 → 30 层（材料不变）',
        null,
        'p.4 / p.10：「我们观察到的 Tachyon HPM 板 PCB 层数从 26 层增加到 30 层」「增加 4 层，但材料保持不变」',
        '文中写作「我们观察到」，属分析师观察而非官方规格。',
      ),
      socammPlacement: sa<string>(
        'LPDDR5X SOCAMM 放置于 HPM 板背面',
        null,
        'p.4：LPDDR5X SOCAMM 将放置在 HPM 背面，而非 HPM 板正面',
      ),
      trayPowerW: saNull('W', `${NOT_IN_SOURCE}（文中只给出电源架规格，未给单托架功耗。）`),
    },
  },
  {
    id: 'cmp.rubin-ultra.nvswitch-tray',
    kind: 'tray',
    name: 'NVSwitch 7 交换托架（Portia，0.75U，预测）',
    vendor: 'NVIDIA（第三方分析）',
    status: 'forecast',
    summary:
      '代号 Portia 的 0.75U 交换托架，可扩展版每托架 4 颗 NVLink 7 交换芯片，每机架 18 个；分 NPO 与 CPO 两个在研版本。',
    presalesNote:
      '★ 这是整代最值得讲的一层。三件事：**托架高度从 1U 压到 0.75U**、**每机架从 9 个变 18 个**、**可扩展版每托架 4 颗交换芯片（每机架 72 颗，是 NVL72 版 36 颗的两倍）**。为什么要压高度？文中解释得很清楚：把最远的计算托架与最远的交换托架之间的距离控制在 22.5U（原来 19U），铜背板上的 NVLink 信号才驱动得动。多出来的交换容量就是拿去做跨机架光互连的。',
    visual: { shape: 'tray-slab', colorToken: 'plane-nvlink', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    specs: {
      codename: sa<string>('Portia', null, 'p.5 / p.10：NVLink Switch 托盘代号 Portia'),
      asicsPerTray: sa<number>(
        4,
        '颗',
        'p.10：可扩展版本每托盘 NVLink Switch ASIC 数量翻倍至 4 个，每机架 72 个；p.4 立面图标注「0.75U Expandable NVSwitch7 Tray (4 NVSwitch7)」',
        '不可扩展版（NVL72 形态）为每托盘 2 颗、每机架 36 颗（p.6）。',
      ),
      traysPerRack: sa<number>(18, '个', 'p.5：NVLink Switch 托架数量翻倍至每机架 18 个'),
      trayHeightU: sa<number>(0.75, 'U', 'p.5：单托架高度缩减至 0.75U；p.4 立面图 U16.75–29.50 按 0.75 步进排布'),
      asicsPerRack: sa<number>(
        72,
        '颗',
        'p.10：可扩展版本每机架 72 个 NVLink Switch ASIC（目的是提高总带宽以支持跨机架连接）',
      ),
      opticsVariants: sa<string>(
        'NPO（模块插槽式）与 CPO（每颗 ASIC 4 个不可更换光引擎）两个版本在研',
        null,
        'p.5 / p.10；NPO 版俯视图见 p.7–p.8，CPO 版见 p.9–p.10（CPO 版另有 External Laser Source Module）',
      ),
      firstToMarket: saForecast<string>(
        'NPO 版本预计率先投入市场',
        null,
        'p.5（原文以黄色高亮 + 下划线标出）：「我们认为，考虑到 NPO 相比 CPO 更为成熟的封装形态，NPO 将是率先投入市场的版本」',
      ),
      trayFrontElements: sa<string>(
        '8 个 NVLink 连接器 + 1 个母排连接器 + 冷/热水进出口 + 内部歧管 + 系统管理模块（5×RJ45）',
        null,
        'p.7–p.8 NPO 版托架俯视图；p.6 为 NVL72 版同类图',
        '⚠️ 原图把连接器标为「NVLink6 Connector」，而芯片标为「NVLink 7 Switch」，疑为沿用旧标签。',
      ),
      networkOs: saNull(null, NOT_IN_SOURCE),
    },
  },
  {
    id: 'cmp.rubin-ultra.nvswitch7',
    kind: 'switch',
    name: 'NVLink 7 交换芯片（预测）',
    vendor: 'NVIDIA（第三方分析）',
    status: 'forecast',
    summary: '第七代 NVLink 交换芯片，单芯片聚合带宽 3,600 GB/s（单向口径）。',
    presalesNote:
      '注意一个容易被忽略的细节：按分析师表格，NVLink 7 交换芯片的单芯片聚合带宽（3,600 GB/s 单向）与 NVLink 5/6 一代**相同**——这一代提升总带宽靠的是「芯片数量翻倍」而不是单芯片更强。这正是交换托架要从 9 个变 18 个、每托架从 2 颗变 4 颗的原因。',
    visual: { shape: 'chip', colorToken: 'plane-nvlink', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    specs: {
      generation: sa<string>('NVLink 7 Switch', null, 'p.3 表②，NVLink Switch Generation = NVLink 7 Switch'),
      aggregateBandwidthGBs: sa<number>(
        3600,
        'GB/s',
        'p.3 表②，Switch Aggregate BW (GB/s uni-di) = 3,600',
        '单向口径。同表 NVLink 5 / NVLink 6 Switch 也是 3,600——单芯片带宽未变。',
      ),
      laneSpeed: sa<string>(
        '400G（200G PAM4，同时双向）',
        null,
        'p.3 表②，Lane Speed (Gb/s uni-di) =「400G (200G PAM4 Simultanous Bidi)」',
      ),
      opticalEnginesCpo: sa<number>(
        4,
        '个',
        'p.10：CPO 版本每个 NVLink Switch ASIC 配备 4 个光引擎，且不可更换；图见 p.9',
      ),
      portCount: saNull('端口', NOT_IN_SOURCE),
    },
  },
  {
    id: 'cmp.rubin-ultra.interrack-fabric',
    kind: 'switch',
    name: '跨机架 scale-up 光互连（官方确认存在）',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '★ 组件层证据分层示例：NVIDIA 官方证实 8 个机架之间靠「direct optical connections」组成单一 576-GPU NVLink 域（POD 博客）；这条光互连具体走什么协议/模块形态（NPO 插槽式或 CPO 共封装、「Dragonfly」拓扑名字）是 SemiAnalysis 的分析师推测，见 `cmp.rubin-ultra.optics-module` 与 specs 里的低置信项。',
    presalesNote:
      '对客户讲这一层要分两句话：**「NVLink 域要跨出机架了」是官方证实的**——8 个机架经光连接合并成一个 576 卡的 scale-up 域，这决定了「一台机器」的边界从 72 卡扩到 576 卡；**「怎么跨」还是分析师推测**——NPO 还是 CPO、走不走 Dragonfly 拓扑、每机架多少个光模块，这些都等官方规格表出来再报给客户。',
    visual: { shape: 'switch-box', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [POD, SA],
    specs: {
      existenceAndMedium: official<string>(
        '机架间直接光连接（direct optical connections），使 8 个机架组成单一 NVLink 域',
        null,
        POD,
        '2026-03',
        'NVIDIA Vera Rubin Ultra NVL576 节，「…all in a single 576-GPU NVLink domain with copper and direct optical connections.」',
      ),
      topologyName: sa<string>(
        'Dragonfly（SemiAnalysis 命名，官方材料未使用此术语）',
        null,
        'p.3 表①，Scale up links =「Between Racks: Dragonfly NPO/CPO」',
        '⚠️ 官方只说「direct optical connections」，没有点名任何拓扑算法或标准名字；「Dragonfly」是分析师文章自己的归类。',
      ),
      moduleFormFactor: sa<string>(
        'NPO（插槽式）与 CPO（共封装，芯片内嵌光引擎）两种在研形态，文中判断 NPO 更可能率先量产',
        null,
        'p.5 / p.10；NPO 版细节见 p.7–p.8，CPO 版见 p.9–p.10',
        '具体到「模块」这一级的实现细节，详见 cmp.rubin-ultra.optics-module（板级、分析师口径）。',
      ),
    },
  },
  {
    id: 'cmp.rubin-ultra.optics-module',
    kind: 'switch',
    name: 'NPO / CPO 光互连模块（预测）',
    vendor: '光模块厂商（第三方分析）',
    status: 'forecast',
    summary: '装在交换托架上的近封装（NPO）或共封装（CPO）光模块，负责把 NVLink 域从机架内延伸到 8 个机架之间。',
    presalesNote:
      '★ 这是「NVLink 出机架」这件事的物理载体，也是整代最大的变化点：机架内还是铜背板（便宜、可靠、不耗电），机架之间改走光——NPO 版是插槽式模块（每颗交换芯片旁 4 个），CPO 版是 4 个不可更换的光引擎 + 外置激光源。对客户的含义是：**故障域和维护方式变了**，光模块坏了怎么换要提前问清楚（CPO 版换不了单个光引擎）。⚠️ 原图里模块带宽被写成占位符「x.xT」，没有具体数字。',
    visual: { shape: 'nic-card', colorToken: 'plane-scaleout', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    specs: {
      npoMounting: sa<string>(
        'NPO 模块通过插槽安装在 PCB 上，位于 NVLink Switch ASIC 旁边',
        null,
        'p.10；图见 p.7（每颗交换芯片旁 4 个模块，全托架 16 个）',
      ),
      cpoMounting: sa<string>(
        'CPO 版每颗交换 ASIC 配 4 个光引擎，不可更换，另配外置激光源模块',
        null,
        'p.10；图见 p.9–p.10（External Laser Source Module）',
      ),
      interRackTopology: sa<string>(
        'Dragonfly（机架之间）',
        null,
        'p.3 表①，Scale up links =「Between Racks: Dragonfly NPO/CPO」',
      ),
      bandwidthTbs: saNull(
        'Tb/s',
        '⚠️ 原图（p.7 / p.9）把模块带宽写成占位符「x.xT」，没有具体数字，本项目不填。',
      ),
    },
  },
  {
    id: 'cmp.rubin-ultra.power-shelf',
    kind: 'power',
    name: '3U 110 kW 电源架（预测）',
    vendor: 'NVIDIA / OEM（第三方分析）',
    status: 'forecast',
    summary: '立面图标注的 3U 电源架，单架 110 kW（6 × 18.3 kW 模块），每机架 4 个（顶部 2 个、底部 2 个）。',
    presalesNote:
      '拿这个跟 GB300 对比最直观：GB300 是 8 个 33 kW 电源架（合计 264 kW 供电能力），这一代是 4 个 110 kW（合计 440 kW）。单个电源模块也从 5.5 kW 跳到 18.3 kW。⚠️ 但要说清楚：**文中没有给出机架总功率**，440 kW 是我按图上数字乘出来的算术，不是分析师的结论，更不是官方数字。',
    visual: { shape: 'psu-brick', colorToken: 'plane-power', wireframe: true },
    imageUrl: null,
    sourceIds: [SA],
    specs: {
      shelfPowerKW: sa<number>(110, 'kW', 'p.4 机架立面图，「3U Power Shelf 110kW (6*18.3kW)」（4 处）'),
      psusPerShelf: sa<number>(6, '个', 'p.4 立面图，「110kW (6*18.3kW)」'),
      psuPowerKW: sa<number>(18.3, 'kW', 'p.4 立面图，「110kW (6*18.3kW)」'),
      shelvesPerRack: sa<number>(
        4,
        '个',
        'p.4 立面图：顶部 U40.5–42.5 与 U43.5–45.5、底部 U1–3 与 U4–6 各一个 3U 电源架',
      ),
      shelfHeightU: sa<number>(3, 'U', 'p.4 立面图，「3U Power Shelf」'),
      redundancyMode: saNull(null, NOT_IN_SOURCE),
    },
  },
  {
    id: 'cmp.rubin-ultra.oberon-rack',
    kind: 'rack',
    name: 'MGX NVL 机架（NVL576 之一，Oberon 形态）',
    vendor: 'NVIDIA / OEM',
    status: 'announced',
    summary:
      '★ 组件层证据分层示例：这是 8 个机架之一的**壳体本身**——NVIDIA 官方证实它是标准 MGX NVL 机架、装 72 张 Rubin Ultra GPU（POD 博客）；壳体内部具体怎么排布（9+18+9 托架分层、0.75U 交换托架、立面刻度 48.5U）则来自 SemiAnalysis 的分析师推测，规格表见下方 specs。',
    presalesNote:
      '这一层要跟客户说清楚「哪些是官方确认的」：机架本身是标准 MGX NVL 家族的一员，与 Vera Rubin NVL72 共享同一套机械/供电/冷却包络（POD 博客原话「built using the same MGX rack-scale ecosystem for fastest time to production」）——这意味着供应链、机房适配这些「壳体级」结论是稳的。但壳体**内部**怎么重排（9+18+9、最远托架间距 22.5U、PHD3 连接器）目前只有 SemiAnalysis 一家分析师文章描述，官方规格表还没出来，讲这些细节时要显式加上「分析师推测」的前缀。',
    visual: { shape: 'rack-frame', colorToken: null },
    imageUrl: null,
    sourceIds: [POD, SA],
    specs: {
      rackFamily: official<string>(
        'MGX NVL 机架（与 Vera Rubin NVL72 同代 MGX 机架生态，铜背板 spine）',
        null,
        POD,
        '2026-03',
        'NVIDIA Vera Rubin Ultra NVL576 节，「Vera Rubin Ultra NVL576 will combine eight separate MGX NVL racks, each with 72 Rubin Ultra GPUs…It will be built using the same MGX rack-scale ecosystem for fastest time to production.」',
      ),
      trayLayout: sa<string>(
        '9 计算 + 18 交换 + 9 计算（9+18+9）',
        null,
        'p.5：Rubin Ultra 的 Oberon 系统为 (9+18+9)，计算托架总数仍为 18 个但均匀分布于顶部和底部',
        '当前（Vera Rubin）Oberon 布局为 (10+9+8)，全部 1U。',
      ),
      maxTrayDistanceU: sa<number>(
        22.5,
        'U',
        'p.5：此前最大距离 19U；现在虽然交换托架翻倍，最大距离仅略增至 22.5U',
        '这是整代机架重排的直接原因——铜背板上 NVLink 信号的链路驱动能力有距离上限。',
      ),
      elevationScaleU: sa<number>(
        48.5,
        'U',
        'p.4 机架立面图 U 轴刻度顶端为 48.5（最上方 OOB 管理交换机在 U46.5 与 U47.5）',
      ),
      backplaneConnector: sa<string>(
        'PHD2 → PHD3（背板含量增加，每机架 DP 数量不变）',
        null,
        'p.10：背板含量将随 PHD2 连接器升级至 PHD3 而增加，每机架 DP 数量保持不变',
      ),
      sharedHeightAcrossVariants: sa<string>(
        '可扩展版与不可扩展版机架高度、背板完全相同，仅交换托盘不同',
        null,
        'p.5：不可扩展版本和可扩展版本的机架高度相同，唯一区别在于 NVLink Switch 托盘',
      ),
      liquidCooled: saNull(
        null,
        '⚠️ 该文全文未出现「液冷 / 冷板 / CDU」字样；仅在交换托架俯视图上画出了冷水进口、热水出口与内部歧管（p.6/p.7/p.9）。因此本项目对该代的冷却方案不做断言。',
      ),
      weightKg: saNull('kg', NOT_IN_SOURCE),
    },
  },
  {
    id: 'cmp.rubin-ultra.backplane',
    kind: 'rack',
    name: '机架内铜背板',
    vendor: 'NVIDIA / OEM',
    status: 'announced',
    summary:
      '机架内部是无源铜背板——NVIDIA 官方证实「机架内铜、机架间光」这一分层（POD 博客）；连接器代号从 PHD2 升级到 PHD3 则是 SemiAnalysis 的分析师推测。',
    presalesNote:
      '这一条对判断成本结构很有用，且这次官方也认了账：**铜没有被光取代，只是被限制在机架内**（POD 博客原话「with copper and direct optical connections」）。机架内继续用铜（省电、便宜、可靠），跨机架才上光互连——具体是不是叫 NPO/CPO、连接器是不是升级到 PHD3，那是 SemiAnalysis 一家的推测，官方没确认这些型号细节。谁要是说「Rubin Ultra 全面转向光互连」，那是没分清 scale-up 的机架内与机架间。',
    visual: { shape: 'backplane', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [POD, SA],
    specs: {
      medium: official<string>(
        '铜背板（机架内）',
        null,
        POD,
        '2026-03',
        'NVIDIA Vera Rubin Ultra NVL576 节，「…all in a single 576-GPU NVLink domain with copper and direct optical connections.」',
        'SemiAnalysis p.3 表①独立佐证：Scale up links =「Within Rack: Copper Backplane」（表②同口径）。',
      ),
      connectorGeneration: sa<string>(
        'PHD3（自 PHD2 升级，分析师推测）',
        null,
        'p.10：背板含量将随 PHD2 连接器升级至 PHD3 而增加',
        '⚠️ 具体连接器型号官方未确认，仅 SemiAnalysis 一家文章提及。',
      ),
      cableCount: saNull('根', NOT_IN_SOURCE),
    },
  },
]

// ─────────────────────────── 装配树 ───────────────────────────

/**
 * ⚠️ rackU 摆位说明：立面图（p.4）的真实排布是「底部 9 个计算托架（U8–16）→ 18 个
 * 0.75U 交换托架（U16.75–29.5）→ 顶部 9 个计算托架（U30.5–38.5）」，即计算托架被拆成
 * 上下两组。本项目为保持 **每个 roleKey 在一个系统内至多一个装配节点**（跨代比较的
 * 确定性前提），把 18 个计算托架建模为**一个**节点、一段连续 U 位；上下分组的事实
 * 记录在 note 与组件 specs 里，不进摆位。
 */
const SPLIT_NOTE =
  '⚠️ 真实布局是上下各 9 个（p.4 立面图：U8–16 与 U30.5–38.5），本项目为保证 roleKey 唯一而建模为一段连续 U 位，属 3D 摆位示意。'

export const RUBIN_ULTRA_ASSEMBLIES: AssemblyNode[] = [
  // ── cluster 层 ──
  {
    id: 'asm.ru.facility',
    systemId: SYSTEM_ID,
    parentId: null,
    componentId: 'cmp.shared.facility-room',
    roleKey: 'facility',
    label: '机房',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '装配树根节点。该 SemiAnalysis 文章只讨论机架与托架，机房侧（供配电容量、冷却水）完全未涉及。',
  },
  {
    id: 'asm.ru.facility-water',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.facility',
    componentId: 'cmp.shared.facility-water-loop',
    roleKey: 'facility-water-loop',
    label: '机房一次侧冷却水回路',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '⚠️ 该文未涉及机房侧冷却；此节点仅为让冷却链在 3D 里能闭合，不代表文中有此描述。',
  },
  {
    // v1.1 A3：与前两代同构。SemiAnalysis 那篇同样没写机房配电，
    // 此节点只为让「市电 → 电源架」这条边有个可见的起点，规格一律未知。
    id: 'asm.ru.facility-power',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.facility',
    componentId: 'cmp.shared.facility-power',
    roleKey: 'facility-power',
    label: '机房配电（列头柜 / 母线）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '⚠️ 该文未涉及机房侧配电；此节点仅为让供电链在 3D 里有起点，不代表文中有此描述。',
  },
  {
    id: 'asm.ru.cdu',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.facility',
    componentId: 'cmp.shared.cdu',
    roleKey: 'cdu',
    label: 'CDU 冷量分配单元',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '⚠️ 该文全文未出现 CDU；此节点为冷却链闭合的示意，规格一律未知。',
  },
  {
    id: 'asm.ru.row',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.facility',
    componentId: 'cmp.shared.rack-row',
    roleKey: 'rack-row',
    label: '机架列（1 个 NVL576 域）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '★ 这一列的 8 个机架合起来是**一个** NVLink 域，不是 8 套独立系统。',
  },
  {
    id: 'asm.ru.rack',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.row',
    componentId: 'cmp.rubin-ultra.oberon-rack',
    roleKey: 'rack',
    label: 'MGX NVL 机架（NVL576 之一）',
    count: 8,
    countClaim: official<number>(
      8,
      '个',
      POD,
      '2026-03',
      'NVIDIA Vera Rubin Ultra NVL576 节，「combine eight separate MGX NVL racks」',
      'SemiAnalysis p.3 表①独立佐证：Form Factor =「8x Oberon Racks」；p.4 立面图标注 VRU NVL576 (Rack 1) … (Rack 8)。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note: '每机架 72 张 Rubin Ultra GPU（官方证实），托架内部 18×4 的分布方式是 SemiAnalysis 的分析师推测；8 机架合计 576 张（官方证实）。',
  },
  {
    id: 'asm.ru.interrack-fabric',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.facility',
    componentId: 'cmp.rubin-ultra.interrack-fabric',
    roleKey: 'interrack-scaleup-fabric',
    label: '跨机架 scale-up 光互连',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '★ 本代新增的层：8 个机架之间靠官方证实的直接光连接组成单一 576-GPU NVLink 域；具体走 NPO/CPO 哪种模块、是否叫「Dragonfly」拓扑，是 SemiAnalysis 的分析师推测（见 cmp.rubin-ultra.optics-module）。',
  },

  // ── rack 层 ──
  {
    id: 'asm.ru.power-shelf',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.rubin-ultra.power-shelf',
    roleKey: 'power-shelf',
    label: '3U 110 kW 电源架',
    count: 4,
    countClaim: sa<number>(
      4,
      '个',
      'p.4 立面图：顶部 U40.5–42.5 与 U43.5–45.5、底部 U1–3 与 U4–6 各一个 3U 电源架',
    ),
    lodLevel: 'rack',
    rackU: { start: 1, height: 6 },
    note: '⚠️ 真实布局是顶部 2 个 + 底部 2 个（p.4），本项目为摆位简化排在一段。',
  },
  {
    id: 'asm.ru.compute-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.rubin-ultra.compute-tray',
    roleKey: 'compute-tray',
    label: '计算托架（1U）',
    count: 18,
    countClaim: sa<number>(
      18,
      '个',
      'p.5：计算托架总数仍为 18 个，均匀分布于机架顶部和底部（各 9 个）；p.4 立面图逐个标注',
    ),
    lodLevel: 'rack',
    rackU: { start: 8, height: 18 },
    note: SPLIT_NOTE,
  },
  {
    id: 'asm.ru.nvswitch-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.rubin-ultra.nvswitch-tray',
    roleKey: 'nvswitch-tray',
    label: 'NVSwitch 7 交换托架（0.75U）',
    count: 18,
    countClaim: sa<number>(18, '个', 'p.5：NVLink Switch 托架数量翻倍至每机架 18 个，单托架高度缩减至 0.75U'),
    lodLevel: 'rack',
    rackU: { start: 27, height: 13.5 },
    note: '18 × 0.75U = 13.5U，对应立面图 U16.75–29.50 的 0.75 步进排布（本项目整体上移以避开简化后的计算托架段）。',
  },
  {
    id: 'asm.ru.inrack-mgmt-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'inrack-mgmt-switch',
    label: '带外管理交换机（SN2201）',
    count: 2,
    countClaim: sa<number>(
      2,
      '台',
      'p.4 立面图：U47.5「OOB 1Gbe MGMT Switch 02 - SN2201_M DC」与 U46.5「…Switch 01」',
    ),
    lodLevel: 'rack',
    rackU: { start: 42, height: 2 },
    note: '立面图上位于机架顶部 U46.5/U47.5，此处为摆位简化。',
  },
  {
    id: 'asm.ru.busbar',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.shared.busbar',
    roleKey: 'dc-busbar',
    label: '直流母排',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '交换托架俯视图上有居中的 Bus Bar Connector（p.6/p.7/p.9）。',
  },
  {
    id: 'asm.ru.manifold',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.shared.manifold',
    roleKey: 'liquid-manifold',
    label: '分液歧管',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '托架俯视图上标出了冷水进口、热水出口、Internal Manifolds 与 MQDB04 快接头（p.6/p.7/p.9）。',
  },
  {
    id: 'asm.ru.backplane',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.rack',
    componentId: 'cmp.rubin-ultra.backplane',
    roleKey: 'nvlink-backplane',
    label: '机架内铜背板（PHD3）',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '机架内仍是铜；跨机架才走光。',
  },

  // ── board 层（刻意最少化：该文没有板级细节） ──
  {
    id: 'asm.ru.vera-cpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.compute-tray',
    componentId: 'cmp.rubin.vera-cpu',
    roleKey: 'host-cpu',
    label: 'Vera CPU',
    count: 2,
    countClaim: sa<number>(2, '颗', 'p.4 立面图内文，「1U Compute Tray (2 Vera CPU, 4 Rubin Ultra GPU)」'),
    lodLevel: 'board',
    rackU: null,
    note: 'CPU 沿用 Vera（p.3 表① CPU 行），因此这里复用 Vera Rubin 代的 Vera CPU 组件（其规格为 NVIDIA 官方口径）。18 托架 × 2 = 每机架 36 颗，8 机架 288 颗，与表① # of CPU Sockets = 288 一致。',
  },
  {
    id: 'asm.ru.gpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.compute-tray',
    componentId: 'cmp.rubin-ultra.gpu',
    roleKey: 'accelerator',
    label: 'Rubin Ultra GPU',
    count: 4,
    countClaim: sa<number>(4, '张', 'p.4 立面图内文，「1U Compute Tray (2 Vera CPU, 4 Rubin Ultra GPU)」'),
    lodLevel: 'board',
    rackU: null,
    note: '18 托架 × 4 = 每机架 72 张，8 机架 576 张（= 表① # of Logical GPUs）。每张封装内 2 颗 GPU die，故 die 数 1,152。',
  },
  {
    id: 'asm.ru.hbm',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.gpu',
    componentId: 'cmp.rubin-ultra.hbm4',
    roleKey: 'gpu-hbm',
    label: 'HBM4 堆栈',
    count: 8,
    countClaim: sa<number>(8, '个', 'p.3 表①，HBM Stacks = 8'),
    lodLevel: 'board',
    rackU: null,
    note: '★ 这一代的堆栈数是表里有的（8），不像 GB300/Vera Rubin 那样只能按视觉示意摆。',
  },
  {
    id: 'asm.ru.nvswitch-asic',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.nvswitch-tray',
    componentId: 'cmp.rubin-ultra.nvswitch7',
    roleKey: 'nvswitch-asic',
    label: 'NVLink 7 交换芯片',
    count: 4,
    countClaim: sa<number>(
      4,
      '颗',
      'p.10：可扩展版本每托盘 4 个 NVLink Switch ASIC；p.4 立面图标注「0.75U Expandable NVSwitch7 Tray (4 NVSwitch7)」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '18 托架 × 4 = 每机架 72 颗（不可扩展版是每托盘 2 颗、每机架 36 颗，见 p.6）。',
  },
  {
    id: 'asm.ru.optics',
    systemId: SYSTEM_ID,
    parentId: 'asm.ru.nvswitch-tray',
    componentId: 'cmp.rubin-ultra.optics-module',
    roleKey: 'scaleup-optics',
    label: 'NPO 光模块',
    count: 16,
    countClaim: sa<number>(
      16,
      '个',
      'p.7 NPO 版托架俯视图：每颗 NVLink 7 Switch 旁 4 个 NPO 模块 × 4 颗 = 16 个',
    ),
    lodLevel: 'board',
    rackU: null,
    note: 'CPO 版对应为每颗 ASIC 内嵌 4 个不可更换光引擎（p.9–p.10），本项目按 NPO 版建模（文中判断 NPO 会先上市）。',
  },
]

// ─────────────────────────── 连接 ───────────────────────────

export const RUBIN_ULTRA_CONNECTIONS: Connection[] = [
  // ── nvlink 平面 ──
  {
    id: 'con.ru.gpu-nvswitch',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.gpu',
    toAssemblyId: 'asm.ru.nvswitch-asic',
    plane: 'nvlink',
    topology: 'all-to-all',
    medium: 'copper-backplane',
    protocol: 'NVLink 7',
    bandwidth: sa<number>(
      1800,
      'GB/s',
      'p.3 表②，Bandwidth per Logical GPU (GB/s uni-di) = 1,800',
      '单向口径。',
    ),
    direction: 'bidirectional',
    label: 'GPU ↔ NVLink 7 交换芯片（机架内铜）',
    summary:
      '机架内 72 张 Rubin Ultra GPU 经铜背板连到 18 个交换托架的 72 颗 NVLink 7 交换芯片上。机架内拓扑仍是铜——这一代的变化在机架之间。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.nvswitch-backplane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.nvswitch-asic',
    toAssemblyId: 'asm.ru.backplane',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'copper-backplane',
    protocol: 'NVLink 7',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NVLink 7 交换芯片 → 铜背板',
    summary: '背板连接器由 PHD2 升级到 PHD3，背板含量增加但每机架 DP 数量不变（p.10）。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.tray-backplane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.compute-tray',
    toAssemblyId: 'asm.ru.backplane',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'copper-backplane',
    protocol: 'NVLink 7',
    bandwidth: null,
    direction: 'bidirectional',
    label: '计算托架 → 铜背板',
    summary:
      '机架重排成 9+18+9 的唯一目的就是这条链路：把最远的计算托架与交换托架之间的距离压在 22.5U 内，铜信号才驱动得动。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.nvswitch-optics',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.nvswitch-asic',
    toAssemblyId: 'asm.ru.optics',
    plane: 'nvlink',
    topology: 'star',
    medium: 'pcb-trace',
    protocol: 'NVLink 7（电 → 光转换）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NVLink 7 交换芯片 → NPO 光模块',
    summary:
      'NPO 版每颗交换芯片旁 4 个插槽式光模块（CPO 版则是芯片内嵌 4 个不可更换光引擎）。⚠️ 原图把模块带宽写成占位符「x.xT」，没有数字。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.optics-interrack',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.optics',
    toAssemblyId: 'asm.ru.interrack-fabric',
    plane: 'nvlink',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: 'NVLink 7 over NPO/CPO（Dragonfly）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NPO 光模块 ↔ 跨机架 scale-up 光互连',
    summary:
      '★ 本代的分水岭：NVLink 域第一次跨出机架。8 个 Oberon 机架经 NPO/CPO 光互连组成 Dragonfly 拓扑，576 张 GPU 成为一个 scale-up 域。',
    sourceIds: [SA],
  },

  // ── power 平面 ──
  {
    id: 'con.ru.facility-power-shelf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.facility-power',
    toAssemblyId: 'asm.ru.power-shelf',
    plane: 'power',
    topology: 'bus',
    medium: 'ac-feed',
    protocol: '机房交流配电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '机房配电 → 电源架',
    summary:
      '每机架 4 个 3U/110 kW 电源架。⚠️ 文中没有给出机架总功率；4 × 110 = 440 kW 是本项目的算术推论，不能当作分析师或官方结论引用。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.power-shelf-busbar',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.power-shelf',
    toAssemblyId: 'asm.ru.busbar',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排',
    bandwidth: sa<number>(110, 'kW', 'p.4 立面图，「3U Power Shelf 110kW (6*18.3kW)」'),
    direction: 'unidirectional',
    label: '电源架 → 直流母排',
    summary: '单架 110 kW（6 × 18.3 kW 模块），相对 GB300 的 33 kW/架、5.5 kW/模块是数量级的跃升。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.busbar-compute-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.busbar',
    toAssemblyId: 'asm.ru.compute-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → 计算托架',
    summary: '每托架 4 张 1.8–2.6 kW 的 GPU——这是电源架要从 33 kW 跳到 110 kW 的根本原因。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.busbar-nvswitch-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.busbar',
    toAssemblyId: 'asm.ru.nvswitch-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → 交换托架',
    summary: '交换托架顶部有居中的 Bus Bar Connector（p.6/p.7/p.9 俯视图）。',
    sourceIds: [SA],
  },

  // ── mgmt 平面 ──
  {
    id: 'con.ru.tray-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.compute-tray',
    toAssemblyId: 'asm.ru.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet 1 GbE（带外）',
    bandwidth: sa<number>(1, 'Gb/s', 'p.4 立面图，「OOB 1Gbe MGMT Switch 01/02 - SN2201_M DC」'),
    direction: 'bidirectional',
    label: '计算托架 → 带外管理交换机',
    summary: '机架顶部两台 SN2201 承担 1 GbE 带外管理（立面图 U46.5 / U47.5）。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.nvswitch-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.nvswitch-tray',
    toAssemblyId: 'asm.ru.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet（系统管理模块）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '交换托架 → 带外管理交换机',
    summary: '每个交换托架下部有一个 System Management Module，带 5 个 RJ45 口（p.6/p.8 俯视图）。',
    sourceIds: [SA],
  },

  // ── cooling 平面 ──
  {
    id: 'con.ru.compute-tray-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.compute-tray',
    toAssemblyId: 'asm.ru.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '计算托架 ↔ 分液歧管',
    summary:
      '⚠️ 该文没有描述计算托架的冷却细节（连「冷板」二字都没出现）；此连接按交换托架俯视图上的进出水口形态类推，仅作 3D 冷却链闭合之用。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.nvswitch-tray-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.nvswitch-tray',
    toAssemblyId: 'asm.ru.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '交换托架 ↔ 分液歧管',
    summary: '托架俯视图上明确画出了冷水进口（左，蓝）、热水出口（右，红）、内部歧管与 MQDB04 快接头（p.6/p.7/p.9）。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.manifold-cdu',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.manifold',
    toAssemblyId: 'asm.ru.cdu',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '分液歧管 ↔ CDU',
    summary: '⚠️ 该文未涉及 CDU，此段为冷却链闭合的示意。',
    sourceIds: [SA],
  },
  {
    id: 'con.ru.cdu-facility-water',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.ru.cdu',
    toAssemblyId: 'asm.ru.facility-water',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '一次侧冷却水回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'CDU ↔ 机房一次侧水',
    summary: '⚠️ 该文未涉及机房侧冷却，此段为示意。',
    sourceIds: [SA],
  },
]

// ─────────────────────────── 导览场景 ───────────────────────────

export const RUBIN_ULTRA_SCENES: ScenePreset[] = [
  {
    id: 'scene.ru.domain-overview',
    systemId: SYSTEM_ID,
    title: '8 个机架 = 一台机器',
    narration:
      '这一屏要建立的唯一认知：NVL576 的 8 个 Oberon 机架**不是 8 套独立系统**，而是通过 NPO/CPO 光互连组成 Dragonfly 拓扑的**单一 NVLink 域**——576 张 GPU 对软件来说是一台机器。机架内仍然是铜背板，只有机架之间才走光。⚠️ 全屏内容来自 SemiAnalysis 分析师文章，不是 NVIDIA 官方规格。',
    lodLevel: 'cluster',
    focusAssemblyId: 'asm.ru.facility',
    planes: ['nvlink', 'power'],
    highlightAssemblyIds: ['asm.ru.rack', 'asm.ru.interrack-fabric'],
    presalesNote:
      '汇报时这一页务必先说来源级别，再说结论。可以讲趋势（scale-up 域要跨机架了），不要讲数字（PFLOPS / token 产能都没有官方规格表支撑）。',
  },
  {
    id: 'scene.ru.rack-relayout',
    systemId: SYSTEM_ID,
    title: '机架为什么要重排成 9+18+9',
    narration:
      '交换托架从 9 个翻倍到 18 个、高度从 1U 压到 0.75U，计算托架则拆成上下两组各 9 个。原因是物理的：铜背板上的 NVLink 信号有驱动距离上限，重排后最远的计算托架到最远的交换托架只有 22.5U。多出来的交换容量（每机架 72 颗 NVLink 7 芯片，是 NVL72 版的两倍）就是用来支撑跨机架光互连的。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.ru.rack',
    planes: ['nvlink', 'power', 'cooling'],
    highlightAssemblyIds: ['asm.ru.nvswitch-tray', 'asm.ru.compute-tray', 'asm.ru.power-shelf'],
    presalesNote:
      '这一屏最能体现「结构服从物理」：客户如果问「为什么不直接堆更多卡」，答案就是铜的驱动距离和电源密度——4 个 110 kW 电源架也是同一个约束链上的结果。',
  },
]

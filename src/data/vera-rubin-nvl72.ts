import { claim } from './claim'
import type {
  AssemblyNode,
  Claim,
  ClaimValue,
  Connection,
  FactorySystem,
  HardwareComponent,
  ScenePreset,
} from './types'

/**
 * Vera Rubin NVL72 内容包（`announced` 代际）。
 *
 * 数据来源纪律：本文件中的每一个数字都来自 **NVIDIA 官方**页面/发布稿/技术博客，
 * locator 精确到规格表行或段落原文。官方没公布的一律 `value: null` + note 说明，
 * **不用作者记忆、不用第三方媒体、不用分析师估算补齐**。
 *
 * ⚠️ 两条必须随数字一起说出口的官方限定：
 * 1. 产品页、DGX 页与数据手册的规格表**表头都挂着上标 ¹**，脚注 1 为「Preliminary information.
 *    All values are up to and subject to change.」——整张表都是**预发布口径**，不是量产验收值。
 *    v1.5 起这句由 `vr()` / `vrVendor()` **按源自动注入** Claim.note（见 `withPreliminary`），
 *    因为 `DetailPanel` 的 `SourceLine` 只渲染 source 的 title/publisher/asOf，
 *    `SourceRef.note` 从不上屏——写在 sources.ts 里等于没对用户说。
 * 2. 算力只有带脚注 2「Dense specification」的行才是稠密口径（NVFP4 Training 35 PFLOPS/卡、
 *    FP8/FP6 Training 17.5 PFLOPS/卡）。表头那行更醒目的「NVFP4 Inference 50 PFLOPS」
 *    不进 `mathSpecs`，且理由是**硬证据**：数据手册 PDF 的脚注 1 比产品页多一句
 *    「NVFP4 Inference specification is sparse.」——官方明说了那一列是稀疏口径。
 *
 * ⚠️ 三条 v1.5 事实核验订正（改之前先读这里，别改回去）：
 * - **机架级 NVLink 走后部铜缆脊柱，不是 PCB 中板**。官方原话：「This high-speed data transfer
 *   happens in the NVLink spine at the back of the rack, which features four modular preintegrated
 *   cable cartridges housing 5,000 copper cables over two miles in length.」；而「cable-free」修饰的
 *   是**托盘**（「cable-free, hose-free, and fanless compute and NVLink switch trays」），
 *   PCB 中板官方点名连接的是**超级芯片 ↔ 前部网卡仓**。官方没说明两者电气分工，两说并存不互相否定。
 *   代际差异因此在**托盘内部**，不在机架脊柱——GB300 与 Vera Rubin 的机架 NVLink 同为铜缆形态。
 * - **1.8 TB/s NVLink-C2C 是「每超级芯片」口径，不是单卡**。产品页规格表 NVLink-C2C 行的
 *   Rubin GPU 列是「-」，36 × 1.8 = 64.8 ≈ 官方整机架 65 TB/s。按单卡乘 72 会差一倍。
 * - **ConnectX-9 的板级拆分不是确证事实**（官方英文「quad ConnectX-9 SuperNIC boards」有歧义），
 *   确证的只有「每托盘 8 张、每机架 144 张」。见 `CX9_BOARD_AMBIGUITY`。
 *
 * ⚠️ 官方未公布、因而全项目下游一律 null 的关键项：
 * - **整机架功率（kW）**：任何官方规格表都没有这一行（唯一提到 Vera Rubin 机架功率的
 *   NVIDIA 博客自身正文与配图互相矛盾），因此 `rackPowerKW.value = null`，
 *   产能估算的 tokens/W 会据此拒绝出数——这是预期行为，不是缺陷。
 * - **Rubin GPU 单卡 TDP**：未公布（官方唯一出现的 1800 W 是另一款 NVL4 产品的
 *   benchmark 假设，不能挪用）。
 * - 每卡 NVLink 链路条数、NVSwitch 端口数、机架 U 高与逐 U 布局。
 */

const SYSTEM_ID = 'sys.vera-rubin-nvl72'

// ─────────────────────────── 源与 Claim 小工具 ───────────────────────────

const VR_PAGE = 'src.nvidia-vera-rubin-page'
const VR_PRESS = 'src.nvidia-rubin-press'
const VR_POD = 'src.nvidia-rubin-pod-blog'
const VR_CHIPS = 'src.nvidia-rubin-chips-blog'
const VR_GPU_BLOG = 'src.nvidia-rubin-gpu-blog'
const VR_DGX = 'src.nvidia-dgx-rubin-page'
const VR_DATASHEET = 'src.nvidia-vera-rubin-datasheet'
/** 2026-05-31 GTC Taipei「进入量产」发布稿——上市时间的最新官方口径（v1.5 新增）。 */
const VR_FULLPROD_PRESS = 'src.nvidia-vera-rubin-fullprod-press'
/** 2025-10 OCP 博客——NVL144 → NVL72 改名的唯一官方留痕（v1.5 新增，此前只登记未引用）。 */
const VR_OCP = 'src.nvidia-ocp-vera-rubin-blog'

/** 各源的抓取/发布时间（与 sources.ts 保持一致）。 */
const AS_OF: Record<string, string> = {
  [VR_PAGE]: '2026-08',
  [VR_PRESS]: '2026-01',
  [VR_POD]: '2026-03',
  [VR_CHIPS]: '2026-01',
  [VR_GPU_BLOG]: '2026-07',
  [VR_DGX]: '2026-08',
  [VR_DATASHEET]: '2026-08',
  [VR_FULLPROD_PRESS]: '2026-05',
  [VR_OCP]: '2025-10',
}

const PRELIMINARY =
  '⚠️ 官方规格表脚注 1：「Preliminary information. All values are up to and subject to change.」（预发布口径，不是量产验收值）'

/**
 * 带「Preliminary information」脚注的三个源：Vera Rubin 产品页、DGX Vera Rubin 产品页、
 * Vera Rubin 数据手册 PDF。三者的规格表表头都直接挂着上标 ¹，即**整张表**都在这条脚注之下。
 *
 * ★ v1.5 缺陷修复：此前 PRELIMINARY 只被手写在 2 条 Claim 上，其余十几条同样落在这条脚注下的
 *   规格（20.7 TB / 1,580 TB/s / 2,520 PFLOPS / 3,168 核 / 1,296 颗 …）都是裸数字。
 *   而 `DetailPanel` 的 `SourceLine` 只渲染 source 的 title/publisher/asOf，**`SourceRef.note`
 *   从不上屏**——写在 sources.ts 里的那句声明对最终用户不可见，用户看到的是一枚证据徽章加一个
 *   不带任何预发布提示的数字。
 *   因此改成在工厂函数里**按源自动注入**：以后任何人往这三个源上新建 Claim 都会自动带上，
 *   不再依赖「记得手写」。手写的 note 与它用换行拼接，两句都保留。
 */
const PRELIMINARY_SOURCES = new Set([VR_PAGE, VR_DGX, VR_DATASHEET])

function withPreliminary(sourceId: string, note: string | null): string | null {
  if (!PRELIMINARY_SOURCES.has(sourceId)) return note
  if (note === null) return PRELIMINARY
  // 已经手写过就不重复贴（防止历史 note 与自动注入叠出两遍）
  if (note.includes('Preliminary information')) return note
  return `${note}\n${PRELIMINARY}`
}

/** 官方已公布的规格：evidence=verified_spec，status=announced（产品尚未量产交付）。 */
function vr<T extends ClaimValue>(
  value: T,
  unit: string | null,
  sourceId: string,
  locator: string,
  note: string | null = null,
): Claim<T> {
  return claim<T>({
    value,
    unit,
    sourceId,
    locator,
    evidence: 'verified_spec',
    status: 'announced',
    asOf: AS_OF[sourceId] ?? '2026-08',
    note: withPreliminary(sourceId, note),
  })
}

/**
 * 官方说了、但**不是规格表里的确切数字**的那一档：厂商宣称口径。
 *
 * 用于两类内容（`types.ts` 对 `verified_spec` 的定义是「官方规格表/参考架构中的确切数字」，
 * 这两类都不满足，硬标成 verified_spec 是给读者错误的确定性）：
 * 1. 发布稿里的**前瞻性上市承诺**（带 Safe Harbor 声明，随时可能变）；
 * 2. 官方英文本身**存在歧义**、当前数值是本项目对该英文的一种解读。
 */
function vrVendor<T extends ClaimValue>(
  value: T,
  unit: string | null,
  sourceId: string,
  locator: string,
  note: string,
  confidence: 'medium' | 'low' = 'medium',
): Claim<T> {
  return claim<T>({
    value,
    unit,
    sourceId,
    locator,
    evidence: 'vendor_claim',
    status: 'announced',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence,
    note: withPreliminary(sourceId, note),
  })
}

/** 关键数量（必带 locator）。 */
function vrCount(value: number, sourceId: string, locator: string, note: string | null = null): Claim<number> {
  return vr<number>(value, '个', sourceId, locator, note)
}

/**
 * ★ ConnectX-9 板级拆分的歧义留痕（v1.5）。
 *
 * 六芯片博客只有两句话涉及板级结构，逐字为：
 *   「each compute tray contains quad ConnectX-9 SuperNIC boards, delivering 1.6Tb/s of network
 *     bandwidth per Rubin GPU」
 *   「Each quad ConnectX-9 SuperNIC board connects to each Vera CPU.」
 * 第二句把「quad ConnectX-9 SuperNIC board」当成**一个复合名词**（一块载有 4 颗 CX-9 的板），
 * 配合每托盘 2 颗 Vera CPU，更自然的读法是 **2 块板 × 每块 4 张 = 8 张**；
 * 第一句单独看则可以读成 **4 块板 × 每块 2 张 = 8 张**（本项目当前建模取的读法）。
 * 两种读法的总数都是 8，与 POD 博客「eight ConnectX-9 SuperNICs」一致。
 *
 * 因此本项目的证据边界是：**「每托盘 8 张、每机架 144 张」是确证事实，板级拆分不是**。
 * 板数/每板张数一律降为 `vendor_claim` + `confidence: 'low'`，并在 note 里写明歧义。
 */
const CX9_BOARD_AMBIGUITY =
  '⚠️ **官方英文有歧义，本条是其中一种读法，不是确证事实**。六芯片博客只有两句涉及板级结构：' +
  '「each compute tray contains quad ConnectX-9 SuperNIC boards, delivering 1.6Tb/s of network bandwidth per ' +
  'Rubin GPU」与「Each quad ConnectX-9 SuperNIC board connects to each Vera CPU.」——' +
  '第二句把「quad ConnectX-9 SuperNIC board」当作一个复合名词（载 4 颗 CX-9 的板），' +
  '配合每托盘 2 颗 Vera CPU，可读成 **2 块板 × 4 张**；第一句单独看又可读成 **4 块板 × 2 张**。' +
  '两种读法总数都是 8 张/托盘（与 POD 博客「eight ConnectX-9 SuperNICs」一致）。' +
  '★ 本项目只把「每托盘 8 张、每机架 144 张」当确证事实；板级拆分取 4×2 建模，' +
  '仅为 3D 摆位需要一个确定形态，**不得当作官方规格引用**。'

/** 「官方未公布，本项目不编数」。 */
function vrNull(unit: string | null, sourceId: string, note: string, locator: string | null = null): Claim {
  return claim({
    value: null,
    unit,
    sourceId,
    locator,
    evidence: 'verified_spec',
    status: 'announced',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence: 'low',
    note,
  })
}

// ─────────────────────────── 系统 ───────────────────────────

export const VERA_RUBIN_SYSTEM: FactorySystem = {
  id: SYSTEM_ID,
  name: 'NVIDIA Vera Rubin NVL72',
  vendor: 'NVIDIA',
  status: 'announced',
  capacityPolicy: 'standard',
  architecture: 'nvlink-rack-domain',
  generation: 'vera-rubin',
  referenceUrl: 'https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/',
  summary:
    '下一代机架级系统：72 张 Rubin GPU + 36 颗 Vera CPU，经机架后部的第六代 NVLink 铜缆脊柱连成一个域，配 ConnectX-9 SuperNIC 与 BlueField-4 DPU，装在第三代 MGX 单宽机架的无线缆盲插托盘里。',
  presalesNote:
    '跟 GB300 讲差异只需要抓三件事：**显存带宽从 8 TB/s 跳到 22 TB/s（decode 直接受益）**、**NVLink 从每卡 1.8 TB/s 到 3.6 TB/s**、**scale-out 从每 GPU 1 张 800 Gb/s 网卡变成 2 张（1.6 Tb/s/GPU）**。注意口径纪律：官方规格表明确写着「Preliminary information」，报给客户时必须带上这句；整机架功率官方至今没公布，谁给你一个 kW 数字都要问出处。',
  sourceIds: [VR_PAGE, VR_PRESS, VR_POD, VR_GPU_BLOG, VR_DGX, VR_DATASHEET, VR_FULLPROD_PRESS, VR_OCP],
  keySpecs: {
    // note 里的「Preliminary information」脚注由 vr() 按源自动注入，见 withPreliminary()。
    gpuCount: vr<number>(72, '张', VR_PAGE, '规格表 Configuration 行，「72 Rubin GPUs | 36 Vera CPUs」'),
    cpuCount: vr<number>(36, '颗', VR_PAGE, '规格表 Configuration 行，「72 Rubin GPUs | 36 Vera CPUs」'),
    computeTrayCount: vr<number>(
      18,
      '个',
      VR_POD,
      'NVIDIA Vera Rubin NVL72 节，「…across 18 compute trays, alongside 9 NVLink switch trays」',
    ),
    nvswitchTrayCount: vr<number>(
      9,
      '个',
      VR_POD,
      'NVIDIA Vera Rubin NVL72 节，「…alongside 9 NVLink switch trays」（DGX 产品页规格表同口径：「9x L1 NVIDIA NVLink Switches」）',
    ),
    rackPowerKW: vrNull(
      'kW',
      VR_PAGE,
      '★ NVIDIA 至今未在任何官方规格表中公布 Vera Rubin NVL72 的整机架功率。唯一提到该数字的 NVIDIA 博客（DSX MaxLPS）正文写「Vera Rubin NVL72 从 136 kW 降到 101 kW」，同页配图却把同一组数字标成 GB300 NVL72，且那是 provisioned power 而非铭牌规格——因此本项目取 null，tokens/W 一律不出数。',
    ),
    nvlinkAggregateBandwidthTBs: vr<number>(
      260,
      'TB/s',
      VR_PAGE,
      '规格表 NVLink Bandwidth 行，「260 TB/s」（发布稿同口径：「the Vera Rubin NVL72 rack provides 260TB/s」）',
    ),
    c2cAggregateBandwidthTBs: vr<number>(
      65,
      'TB/s',
      VR_PAGE,
      '规格表 NVLink-C2C Bandwidth 行：整机架列「65 TB/s」，Vera Rubin Superchip 列「1.8 TB/s」',
      '= 36 个超级芯片 × 1.8 TB/s ≈ 64.8 TB/s，官方取整为 65 TB/s；不是 GPU↔GPU 的 NVLink 6，而是 CPU↔GPU 的 NVLink-C2C 在整机架尺度上的聚合值。',
    ),
    gpuMemoryTotalTB: vr<number>(20.7, 'TB', VR_PAGE, '规格表 GPU Memory | Bandwidth 行，「20.7 TB HBM4」'),
    gpuMemoryBandwidthTBs: vr<number>(
      1580,
      'TB/s',
      VR_PAGE,
      '规格表 GPU Memory | Bandwidth 行，「20.7 TB HBM4 | 1,580 TB/s」',
    ),
    cpuMemoryTB: vr<number>(54, 'TB', VR_PAGE, '规格表 CPU Memory 行，「54 TB LPDDR5X」'),
    fastMemoryTB: vr<number>(
      75,
      'TB',
      VR_DATASHEET,
      '数据手册第 1 页 Key Features，「75 TB of fast-access memory」',
      '= 20.7 TB HBM4 + 54 TB LPDDR5X。对照 GB300 的 37 TB，「快内存」翻了一倍。',
    ),
    fp4DensePflops: vr<number>(
      2520,
      'PFLOPS',
      VR_PAGE,
      '规格表 NVFP4 Training² 行，「2,520 PFLOPS」+ 脚注 2「Dense specification」',
      '稠密口径，可与 GB300 的 1080 PFLOPS 稠密值直接对比（2.33×）。',
    ),
    fp4InferencePflops: vr<number>(
      3600,
      'PFLOPS',
      VR_PAGE,
      '规格表 NVFP4 Inference 行，「3,600 PFLOPS」（发布稿口径：单卡 50 PFLOPS）',
      '⚠️ **这一列是稀疏口径，官方已明说**：Vera Rubin 数据手册 PDF 的 Technical Specifications¹ 脚注 1 比产品页' +
        '多出后半句，逐字为「Preliminary information. All values are up to and subject to change. NVFP4 Inference ' +
        'specification is sparse.」（产品页脚注 1 只有前半句，且该行也没有脚注 2「Dense specification.」）。' +
        '因此本项目不让它进 mathSpecs，产能估算只用上面带脚注 2 的稠密值——这不是保守处理，是有硬证据的排除。',
    ),
    fp8DensePflops: vr<number>(
      1260,
      'PFLOPS',
      VR_PAGE,
      '规格表 FP8/FP6 Training² 行，「1,260 PFLOPS」+ 脚注 2「Dense specification」',
      'GB300 产品页给的 720 PFLOPS 是含稀疏口径（稠密 360），因此稠密对稠密是 360 → 1260（3.5×）。',
    ),
    cpuCoreCount: vr<number>(
      3168,
      '核',
      VR_PAGE,
      '规格表 CPU Core Count 行，「3,168 custom NVIDIA Olympus cores (Arm compatible)」',
    ),
    scaleOutBandwidthTBs: vr<number>(
      28.8,
      'TB/s',
      VR_PAGE,
      '规格表 Networking Bandwidth (Scale Out) 行，「28.8 TB/s」',
    ),
    totalChipCount: vr<number>(
      1296,
      '颗',
      VR_PAGE,
      '规格表 Total NVIDIA + HBM4 Chips 行，「1,296」',
    ),
    availability: vrVendor<string>(
      '官方最新口径：量产出货「今年秋季开始」（2026-05-31 发布稿）；CES 2026-01 发布稿的原口径为「2026 下半年由合作伙伴上市」',
      null,
      VR_FULLPROD_PRESS,
      'Availability 节，「Production shipments of Vera Rubin are set to begin starting this fall.」（同稿正文：「NVIDIA today announced the NVIDIA Vera Rubin platform is ramping into full production to power agentic AI factories worldwide.」）',
      '★ 三点口径纪律：' +
        '① **evidence 是 vendor_claim 不是 verified_spec**——这是发布稿里的前瞻性上市承诺（两篇发布稿末尾都带 ' +
        'Safe Harbor 声明），不是「官方规格表/参考架构中的确切数字」。' +
        '② **两版官方口径并存**：2026-01 CES 发布稿「NVIDIA Rubin is in full production, and Rubin-based ' +
        'products will be available from partners the second half of 2026.」；2026-05-31 GTC Taipei 发布稿把它' +
        '细化为「set to begin starting this fall」。后者更新更具体，前者不作废——两句不矛盾，是同一承诺的收窄。' +
        '③ **注意「full production」说的是制造不是出货**：官方原文是平台「ramping into full production」，' +
        '而客户侧的 production shipments 是「set to begin」（将要开始）。截至本内容包生成时点，' +
        'NVIDIA 没有发过「已开始出货」的官方声明，因此 sys.vera-rubin-nvl72 的 status 保持 announced，' +
        '不改 shipping——把「即将出货」讲成「在售」正是本项目要防的那类偏差。',
    ),
  },
  // 与 GB300 一致的示意高度：官方同样未公布 Vera Rubin 机架的 U 高与逐 U 布局
  rackUnitsForLayout: 48,
}

// ─────────────────────────── 组件 ───────────────────────────

export const VERA_RUBIN_COMPONENTS: HardwareComponent[] = [
  {
    id: 'cmp.rubin.rubin-gpu',
    kind: 'gpu',
    name: 'NVIDIA Rubin GPU',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '双 die 经 NV-HBI 合封成的一张 GPU，带 288 GB HBM4 与 22 TB/s 显存带宽，通过第六代 NVLink 与机架内其余 71 张卡直连。',
    presalesNote:
      '客户最该记的一个数字是 **22 TB/s**：相对 Blackwell/Blackwell Ultra 的 2.8 倍显存带宽。推理的 decode 阶段是带宽瓶颈，这一项几乎线性地决定「同样的模型每秒能吐多少 token」。显存容量反而没变（都是 288 GB），所以「装得下多大模型」这件事上 Rubin 与 B300 是同一量级——涨的是速度不是容量。另外注意口径：官方一张卡 = 一个封装（两颗 die），不要跟着某些材料按 die 数报 144。',
    visual: { shape: 'chip', colorToken: 'accent' },
    imageUrl: 'https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/',
    sourceIds: [VR_PAGE, VR_GPU_BLOG, VR_PRESS],
    mathSpecs: {
      memoryGB: 288,
      bandwidthTBs: 22,
      fp8Tflops: 17500,
      fp4Tflops: 35000,
      tdpW: null,
      derivation:
        '显存 288 GB 与带宽 22 TB/s = 产品页规格表 Rubin GPU 列「288 GB HBM4 | 22 TB/s」（GPU 架构博客同值）；' +
        'FP8 稠密 17,500 TFLOPS = 规格表「FP8/FP6 Training 17.5 PFLOPS」+ 脚注 2「Dense specification」；' +
        'FP4 稠密 35,000 TFLOPS = 规格表「NVFP4 Training 35 PFLOPS」+ 同一脚注；' +
        '⚠️ 更醒目的「NVFP4 Inference 50 PFLOPS」不采用，且理由是硬证据而非保守推断——' +
        '数据手册 PDF 的脚注 1 明写「NVFP4 Inference specification is sparse.」（产品页脚注 1 没有这后半句，' +
        '该行也不带脚注 2「Dense specification.」）；' +
        'TDP 官方未公布，保持 null（官方唯一出现的 1800 W 属于另一款 NVL4 产品的 benchmark 假设）。',
    },
    specs: {
      hbmPerGpuGB: vr<number>(
        288,
        'GB',
        VR_PAGE,
        '规格表 Rubin GPU 列 GPU Memory | Bandwidth，「288 GB HBM4 | 22 TB/s」',
        '与 GB300 的 B300 同为 288 GB——容量没涨，涨的是带宽。',
      ),
      memoryBandwidthTBs: vr<number>(
        22,
        'TB/s',
        VR_GPU_BLOG,
        'The Rubin GPU 节，「Rubin integrates up to 288 GB of HBM4 memory, driven by dedicated HBM controllers and 12-Hi stacks, to deliver up to 22 TB/s of peak bandwidth.」',
        '★ v1.5 订正 locator：此前用「…」把分属两段的两句拼成了一句。' +
          '「2.8x increase」出自本文另一节（Memory 一节）的独立句子：「this subsystem provides up to 22 TB/s of ' +
          'memory bandwidth: a 2.8x increase over Blackwell and Blackwell Ultra.」——两句都属实，但不是同一段。',
      ),
      nvlinkPerGpuGBs: vr<number>(
        3600,
        'GB/s',
        VR_GPU_BLOG,
        'The Rubin GPU 节，「NVLink 6 provides 3,600 GB/s scale-up bandwidth」（产品页写作 3.6 TB/s）',
        '对照 GB300 第五代 NVLink 的 1800 GB/s，正好翻倍。',
      ),
      nvlinkLinksPerGpu: vrNull(
        '条',
        VR_GPU_BLOG,
        'NVIDIA 未公布 Rubin GPU 的 NVLink 链路条数（GB300 是每卡 18 条对应 18 颗 NVSwitch）。已知每托盘 4 颗 NVLink 6 交换芯片 × 9 托盘 = 36 颗，但官方没有给出「每 GPU 几条链路」的说法，不做推导。',
      ),
      // ⚠️ 键名沿用历史命名（compare.ts 按键名跨代配对，不能改），但**口径不是单卡**——见 note。
      c2cBandwidthGBs: vrVendor<number>(
        1800,
        'GB/s',
        VR_GPU_BLOG,
        'The Rubin GPU 节，「…NVLink-C2C delivers 1,800 GB/s for coherent CPU-GPU communication…」',
        '★ **两说并存，别按单卡用**（v1.5 订正：此前本条挂在单张 GPU 上，会推出 72 × 1.8 = 129.6 TB/s，' +
          '与官方整机架 65 TB/s 差一倍）：' +
          '① **产品页规格表的 Rubin GPU 列在 NVLink-C2C Bandwidth 这一行是「-」**——官方刻意没给单卡 C2C 数字；' +
          '同一行 Vera Rubin Superchip 列是「1.8 TB/s」、NVL72 列是「65 TB/s」，' +
          '而 36 个超级芯片 × 1.8 = 64.8 ≈ 65，说明 **1.8 TB/s 是「每超级芯片（1 Vera + 2 Rubin）」口径**；' +
          '六芯片博客也把 1.8 TB/s 印在 **Vera CPU** 卡片上。' +
          '② 但 GPU 架构博客确实在 Rubin GPU 的语境里写了这句「NVLink-C2C delivers 1,800 GB/s for coherent ' +
          'CPU-GPU communication」（同句还并列了 NVLink 6 的 3,600 GB/s 与 PCIe Gen 6 的 256 GB/s，' +
          '那两项确为单卡口径），**官方没有说明这里是不是单卡**。' +
          '★ 对外只报「每超级芯片 1.8 TB/s、整机架 65 TB/s」这两个有规格表行支撑的数字，不要乘 72。',
        'low',
      ),
      transistorCountB: vr<number>(
        336,
        '十亿',
        VR_GPU_BLOG,
        '正文首段，「Its 336 billion transistors, 224 streaming multiprocessors (SMs), and 896 Tensor Cores provide the raw compute density」（摘要要点同口径：「using 336 billion transistors, 224 streaming multiprocessors, 896 Tensor Cores」）',
        '★ v1.5 订正 locator：此前把原文的 streaming multiprocessors 缩写成了「SMs」再当引文，属改写原文。',
      ),
      smCount: vr<number>(
        224,
        '个',
        VR_GPU_BLOG,
        '正文首段，「Its 336 billion transistors, 224 streaming multiprocessors (SMs), and 896 Tensor Cores provide the raw compute density」',
        '★ v1.5 订正 locator：原文写的是 streaming multiprocessors（首次出现处才带括注 SMs），不是「224 SMs」。',
      ),
      diesPerPackage: vr<number>(
        2,
        '颗',
        VR_GPU_BLOG,
        'The Rubin GPU 节，「These two dies are unified on a single package through… NVIDIA High-Bandwidth Interface (NV-HBI)」',
        '★ 口径要点：官方把「一个封装（两颗 die）」算作一张 GPU，所以 NVL72 = 72 张 = 144 颗 die。' +
          '⚠️ 关于 NVL144 → NVL72 改名（v1.5 订正）：官方唯一的留痕是 2025-10 OCP 博客的编者按，逐字为' +
          '「Editor\'s note: This blog has been updated to reflect a branding change from Vera Rubin NVL144 to ' +
          'Vera Rubin NVL72.」——官方**只说了这是一次 branding change，没有给出原因**。' +
          '「因为从按 die 计数改成按封装计数」是本项目基于上面这条封装口径做的**推断**，不是官方说法；' +
          '此前把它写成官方沿革（并挂在 GPU 架构博客名下）是错的——该博客全篇零出现「NVL144」与「CPX」。',
      ),
      fp4DenseTflopsPerGpu: vr<number>(
        35000,
        'TFLOPS',
        VR_PAGE,
        '规格表 Rubin GPU 列 NVFP4 Training²，「35 PFLOPS」+ 脚注 2「Dense specification」',
        'GB300 的 B300 同口径为 15,000 TFLOPS。',
      ),
      pcieGen: vr<string>(
        'PCIe Gen 6 x16（最高 256 GB/s）',
        null,
        VR_GPU_BLOG,
        'The Rubin GPU 节，「x16 PCIe Gen 6 provides up to 256 GB/s of host connectivity」',
      ),
      tdpW: vrNull(
        'W',
        VR_PAGE,
        'NVIDIA 未公布 Rubin GPU 单卡 TDP。官方材料里唯一出现的 1800 W/GPU 是 Vera Rubin **NVL4** 的 benchmark 假设脚注，不能当作 NVL72 的单卡 TDP 使用。',
      ),
    },
  },
  {
    id: 'cmp.rubin.vera-cpu',
    kind: 'cpu',
    name: 'NVIDIA Vera CPU',
    vendor: 'NVIDIA',
    status: 'announced',
    summary: '88 核自研 Olympus 架构主机 CPU（Armv9.2 兼容），经 NVLink-C2C 与 Rubin GPU 共享内存空间。',
    presalesNote:
      'Vera 相对 Grace 的变化：核数从 72 核/托盘 涨到 176 核/托盘，内存也从 1 TB/托盘 涨到 3 TB/托盘。对客户的意义是「CPU 侧不再是数据预处理的瓶颈」，以及 MoE 场景下可以往 CPU 内存里放更多冷专家。注意它是 NVIDIA 自研核（Olympus），不是标准 Neoverse 公版核。',
    visual: { shape: 'chip', colorToken: null },
    imageUrl: null,
    sourceIds: [VR_PAGE, VR_PRESS],
    specs: {
      coresPerCpu: vr<number>(
        88,
        '核',
        VR_PRESS,
        'NVIDIA Vera CPU 节，「built with 88 NVIDIA custom Olympus cores, full Armv9.2 compatibility」',
      ),
      coresPerTray: vr<number>(
        176,
        '核',
        VR_PAGE,
        '规格表 CPU Core Count「3,168 cores」÷ 18 个计算托盘（= 每托盘 2 颗 × 88 核）',
        '由官方整机架值折算，非官方逐托盘规格行。',
      ),
      lpddr5PerTrayTB: vr<number>(
        3,
        'TB',
        VR_PAGE,
        '规格表 CPU Memory「54 TB LPDDR5X」÷ 18 个计算托盘（= 每托盘 2 颗 × 1.5 TB）',
        '由官方整机架值折算，非官方逐托盘规格行。',
      ),
      memoryBandwidthTBs: vr<number>(
        1.2,
        'TB/s',
        VR_PAGE,
        'Vera CPU 产品页，「up to 1.2 terabytes per second (TB/s) of LPDDR5X memory bandwidth」',
      ),
      threadsPerCpu: vr<number>(
        176,
        '线程',
        VR_PAGE,
        'Vera CPU 产品页，「NVIDIA Spatial Multithreading creates 176 threads」',
      ),
      c2cInterconnect: vr<string>(
        'NVLink C2C',
        null,
        VR_GPU_BLOG,
        'The Rubin GPU 节，「…NVLink-C2C delivers 1,800 GB/s for coherent CPU-GPU communication…」（Vera↔Rubin 之间仍是 NVLink-C2C）',
        '⚠️ 那个 1,800 GB/s 的数值口径见 cmp.rubin.rubin-gpu.specs.c2cBandwidthGBs：产品页规格表把 1.8 TB/s 放在' +
          'Vera Rubin Superchip 列，Rubin GPU 列是「-」，因此应按**每超级芯片**理解，不要乘 72。',
      ),
      tdpW: vrNull('W', VR_PAGE, 'NVIDIA 未公布 Vera CPU 的单颗 TDP。'),
    },
  },
  {
    id: 'cmp.rubin.hbm4',
    kind: 'hbm',
    name: 'HBM4 高带宽显存堆栈',
    vendor: 'NVIDIA / 存储厂商',
    status: 'announced',
    summary: '与 Rubin GPU 合封的第四代高带宽显存，12-Hi 堆叠，单卡 288 GB / 22 TB/s。',
    presalesNote:
      'HBM3e → HBM4 是这一代最值钱的升级：容量不变（288 GB）但带宽 2.8 倍。把这句话讲给客户听——「同样装得下的模型，token 吐出来的速度快接近 3 倍」，比讲 PFLOPS 有用得多。',
    visual: { shape: 'chip-stack', colorToken: null },
    imageUrl: null,
    sourceIds: [VR_PAGE, VR_GPU_BLOG],
    specs: {
      totalPerRackTB: vr<number>(20.7, 'TB', VR_PAGE, '规格表 GPU Memory 行，「20.7 TB HBM4」'),
      bandwidthPerRackTBs: vr<number>(
        1580,
        'TB/s',
        VR_PAGE,
        '规格表 GPU Memory | Bandwidth 行，「20.7 TB HBM4 | 1,580 TB/s」',
      ),
      stackHeight: vr<string>(
        '12-Hi',
        null,
        VR_GPU_BLOG,
        'The Rubin GPU 节，「driven by dedicated HBM controllers and 12-Hi stacks」',
      ),
      stacksPerGpu: vrNull(
        '个',
        VR_GPU_BLOG,
        'NVIDIA 只说明是 12-Hi 堆栈，未公布每张 Rubin GPU 的 HBM4 堆栈数量；3D 场景中的堆栈数为视觉示意。',
      ),
    },
  },
  {
    id: 'cmp.rubin.compute-tray',
    kind: 'tray',
    name: 'Vera Rubin 计算托盘',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '含 2 个 Vera Rubin 超级芯片（合计 2 颗 Vera CPU + 4 张 Rubin GPU）、8 张 ConnectX-9 SuperNIC 与 1 张 BlueField-4 DPU 的无线缆液冷托盘。',
    presalesNote:
      '对比 GB300 的托盘要说清两点：**GPU/CPU 数量没变（4+2）**，但**网卡从 4 张变成 8 张**，因为每张 GPU 配 2 张 800 Gb/s 单口卡凑 1.6 Tb/s。另一点客户运维会很在意：官方说托盘装配从近 2 小时降到约 5 分钟（2026-01 材料写 1.5 小时以上、18×，2026-03 POD 博客写 nearly two hours、最高 20×，两版并存），**无线缆盲插的主语是托盘**——机架后部的 NVLink 脊柱仍是 4 个预集成铜缆匣、约 5,000 根铜缆，别讲成「整机架没有线缆」。',
    visual: { shape: 'tray-slab', colorToken: null },
    imageUrl: null,
    sourceIds: [VR_POD, VR_CHIPS],
    specs: {
      gpusPerTray: vrCount(
        4,
        VR_POD,
        'Compute and NVLink Switch trays 节，「Each compute tray features two NVIDIA Vera Rubin superchips」× 每超级芯片 2 张 Rubin GPU（规格表 Vera Rubin Superchip 列：「2 Rubin GPUs | 1 Vera CPU」）',
      ),
      cpusPerTray: vrCount(
        2,
        VR_POD,
        'Compute and NVLink Switch trays 节，「two NVIDIA Vera Rubin superchips」× 每超级芯片 1 颗 Vera CPU',
      ),
      superchipsPerTray: vrCount(
        2,
        VR_POD,
        'Compute and NVLink Switch trays 节，「Each compute tray features two NVIDIA Vera Rubin superchips with 17,000 components each」',
      ),
      connectx9PerTray: vrCount(
        8,
        VR_POD,
        'Compute and NVLink Switch trays 节，「the front modular bays that house eight ConnectX-9 SuperNICs and one BlueField-4 DPU」',
      ),
      bluefield4PerTray: vrCount(
        1,
        VR_POD,
        'Compute and NVLink Switch trays 节，「…eight ConnectX-9 SuperNICs and one BlueField-4 DPU」',
      ),
      nvfp4PerTrayPflops: vr<number>(
        200,
        'PFLOPS',
        VR_CHIPS,
        '计算托盘图注，「200 petaFLOPS of NVFP4 AI performance per tray」',
        '⚠️ 未标注稠密/稀疏口径，仅作量级参考，不进产能数学。',
      ),
      nvlinkPerTrayTBs: vr<number>(14.4, 'TB/s', VR_CHIPS, '计算托盘图注，「14.4 TB/s of NVLink 6 bandwidth」'),
      fastMemoryPerTrayTB: vr<number>(2, 'TB', VR_CHIPS, '计算托盘图注，「2 TB of fast memory」'),
      nvlinkScaleUp: vr<string>(
        '托盘盲插即接入 NVLink 6 域；机架级 NVLink 的高速传输发生在机架后部的铜缆脊柱里',
        null,
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「This high-speed data transfer happens in the NVLink spine at the back of the rack, which features four modular preintegrated cable cartridges housing 5,000 copper cables over two miles in length.」',
        '⚠️ v1.5 订正：此前这条把机架级 NVLink 记在 PCB 中板名下。官方对 PCB 中板点名的连接对象是' +
          '「The superchips are connected to the front modular bays that house eight ConnectX-9 SuperNICs and ' +
          'one BlueField-4 DPU through the PCB midplane.」——超级芯片 ↔ 前部网卡仓。' +
          '两句都是官方原话，官方未说明脊柱铜缆与中板在 NVLink 上如何分工，本项目两说并存。',
      ),
      assemblyTime: vr<string>(
        '约 5 分钟（官方两版口径：1.5 小时以上 → 18×，或 nearly two hours → 最高 20×）',
        null,
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「This simplification drops compute tray assembly time from nearly two hours to just five minutes—up to 20x faster assembly and serviceability.」',
        '★ 官方**两版口径并存，本项目都留痕**：' +
          '① 2026-01 六芯片博客写「Assembly that used to take more than 1.5 hours for Blackwell now takes only ' +
          '~5 minutes with Vera Rubin」+「reduces service time by up to 18x」；' +
          '② 2026-03 POD 博客更新为「from nearly two hours to just five minutes—up to 20x faster assembly and ' +
          'serviceability」；③ Vera Rubin 数据手册与 CES 发布稿仍写 18×（发布稿原文「enables up to 18x faster ' +
          'assembly and servicing than Blackwell」）。' +
          '「5 分钟」这一端三处一致；分子端（1.5 小时 / 近 2 小时）与倍数（18× / 20×）官方自己有两版，' +
          '对外报数时说清取的是哪一版。',
      ),
      trayPowerW: vrNull('W', VR_PAGE, 'NVIDIA 未公布单个计算托盘的功耗（整机架功率也未公布）。'),
    },
  },
  {
    id: 'cmp.rubin.nvlink6-switch-tray',
    kind: 'tray',
    name: 'NVLink 第六代交换托盘',
    vendor: 'NVIDIA',
    status: 'announced',
    summary: '容纳 4 颗 NVLink 6 交换芯片的交换托盘，9 个一组构成机架内 260 TB/s 的全互联交换层。',
    presalesNote:
      '★ 高风险数字：**每托盘 4 颗**交换芯片（GB300 是每托盘 2 颗），托盘数仍是 9 个，所以机架内交换芯片从 18 颗变成 36 颗。另一个容易被忽略的点是 SHARP 在网计算——单托盘 14.4 TFLOPS FP8 的规约算力直接省掉一轮 all-reduce 的往返。',
    visual: { shape: 'tray-slab', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [VR_POD, VR_CHIPS, VR_DGX],
    specs: {
      asicsPerTray: vrCount(
        4,
        VR_CHIPS,
        'Vera Rubin NVL72 NVLink switch tray 节，「Each switch tray incorporates four NVLink 6 switch chips」',
        '★ 与 GB300 的每托盘 2 颗 NVSwitch ASIC 相比翻倍：9 × 4 = 每机架 36 颗。',
      ),
      traysPerRack: vrCount(
        9,
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「…alongside 9 NVLink switch trays」（DGX 规格表：「9x L1 NVIDIA NVLink Switches」）',
      ),
      trayBandwidthTBs: vr<number>(
        28.8,
        'TB/s',
        VR_CHIPS,
        'NVLink switch tray 图注，「28.8 TB/s of total tray bandwidth」',
      ),
      sharpFp8Tflops: vr<number>(
        14.4,
        'TFLOPS',
        VR_CHIPS,
        'NVLink switch tray 图注，「14.4 TFLOPS of FP8 in-network compute enabled by NVLink 6 SHARP acceleration」',
      ),
      networkOs: vrNull(
        null,
        VR_CHIPS,
        'NVIDIA 未在已公布材料中说明 NVLink 6 交换托盘运行的网络操作系统（GB300 一代明确为 NVOS）。',
      ),
    },
  },
  {
    id: 'cmp.rubin.nvlink6-switch-chip',
    kind: 'switch',
    name: 'NVLink 6 交换芯片',
    vendor: 'NVIDIA',
    status: 'announced',
    summary: '第六代 NVLink 交换芯片，把 72 张 Rubin GPU 的链路交叉互连成 260 TB/s 的无阻塞 scale-up 域。',
    presalesNote:
      '一句话对比：GB300 机架内 130 TB/s，Vera Rubin 260 TB/s，整整翻倍。它是「机架即一台机器」这个说法的物理支撑——张量并行/专家并行留在机架内走的就是这张网。',
    visual: { shape: 'chip', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [VR_PAGE, VR_CHIPS],
    specs: {
      aggregateBandwidthPerRackTBs: vr<number>(
        260,
        'TB/s',
        VR_PAGE,
        '规格表 NVLink Bandwidth 行，「260 TB/s」',
        'GB300 同口径为 130 TB/s。',
      ),
      perGpuBandwidthTBs: vr<number>(
        3.6,
        'TB/s',
        VR_PAGE,
        'NVLink 6 Switch 卡片，「NVLink 6 switches feature 3.6 terabytes per second (TB/s) of all-to-all, scale-up bandwidth per GPU」',
      ),
      linksFromEachGpu: vrNull(
        '条',
        VR_CHIPS,
        'NVIDIA 未公布每张 Rubin GPU 到每颗交换芯片的链路条数（GB300 一代明确是「每 GPU 18 条，每颗 NVSwitch 一条」）。',
      ),
      portCount: vrNull('端口', VR_CHIPS, 'NVIDIA 未公布 NVLink 6 交换芯片的端口数与单芯片吞吐。'),
    },
  },
  {
    id: 'cmp.rubin.cx9-mezzanine',
    kind: 'nic',
    name: 'ConnectX-9 SuperNIC 板（前置模块化仓）',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '计算托盘正面的模块化网卡板，经 PCB 中板与超级芯片相连。' +
      '⚠️ 板数与每板张数是对官方英文的一种读法（官方英文有歧义），确证的只有「每托盘 8 张 ConnectX-9」。',
    presalesNote:
      '这一代把网卡挪到托盘正面的模块化仓里，可以不拆托盘就换网卡——对运维是实打实的好处。' +
      '★ 但**板级拆分不要报死数**：官方只确证「每托盘 8 张 ConnectX-9、每机架 144 张」；' +
      '「quad ConnectX-9 SuperNIC boards」这句英文既可读成 4 块板×2 张，也可读成 2 块板×4 张' +
      '（第二句「Each quad ConnectX-9 SuperNIC board connects to each Vera CPU」配合每托盘 2 颗 Vera CPU，' +
      '反而更支持后者）。对客户就讲「每托盘 8 张、每 GPU 2 张、1.6 Tb/s/GPU」——这三个数字是稳的。' +
      '对照 GB300 是 2 块夹层板（每块 2 颗 CX-8，合计 4 张）。',
    visual: { shape: 'nic-card', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [VR_CHIPS, VR_POD],
    specs: {
      nicsPerTray: vrCount(
        8,
        VR_POD,
        'Compute and NVLink Switch trays 节，「The superchips are connected to the front modular bays that house eight ConnectX-9 SuperNICs and one BlueField-4 DPU through the PCB midplane.」',
        '★ 这一条才是确证事实（DGX 规格表独立佐证：「144x OSFP single-port ConnectX-9」= 18 托盘 × 8）。' +
          '下面的板数 / 每板张数都是对官方英文的解读，置信度低于本条。',
      ),
      boardsPerTray: vrVendor<number>(
        4,
        '个',
        VR_CHIPS,
        'ConnectX-9 节，「each compute tray contains quad ConnectX-9 SuperNIC boards, delivering 1.6Tb/s of network bandwidth per Rubin GPU」',
        CX9_BOARD_AMBIGUITY,
        'low',
      ),
      nicsPerBoard: vrVendor<number>(
        2,
        '个',
        VR_POD,
        '每托盘 8 张 ConnectX-9（POD 博客「eight ConnectX-9 SuperNICs」）÷ 4 块 SuperNIC 板（六芯片博客「quad ConnectX-9 SuperNIC boards」的一种读法）',
        `由两处官方数字相除得到，非官方直接给出的规格行。${CX9_BOARD_AMBIGUITY}`,
        'low',
      ),
      cpuPairing: vrVendor<string>(
        '官方原文「Each quad ConnectX-9 SuperNIC board connects to each Vera CPU.」——网卡板接的是 Vera CPU',
        null,
        VR_CHIPS,
        'ConnectX-9 节，「Each quad ConnectX-9 SuperNIC board connects to each Vera CPU.」',
        '★ v1.5 订正：此前本项目记作「NVIDIA 未说明配对关系」，实为漏检——官方明确说了网卡板接 Vera CPU。' +
          '⚠️ 但「each…to each」这个说法本身有歧义（一块板对应一颗 CPU？还是每块板都接到每颗 CPU？），' +
          '官方也没给出板数，因此只记录「网卡板挂在 Vera CPU 上」这个方向性事实，' +
          '不据此反推板数——见 boardsPerTray 的歧义留痕。' +
          'GB300 一代的对应说法是「每颗 Grace 配一块夹层板」。',
      ),
      mounting: vr<string>(
        '托盘正面模块化仓，经 PCB 中板与超级芯片相连',
        null,
        VR_POD,
        'Compute and NVLink Switch trays 节，「connected to the front modular bays that house eight ConnectX-9 SuperNICs and one BlueField-4 DPU through the PCB midplane」',
      ),
    },
  },
  {
    id: 'cmp.rubin.connectx-9',
    kind: 'nic',
    name: 'NVIDIA ConnectX-9 SuperNIC',
    vendor: 'NVIDIA',
    status: 'announced',
    summary: '800 Gb/s 单口 SuperNIC，每张 Rubin GPU 配两张，凑出 1.6 Tb/s 的跨机架 RDMA 出口带宽。',
    presalesNote:
      '★ 代际口径：Vera Rubin 配 **ConnectX-9**（GB300 是 CX-8）。真正的变化不是单口速率（都是 800 Gb/s），而是**每 GPU 的网卡数从 1 张变成 2 张**——GPU:NIC 从 1:1 变成 1:2，每 GPU 出口带宽翻倍到 1.6 Tb/s。客户做跨机架 EP/DP 规划时，这一项直接决定 all-to-all 会不会在网卡侧堵住。',
    visual: { shape: 'nic-card', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [VR_CHIPS, VR_DGX, VR_PAGE],
    specs: {
      bandwidthGbs: vr<number>(
        800,
        'Gb/s',
        VR_CHIPS,
        'ConnectX-9 图注，「800 Gb/s per port, programmable RDMA transport」（DGX 规格表同口径：「144x OSFP single-port ConnectX-9 VPI with 800 Gb/s」）',
        '单口速率与 GB300 的 ConnectX-8 相同；变的是每 GPU 配几张。',
      ),
      perGpuBandwidthTbs: vr<number>(
        1.6,
        'Tb/s',
        VR_PAGE,
        'ConnectX-9 卡片，「ConnectX-9 SuperNICs deliver 1.6 terabits per second (Tb/s) of per-GPU bandwidth」',
      ),
      gpuToNicRatio: vr<string>(
        '1:2（每张 GPU 两张 800 Gb/s 单口卡）',
        null,
        VR_DGX,
        'DGX 规格表 Networking 行，「144x OSFP single-port ConnectX-9」÷ 72 张 GPU',
        'GB300 同口径为 1:1。',
      ),
      nicsPerTray: vrCount(
        8,
        VR_POD,
        'Compute and NVLink Switch trays 节，「eight ConnectX-9 SuperNICs」',
      ),
      serdes: vr<string>(
        '200G PAM4 SerDes',
        null,
        VR_CHIPS,
        'ConnectX-9 图注，「1.6 Tb/s bandwidth using 200G PAM4 SerDes」',
      ),
      dualPlaneSplit: vrNull(
        null,
        VR_DGX,
        'NVIDIA 未公布 Vera Rubin 的双平面接线口径（GB300 一代明确「800 Gb/s 拆成 2×400 Gb/s 分接两台 leaf」）；DGX 规格表只写明是单口 800 Gb/s OSFP。',
      ),
    },
  },
  {
    id: 'cmp.rubin.bluefield-4',
    kind: 'dpu',
    name: 'NVIDIA BlueField-4 DPU',
    vendor: 'NVIDIA',
    status: 'announced',
    summary: '整合 64 核 CPU 与 ConnectX-9 网络的数据处理单元，承担 North/South 存储与安全卸载，最高 800 Gb/s。',
    presalesNote:
      '★ 代际口径：Vera Rubin 配 **BlueField-4**（GB300 是 BF-3）。官方给的对比是「2× 网络、6× 算力、3× 内存带宽」。讲价值仍是三点：存储卸载、SNAP 远端盘本地化、独立于主机的零信任边界——只是每一项的余量都大了一档。',
    visual: { shape: 'nic-card', colorToken: 'plane-business' },
    imageUrl: null,
    sourceIds: [VR_CHIPS, VR_DGX, VR_PRESS],
    specs: {
      aggregateBandwidthGbs: vr<number>(
        800,
        'Gb/s',
        VR_CHIPS,
        'BlueField-4 图注（Figure 13），「NVIDIA ConnectX-9 networking delivering up to 800 Gb/s using 200G SerDes over PCIe Gen6」',
        '★ v1.5 订正：**同代对照应取 400 Gb/s**——同一篇博客的 Table 5「NVIDIA BlueField DPU capability ' +
          'comparison」写着「Bandwidth | BlueField-3 400 Gb/s | BlueField-4 800 Gb/s」，正好是官方点名的' +
          '「2x networking performance」。此前本项目写的「BF-3 同口径约 480 Gb/s」是错的：那个 480 出自 ' +
          'GB300 企业参考架构的「can handle an aggregate bandwidth of approximately 480 Gb/s」，' +
          '说的是**节点南北向汇聚网带宽**，不是 BlueField-3 的芯片规格，两者不同口径、不能对比。',
      ),
      portType: vr<string>(
        '双口 VPI，每口 400 Gb/s（InfiniBand 或以太网）',
        null,
        VR_DGX,
        'DGX 规格表 Networking 行，「18x dual-port NVIDIA BlueField-4 VPI with 400 Gb/s NVIDIA InfiniBand and Ethernet」',
      ),
      cpuCores: vr<number>(
        64,
        '核',
        VR_CHIPS,
        'BlueField-4 图注，「integrates a 64-core NVIDIA Grace CPU based on Arm Neoverse V2 with 250 GB/s of LPDDR5 memory bandwidth」',
        '⚠️ 官方口径冲突（v1.5 补齐第三处材料）：**2026-01** 六芯片技术博客写「integrates a 64-core NVIDIA Grace ' +
          'CPU based on Arm Neoverse V2」（正文与图 13 图注两处一致）；而 **2026-03** 有两篇材料都说是 Vera——' +
          'GTC 2026 发布稿「Powered by BlueField-4 — combining the NVIDIA Vera CPU and NVIDIA ConnectX-9 ' +
          'SuperNIC」，POD 博客「the NVIDIA BlueField-4 processor, which combines the Vera CPU and ConnectX-9 ' +
          'SuperNIC」。即 **2 篇 2026-03 材料 vs 1 篇 2026-01 材料**，较新的一侧更一致。' +
          '但官方从未发过更正声明，本项目仍原样记录不做取舍——核数 64 这个数字只有 2026-01 那篇给过。',
      ),
      memoryBandwidthGBs: vr<number>(250, 'GB/s', VR_CHIPS, 'BlueField-4 图注，「250 GB/s of LPDDR5 memory bandwidth」'),
      vsPreviousGen: vr<string>(
        '相对 BlueField-3：2× 网络、6× 算力、3× 内存带宽',
        null,
        VR_CHIPS,
        '图 19（ConnectX-9 与 BlueField-4 模块）图注，「…generational gains of 2x networking performance, 6x compute, and 3x memory bandwidth versus BlueField-3」',
        '★ v1.5 复核结论：这句**确为原文逐字**（曾被怀疑是合成句，经全文检索确认存在），' +
          '只是位置写错了——它在图 19 的模块对照图注里，不是 BlueField-4 那张图（图 13）的图注，locator 已订正。' +
          '同文 Table 5 给出可核对的分项：Bandwidth 400 → 800 Gb/s、Compute 16 Arm A78 → 64 Arm Neoverse V2（6x）。',
      ),
      inlineCryptoGbs: vr<number>(
        800,
        'Gb/s',
        VR_CHIPS,
        '图 13（BlueField-4 DPU）图注，「…zero-trust security capabilities such as 800 Gb/s inline cryptography using AES-XTS, real-time data inspection, and threat detection for secure AI infrastructure」',
        '★ v1.5 订正 locator：此前标为「BlueField-4 节」（正文），实际出现在图 13 的图注里，正文没有这句。',
      ),
      operatingMode: vrNull(
        null,
        VR_DGX,
        'NVIDIA 未公布 Vera Rubin 参考设计里 BlueField-4 的工作模式（GB300 企业参考架构明确用 ECPF/DPU 模式）。',
      ),
      oobPortGbs: vrNull('Gb/s', VR_DGX, 'NVIDIA 未公布 BlueField-4 板载 BMC 带外管理口速率。'),
    },
  },
  {
    id: 'cmp.rubin.mgx-rack',
    kind: 'rack',
    name: '第三代 MGX 液冷机架',
    vendor: 'NVIDIA / OEM',
    status: 'announced',
    summary:
      '单宽第三代 MGX 机架：**托盘**无线缆盲插（cable-free / hose-free / fanless），' +
      '机架**后部**是模块化铜缆脊柱（预集成线缆匣），45°C 液冷，整机约 4,000 磅（约 1.8 吨）。',
    presalesNote:
      '两个对客户机房最重要的官方事实：**45°C 液冷**（进水温度越高越容易用自然冷却，PUE 直接受益）与' +
      '**无线缆托盘**（装配从「nearly two hours」降到 5 分钟量级）。' +
      '⚠️ 措辞要准确：官方的 cable-free 修饰的是 **compute and NVLink switch trays**，' +
      '不是整台机架——机架后部的 NVLink 脊柱是 4 个预集成铜缆匣、约 5,000 根铜缆。' +
      '把它讲成「整机架没有线缆」会在客户现场被当场推翻。承重仍是 1.8 吨级，机房楼板与运输通道要提前确认。',
    visual: { shape: 'rack-frame', colorToken: null },
    imageUrl: null,
    sourceIds: [VR_POD, VR_GPU_BLOG, VR_PRESS],
    specs: {
      liquidCooled: vr<boolean>(
        true,
        null,
        VR_GPU_BLOG,
        '机架节，「third-generation MGX rack architecture combines cable-free compute and switch trays, 45°C liquid cooling…」',
      ),
      coolantSupplyTempC: vr<number>(
        45,
        '°C',
        VR_GPU_BLOG,
        '机架节，「…45°C liquid cooling, dynamic rack-scale power steering, and Intelligent Power Smoothing」',
      ),
      mgxGeneration: vr<string>(
        '第三代 MGX（单宽）',
        null,
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「all packed into a single-wide third-generation NVIDIA MGX rack」',
      ),
      namingHistory: vr<string>(
        '曾名 Vera Rubin NVL144，官方于 2025-10 改名为 Vera Rubin NVL72（官方只称之为 branding change，未给原因）',
        null,
        VR_OCP,
        '文首编者按，「Editor\'s note: This blog has been updated to reflect a branding change from Vera Rubin NVL144 to Vera Rubin NVL72.」',
        '★ 这是官方对这次改名的**唯一**留痕，且只说了「branding change」四个字。' +
          '业界常见的解释「NVL144 按 die 数、NVL72 按封装数」与官方「一封装 = 一张 GPU」的口径自洽，' +
          '但**官方从未这样说过**——引用时请标明这是推断。' +
          '售前含义：客户手上 2025 年的材料如果写着「Vera Rubin NVL144」，指的就是同一台 NVL72，不是另一款产品；' +
          '真正独立的 NVL144 是下一代 Kyber 机架（POD 博客：「Kyber will first be introduced with Vera Rubin ' +
          'Ultra as a standalone NVL144 system」），两者别混。',
      ),
      cableFree: vr<boolean>(
        true,
        null,
        VR_PRESS,
        'Second-Generation RAS Engine 节，「The rack\'s modular, cable-free tray design enables up to 18x faster assembly and servicing than Blackwell.」（POD 博客同口径：「It unlocks completely modular, cable-free, hose-free, and fanless compute and NVLink switch trays」）',
        '★ 口径边界：官方 cable-free 的主语始终是 **tray**（发布稿写 cable-free *tray* design，' +
          'POD 博客写 cable-free… compute and NVLink switch *trays*），不是整台机架。' +
          '机架后部仍有 NVLink 铜缆脊柱（4 个线缆匣、约 5,000 根铜缆），见 cmp.rubin.nvlink-midplane。',
      ),
      componentCount: vr<number>(
        1_300_000,
        '个',
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「the rack houses 1.3 million individual components, nearly 1,300 chips」',
      ),
      weightKg: vr<number>(
        1814,
        'kg',
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「a single-wide third-generation NVIDIA MGX rack weighing roughly 4,000 lbs」',
        '官方口径是「roughly 4,000 lbs」，此处按 1 lb = 0.4536 kg 换算为约 1,814 kg。',
      ),
      leakDetection: vrNull(
        null,
        VR_POD,
        'NVIDIA 未公布 Vera Rubin 机架的液体泄漏检测方案（GB300 一代明确有 tray/rack 双层检测）。',
      ),
      heightU: vrNull(
        'U',
        VR_POD,
        'NVIDIA 未公布机架 U 高与逐 U 布局；本项目 3D 摆位使用与 GB300 相同的示意占位高度。',
      ),
    },
  },
  {
    id: 'cmp.rubin.nvlink-midplane',
    kind: 'rack',
    name: 'NVLink 铜缆脊柱（Spine）+ 托盘 PCB 中板',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '机架内 scale-up 互连底板的两个官方部件：机架**后部**的模块化铜缆脊柱（4 个预集成线缆匣、约 5,000 根铜缆），' +
      '以及计算托盘**内部**的无源 PCB 中板（把超级芯片接到托盘正面的网卡仓）。',
    presalesNote:
      '★ 这一格最容易讲反，v1.5 已按官方原文订正：**机架级 NVLink 走的是后部铜缆脊柱，不是 PCB 中板**——' +
      'POD 博客原话「This high-speed data transfer happens in the NVLink spine at the back of the rack, which ' +
      'features four modular preintegrated cable cartridges housing 5,000 copper cables over two miles in length.」；' +
      '而「cable-free」修饰的对象是**托盘**（「compute trays… features a robust PCB midplane… that unlocks a ' +
      'cable-free, hose-free, and fanless design」），PCB 中板官方点名的连接对象是**超级芯片 ↔ 前部网卡仓**。' +
      '所以对客户的正确讲法是：**托盘内无线缆（装配/换件不用重新走线），机架脊柱仍然是铜缆——只是被做成了预集成、' +
      '预验证的线缆匣，整匣更换而不是一根根插**。跟 GB300 的代际差异也在这里：' +
      '差异在托盘内部（cable-free tray），**不在**机架脊柱——两代的机架级 NVLink 同为铜缆形态。',
    visual: { shape: 'backplane', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [VR_POD, VR_PRESS],
    specs: {
      medium: vr<string>(
        '机架后部铜缆脊柱（4 个预集成线缆匣）+ 托盘内 PCB 中板',
        null,
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「This high-speed data transfer happens in the NVLink spine at the back of the rack, which features four modular preintegrated cable cartridges housing 5,000 copper cables over two miles in length.」；Compute and NVLink Switch trays 节，「The superchips are connected to the front modular bays that house eight ConnectX-9 SuperNICs and one BlueField-4 DPU through the PCB midplane.」',
        '⚠️ 两句官方话都要如实呈现，**不要用一句去否定另一句**：官方既没有说明这 5,000 根铜缆与 PCB 中板' +
          '在电气上如何分工，也没有说中板完全不参与 NVLink。能确定的只有——机架级 NVLink 的高速传输发生在' +
          '后部铜缆脊柱里，而中板官方点名的连接对象是超级芯片与前部网卡仓。' +
          'GB300 一代的同一位置是 copper backplane（铜背板），**两代的机架脊柱同为铜缆形态**；' +
          '代际差异在托盘内部（Vera Rubin 的 cable-free tray），不在机架脊柱。',
      ),
      cableCount: vr<number>(
        5000,
        '根',
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「…four modular preintegrated cable cartridges housing 5,000 copper cables over two miles in length」',
        '官方措辞是「5,000 copper cables over two miles in length」（约 3.2 km 总长度）。' +
          '这是**机架后部 NVLink 脊柱**里的铜缆根数，不是「PCB 中板内部的链路根数」——中板走的是 PCB 走线，官方未给根数。',
      ),
      cableCartridgeCount: vrCount(
        4,
        VR_POD,
        'NVIDIA Vera Rubin NVL72 节，「four modular preintegrated cable cartridges」（通用形态另见「The rack features a highly modular spine as its backplane, consisting of up to four preintegrated and prevalidated copper cable cartridges that connect each tray as one.」）',
        '★ 售前含义：线缆匣是**预集成、预验证**的整体件，MGX NVL 与 MGX ETL 两种机架共用同一套机械形态' +
          '（官方原话「shares the same mechanical form factor for both MGX NVL and MGX ETL racks」）——' +
          '维护粒度是「换一个匣」，不是「插一根线」。',
      ),
    },
  },
  {
    id: 'cmp.rubin.power-shelf',
    kind: 'power',
    name: 'Vera Rubin 机架供电层',
    vendor: 'NVIDIA / OEM',
    status: 'announced',
    summary: '机架级供电层，支持动态功率调度（power steering）与智能功率平滑；具体电源架数量与功率官方未公布。',
    presalesNote:
      '这一代供电最值得讲的不是「几个电源架」，而是官方点名的两项能力：**动态机架级功率调度**（把功率往真正在算的托盘上挪）与**智能功率平滑**（削掉 AI 负载的功率尖峰）。客户的电气工程师最怕的就是尖峰——这条能直接降低配电容量的冗余要求。⚠️ 但整机架功率官方至今没公布，任何 kW 数字都要问出处。',
    visual: { shape: 'psu-brick', colorToken: 'plane-power' },
    imageUrl: null,
    sourceIds: [VR_GPU_BLOG, VR_PAGE],
    specs: {
      powerFeatures: vr<string>(
        '动态机架级功率调度（power steering）+ 智能功率平滑（Intelligent Power Smoothing）',
        null,
        VR_GPU_BLOG,
        '机架节，「…dynamic rack-scale power steering, and Intelligent Power Smoothing」',
      ),
      gpuDensityGain: vr<string>(
        '同等功率包络下 GPU 数量最多 +40%',
        null,
        VR_GPU_BLOG,
        '机架节，「up to 40% more GPUs within the same power envelope」',
      ),
      shelvesPerRack: vrNull('个', VR_PAGE, 'NVIDIA 未公布 Vera Rubin 机架的电源架数量。'),
      shelfPowerKW: vrNull('kW', VR_PAGE, 'NVIDIA 未公布单个电源架的输出功率。'),
      psusPerShelf: vrNull('个', VR_PAGE, 'NVIDIA 未公布每个电源架的电源模块数。'),
      psuPowerKW: vrNull('kW', VR_PAGE, 'NVIDIA 未公布单个电源模块的功率。'),
      redundancyMode: vrNull(null, VR_PAGE, 'NVIDIA 未声明冗余模式与掉电保持策略。'),
    },
  },
  {
    id: 'cmp.rubin.scaleout-switch',
    kind: 'switch',
    name: 'Spectrum-X 以太网 / Quantum-X800 InfiniBand 交换层',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      'Vera Rubin NVL72 的 scale-out 交换层，官方口径为 Quantum-X800 InfiniBand 与 Spectrum-X 以太网两选一；角色划分与 GB300 一致——Leaf 交换层负责计算网的机架接入，Spine 交换层负责计算网的跨机架主干，汇聚交换层则是完全独立的另一张业务与存储网。',
    presalesNote:
      '三个名字的角色划分和 GB300 一样：Leaf 管接入——机架内 GPU 的网卡上联到 leaf，是跨机架东西向流量的第一跳；Spine 管互联——只连 leaf、不直连服务器，和 leaf 一起把多台机架拼成集群，「Leaf 管接入，Spine 管互联，它们是同一张计算网的两级」，也对应「NVLink 负责机架内 72 GPU 一跳互联，leaf/spine 负责机架之间」的整体分工。汇聚交换层是完全独立的另一张网——南北向业务与存储经 BlueField-4 DPU 接入，与计算网隔离：「leaf/spine 是 GPU 之间说话的网，汇聚层是集群对外界与存储说话的网」。但要向客户说清楚：这只是角色划分的方向性说法，端口数、交换机型号、收敛比与具体接线方案都还没有 Vera Rubin 专属的参考架构文档，方案要按需求另行设计。',
    visual: { shape: 'switch-box', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [VR_PAGE, VR_PRESS],
    specs: {
      roles: vr<string>(
        'scale-out：Quantum-X800 InfiniBand 或 Spectrum-X 以太网',
        null,
        VR_PAGE,
        '概览段，「It scales up intelligence in a rack-scale platform with the NVIDIA NVLink 6 switch and scales out with NVIDIA Quantum-X800 InfiniBand and Spectrum-X Ethernet.」',
      ),
      ethernetGeneration: vr<string>(
        'Spectrum-6（200G SerDes + 共封装光学）',
        null,
        VR_PRESS,
        'Next-Generation Ethernet Networking 节，「NVIDIA Spectrum-6 Ethernet… enabled by 200G SerDes communication circuitry, co-packaged optics and AI-optimized fabrics」',
      ),
      ports: vrNull('端口', VR_PAGE, 'NVIDIA 未公布 Vera Rubin scale-out 交换机的端口数。'),
      portSpeedGbs: vrNull('Gb/s', VR_PAGE, 'NVIDIA 未公布该交换层的单端口速率。'),
      switchesPerRack: vrNull('台', VR_PAGE, '尚无 Vera Rubin 专属参考架构，交换机台数需按实际规模设计。'),
    },
  },
]

// ─────────────────────────── 装配树 ───────────────────────────

const RACK_U_PLACEHOLDER = '机架内 U 位为 3D 摆位示意占位，NVIDIA 未公布 Vera Rubin 的逐 U 布局。'
const RACK_COUNT_PLACEHOLDER =
  '机架数量为 3D 场景的示意规模，NVIDIA 尚未公布 Vera Rubin 的 SU / POD 规模上限（GB300 一代官方验证到 8 个 SU）。'

export const VERA_RUBIN_ASSEMBLIES: AssemblyNode[] = [
  // ── cluster 层 ──
  {
    id: 'asm.rubin.facility',
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
    id: 'asm.rubin.facility-water',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.shared.facility-water-loop',
    roleKey: 'facility-water-loop',
    label: '机房一次侧冷却水回路',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '官方明确 Vera Rubin 机架为 45°C 液冷，一次侧水温要求见 CDU 选型。',
  },
  {
    // v1.1 A3：与 GB300 同构——机房配电需要一个真实存在的盒子，
    // `con.rubin.facility-power-shelf` 才不会从装配树根（从不渲染）长出来。
    id: 'asm.rubin.facility-power',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.shared.facility-power',
    roleKey: 'facility-power',
    label: '机房配电（列头柜 / 母线）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: 'NVIDIA 未公布 Vera Rubin 的机房侧配电要求，数量与形态为示意。',
  },
  {
    id: 'asm.rubin.cdu',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.shared.cdu',
    roleKey: 'cdu',
    label: 'CDU 冷量分配单元',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: 'NVIDIA 未公布 Vera Rubin 的 CDU 型号与数量，此处按每部署 1 台示意。',
  },
  {
    id: 'asm.rubin.scaleout-spine',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.rubin.scaleout-switch',
    roleKey: 'scaleout-spine',
    label: 'Spine 交换层（计算网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '官方仅给出「Quantum-X800 InfiniBand 或 Spectrum-X 以太网」的方向，台数与收敛比未公布。',
  },
  {
    id: 'asm.rubin.scaleout-leaf',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.rubin.scaleout-switch',
    roleKey: 'scaleout-leaf',
    label: 'Leaf 交换层（计算网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '每张 GPU 出 2 张 800 Gb/s 单口 ConnectX-9，接线方案官方未公布。',
  },
  {
    id: 'asm.rubin.converged-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.rubin.scaleout-switch',
    roleKey: 'converged-switch',
    label: '汇聚交换层（业务与存储网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '承载 BlueField-4 的 North/South 流量；Vera Rubin 尚无企业参考架构文档。',
  },
  {
    id: 'asm.rubin.oob-fabric-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'oob-mgmt-switch',
    label: '带外管理汇聚交换机',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '带外管理网沿用上一代形态；NVIDIA 未发布 Vera Rubin 专属的管理网设计。',
  },
  {
    id: 'asm.rubin.storage',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
    componentId: 'cmp.shared.storage-array',
    roleKey: 'external-storage',
    label: '外部存储集群',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '存储选型与规模由客户方案决定。',
  },
  {
    id: 'asm.rubin.row',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.facility',
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
    id: 'asm.rubin.rack',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.row',
    componentId: 'cmp.rubin.mgx-rack',
    roleKey: 'rack',
    label: 'Vera Rubin NVL72 机架',
    count: 8,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: RACK_COUNT_PLACEHOLDER,
  },

  // ── rack 层 ──
  {
    id: 'asm.rubin.inrack-mgmt-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'inrack-mgmt-switch',
    label: '机架内管理交换机',
    count: 2,
    countClaim: null,
    lodLevel: 'rack',
    rackU: { start: 1, height: 2 },
    note: `数量沿用上一代形态示意，NVIDIA 未公布 Vera Rubin 机架内管理交换机的数量。${RACK_U_PLACEHOLDER}`,
  },
  {
    id: 'asm.rubin.power-shelf',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
    componentId: 'cmp.rubin.power-shelf',
    roleKey: 'power-shelf',
    label: '供电层（电源架）',
    count: 8,
    countClaim: null,
    lodLevel: 'rack',
    rackU: { start: 3, height: 8 },
    note: `⚠️ 数量为 3D 摆位示意：NVIDIA 未公布 Vera Rubin 的电源架数量与整机架功率。${RACK_U_PLACEHOLDER}`,
  },
  {
    id: 'asm.rubin.compute-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
    componentId: 'cmp.rubin.compute-tray',
    roleKey: 'compute-tray',
    label: '计算托盘',
    count: 18,
    countClaim: vrCount(
      18,
      VR_POD,
      'NVIDIA Vera Rubin NVL72 节，「…across 18 compute trays, alongside 9 NVLink switch trays」',
    ),
    lodLevel: 'rack',
    rackU: { start: 11, height: 18 },
    note: RACK_U_PLACEHOLDER,
  },
  {
    id: 'asm.rubin.nvswitch-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
    componentId: 'cmp.rubin.nvlink6-switch-tray',
    roleKey: 'nvswitch-tray',
    label: 'NVLink 6 交换托盘',
    count: 9,
    countClaim: vrCount(
      9,
      VR_POD,
      'NVIDIA Vera Rubin NVL72 节，「…alongside 9 NVLink switch trays」',
      'DGX Vera Rubin NVL72 规格表独立佐证：「9x L1 NVIDIA NVLink Switches」。',
    ),
    lodLevel: 'rack',
    rackU: { start: 29, height: 9 },
    note: RACK_U_PLACEHOLDER,
  },
  {
    id: 'asm.rubin.busbar',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
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
    id: 'asm.rubin.manifold',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
    componentId: 'cmp.shared.manifold',
    roleKey: 'liquid-manifold',
    label: '分液歧管',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '官方口径为 45°C 液冷，歧管规格未公布。',
  },
  {
    id: 'asm.rubin.midplane',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rack',
    componentId: 'cmp.rubin.nvlink-midplane',
    roleKey: 'nvlink-backplane',
    label: 'NVLink 铜缆脊柱 + 托盘 PCB 中板',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note:
      '不占用 U 位。★ v1.5 订正：机架级 NVLink 走的是**机架后部的铜缆脊柱**（4 个预集成线缆匣、约 5,000 根铜缆），' +
      'PCB 中板官方点名连接的是超级芯片与托盘前部网卡仓。GB300 一代对应的是铜背板——' +
      '**两代的机架脊柱同为铜缆形态**，代际差异在托盘内部（cable-free tray），不在机架脊柱。' +
      '3D 里这一格按单一底板形态示意，不区分脊柱与中板两个物理件。',
  },

  // ── tray / board 层 ──
  {
    id: 'asm.rubin.tray-cold-plate',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.compute-tray',
    componentId: 'cmp.shared.cold-plate',
    roleKey: 'cold-plate',
    label: '计算托盘冷板',
    count: 1,
    countClaim: null,
    lodLevel: 'tray',
    rackU: null,
    note: '按托盘内一套冷板回路建模；官方未公布逐器件冷板数量。',
  },
  {
    id: 'asm.rubin.vera-cpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.compute-tray',
    componentId: 'cmp.rubin.vera-cpu',
    roleKey: 'host-cpu',
    label: 'Vera CPU',
    count: 2,
    countClaim: vrCount(
      2,
      VR_POD,
      'Compute and NVLink Switch trays 节，「Each compute tray features two NVIDIA Vera Rubin superchips」× 每超级芯片 1 颗 Vera CPU',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '18 托盘 × 2 = 全机架 36 颗，与规格表「36 Vera CPUs」一致。每 1 颗 Vera + 2 张 Rubin 合封为一个 Vera Rubin 超级芯片。',
  },
  {
    id: 'asm.rubin.rubin-gpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.compute-tray',
    componentId: 'cmp.rubin.rubin-gpu',
    roleKey: 'accelerator',
    label: 'Rubin GPU',
    count: 4,
    countClaim: vrCount(
      4,
      VR_PAGE,
      '规格表 Vera Rubin Superchip 列「2 Rubin GPUs | 1 Vera CPU」× 每托盘 2 个超级芯片（POD 博客）',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '18 托盘 × 4 = 全机架 72 张，即 NVL72 之名的由来。注意官方一张 GPU = 一个封装（两颗 die）。',
  },
  {
    id: 'asm.rubin.hbm',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.rubin-gpu',
    componentId: 'cmp.rubin.hbm4',
    roleKey: 'gpu-hbm',
    label: 'HBM4 显存堆栈',
    count: 8,
    countClaim: null,
    lodLevel: 'board',
    rackU: null,
    note: '⚠️ 堆栈数量 8 为 3D 视觉示意；官方只说明是 12-Hi 堆栈，未公布每卡堆栈数。',
  },
  {
    id: 'asm.rubin.nic-board',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.compute-tray',
    componentId: 'cmp.rubin.cx9-mezzanine',
    roleKey: 'nic-mezzanine',
    label: 'ConnectX-9 SuperNIC 板',
    count: 4,
    countClaim: vrVendor<number>(
      4,
      '个',
      VR_CHIPS,
      'ConnectX-9 节，「each compute tray contains quad ConnectX-9 SuperNIC boards, delivering 1.6Tb/s of network bandwidth per Rubin GPU」',
      CX9_BOARD_AMBIGUITY,
      'low',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '⚠️ 板数 4 是对官方英文的一种读法（另一种读法是 2 块板 × 每块 4 张），3D 里必须选一种形态才建模，' +
      '详见 countClaim 的 note。确证的只有「每托盘 8 张、每机架 144 张」。GB300 一代是 2 块夹层板。',
  },
  {
    id: 'asm.rubin.cx9-nic',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.nic-board',
    componentId: 'cmp.rubin.connectx-9',
    roleKey: 'scaleout-nic',
    label: 'ConnectX-9 SuperNIC',
    count: 2,
    countClaim: vrVendor<number>(
      2,
      '个',
      VR_POD,
      '每托盘 8 张 ConnectX-9（POD 博客「eight ConnectX-9 SuperNICs」）÷ 4 块 SuperNIC 板（六芯片博客「quad ConnectX-9 SuperNIC boards」的一种读法）',
      CX9_BOARD_AMBIGUITY,
      'low',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '★ 稳的是**乘积**不是因子：4 × 2 = 每托盘 8 张、全机架 144 张，对应官方 POD 博客的「eight ConnectX-9 ' +
      'SuperNICs」、DGX 规格表的「144x OSFP single-port ConnectX-9」与每 GPU 1.6 Tb/s。' +
      '两个因子本身（4 块板 / 每块 2 张）是对歧义英文的一种读法，见 countClaim 的 note。',
  },
  {
    id: 'asm.rubin.bf4-dpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.compute-tray',
    componentId: 'cmp.rubin.bluefield-4',
    roleKey: 'north-south-dpu',
    label: 'BlueField-4 DPU',
    count: 1,
    countClaim: vrCount(
      1,
      VR_POD,
      'Compute and NVLink Switch trays 节，「…eight ConnectX-9 SuperNICs and one BlueField-4 DPU」',
      'DGX 规格表独立佐证：「18x dual-port BlueField-4」= 每托盘 1 张。',
    ),
    lodLevel: 'board',
    rackU: null,
    note: null,
  },
  {
    id: 'asm.rubin.nvswitch-asic',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.nvswitch-tray',
    componentId: 'cmp.rubin.nvlink6-switch-chip',
    roleKey: 'nvswitch-asic',
    label: 'NVLink 6 交换芯片',
    count: 4,
    countClaim: vrCount(
      4,
      VR_CHIPS,
      'Vera Rubin NVL72 NVLink switch tray 节，「Each switch tray incorporates four NVLink 6 switch chips」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '★ 9 托盘 × 4 = 36 颗，是 GB300（9 × 2 = 18 颗）的两倍。',
  },
  {
    id: 'asm.rubin.nvswitch-cold-plate',
    systemId: SYSTEM_ID,
    parentId: 'asm.rubin.nvswitch-tray',
    componentId: 'cmp.shared.cold-plate',
    roleKey: 'nvswitch-cold-plate',
    label: '交换托盘冷板',
    count: 1,
    countClaim: null,
    lodLevel: 'tray',
    rackU: null,
    note: null,
  },
]

// ─────────────────────────── 连接 ───────────────────────────

export const VERA_RUBIN_CONNECTIONS: Connection[] = [
  // ── nvlink 平面 ──
  {
    id: 'con.rubin.gpu-nvswitch',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.rubin-gpu',
    toAssemblyId: 'asm.rubin.nvswitch-asic',
    plane: 'nvlink',
    topology: 'all-to-all',
    medium: 'copper-backplane',
    protocol: 'NVLink 第六代',
    bandwidth: vr<number>(
      3600,
      'GB/s',
      VR_GPU_BLOG,
      'The Rubin GPU 节，「NVLink 6 provides 3,600 GB/s scale-up bandwidth」',
    ),
    direction: 'bidirectional',
    label: 'GPU ↔ NVLink 6 交换芯片（全互联）',
    summary:
      '72 张 Rubin GPU 经 9 个交换托盘（每托盘 4 颗交换芯片，共 36 颗）连成一个 260 TB/s 的无阻塞 scale-up 域。每卡 3.6 TB/s，是 GB300 的两倍。官方未公布每卡的 NVLink 链路条数。',
    sourceIds: [VR_PAGE, VR_GPU_BLOG, VR_CHIPS],
  },
  {
    id: 'con.rubin.nvswitch-midplane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.nvswitch-asic',
    toAssemblyId: 'asm.rubin.midplane',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'pcb-trace',
    protocol: 'NVLink 第六代',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NVLink 6 交换芯片 → 机架脊柱 / 中板',
    summary:
      '★ 官方口径（v1.5 订正）：机架级 NVLink 的高速传输发生在**机架后部的铜缆脊柱**里——' +
      '「four modular preintegrated cable cartridges housing 5,000 copper cables over two miles in length」，' +
      '不是「无线缆、无光模块」。交换托盘本身是 cable-free 的（官方「cable-free, hose-free, and fanless ' +
      'compute and NVLink switch trays」），但托盘之间靠的是铜缆脊柱把它们「connect each tray as one」。' +
      '官方未说明脊柱铜缆与托盘 PCB 中板在电气上如何分工，此处两说并存不互相否定。',
    sourceIds: [VR_POD],
  },
  {
    id: 'con.rubin.tray-midplane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.compute-tray',
    toAssemblyId: 'asm.rubin.midplane',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'pcb-trace',
    protocol: 'NVLink 第六代',
    bandwidth: vr<number>(14.4, 'TB/s', VR_CHIPS, '计算托盘图注，「14.4 TB/s of NVLink 6 bandwidth」'),
    direction: 'bidirectional',
    label: '计算托盘 → 机架脊柱 / 中板',
    summary:
      '计算托盘盲插即接入 scale-up 域，托盘本身无线缆——官方称这让装配时间从「nearly two hours」降到约 5 分钟' +
      '（2026-03 POD 博客口径 20×；2026-01 六芯片博客与数据手册写的是 1.5 小时 / 18×，两版并存）。' +
      '⚠️ 「无线缆」说的是托盘，机架后部的 NVLink 脊柱仍是 4 个铜缆匣、约 5,000 根铜缆。',
    sourceIds: [VR_POD, VR_CHIPS],
  },
  {
    id: 'con.rubin.vera-gpu-c2c',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.vera-cpu',
    toAssemblyId: 'asm.rubin.rubin-gpu',
    plane: 'nvlink',
    topology: 'point-to-point',
    medium: 'pcb-trace',
    protocol: 'NVLink-C2C',
    bandwidth: vrVendor<number>(
      1800,
      'GB/s',
      VR_PAGE,
      '规格表 NVLink-C2C Bandwidth 行，Vera Rubin Superchip 列「1.8 TB/s」（同行 NVL72 列「65 TB/s」、Rubin GPU 列「-」）',
      '★ 这条边的带宽是**每超级芯片**（1 Vera + 2 Rubin）口径，不是每张 GPU：36 × 1.8 = 64.8 ≈ 官方整机架 65 TB/s。' +
        '产品页规格表的 Rubin GPU 列在这一行是「-」——官方刻意不给单卡 C2C 数字。' +
        '⚠️ GPU 架构博客另有一句出现在 Rubin GPU 语境里的「NVLink-C2C delivers 1,800 GB/s for coherent ' +
        'CPU-GPU communication」，官方没说明是否为单卡口径，两说并存见 cmp.rubin.rubin-gpu.specs.c2cBandwidthGBs。',
      'low',
    ),
    direction: 'bidirectional',
    label: 'Vera ↔ Rubin（C2C，每超级芯片口径）',
    summary:
      '1 颗 Vera + 2 张 Rubin 合封为一个超级芯片，超级芯片内的 CPU↔GPU 是 1.8 TB/s 的 NVLink-C2C' +
      '——整机架 54 TB LPDDR5X 因此成为 GPU 可寻址的扩展内存。' +
      '⚠️ 1.8 TB/s 是**每超级芯片**口径（36 × 1.8 ≈ 官方 65 TB/s），官方规格表的 Rubin GPU 列在这一行写的是「-」，' +
      '不要按单卡乘 72。',
    sourceIds: [VR_PAGE, VR_GPU_BLOG],
  },

  // ── scaleout 平面 ──
  {
    id: 'con.rubin.gpu-cx9',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.rubin-gpu',
    toAssemblyId: 'asm.rubin.cx9-nic',
    plane: 'scaleout',
    topology: 'point-to-point',
    medium: 'pcb-trace',
    protocol: 'GPUDirect RDMA',
    bandwidth: vr<number>(
      1.6,
      'Tb/s',
      VR_PAGE,
      'ConnectX-9 卡片，「ConnectX-9 SuperNICs deliver 1.6 terabits per second (Tb/s) of per-GPU bandwidth」',
    ),
    direction: 'bidirectional',
    label: 'GPU ↔ ConnectX-9（1:2，分摊口径）',
    summary:
      '每张 Rubin GPU 配两张 800 Gb/s 单口 SuperNIC，出机架带宽 1.6 Tb/s——相对 GB300 的 1:1 / 800 Gb/s 翻倍。' +
      '⚠️ **这是分摊口径的比值，不是一条官方点名的直连链路**：官方描述的物理路径是' +
      '「Each quad ConnectX-9 SuperNIC board connects to each Vera CPU.」（网卡板接 Vera CPU）与' +
      '「The superchips are connected to the front modular bays that house eight ConnectX-9 SuperNICs… ' +
      'through the PCB midplane.」（超级芯片经 PCB 中板接前部网卡仓）。' +
      '产品页的「1.6 Tb/s per-GPU bandwidth」= 每托盘 8 张 × 800 Gb/s ÷ 4 张 GPU 的**每 GPU 分摊值**。' +
      '本项目把这条边画成 GPU↔网卡，是为了表达 GPUDirect RDMA 的**数据面语义**（GPU 显存直通网卡，不经主机内存），' +
      '不代表存在一条绕过中板与 CPU 的专用物理链路。',
    sourceIds: [VR_PAGE, VR_DGX, VR_CHIPS, VR_POD],
  },
  {
    id: 'con.rubin.cx9-board',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.cx9-nic',
    toAssemblyId: 'asm.rubin.nic-board',
    plane: 'scaleout',
    topology: 'point-to-point',
    medium: 'pcb-trace',
    protocol: '模块化网卡板板级互连',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'ConnectX-9 → SuperNIC 板',
    summary:
      '网卡装在托盘正面的模块化仓里，官方说网卡板接的是 Vera CPU（「Each quad ConnectX-9 SuperNIC board ' +
      'connects to each Vera CPU.」）。⚠️ 本项目按「4 块板 × 每块 2 张」建模，但官方英文也可读成' +
      '「2 块板 × 每块 4 张」——确证的只有每托盘 8 张。',
    sourceIds: [VR_CHIPS, VR_POD],
  },
  {
    id: 'con.rubin.cx9-leaf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.cx9-nic',
    toAssemblyId: 'asm.rubin.scaleout-leaf',
    plane: 'scaleout',
    topology: 'rail-optimized',
    medium: 'optical-fiber',
    protocol: 'Quantum-X800 InfiniBand 或 Spectrum-X 以太网',
    bandwidth: vr<number>(
      800,
      'Gb/s',
      VR_DGX,
      'DGX 规格表 Networking 行，「144x OSFP single-port NVIDIA ConnectX-9 VPI with 800 Gb/s」',
    ),
    direction: 'bidirectional',
    label: 'ConnectX-9 → Leaf',
    summary:
      '每张网卡一个 800 Gb/s OSFP 口上联。⚠️ Vera Rubin 尚无官方参考架构，双平面/rail 分配方案未公布，此处按上一代的 rail-optimized 惯例示意。',
    sourceIds: [VR_DGX, VR_PAGE],
  },
  {
    id: 'con.rubin.leaf-spine',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.scaleout-leaf',
    toAssemblyId: 'asm.rubin.scaleout-spine',
    plane: 'scaleout',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: 'Quantum-X800 InfiniBand 或 Spectrum-X 以太网',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'Leaf ↔ Spine',
    summary: '机架级 scale-out 总带宽 28.8 TB/s；具体胖树层数与收敛比官方未公布。',
    sourceIds: [VR_PAGE],
  },

  // ── business 平面 ──
  {
    id: 'con.rubin.bf4-converged',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.bf4-dpu',
    toAssemblyId: 'asm.rubin.converged-switch',
    plane: 'business',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'InfiniBand 或以太网（North/South）',
    bandwidth: vr<number>(
      400,
      'Gb/s',
      VR_DGX,
      'DGX 规格表 Networking 行，「18x dual-port NVIDIA BlueField-4 VPI with 400 Gb/s」',
      '双口各 400 Gb/s，DPU 整体最高 800 Gb/s。',
    ),
    direction: 'bidirectional',
    label: 'BlueField-4 → 汇聚交换机',
    summary:
      '每托盘 1 张双口 BlueField-4 承载存储与业务流量，单口 400 Gb/s、整卡最高 800 Gb/s。' +
      '代际对照按官方 Table 5：BlueField-3 400 Gb/s → BlueField-4 800 Gb/s（正好是官方说的 2× 网络）。' +
      '⚠️ 不要拿 GB300 参考架构里的「约 480 Gb/s」当 BF-3 规格——那是节点南北向汇聚网带宽，不是芯片口径。',
    sourceIds: [VR_DGX, VR_CHIPS],
  },
  {
    id: 'con.rubin.converged-storage',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.converged-switch',
    toAssemblyId: 'asm.rubin.storage',
    plane: 'business',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: '存储 fabric',
    bandwidth: null,
    direction: 'bidirectional',
    label: '汇聚交换机 ↔ 外部存储',
    summary: '训练数据、权重与检查点的进出路径。Vera Rubin 尚无官方每节点存储带宽目标值。',
    sourceIds: [VR_PAGE],
  },

  // ── mgmt 平面 ──
  {
    id: 'con.rubin.tray-bmc-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.compute-tray',
    toAssemblyId: 'asm.rubin.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish（BMC）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '计算托盘 BMC → 机架管理交换机',
    summary: '带外管理沿用上一代形态；NVIDIA 尚未发布 Vera Rubin 的管理网参考设计，速率未公布。',
    sourceIds: [VR_POD],
  },
  {
    id: 'con.rubin.nvswitch-tray-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.nvswitch-tray',
    toAssemblyId: 'asm.rubin.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet（交换托盘管理）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NVLink 6 交换托盘 → 机架管理交换机',
    summary: '交换托盘同样纳入带外管理域；运行的网络操作系统官方未公布。',
    sourceIds: [VR_POD],
  },
  {
    id: 'con.rubin.bf4-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.bf4-dpu',
    toAssemblyId: 'asm.rubin.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish（DPU BMC）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'BlueField-4 板载管理 → 机架管理交换机',
    summary: 'DPU 独立于主机的管理通道（BF-3 一代为 1 Gb/s 带外口，BF-4 的口速率官方未公布）。',
    sourceIds: [VR_CHIPS],
  },
  {
    id: 'con.rubin.inrack-oob-uplink',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.inrack-mgmt-switch',
    toAssemblyId: 'asm.rubin.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'Ethernet（OOB 上联）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '机架管理交换机 → 带外管理汇聚',
    summary: '机架内管理交换机上联到集群统一的带外管理平面。',
    sourceIds: [VR_POD],
  },

  // ── power 平面 ──
  {
    id: 'con.rubin.facility-power-shelf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.facility-power',
    toAssemblyId: 'asm.rubin.power-shelf',
    plane: 'power',
    topology: 'bus',
    medium: 'ac-feed',
    protocol: '机房交流配电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '机房配电 → 供电层',
    summary: '⚠️ NVIDIA 未公布 Vera Rubin NVL72 的整机架功率，机房侧容量需按实际配置与 OEM 确认。',
    sourceIds: [VR_PAGE],
  },
  {
    id: 'con.rubin.power-shelf-busbar',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.power-shelf',
    toAssemblyId: 'asm.rubin.busbar',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排',
    bandwidth: null,
    direction: 'unidirectional',
    label: '供电层 → 直流母排',
    summary: '官方点名的两项机架级供电能力：动态功率调度与智能功率平滑（削峰）。',
    sourceIds: [VR_GPU_BLOG],
  },
  {
    id: 'con.rubin.busbar-compute-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.busbar',
    toAssemblyId: 'asm.rubin.compute-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → 计算托盘',
    summary: '托盘盲插即取电，无独立电源线。单托盘功耗官方未公布。',
    sourceIds: [VR_GPU_BLOG],
  },
  {
    id: 'con.rubin.busbar-nvswitch-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.busbar',
    toAssemblyId: 'asm.rubin.nvswitch-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → NVLink 6 交换托盘',
    summary: '交换托盘与计算托盘共用同一条直流母排。',
    sourceIds: [VR_GPU_BLOG],
  },

  // ── cooling 平面 ──
  {
    id: 'con.rubin.gpu-cold-plate',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.rubin-gpu',
    toAssemblyId: 'asm.rubin.tray-cold-plate',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'Rubin GPU → 冷板',
    summary: '第三代 MGX 机架的官方口径是 45°C 液冷——进水温度越高，机房越可能全年自然冷却。',
    sourceIds: [VR_GPU_BLOG],
  },
  {
    id: 'con.rubin.cpu-cold-plate',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.vera-cpu',
    toAssemblyId: 'asm.rubin.tray-cold-plate',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'Vera CPU → 冷板',
    summary: 'CPU 与 GPU 合封成超级芯片，共用托盘内同一套冷板回路。',
    sourceIds: [VR_GPU_BLOG],
  },
  {
    id: 'con.rubin.tray-cold-plate-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.tray-cold-plate',
    toAssemblyId: 'asm.rubin.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '计算托盘冷板 ↔ 分液歧管',
    summary: '无线缆设计同样体现在流体接口上：托盘推入即完成液冷对接。',
    sourceIds: [VR_GPU_BLOG, VR_POD],
  },
  {
    id: 'con.rubin.nvswitch-cold-plate-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.nvswitch-cold-plate',
    toAssemblyId: 'asm.rubin.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '交换托盘冷板 ↔ 分液歧管',
    summary: '36 颗 NVLink 6 交换芯片同样需要液冷。',
    sourceIds: [VR_GPU_BLOG],
  },
  {
    id: 'con.rubin.manifold-cdu',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.manifold',
    toAssemblyId: 'asm.rubin.cdu',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '分液歧管 ↔ CDU',
    summary: '机架歧管与 CDU 构成二次侧闭环，供液温度按 45°C 口径设计。',
    sourceIds: [VR_GPU_BLOG],
  },
  {
    id: 'con.rubin.cdu-facility-water',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.rubin.cdu',
    toAssemblyId: 'asm.rubin.facility-water',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '一次侧冷却水回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'CDU ↔ 机房一次侧水',
    summary: 'CDU 把机架热量换给机房冷冻水系统，完成整条散热链。',
    sourceIds: [VR_GPU_BLOG],
  },
]

// ─────────────────────────── 导览场景 ───────────────────────────

export const VERA_RUBIN_SCENES: ScenePreset[] = [
  {
    id: 'scene.rubin.rack-anatomy',
    systemId: SYSTEM_ID,
    title: 'Vera Rubin 机架：结构没变，密度变了',
    narration:
      '机架级结构与 GB300 高度一致：18 个计算托盘 + 9 个 NVLink 交换托盘。变的是内部密度——每个交换托盘从 2 颗交换芯片变成 4 颗（机架内 18 → 36 颗），scale-up 总带宽从 130 TB/s 翻到 260 TB/s。机架本体是第三代 MGX：单宽、45°C 液冷、约 1.8 吨，托盘一律无线缆盲插；机架后部则是 4 个预集成铜缆匣、约 5,000 根铜缆组成的 NVLink 脊柱——「无线缆」说的是托盘，不是整台机架。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.rubin.rack',
    planes: ['nvlink', 'power'],
    highlightAssemblyIds: [
      'asm.rubin.compute-tray',
      'asm.rubin.nvswitch-tray',
      'asm.rubin.nvswitch-asic',
      'asm.rubin.midplane',
    ],
    presalesNote:
      '客户如果问「机架要重新设计机房吗」，答案是结构上不用（还是 18+9），但功率与配电要重新算——而且官方到现在都没公布整机架功率，这一点要如实说。',
  },
  {
    id: 'scene.rubin.tray-teardown',
    systemId: SYSTEM_ID,
    title: '一个 Vera Rubin 计算托盘里有什么',
    narration:
      '2 个 Vera Rubin 超级芯片 = 2 颗 Vera CPU + 4 张 Rubin GPU（每张 288 GB HBM4 / 22 TB/s），前面是模块化仓里的 8 张 ConnectX-9 与 1 张 BlueField-4。相对 GB300 最大的板级变化是网卡：从 4 张变 8 张，每张 GPU 独占 2 张 800 Gb/s 单口卡。',
    lodLevel: 'board',
    focusAssemblyId: 'asm.rubin.compute-tray',
    planes: ['nvlink', 'scaleout', 'business', 'cooling'],
    highlightAssemblyIds: [
      'asm.rubin.rubin-gpu',
      'asm.rubin.vera-cpu',
      'asm.rubin.cx9-nic',
      'asm.rubin.bf4-dpu',
    ],
    presalesNote:
      '代际口径记准：ConnectX-9 与 BlueField-4（不是 CX-8 / BF-3）。另外别把 die 数当卡数——官方一张 Rubin GPU 是一个封装、两颗 die。',
  },

  // ─── 练习站（v1.3 W2）：追加在尾部，前两站的系统内序号被 store.test.ts 锁着 ───
  {
    id: 'scene.rubin.learn-gen-delta',
    systemId: SYSTEM_ID,
    title: '练习 · 三个代际变化各在哪里（对着 GB300 说）',
    narration:
      '① 你应该看到什么：机架结构跟 GB300 一模一样（还是 18 + 9），变化全在盒子里面——同开 NVLink 与 Scale-Out 两个平面，注意交换托盘与网卡这两处。' +
      '② 谁连谁 + 关键数字：变化一，scale-up 带宽——第六代 NVLink 每卡 3.6 TB/s（3600 GB/s），是 GB300 每卡 1.8 TB/s 的两倍，机架级从 130 TB/s 到 260 TB/s；' +
      '变化二，网卡——ConnectX-9 取代 ConnectX-8，每个计算托盘 8 张（GB300 是 4 张），每张 GPU 独占 2 张 800 Gb/s 单口卡；' +
      '变化三，交换芯片——每个交换托盘从 2 颗变 4 颗，托盘数不变仍是 9 个，于是机架内交换芯片从 18 颗变成 36 颗。' +
      '③ 断了会怎样：这三处正是「换代要不要重新设计机房」的分界——结构上不用（还是 18+9），但功率与配电必须重算，而官方到现在都没公布整机架功率，这一点要如实说。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.rubin.rack',
    planes: ['nvlink', 'scaleout'],
    highlightAssemblyIds: [
      'asm.rubin.nvswitch-tray',
      'asm.rubin.nvswitch-asic',
      'asm.rubin.cx9-nic',
      'asm.rubin.rubin-gpu',
    ],
    presalesNote:
      '三句话版本：「带宽翻倍（1.8→3.6 TB/s 每卡）、网卡换代且翻倍（CX-8×4 → CX-9×8）、交换芯片翻倍（18 → 36 颗）」。三个「翻倍」很好记，但别把 die 数当卡数。',
  },
]

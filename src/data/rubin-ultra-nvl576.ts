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
 * ★ v1.5 追加的两条官方事实（此前被误记为「官方没说」，改之前请先读原文）：
 * - **拓扑类别官方已点名**：「NVIDIA Vera Rubin Ultra introduces a new two-layer all-to-all
 *   NVLink topology that will enable developers to scale-up to 576 GPUs.」——本项目此前两处 note
 *   写「官方只说 direct optical connections、没有点名任何拓扑」是事实错误；那句话是同一段的**后半句**。
 *   分析师的「Dragonfly」与官方的 two-layer all-to-all **不等价**，不得互相替换或用后者去解释前者。
 * - **Kyber 是 MGX NVL 机架的下一代**：「NVIDIA Kyber is the next-generation MGX NVL rack design
 *   that will double the NVLink domain per rack to fit 144 GPUs.」（OCP 博客：「the successor to
 *   NVIDIA Oberon」）——不是「独立于 MGX NVL 的并列产品线」。防混淆的结论不变：Kyber 首发是
 *   standalone NVL144 单机架，与 8 机架的 NVL576 是两档不同产品。
 * - 另注：**「Oberon」是 NVIDIA 官方的机架世代名**（OCP 博客原文），不是分析师用语；
 *   属于分析师的是这一代 Oberon 壳体**内部**怎么重排。
 *
 * 但机架内部具体怎么排布（9+18+9 托架分层、0.75U 交换托架、PHD2→PHD3 连接器、
 * NPO/CPO 光模块细节、「Dragonfly」这个归类本身）通通只出现在本地 PDF
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
    'NVIDIA 官方确认的下一档 scale-up 形态：8 个独立 MGX NVL 机架、每机架 72 张 Rubin Ultra GPU，经官方点名的**两层全互连 NVLink 拓扑**（two-layer all-to-all）、机架内铜 + 机架间直接光连接组成**单一 576-GPU NVLink 域**（内部原型代号 Polyphe），是 Vera Rubin Ultra 三档 NVLink 域（NVL72 / NVL144「Kyber」/ 旗舰 NVL576）里最大的一档。',
  presalesNote:
    '这一代要把「官方说了什么」和「分析师推测了什么」分开讲：**官方**（POD 博客）证实的是拓扑骨架——8 个机架、576 张 GPU、一个 NVLink 域、机架内铜/机架间直接光连接、拓扑类别官方点名为 **two-layer all-to-all（两层全互连）**、三档 scale-up 域可选（NVL72/NVL144/NVL576）；机架内部具体怎么排布（9+18+9 托架分层、0.75U 交换托架、PHD3 连接器、NPO/CPO 光模块细节）以及「Dragonfly」这个归类，通通来自 SemiAnalysis 一篇分析师文章，官方从未证实——而且「Dragonfly」与官方的 two-layer all-to-all **不是同一句话的两种说法**，讲拓扑时先说官方词再说分析师词。因此本工具对这一代**只能讲结构、不能讲产能**——凡是有人报给你 NVL576 的 PFLOPS 或 token 产能数字，先问一句出处，目前没有官方规格表能支撑那些数字。' +
    '关于 Kyber 的定位也别讲反：官方说的是「NVIDIA Kyber is the next-generation MGX NVL rack design」（OCP 博客更直白：「the successor to NVIDIA Oberon」）——它是本代机架的**下一代**，不是并列的另一条产品线；但它首发形态是 standalone NVL144 单机架，与 8 机架的 NVL576 是**两档不同产品**，不要把「Kyber」当成 NVL576 机架的代号。' +
    '出货节奏也要小心：2025-03 GTC 现场那句「2027 下半年」自身就矛盾（同一句里「Rubin Ultra」既指 2026 下半年到货的 NVL144、又指 2027 下半年的 Rubin Ultra 系统），只能当历史留痕；2026 年的官方材料已经不再给日期；2026-07 有媒体报道说 NVL576「可能延期或仅限小批量」（没给年份，报道里的「2028」说的是另一个产品 Kyber NVL144，原因是 PCB 中板的**可制造性**），NVIDIA 在同篇报道里**驳斥**了该研究并称「我们的路线图没有问题」——这句话是媒体转述的官方表态，讲给客户听时务必带上这层来源，不要当成独立声明。',
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
    topologyNameOfficial: official<string>(
      '两层全互连 NVLink 拓扑（two-layer all-to-all）',
      null,
      POD,
      '2026-03',
      'NVIDIA Vera Rubin Ultra NVL576 节，「NVIDIA Vera Rubin Ultra introduces a new two-layer all-to-all NVLink topology that will enable developers to scale-up to 576 GPUs.」（导语同口径：「Future scaling includes NVIDIA Vera Rubin Ultra NVL576 with a two-layer all-to-all NVLink topology across eight racks」）',
      '★ v1.5 订正：**官方已经点名了拓扑类别**，此前本项目两处 note 写「官方没有点名任何拓扑」是事实错误。' +
        '应用引的「with copper and direct optical connections」是同一段的**后半句**，前半句就给了拓扑名。' +
        '⚠️ 与分析师说法的关系：SemiAnalysis 表①的「Dragonfly」是它自己的归类，**与官方措辞不等价**' +
        '——two-layer all-to-all 描述的是「两层、层内全互连」的连接关系，Dragonfly 是一类具体的组网算法族。' +
        '对外讲拓扑时先说官方词（two-layer all-to-all），再说分析师词并标明出处，不要只说 Dragonfly。',
    ),
    scaleUpTopology: sa<string>(
      'Direct Connect NPO（机架内铜背板 + 机架间 NPO/CPO Dragonfly）',
      null,
      'p.3 表②，Scale-Up Topology =「Direct Connect NPO」；Within Rack =「Copper Backplane」；Between Racks =「NPO/CPO」（表中黄色高亮）',
      '⚠️ 这是**分析师**口径。官方口径见同层的 topologyNameOfficial：POD 博客已点名「a new two-layer ' +
        'all-to-all NVLink topology」，并说明介质是「copper and direct optical connections」。' +
        '「NPO/CPO」「Dragonfly」这两个词 NVIDIA 官方材料没有用过，且「Dragonfly」与官方的 ' +
        'two-layer all-to-all **不等价**，是分析师自己的归类，不能互相替换着讲。',
    ),
    nvlinkDomainOptions: official<string>(
      'NVL72 / NVL144（Kyber，单机架）/ NVL576（旗舰，本代）',
      null,
      POD,
      '2026-03',
      'NVIDIA Kyber NVL1152: The next generation 节，「Kyber will first be introduced with Vera Rubin Ultra as a standalone NVL144 system, providing customers with three options for Vera Rubin Ultra NVLink scale-up domains: NVL72, NVL144, and the flagship NVL576.」',
      '★ v1.5 订正 Kyber 的定位（此前写「Kyber 是**独立于** MGX NVL 的另一款产品线、两者**并列**」，' +
        '与官方措辞相反）。官方原话是**继承关系**：' +
        '「To scale beyond NVL576, a new MGX rack, NVIDIA Kyber, will be introduced.」' +
        '「NVIDIA Kyber is the next-generation MGX NVL rack design that will double the NVLink domain per rack ' +
        'to fit 144 GPUs.」（2025-10 OCP 博客更直白：「NVIDIA Kyber — the successor to NVIDIA Oberon」）' +
        '——Kyber 是 MGX NVL 机架的**下一代 / Oberon 的继任者**，不是与 MGX NVL 并列的另一条产品线。' +
        '⚠️ 但**防混淆的结论不变，而且官方原话支持得更硬**：Kyber NVL144 是「standalone NVL144 system」' +
        '（单机架 144 GPU），NVL576 是 8 个本代 MGX NVL 机架合成的一个域——' +
        '两者是同一份三档菜单里的**两档不同产品**，「Kyber」不是 NVL576 机架的代号，别当同一硬件的两种叫法。',
    ),
    prototypeCodename: official<string>(
      'Polyphe',
      null,
      POD,
      '2026-03',
      'NVIDIA Vera Rubin Ultra NVL576 节，「Polyphe is the NVIDIA internal fully functional GB200-based prototype of the multirack NVL576 scale-up architecture.」',
    ),
    announceTimeline: {
      ...official<string>(
        '2027 下半年（2025-03 GTC 现场原话，且该句自身矛盾）',
        null,
        GTC25,
        '2025-03',
        'Vera Rubin 一节，「Systems built on Rubin Ultra, including the Vera Rubin NVL 144, will arrive in the second half of next year. And due for the second half of 2027:  systems built on Rubin Ultra.」',
        '⚠️ 这条读数很弱，三层限定缺一不可：' +
          '① 原话**没有点名 NVL576**（只泛指「systems built on Rubin Ultra」；该篇全文「576」出现 0 次）；' +
          '② **原句自身矛盾**（v1.5 新增留痕）——前半句把 NVL144 归入「Rubin **Ultra**」并说 2026 下半年到货，' +
          '后半句又说「Rubin Ultra 系统」2027 下半年，同一句里「Rubin Ultra」指了两个不同的东西。' +
          '因此「2027 下半年」到底覆盖哪一档产品，从这句话里读不出来，confidence 已降到 low；' +
          '③ 2026 年的官方材料（POD/OCP 博客）都不再给出具体交付日期，本条只作历史留痕，不作交付承诺引用。',
      ),
      confidence: 'low' as const,
    },
    delayOutlook: mediaForecast<string>(
      '可能延期或仅限小批量（媒体报道，无具体年份）',
      null,
      '「NVL576 — a larger system linking eight racks via optical connections — is also likely delayed or limited to small volumes, the research firm said.」',
      '⚠️ 同一篇报道里明确写的「延至 2028」说的是另一个产品 **Kyber NVL144**，' +
        '原因逐字为「Kyber NVL144 rack architecture has been delayed to 2028 as the PCB midplane remains ' +
        'challenging from a manufacturability standpoint」——是 **PCB 中板的可制造性**' +
        '（v1.5 订正：此前写作「良率问题」，原文没有出现 yield/良率，属转述失真）。' +
        '对 NVL576 原文没有给出具体年份。文中 NVIDIA 的表态逐字为「Nvidia rejected the SemiAnalysis report ' +
        'and said, "Our roadmap is intact."」——是**驳斥**（rejected）而不是中性「回应」；' +
        '这仍是媒体转述的官方表态，不是独立声明，讲给客户听时要说明这层转述关系。',
    ),
    analystStructuralDetail: sa<string>(
      '机架内重排为 9+18+9（计算/交换/计算）、0.75U NVLink 交换托架、PHD3 背板连接器、NPO/CPO 光互连模块形态、「Dragonfly」跨机架拓扑命名——均为 SemiAnalysis 的结构细节推测，NVIDIA 官方材料未证实这些具体实现。',
      null,
      'p.4–p.5（机架立面图与机架高度节），p.10（NPO/CPO 与 Dragonfly 拓扑描述）',
      '这条 Claim 的作用是把「分析师推测的具体实现」与上面几条官方事实（gpuCount / rackCount / ' +
        'nvlinkDomainOptions / topologyNameOfficial / prototypeCodename）显式分开，避免两者被当成同一置信等级引用' +
        '——3D 组件层的官方壳体（机架、机架内背板、跨机架光互连）与分析师规格件（GPU/HBM/托盘细节/交换芯片）' +
        '也按这条线分层，见组件定义里的 status 字段。' +
        '⚠️ v1.5 措辞拆分：**「Oberon」本身是 NVIDIA 官方的机架世代名**（2025-10 OCP 博客原文' +
        '「NVIDIA Kyber — the successor to NVIDIA Oberon」），此前把「Oberon 机架」整体归为分析师推测是错的；' +
        '真正属于分析师的是**这一代 Oberon 壳体内部怎么重排**（9+18+9 等上面列的那几项）。',
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
      '★ 这是整代最值得讲的一层。三件事：**托架高度从 1U 压到 0.75U**、**每机架从 9 个变 18 个**、**可扩展版每托架 4 颗交换芯片（每机架 72 颗，是 NVL72 版 36 颗的两倍）**。为什么要压高度？文中解释得很清楚：交换托架数量翻倍本来会把最远的计算托架与最远的交换托架拉得更开，压高度之后这个最大距离**只从 19U 略微增加到 22.5U**，铜背板上的 NVLink 信号才驱动得动。多出来的交换容量就是拿去做跨机架光互连的。',
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
      '★ 组件层证据分层示例：NVIDIA 官方证实 8 个机架之间靠「copper and direct optical connections」组成单一 576-GPU NVLink 域，且把拓扑类别点名为「a new two-layer all-to-all NVLink topology」（POD 博客）；这条光互连具体走什么**模块形态**（NPO 插槽式或 CPO 共封装）以及「Dragonfly」这个归类，是 SemiAnalysis 的分析师推测，见 `cmp.rubin-ultra.optics-module` 与 specs 里的低置信项。',
    presalesNote:
      '对客户讲这一层要分两句话：**「NVLink 域要跨出机架了、而且是两层全互连」是官方证实的**——8 个机架经铜与直接光连接合并成一个 576 卡的 scale-up 域，官方措辞是 two-layer all-to-all，这决定了「一台机器」的边界从 72 卡扩到 576 卡；**「用什么器件跨」还是分析师推测**——NPO 还是 CPO、每机架多少个光模块，这些都等官方规格表出来再报给客户。⚠️ 别把分析师的「Dragonfly」当官方拓扑名讲，官方从未用过这个词，它与 two-layer all-to-all 也不等价。',
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
      topologyNameOfficial: official<string>(
        '两层全互连 NVLink 拓扑（two-layer all-to-all）',
        null,
        POD,
        '2026-03',
        'NVIDIA Vera Rubin Ultra NVL576 节，「NVIDIA Vera Rubin Ultra introduces a new two-layer all-to-all NVLink topology that will enable developers to scale-up to 576 GPUs.」',
        '★ 官方点名的拓扑类别。同段后半句给的是介质：「Vera Rubin Ultra NVL576 will combine eight separate ' +
          'MGX NVL racks, each with 72 Rubin Ultra GPUs, all in a single 576-GPU NVLink domain with copper and ' +
          'direct optical connections.」两句要一起读。',
      ),
      topologyName: sa<string>(
        'Dragonfly（SemiAnalysis 命名，与官方的 two-layer all-to-all 不等价）',
        null,
        'p.3 表①，Scale up links =「Between Racks: Dragonfly NPO/CPO」',
        '⚠️ v1.5 订正：此前这条 note 写「官方只说 direct optical connections，没有点名任何拓扑算法或标准名字」' +
          '——**是错的**。官方在同一段的前半句已经点名为「a new two-layer all-to-all NVLink topology」' +
          '（见同组件的 topologyNameOfficial）。' +
          '「Dragonfly」仍然只是 SemiAnalysis 自己的归类：它描述的是一类具体组网算法族，' +
          '与官方「两层、层内全互连」的描述**不等价**，两者不能互相替换着讲，也不能用它去「解释」官方措辞。',
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
      // ★ v1.4 W-A：CPO 只做讲解、不建 3D 实体——这两条 Claim 是「讲解站」的数据支撑，
      // 不进装配树（见 asm.ru.optics 仍按 NPO 16 个建模，content.test.ts 有可执行锁）。
      cpoExternalLaserSource: sa<string>(
        'CPO 版本额外配一个外置激光源模块（External Laser Source Module），为托架内嵌的光引擎供光；NPO 版本没有这个独立模块，激光随插槽式模块本身',
        null,
        'p.9–p.10（CPO 版托架俯视图标出 External Laser Source Module）',
        '⚠️ 具体数量（每托架/每颗 ASIC 各几个）原图未标注数字，本项目不补。后半句「NPO 无独立激光源模块」系据 NPO（p.7–p.8）/CPO（p.9–p.10）两组俯视图对比推断，原文无逐字陈述。',
      ),
      fieldReplaceability: sa<string>(
        'NPO 模块插槽式安装、单个可现场更换；CPO 光引擎与 ASIC 共封装，4 个不可更换，坏一颗大概率要连整颗 ASIC 一起处理',
        null,
        'p.10（NPO/CPO 差异描述）',
        '售前含义：故障域从「换一个模块」变成「换一颗芯片」，维保口径不同，谈保修条款前要先问清楚客户拿到的是哪个版本。',
      ),
      interRackTopology: sa<string>(
        'Dragonfly（机架之间，SemiAnalysis 归类）',
        null,
        'p.3 表①，Scale up links =「Between Racks: Dragonfly NPO/CPO」',
        '⚠️ 官方对同一件事的措辞是「a new two-layer all-to-all NVLink topology」（POD 博客），' +
          '两者**不等价**；同文表②对同一格写的又是「Direct Connect NPO」，分析师自己的两张表也不一致。',
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
        'p.5：此前最大距离 19U；现在尽管 NVLink Switch 托架数量翻倍，该最大距离仅略微增加至 22.5U',
        '★ 措辞要准（v1.5 订正）：22.5U 是**增加**后的值（19U → 22.5U），不是「压缩到 22.5U」。' +
          '被压缩的是**单托架高度**（1U → 0.75U）；正因为压了托架高度，托架数量翻倍才只让最大距离多了 3.5U。' +
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
    note:
      '★ 本代新增的层：8 个机架之间靠官方证实的直接光连接组成单一 576-GPU NVLink 域，' +
      '拓扑类别官方点名为「two-layer all-to-all」（两层全互连）；具体走 NPO/CPO 哪种模块形态、' +
      '以及分析师把它归类为「Dragonfly」，是 SemiAnalysis 的推测（见 cmp.rubin-ultra.optics-module）。' +
      '⚠️ Dragonfly ≠ two-layer all-to-all，别互相替换。',
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
    // ★ v1.5 订正：此前写 'fat-tree'——**没有任何来源支持**（官方说 two-layer all-to-all，
    //   SemiAnalysis 表①说 Dragonfly、表②说 Direct Connect NPO，三处都不是 fat-tree），
    //   而且与同对象的 protocol/summary 互相打架。改成与官方措辞一致的 'all-to-all'。
    topology: 'all-to-all',
    medium: 'optical-fiber',
    protocol: 'NVLink 7，两层全互连（官方：two-layer all-to-all）；模块形态 NPO/CPO 为分析师推测',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'NPO 光模块 ↔ 跨机架 scale-up 光互连',
    summary:
      '★ 本代的分水岭：NVLink 域第一次跨出机架。**官方口径**：8 个 MGX NVL 机架经「copper and direct optical ' +
      'connections」组成单一 576-GPU NVLink 域，拓扑官方点名为「a new two-layer all-to-all NVLink topology」。' +
      '**分析师口径**：SemiAnalysis 表①把机架之间标为「Dragonfly NPO/CPO」、表②标为「Direct Connect NPO」' +
      '——「Dragonfly」是它自己的归类，与官方的 two-layer all-to-all 不等价，讲的时候要分开说、标明出处。' +
      '（此前本条把拓扑标成 fat-tree，任何来源都没这么说过，已订正。）',
    sourceIds: [POD, SA],
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
      '这一屏要建立的唯一认知：NVL576 的 8 个 MGX NVL（Oberon）机架**不是 8 套独立系统**，而是**单一 NVLink 域**——576 张 GPU 对软件来说是一台机器。机架内仍然是铜，只有机架之间才走光。' +
      '**官方怎么说**（2026-03 POD 博客）：「a new two-layer all-to-all NVLink topology」，八个机架「all in a single 576-GPU NVLink domain with copper and direct optical connections」——官方点名的拓扑是**两层全互连（two-layer all-to-all）**。' +
      '**分析师怎么说**（SemiAnalysis）：把机架之间归类为「Dragonfly」、模块形态推测为 NPO/CPO。⚠️ 「Dragonfly」是分析师自己的归类，与官方措辞不等价，别当成官方说法讲。屏上的机架内部结构（9+18+9、0.75U 交换托架）同样来自该分析师文章，不是 NVIDIA 官方规格。',
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
      '交换托架从 9 个翻倍到 18 个、高度从 1U 压到 0.75U，计算托架则拆成上下两组各 9 个。原因是物理的：铜背板上的 NVLink 信号有驱动距离上限——按 SemiAnalysis p.5，此前最远的计算托架到最远的交换托架是 19U，**尽管交换托架数量翻倍，重排后这个最大距离也只是略微增加到 22.5U**（是「增加得很少」，不是「压缩到」）。多出来的交换容量（每机架 72 颗 NVLink 7 芯片，是 NVL72 版的两倍）就是用来支撑跨机架光互连的。⚠️ 本站全部数字来自 SemiAnalysis 分析师文章，不是 NVIDIA 官方规格。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.ru.rack',
    planes: ['nvlink', 'power', 'cooling'],
    highlightAssemblyIds: ['asm.ru.nvswitch-tray', 'asm.ru.compute-tray', 'asm.ru.power-shelf'],
    presalesNote:
      '这一屏最能体现「结构服从物理」：客户如果问「为什么不直接堆更多卡」，答案就是铜的驱动距离和电源密度——4 个 110 kW 电源架也是同一个约束链上的结果。',
  },
  {
    // v1.4 W-A：CPO 是互斥在研版本，同树并存=建了一台不存在的机器（PLAN-v1.4.md Context）。
    // 本站只做讲解，不建 CPO 实体——3D 里看到的仍然是 NPO 版（asm.ru.optics 16 个模块）。
    id: 'scene.ru.optics-formfactor',
    systemId: SYSTEM_ID,
    title: 'NPO vs CPO：光模块两种在研形态',
    narration:
      '① 你应该看到什么：板级视角聚焦一个 NVSwitch 7 交换托架，16 个 NPO 光模块按 4×4 网格排布——' +
      '4 颗 NVLink 7 交换芯片，每颗旁边 4 个插槽式模块。' +
      '② 谁连谁 + 关键差异：这一屏看到的是 NPO 版本——每颗 ASIC 旁 4 个可插拔模块；CPO 版本没有插槽，' +
      '是每颗 ASIC 内嵌 4 个不可更换的光引擎，另配一个外置激光源模块。SemiAnalysis 判断 NPO 封装形态更成熟，' +
      '会先于 CPO 投入市场——这是分析师原文的判断，不是官方口径。' +
      '③ 断了会怎样：⚠️ 这一句是本手册的解读，不是 SemiAnalysis 原文陈述——NPO 坏一个模块换一个模块，' +
      '维护是插拔级的；CPO 的光引擎焊死在芯片上，坏一颗大概率要连整颗 ASIC 一起处理，维保口径从' +
      '「换模块」变成「换芯片/换托架」。全屏内容仍然是 SemiAnalysis 分析师文章的结构细节推测，不是 NVIDIA 官方规格。',
    lodLevel: 'board',
    focusAssemblyId: 'asm.ru.nvswitch-tray',
    planes: ['nvlink'],
    highlightAssemblyIds: ['asm.ru.nvswitch-asic', 'asm.ru.optics'],
    presalesNote:
      '开口先说证据级别：光模块这一层全部来自 SemiAnalysis 一篇分析师文章，NVIDIA 官方材料至今没有证实 NPO/CPO ' +
      '任何具体细节。讲完这句再讲 NPO/CPO 差异，客户才不会把结构推测当成官方承诺；第③段「断了会怎样」是本手册' +
      '自己的推演，不是原文，讲给客户前务必单独说明这层区别。',
  },
]

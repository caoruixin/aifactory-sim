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
 * NVIDIA HGX B300 内容包（v1.4 W-C 新增的第五个代际，`shipping`）。
 *
 * 这一代与前四代的分野只有一句话，但它决定了整个文件的每一处建模：
 * **NVLink 域止步在一台服务器里。**
 *
 * 读这个文件前先记住四条：
 *
 * 1. **它不是机架级机器**。GB300 NVL72 / Vera Rubin NVL72 / NVL576 是「整个机架 = 一台
 *    计算机」，HGX B300 是「一台 8 卡服务器 = 一个 NVLink 域」，机架只是把若干台服务器
 *    摞起来的家具。因此 `architecture: 'nvlink-node-domain'`，装配树里**刻意没有**
 *    `nvswitch-tray` 与 `nvlink-backplane`（`pack.test.ts` 对这一族强制禁用这两个 roleKey），
 *    机架层级的 nvlink 平面因此一条线都画不出来——**这不是漏建模，这就是教学内容本身**。
 *    机制上：`lib/routing.ts` 会把两端收缩到同一个可见盒子的连接判为退化边丢弃，
 *    HGX 的全部 nvlink 连接两端都在服务器内部，于是在 rack / cluster 深度下全部退化。
 *
 * 2. **它是风冷的**。官方 RA 原话「industry-leading performance in an air-cooled form
 *    factor」。因此这一代没有 CDU、没有分液歧管、没有冷板、没有一次侧水路，
 *    cooling 平面走的是 `medium: 'airflow'`（v1.4 预备提交为它新增的介质）：
 *    服务器 → 机房空调（CRAH）。跨代比较里那一整排 `removed` 全是这个原因，
 *    每一行都写了 narrative，免得被读成「HGX 少了一堆东西」。
 *
 * 3. **产能标尺是「一台服务器」，不是「一个机架」**。`keySpecs.gpuCount = 8` 填的是
 *    **每台 HGX B300 服务器**的 GPU 数（官方 RA Table 2），不是每机架——因为
 *    NVIDIA 在三个设计点上都白纸黑字写着「The number of GPU servers per rack depends on
 *    available rack power」，**官方拒绝给出每机架台数**。这不是取巧：8 恰好也是一个
 *    NVLink 域的边界，让 `lib/capacity.ts` 算出的「单副本 GPU 数」永远不会跨越域边界，
 *    是本代唯一在物理上正确的取值。详见 `keySpecs.gpuCount` 的 note。
 *
 * 4. **同一颗 Blackwell Ultra 芯片，两个平台的官方数字不一样**。数据手册第 5 页按平台
 *    分列：GB300 NVL72 列是 279 GB / 8 TB/s / FP4 稠密 15 PFLOPS / up to 1,400 W，
 *    HGX B300 列是 270 GB / 7.7 TB/s / FP4 稠密 14 PFLOPS / up to 1,100 W。
 *    因此本代**单独建 GPU 组件**（`cmp.hgx.b300-sxm`），不复用 GB300 那一份 mathSpecs。
 *
 * ⚠️ 官方未公布、因而一律 null 的关键项：
 * - **每机架服务器台数**与**整机架功率**（RA 明确交给「可用机架功率」决定）；
 * - **HGX 服务器的机箱高度**（OEM 决定；本项目 3D 用 DGX B300 的官方 10U 作数量级参照）；
 * - **HGX 基板上 NVSwitch 芯片的数量**（RA 只说「a combination of fifth-generation
 *   NVSwitch and fifth-generation NVLink」，数据手册用单数「via NVSwitch chip」；
 *   DGX B300 规格表写「NVLink Switch System | 2x」，只能作 DGX 参照，不当 HGX 规格）；
 * - **主机 CPU 的型号**（RA 只给下限：2 插槽、≥48 核/插槽、≥2 TB 系统内存）。
 *
 * ⚠️ 已发现的官方文档内部冲突（全部在对应 Claim 的 note 里留痕，不做「修正」）：
 *   1. 显存三个数并存：芯片博客 288 GB、数据手册 GB300 列 279 GB、HGX 列 270 GB。
 *      官方自己给了解释——博客图 1 脚注「Available SM count and HBM capacity varies by SKU」。
 *   2. 整机显存：HGX 产品页与数据手册写 2.1 TB，RA Table 1 写「Memory per Node 2.30TB」，
 *      RA Table 2 写「up to 2304 GB」。前者是 SKU 实配（8 × 270 GB = 2,160 GB），
 *      后者是「8 × 288 GB 上限」口径。
 *   3. 整机显存带宽：数据手册 62 TB/s（= 8 × 7.7），RA Table 1「Up to 64 TB/s」（= 8 × 8）。
 *   4. RA components.html Table 2 的「CPU」「CPU sockets」两行被误填成 NVLink 的值。
 *   5. CPU 核数下限：Table 2 写 48/插槽，appendix Table 8 写 32/插槽。
 *   6. 交换机型号：Table 5 / appendix Table 9 写 SN5600（128 端口 400 GbE，Spectrum-4），
 *      networking-hardware 一节写 SN5610（64 × 800 Gbps）。
 */

const SYSTEM_ID = 'sys.hgx-b300'

// ─────────────────────────── 源与 Claim 小工具 ───────────────────────────

const HGX_RA = 'src.nvidia-hgx-ra'
const HGX_PAGE = 'src.nvidia-hgx-page'
const BU_DATASHEET = 'src.nvidia-blackwell-ultra-datasheet'
const BU_BLOG = 'src.nvidia-blackwell-ultra-blog'
const DGX_PAGE = 'src.nvidia-dgx-b300-page'

/** 各源的抓取/发布时间（与 sources.ts 保持一致）。 */
const AS_OF: Record<string, string> = {
  [HGX_RA]: '2026-08',
  [HGX_PAGE]: '2026-08',
  [BU_DATASHEET]: '2025-10',
  [BU_BLOG]: '2025-08',
  [DGX_PAGE]: '2026-08',
}

/**
 * HGX 的官方数字一律 `verified_spec`（与 GB300 同级，与 LPX 不同）。
 *
 * 理由：这一代有完整的企业参考架构文档 + 平台规格表 + 数据手册技术规格表三层官方材料，
 * 每个数字都能精确回指到表号/段落原文，属于可验收的规格行，不是产品页卡片文案。
 */
function hgx<T extends ClaimValue>(
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
    status: 'shipping',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence: 'high',
    note,
  })
}

/** 关键数量（必带 locator）。 */
function hgxCount(value: number, sourceId: string, locator: string, note: string | null = null): Claim<number> {
  return hgx<number>(value, '个', sourceId, locator, note)
}

/** 厂商宣称（营销倍数口径，与可验收规格明显区分）。 */
function hgxVendor<T extends ClaimValue>(
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
    evidence: 'vendor_claim',
    status: 'shipping',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence: 'medium',
    note,
  })
}

/** 「官方未公布，本项目不编数」。 */
function hgxNull(unit: string | null, sourceId: string, note: string, locator: string | null = null): Claim {
  return claim({
    value: null,
    unit,
    sourceId,
    locator,
    evidence: 'verified_spec',
    status: 'shipping',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence: 'low',
    note,
  })
}

/** 这条口径被官方反复强调的一句话——每机架台数不是规格，是机房功率的函数。 */
const SERVERS_PER_RACK_NOTE =
  '★ NVIDIA 在 32 / 64 / 128 三个设计点的「Additional Considerations」里都写了同一句话：' +
  '「The number of GPU servers per rack depends on available rack power」（另一句是' +
  '「Rack layout must provide power supply redundancy」）。Overview 也说这是' +
  '「Flexible rail-optimized end-of-row network architecture that can accommodate modifications ' +
  'in the rack layout and number of servers per rack」。' +
  '也就是说**官方刻意不给每机架台数**——这与 NVL72 那种「一个机架就是一台机器」的形态是' +
  '根本区别：HGX 的机架只是家具，装几台由你的机房配电决定。'

/** 3D 里「一个机架 = 一个 4 节点 SU」的示意映射依据。 */
const RACK_AS_SU_NOTE =
  '本项目 3D 按「1 机架 = 1 个 SU = 4 台服务器」示意，8 个机架 = 32 台 = 官方 32 节点设计点' +
  '（256 GPU）。这样映射的三个理由：① SU = 4 compute nodes 是官方定义的最小复制单元；' +
  '② 官方 32 节点设计点恰好是「8 SU × 4 节点」；③ 用 DGX B300 的官方 ~14 kW/台做数量级参照，' +
  '4 台约 56 kW，是当下风冷高密机架的常见档位。' +
  `⚠️ 但这只是示意，不是官方规格。${SERVERS_PER_RACK_NOTE}`

/**
 * ⚠️ 官方 FP4 **稠密**口径在整板与单卡两行之间不闭合（稀疏口径闭合）。
 * 与 LPX 的「315 vs 32×9.6」同类问题：两条各自独立成立，本项目不互推、不加相等不变量。
 */
const FP4_DENSE_MISMATCH_NOTE =
  '⚠️ 官方 FP4 口径**稀疏闭合、稠密不闭合**：数据手册第 5 页 HGX B300 列，' +
  '整板「Total FP4 Tensor Core 144 PFLOPS | 108 PFLOPS」、单卡「FP4 Tensor Core 18 PFLOPS | 14 PFLOPS」。' +
  '稀疏侧 8 × 18 = 144 ✓ 完全闭合；稠密侧 8 × 14 = **112 ≠ 108**，差 4 PFLOPS。' +
  '按整板稠密反推的单卡值应是 108 ÷ 8 = 13.5 PFLOPS，官方单卡行写的是 14——大概率是各自取整所致，' +
  '但 NVIDIA 没有解释。' +
  '本项目的处理与 Groq 3 LPX 的「315 vs 32 × 9.6」完全一致：**两条数字各自独立成立、互不推导**，' +
  '产能数学取官方直接给出的单卡值 14 PFLOPS（不用整板值反推），报数时按需要引用其中一条并说明出处，' +
  '不要拿一条去「验算」另一条。'

const SKU_MEMORY_NOTE =
  '★ Blackwell Ultra 的显存有三个并存的官方数字，不是互相矛盾：芯片技术博客写 288 GB HBM3e，' +
  '数据手册第 5 页 GB300 NVL72 列写 279 GB、HGX B300 列写 270 GB。官方自己给了解释——' +
  '博客图 1 脚注「Blackwell Ultra GPUs contain up to 160 SMs and 288GB HBM3E Memory. ' +
  'Available SM count and HBM capacity varies by SKU.」。' +
  '本项目的产能数学取数据手册 HGX B300 列的 270 GB（该列自洽：8 × 270 = 2,160 GB ≈ 整机 2.1 TB，' +
  '8 × 7.7 = 61.6 ≈ 整机 62 TB/s），对外讲数时务必带上「哪个平台的哪个 SKU」这个前提。'

// ─────────────────────────── 系统 ───────────────────────────

export const HGX_B300_SYSTEM: FactorySystem = {
  id: SYSTEM_ID,
  name: 'NVIDIA HGX B300',
  vendor: 'NVIDIA',
  status: 'shipping',
  capacityPolicy: 'standard',
  architecture: 'nvlink-node-domain',
  generation: 'hgx-b300',
  referenceUrl: 'https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/',
  summary:
    '风冷的「服务器级 AI 工厂」：一台 NVIDIA-Certified HGX B300 服务器 = 1 块 HGX 基板上的 8 张 ' +
    'Blackwell Ultra SXM，经**板载**第五代 NVSwitch 组成 14.4 TB/s 的 NVLink 域（每卡 1.8 TB/s）；' +
    '域到此为止，跨服务器一律走 Spectrum-X 以太网（每 GPU 800 Gb/s，8 张 ConnectX-8 SuperNIC ' +
    '同样焊在基板上，1:1 配比）。官方以 2-8-9-800 配置、4 节点 SU 为单元，验证到 32 / 64 / 128 节点三档。',
  presalesNote:
    '讲 HGX B300 最省事的办法是把它和 GB300 NVL72 摆在一起，用一句话切开：' +
    '**「同一颗 B300，NVLink 域是 8 卡还是 72 卡」**。' +
    '① 客户如果做的是 ≤120B 的推理（官方原话「Each NVIDIA B300 SXM GPU can support a maximum ' +
    'model size of approximately 120B parameters」），模型压根装得进单卡、最多单机 8 卡，' +
    '机架级 NVLink 域是买了用不上的钱，风冷 HGX 才是对的；' +
    '② 客户如果做万亿参数 MoE 的低时延推理或大规模训练，专家并行/张量并行一旦跨出 8 卡，' +
    '就要走 800 Gb/s 以太网——比机架内 NVLink 慢一个数量级，这时才需要 NVL72。' +
    '★ 三个最容易说错的地方：' +
    '① **HGX ≠ DGX**：HGX 是 NVIDIA 卖给 OEM 的**基板**（8 GPU + 板载 NVSwitch + 8 张 CX-8），' +
    '整机由 OEM 做成 NVIDIA-Certified System；DGX B300 是 NVIDIA 自己出的整机（固定 10U、' +
    'Intel Xeon 6776P、2 张 BF-3、~14 kW）。客户说「买 HGX」时要先问清是要基板方案还是整机。' +
    '② **机架里没有 NVLink**：这一代的机架级 nvlink 平面是空的，别照着 NVL72 的图讲成' +
    '「机架内全互联」——那会在技术评审里被当场问倒。' +
    '③ **每机架放几台官方不给**：RA 三处都写「depends on available rack power」，' +
    '报方案时这一项必须按客户机房实测配电算，不能套模板。',
  sourceIds: [HGX_RA, HGX_PAGE, BU_DATASHEET, BU_BLOG, DGX_PAGE],
  keySpecs: {
    /**
     * ⚠️ 口径与前四代不同，务必读完这条 note 再用这个数。
     */
    gpuCount: hgx<number>(
      8,
      '张',
      HGX_RA,
      'Components 节 Table 2「GPU configuration | Eight NVIDIA B300 GPUs on an HGX B300 baseboard with up to 2304 GB of GPU memory」' +
        '（Abstract 同口径：「a 2-8-9-800 infrastructure configuration (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU)」）',
      '★★ 这里填的是**每台 HGX B300 服务器**的 GPU 数，不是「每机架」——' +
        `${SERVERS_PER_RACK_NOTE}` +
        '因此产能面板里的「机架数」滑杆对本代际请读作「**服务器台数**」，' +
        '「每机架 GPU 数」这一行的正确读法是「每台服务器 8 张」。' +
        '★ 这个取值同时是唯一物理正确的取值：8 恰好是一个 NVLink 域的边界，' +
        '产能模型算出的「单副本至少几张卡」因此永远不会跨过域边界；' +
        '若按「每机架 32 张」填，模型就会默许一个副本横跨 4 台没有 NVLink 相连的服务器，' +
        '得出的时延与吞吐会系统性偏乐观。',
    ),
    cpuCount: hgx<number>(
      2,
      '颗',
      HGX_RA,
      'Abstract，「a 2-8-9-800 infrastructure configuration (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU)」',
      '每台服务器 2 颗 x86 主机 CPU（型号由 OEM 选型，见 cmp.hgx.host-cpu）。',
    ),
    nicCountPerNode: hgx<number>(
      9,
      '张',
      HGX_RA,
      'Abstract，「2-8-9-800 ... (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU)」' +
        '（拆解见 Components Table 2：「Eight NVIDIA® ConnectX-8 SuperNICs per NVIDIA HGX B300 baseboard」' +
        '+「One NVIDIA® BlueField®-3 DPU per server」）',
      '9 = 8 张 East/West 的 ConnectX-8 SuperNIC（板载）+ 1 张 North/South 的 BlueField-3 DPU。' +
        '「2-8-9-800」这四个数字是这一代最好记的口诀，客户会场提问率极高。',
    ),
    perGpuNetworkGbs: hgx<number>(
      800,
      'Gb/s',
      HGX_RA,
      'Components 节，「externally connected by a network interface of 800 Gb/s (2 x 400Gb/s Ethernet) per GPU. ' +
        'This connectivity is provided by 8x ConnectX-8 SuperNICs on the HGX baseboard」',
      '★ 与机架内 NVLink 的 1.8 TB/s（= 14,400 Gb/s）对照：跨服务器带宽是域内的 1/18。' +
        '「域内 18 倍带宽」这个比值就是「为什么并行策略要尽量塞进 8 卡」的全部答案。',
    ),
    /** 产能的 tokens/W 输入。官方拒绝出数 ⇒ 恒为 null。 */
    rackPowerKW: hgxNull(
      'kW',
      HGX_RA,
      `★ NVIDIA 未公布 HGX B300 的整机架功率，而且是**刻意不公布**。${SERVERS_PER_RACK_NOTE}` +
        '本工具因此对这一代不出任何 tokens/W。' +
        '⚠️ 唯一可用的官方数量级参照来自 DGX B300 产品页的「Power Consumption | ~14 kW」' +
        '（单台 10U 整机），但 DGX ≠ HGX（DGX 是 2 张 BF-3 的固定形态），只能当量级看，' +
        '真实配电必须按 OEM 整机的实际铭牌算。',
    ),
    nvlinkAggregateBandwidthTBs: hgx<number>(
      14.4,
      'TB/s',
      HGX_RA,
      'Components 节 Table 2「NVIDIA® NVLink™ and NVSwitch™ | ... • Total Aggregate Bandwidth 14.4TB/s」' +
        '（Abstract 同口径：「connected via fifth-generation NVLink with 14.4 TB/s total interconnect bandwidth」；' +
        'HGX 产品页规格表「Total NVLink Bandwidth | 14.4 TB/s」；数据手册 HGX B300 列「Total NVLink Switch Bandwidth 14.4 TB/s」）',
      '★ 这是**一台服务器**（8 卡）的 NVLink 总带宽。对照 GB300 NVL72 的 130 TB/s——' +
        '那是**一个机架**（72 卡）的口径，两者不是同一层的数字，不能直接相比。' +
        '按卡折算：14.4 / 8 = 1.8 TB/s，130 / 72 ≈ 1.8 TB/s，**每卡是一样的**，' +
        '差的只是「域里有几张卡」。',
    ),
    gpuToGpuBandwidthGBs: hgx<number>(
      1800,
      'GB/s',
      HGX_RA,
      'Components 节 Table 2「NVIDIA® NVLink™ and NVSwitch™ | ... • GPU-to-GPU Bandwidth 1800GB/s」' +
        '（HGX 产品页「NVLink GPU-to-GPU Bandwidth | 1.8 TB/s」；数据手册「Interconnect | Fifth-Generation NVLink: 1.8 TB/s」）',
      '芯片技术博客给出构成：「1.8 TB/s bidirectional (18 links x 100 GB/s)」。',
    ),
    gpuMemoryPerNodeTB: hgx<number>(
      2.1,
      'TB',
      BU_DATASHEET,
      '第 5 页 Technical Specifications，HGX B300 列「Total Fast Memory | 2.1 TB」' +
        '（HGX 产品页规格表「Total Memory | 2.1 TB」同值）',
      `⚠️ RA Table 1 写「Memory per Node | 2.30TB HBM3e」、Table 2 写「up to 2304 GB of GPU memory」，` +
        `与这里的 2.1 TB 不一致：2,304 GB = 8 × 288 GB 是**上限口径**，2.1 TB ≈ 8 × 270 GB 是` +
        `数据手册 HGX B300 SKU 的实配口径。${SKU_MEMORY_NOTE}`,
    ),
    gpuMemoryBandwidthPerNodeTBs: hgx<number>(
      62,
      'TB/s',
      BU_DATASHEET,
      '第 5 页 Technical Specifications，HGX B300 列「Total Memory Bandwidth | 62 TB/s」',
      '⚠️ RA Table 1 写「GPU Aggregate Bandwidth per Node | Up to 64 TB/s」。' +
        '两者与显存的分歧同源：62 = 8 × 7.7（数据手册 HGX 列单卡值），64 = 8 × 8（RA 的「Up to」上限值）。',
    ),
    fp4DensePflops: hgx<number>(
      108,
      'PFLOPS',
      HGX_PAGE,
      'HGX 规格表 NVIDIA Blackwell 一栏 HGX B300 列「FP4 Tensor Core | 144 PFLOPS | 108 PFLOPS」' +
        '+ 脚注 1「Specification in Sparse | Dense」（数据手册第 5 页同值）',
      `144 为含稀疏口径，108 为稠密口径（均为**整块基板 8 卡**合计）。产能估算只用稠密值。${FP4_DENSE_MISMATCH_NOTE}`,
    ),
    fp8SparsePflops: hgx<number>(
      72,
      'PFLOPS',
      HGX_PAGE,
      'HGX 规格表 HGX B300 列「FP8/FP6 Tensor Core | 72 PFLOPS」+ 脚注 2「Specification in Sparse. Dense is ½ sparse spec shown.」',
      '该值含稀疏；稠密口径为 36 PFLOPS（整板）。RA components 节另有一处整板措辞：' +
        '「The HGX B300 baseboard provides up to 144 petaflops of processing power」——那是 FP4 含稀疏口径。',
    ),
    nodesPerScalableUnit: hgx<number>(
      4,
      '台',
      HGX_RA,
      'Networking Logical Architecture 节 Enterprise RA Scalable Unit (SU)，「This Enterprise RA is built on scalable units (SU) based on 4 compute nodes.」',
      '一个 SU 提供：计算网 64 × 400 Gb/s（聚合 25.6 Tb/s）、汇聚网 8 × 400 Gb/s（聚合 3.2 Tb/s）、' +
        '带外管理 24 × 1 Gb/s。SU 是这一代唯一官方定义的「复制单元」——注意它不是机架。',
    ),
    maxNodes: hgx<number>(
      128,
      '台',
      HGX_RA,
      'Overview，「this Enterprise RA scales up to 128 NVIDIA-Certified HGX B300 systems for a total of 1024 B300 SXM GPUs」',
      '三个官方设计点：32 节点 / 256 GPU、64 节点 / 512 GPU、128 节点 / 1024 GPU。' +
        '同节另有「A fully tested system scales to 32 SUs (Scalable Units). Larger clusters can be built ' +
        'based on customer requirements.」',
    ),
    maxScalableUnits: hgx<number>(
      32,
      '个 SU',
      HGX_RA,
      'Overview，「A fully tested system scales to 32 SUs (Scalable Units).」',
      '32 SU × 4 节点 = 128 台，与 maxNodes 闭合。这是官方完整测试过的规模，不是物理上限。',
    ),
    coolingMode: hgx<string>(
      '风冷（air-cooled）',
      null,
      HGX_RA,
      'Abstract，「designed to support enterprise AI inference workloads with industry-leading performance in an air-cooled form factor」',
      '★ 这一代与 NVL72 三代最直观的差别：**没有液冷**。整份 RA 里没有 CDU、没有分液歧管、' +
        '没有冷板、没有进液温度要求。对客户的意义是「现有风冷机房不用改造就能上」——' +
        '这往往比算力数字更能决定一单能不能落地。',
    ),
    maxModelPerGpuB: hgx<number>(
      120,
      'B 参数',
      HGX_RA,
      'Networking Physical Topologies 节 Compute Fabric Excluded for Pure Inference Deployments，' +
        '「Each NVIDIA B300 SXM GPU can support a maximum model size of approximately 120B parameters」',
      '★ 这是整份 RA 里对售前最有用的一句话：官方措辞是 approximately（约），' +
        '且紧接着说「Models beyond 120B parameters may require model parallelism ... ' +
        'This parallelism will still reside within the same node as each server node can hold up to ' +
        '8x NVIDIA B300 SXM GPUs」——即 120B 以内单卡搞定、超出也基本在单机 8 卡内解决。' +
        '这正是「纯推理场景可以不建计算网」这条官方建议的前提。',
    ),
    aiFactoryOutputVsHopper: hgxVendor<number>(
      30,
      '倍',
      BU_DATASHEET,
      '第 3 页 Boost Revenue With HGX B300 AI Factory Output，「HGX B300 yields a 30x overall increase in AI factory output performance compared to the Hopper architecture for maximum token revenue」',
      '⚠️ 厂商营销口径（帕累托前沿上的综合产出比，图注前提：FTL = 2,000 ms、ISL = 32K、OSL = 8K、' +
        '与 Dynamo FP4 一起用），不是单卡算力比，不可直接换算成 token 产能。' +
        '★ 对照 GB300 NVL72 的同类口径是 50×——**同一颗芯片、同一个对比基准，机架级方案比服务器级高**，' +
        '差的正是那个 72 卡 NVLink 域。这一对数字放在一起讲比任何架构图都有说服力。',
    ),
  },
  // 48U 为 3D 摆位用的示意值，与前四代一致：NVIDIA 未公布 HGX 部署的机架立面
  //（连每机架几台服务器都刻意不给，见 SERVERS_PER_RACK_NOTE）。
  rackUnitsForLayout: 48,
}

// ─────────────────────────── 组件 ───────────────────────────

export const HGX_B300_COMPONENTS: HardwareComponent[] = [
  {
    id: 'cmp.hgx.b300-sxm',
    kind: 'gpu',
    name: 'NVIDIA B300 SXM（Blackwell Ultra，HGX 口径）',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary:
      '与 GB300 NVL72 里同一颗 Blackwell Ultra 芯片（双 die 经 NV-HBI 合封、208B 晶体管、160 SM），' +
      '但按 HGX 风冷平台的 SKU 口径供货：270 GB HBM3E / 7.7 TB/s / 最高 1,100 W，' +
      '稠密 FP4 14 PFLOPS、稠密 FP8 4.5 PFLOPS。',
    presalesNote:
      '★ 这一条是本代最容易讲错、也最能体现专业度的地方：**同一颗 B300，HGX 与 GB300 NVL72 的官方数字不一样**。' +
      '数据手册第 5 页把两个平台分成两列：GB300 NVL72 是 279 GB / 8 TB/s / FP4 稠密 15 PFLOPS / 最高 1,400 W，' +
      'HGX B300 是 270 GB / 7.7 TB/s / FP4 稠密 14 PFLOPS / 最高 1,100 W。' +
      '差异来自功率档位——液冷机架能喂到 1,400 W，风冷整机的档位是 1,100 W，' +
      '掉的那 ~7% 算力就是「不改造机房」的代价。' +
      '客户拿着 NVL72 的规格表来问 HGX 报价时，把这一列指给他看，比解释十分钟都管用。' +
      '⚠️ 显存还有第三个官方数字 288 GB（芯片技术博客），那是芯片上限，不是任何一个平台的实配。',
    visual: { shape: 'chip', colorToken: 'accent' },
    imageUrl: 'https://www.nvidia.com/en-us/data-center/hgx/',
    sourceIds: [BU_DATASHEET, BU_BLOG, HGX_RA, HGX_PAGE],
    /**
     * ★ 产能数学的唯一口径：数据手册第 5 页 **HGX B300 列**（不是 GB300 NVL72 列）。
     *   该列内部自洽（8 × 270 GB = 2,160 GB ≈ 整机 2.1 TB；8 × 7.7 = 61.6 ≈ 整机 62 TB/s），
     *   因此整套取同一列，绝不与 RA 的「288 GB / Up to 8 TB/s」混用。
     */
    mathSpecs: {
      memoryGB: 270,
      bandwidthTBs: 7.7,
      fp8Tflops: 4500,
      fp4Tflops: 14000,
      tdpW: 1100,
      derivation:
        '全部取自 Blackwell Ultra 数据手册第 5 页 Technical Specifications 的 **HGX B300 列**' +
        '（同表 GB300 NVL72 列是另一组数字，本项目在 GB300 代际里单独建模，两者不混用）：' +
        '显存 270 GB 与带宽 7.7 TB/s 直接取「GPU Memory | Bandwidth 270 GB HBM3E | 7.7 TB/s」；' +
        'FP4 稠密 14,000 TFLOPS 取「FP4 Tensor Core 18 PFLOPS | 14 PFLOPS」+ 脚注 1「Specification in Sparse | Dense」的稠密值；' +
        'FP8 稠密 4,500 TFLOPS = 「FP8/FP6 Tensor Core 9 PFLOPS」（脚注 2「Specification in sparse. Dense is ½ sparse spec shown.」）÷ 2；' +
        'TDP 1,100 W 取「Max Thermal Design Power (TDP) | Configurable up to 1,100 W」——官方措辞是' +
        '「configurable up to」（可配置上限），不是典型工况功率。' +
        '⚠️ RA Table 1 的「288GB HBM3e / Up to 8TB/s」是另一套口径（芯片上限而非 HGX SKU 实配），' +
        '不进产能数学，只作为规格 Claim 并列登记。' +
        '⚠️ FP4 稠密取的是官方**单卡行**的 14 PFLOPS，不是整板 108 ÷ 8 = 13.5——' +
        '这两个官方数字本身就不闭合（8 × 14 = 112 ≠ 108），本项目不互推，详见该 Claim 的 note。',
    },
    specs: {
      hbmPerGpuGB: hgx<number>(
        270,
        'GB',
        BU_DATASHEET,
        '第 5 页 Technical Specifications，HGX B300 列「GPU Memory | Bandwidth | 270 GB HBM3E | 7.7 TB/s」',
        SKU_MEMORY_NOTE,
      ),
      hbmPerGpuRaGB: hgx<number>(
        288,
        'GB',
        HGX_RA,
        'Components 节 Table 1「Memory per GPU | NVIDIA B300 SXM | 288GB HBM3e」' +
          '（芯片技术博客同值：「With 288 GB of HBM3e per GPU, it offers 3.6x more on-package memory than H100」）',
        `⚠️ 与上一条的 270 GB 并列登记、**不互相覆盖**。${SKU_MEMORY_NOTE}`,
      ),
      hbmBandwidthTBs: hgx<number>(
        7.7,
        'TB/s',
        BU_DATASHEET,
        '第 5 页 Technical Specifications，HGX B300 列「GPU Memory | Bandwidth | 270 GB HBM3E | 7.7 TB/s」',
        '⚠️ RA Table 1 写「GPU Bandwidth | Up to 8TB/s」、芯片博客写「Bandwidth: 8 TB/s per GPU, ' +
          '2.4x improvement over H100 (3.35 TB/s)」。7.7 是 HGX SKU 实配，8 是芯片上限口径。',
      ),
      hbmStackConfig: hgx<string>(
        'Eight 12-Hi stacks / 16 × 512-bit 控制器（总位宽 8,192 bit）',
        null,
        BU_BLOG,
        'Memory: high capacity and bandwidth for multi-trillion-parameter models 节，' +
          '「HBM configuration: Eight 12-Hi stacks, 16 × 512-bit controllers (8,192-bit total width)」',
        '★ 这是本项目里少见的「HBM 堆栈数有官方出处」的一代——GB300 那边 3D 里的 8 颗堆栈是视觉示意，' +
          '这里的 8 是官方数字。',
      ),
      fp4DenseTflops: hgx<number>(
        14000,
        'TFLOPS',
        BU_DATASHEET,
        '第 5 页 Individual Blackwell Ultra GPU Specifications，HGX B300 列「FP4 Tensor Core | 18 PFLOPS | 14 PFLOPS」+ 脚注 1「Specification in Sparse | Dense」',
        `同表 GB300 NVL72 列为「20 PFLOPS | 15 PFLOPS」——同一颗芯片、不同平台功率档位。${FP4_DENSE_MISMATCH_NOTE}`,
      ),
      fp8DenseTflops: hgx<number>(
        4500,
        'TFLOPS',
        BU_DATASHEET,
        '第 5 页 Individual Blackwell Ultra GPU Specifications，HGX B300 列「FP8/FP6 Tensor Core | 9 PFLOPS」+ 脚注 2「Specification in sparse. Dense is ½ sparse spec shown.」（9 ÷ 2 = 4.5 PFLOPS 稠密）',
        '同表 GB300 NVL72 列稀疏 10 PFLOPS ⇒ 稠密 5 PFLOPS。',
      ),
      nvlinkPerGpuTBs: hgx<number>(
        1.8,
        'TB/s',
        BU_DATASHEET,
        '第 5 页「Interconnect | Fifth-Generation NVLink: 1.8 TB/s」' +
          '（芯片技术博客给出构成：「Per-GPU Bandwidth: 1.8 TB/s bidirectional (18 links x 100 GB/s)」）',
        '★ 与 GB300 NVL72 **完全相同**——每卡的 NVLink 能力没变，变的是「这条链路通到多少张卡」。',
      ),
      pcieInterface: hgx<string>(
        'PCIe Gen6 ×16（256 GB/s 双向）',
        null,
        BU_DATASHEET,
        '第 5 页「Interconnect | ... PCIe Gen6: 256 GB/s」（芯片技术博客：「PCIe Interface: Gen6 × 16 lanes (256 GB/s bidirectional)」）',
        '★ 与 GB300 的关键差异：HGX 是 x86 主机 + PCIe，**没有 NVLink-C2C**。' +
          'GB300 NVL72 的 Grace CPU 经 900 GB/s C2C 与 GPU 一致寻址（「37 TB 快内存」由此而来），' +
          'HGX 这一代主机内存与显存是两个独立地址空间，不要把 NVL72 的「快内存」话术搬过来。',
      ),
      tdpW: hgx<number>(
        1100,
        'W',
        BU_DATASHEET,
        '第 5 页「Max Thermal Design Power (TDP) | Configurable up to 1,100 W」（HGX B300 列）',
        '★ 官方措辞是「Configurable up to」——是可配置上限，不是典型工况功率。' +
          '同表 GB300 NVL72 列为「Configurable up to 1,400 W」，风冷与液冷的档位差就在这里。' +
          '这也是本项目里**第一个有官方单卡 TDP 的加速器**（前四代官方都没给）。',
      ),
      transistorsB: hgx<number>(
        208,
        '十亿',
        BU_BLOG,
        'Dual-reticle design: one GPU 节，「Blackwell Ultra is manufactured using TSMC 4NP and features 208B transistors–2.6x more than the NVIDIA Hopper GPU」',
      ),
      processNode: hgx<string>(
        'TSMC 4NP（双 reticle 双 die 经 NV-HBI 合封）',
        null,
        BU_BLOG,
        'Dual-reticle design: one GPU 节，「two reticle-sized dies connected using NVIDIA High-Bandwidth Interface (NV-HBI), a custom, power-efficient die-to-die interconnect technology that provides 10 TB/s of bandwidth ... manufactured using TSMC 4NP」',
      ),
      smCount: hgx<number>(
        160,
        '个 SM',
        BU_BLOG,
        'Streaming multiprocessors 节，「160 Streaming Multiprocessors (SMs) organized into eight Graphics Processing Clusters (GPCs) in the full GPU implementation」，提供 640 个第五代 Tensor Core',
        '⚠️ 图 1 脚注：「Blackwell Ultra GPUs contain up to 160 SMs ... Available SM count and HBM capacity varies by SKU.」' +
          '——160 是完整实现的上限，具体 SKU 可能更少。',
      ),
      attentionSpeedupVsBlackwell: hgxVendor<number>(
        2,
        '倍',
        BU_BLOG,
        'Accelerated softmax in the attention layer 节，「In Blackwell Ultra, SFU throughput has been doubled for key instructions used in attention, delivering up to 2x faster attention-layer compute compared to Blackwell GPUs」',
        '★ 对推理售前最实用的一条架构改进：softmax/超越函数走的 SFU 吞吐翻倍，' +
          '长上下文推理里 softmax 阶段常常是时延瓶颈。HGX 产品页规格表也用一行「Attention Performance | 2x」' +
          '（对比 Blackwell）表达同一件事。',
      ),
      migInstances: hgx<number>(
        7,
        '个',
        BU_DATASHEET,
        '第 5 页「Multi-Instance GPU (MIG) | 7」（GB300 NVL72 与 HGX B300 两列合并为同一格）',
      ),
    },
  },
  {
    id: 'cmp.hgx.baseboard',
    kind: 'tray',
    name: 'NVIDIA HGX B300 基板（baseboard）',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary:
      '「HGX 到底是什么」的答案就是这块板：8 颗 B300 SXM + 板载第五代 NVSwitch（组成 14.4 TB/s ' +
      'NVLink 域）+ 8 张 ConnectX-8 SuperNIC（1:1 配比，每 GPU 800 Gb/s 出网）焊在一起，' +
      '经 8 条 PCIe Gen5 ×16 挂到 OEM 的主机板上。',
    presalesNote:
      '★ 这块板是理解整个 HGX 生意的关键：**NVIDIA 卖的不是服务器，是这块板**。' +
      'OEM（Dell / HPE / Supermicro / 浪潮…）拿它配自己的机箱、CPU、电源、风扇，' +
      '做成 NVIDIA-Certified HGX B300 System 再卖给客户。' +
      '于是有三条对方案直接有影响的推论：' +
      '① **GPU 侧的东西你选不了也改不了**（8 卡、NVSwitch、8 张 CX-8 都在板上），' +
      '不同 OEM 报价的差异全在机箱/CPU/存储/电源/服务；' +
      '② **CPU 与内存反而要认真选**——RA 只给下限（2 插槽、≥48 核/插槽、≥2 TB 系统内存、' +
      '≥500 GB/s 内存带宽、balanced PCIe topology），配歪了会在数据加载侧卡住 GPU；' +
      '③ 对比 DGX B300：那是 NVIDIA 自己用同类基板做的整机，形态固定（10U、Xeon 6776P、2 张 BF-3）。' +
      '客户要「一台就能跑」选 DGX，要「按自己的标准堆规模」选 HGX。',
    visual: { shape: 'board', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [HGX_RA, BU_DATASHEET],
    specs: {
      gpusPerBaseboard: hgxCount(
        8,
        HGX_RA,
        'Components 节，「HGX B300 is a unified platform consisting of 8 Blackwell GPUs internally connected by NVLink」' +
          '（Table 2「Eight NVIDIA B300 GPUs on an HGX B300 baseboard with up to 2304 GB of GPU memory」）',
      ),
      superNicsPerBaseboard: hgxCount(
        8,
        HGX_RA,
        'Components 节 Table 2「Network Adapters/NICs speed (East/West) | Eight NVIDIA® ConnectX-8 SuperNICs per NVIDIA HGX B300 baseboard. Up to 800 Gbps per adapter.」',
        '★ 关键词是 **per baseboard**：网卡是焊在 GPU 基板上的，不是插在主机 PCIe 槽里的。' +
          '这与 GB300 NVL72 把 CX-8 装在计算托盘的夹层板上是两种做法。',
      ),
      nvlinkGeneration: hgx<string>(
        '第五代 NVLink + 第五代 NVSwitch（板载）',
        null,
        HGX_RA,
        'Components 节 Table 2「NVIDIA® NVLink™ and NVSwitch™ | NVIDIA HGX B300 Baseboards use a combination of fifth-generation NVSwitch and fifth-generation NVLink」',
      ),
      nvlinkAggregateTBs: hgx<number>(
        14.4,
        'TB/s',
        HGX_RA,
        'Components 节 Table 2「• Total Aggregate Bandwidth 14.4TB/s」',
      ),
      pcieToHost: hgx<string>(
        '8 条 PCIe Gen5 ×16 + 1 条 Gen4 ×2（每块 HGX B300 基板）',
        null,
        HGX_RA,
        'Components 节 Table 2「PCI Express | Eight Gen5 x16 links and one Gen4 x2 link per NVIDIA HGX B300 baseboard. One Gen5 x16 link per DPU, SuperNIC or adapter.」',
        '8 条 ×16 对应 8 张 GPU 的主机侧通路；那条 Gen4 ×2 是管理/带外用途。' +
          '⚠️ 注意与 GPU 自身「PCIe Gen6 ×16」的芯片能力口径区分——RA 描述的是基板到主机的实际链路。',
      ),
      fp4SparsePflops: hgx<number>(
        144,
        'PFLOPS',
        HGX_RA,
        'Components 节，「The HGX B300 baseboard provides up to 144 petaflops of processing power, making it a leading accelerated platform for AI」' +
          '（HGX 产品页规格表 FP4 Tensor Core「144 PFLOPS | 108 PFLOPS」，脚注 1 声明前者为稀疏）',
        '⚠️ RA 正文这句话没有说明稀疏/稠密口径，对照产品页脚注可知 144 是含稀疏值，稠密为 108。' +
          '对外报数只报 108，或者报 144 时把「含稀疏」一起说。',
      ),
      nvswitchChipCount: hgxNull(
        '颗',
        HGX_RA,
        '★ NVIDIA 未公布 HGX B300 基板上 NVSwitch 芯片的**数量**。RA Table 2 只说' +
          '「a combination of fifth-generation NVSwitch and fifth-generation NVLink」，' +
          '数据手册第 3 页用单数「1,800 GBps NVLink between GPUs via NVSwitch™ chip」。' +
          '⚠️ DGX B300 产品页规格表写「NVIDIA NVLink™ Switch System | 2x」——但那是 DGX 整机的规格，' +
          '本项目只作参照写进 note，不当作 HGX 基板的官方数量。3D 里画 2 颗是示意。',
      ),
      vendorModel: hgxNull(
        null,
        HGX_RA,
        'NVIDIA 未公布 HGX B300 基板的物料型号/板号，也未公布板级尺寸与供电接口规格' +
          '（这些在 OEM 与 NVIDIA 之间的设计文件里，不在公开 RA 中）。',
      ),
    },
  },
  {
    id: 'cmp.hgx.nvswitch5',
    kind: 'switch',
    name: 'NVSwitch ASIC（第五代，板载）',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary:
      '焊在 HGX B300 基板上的 NVLink 交换芯片，把 8 颗 B300 交叉互连成一个 14.4 TB/s 的无阻塞域。' +
      '与 GB300 NVL72 里那颗是同一代交换芯片，位置从机架的交换托盘搬进了服务器的基板。',
    presalesNote:
      '★ 本项目让这颗芯片与 GB300 复用同一个 roleKey（nvswitch-asic）是**刻意的**：' +
      '跨代比较表里它会与 NVL72 的 NVSwitch 排在同一行，一眼看出' +
      '「同一个角色，位置从机架级交换托盘搬进了服务器基板」——' +
      '这正是这一代要教的东西。' +
      '讲法：NVSwitch 之于 NVLink，就像以太网交换机之于网线。有它，8 张卡才是全连接；' +
      '**但也就到 8 张为止**——机架里没有第二级 NVSwitch，第 9 张卡开始就得走以太网了。' +
      '⚠️ 官方没有公布基板上这颗芯片的数量（RA 只说「a combination of ... NVSwitch and ... NVLink」，' +
      '数据手册用单数）。DGX B300 规格表写 2x，可以作为数量级参照转述，但别说成 HGX 的规格。',
    visual: { shape: 'chip', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [HGX_RA, BU_DATASHEET, DGX_PAGE],
    specs: {
      generation: hgx<string>(
        '第五代 NVSwitch',
        null,
        HGX_RA,
        'Components 节 Table 2「NVIDIA HGX B300 Baseboards use a combination of fifth-generation NVSwitch and fifth-generation NVLink」',
      ),
      domainScope: hgx<string>(
        '单台服务器内的 8 张 B300（域不跨服务器）',
        null,
        HGX_RA,
        'Components 节，「HGX B300 is a unified platform consisting of 8 Blackwell GPUs internally connected by NVLink and externally connected by a network interface of 800 Gb/s (2 x 400Gb/s Ethernet) per GPU」',
        '★★ 这条 Claim 就是本代际的定义特征：**internally connected by NVLink, externally by Ethernet**。' +
          '「internal/external」的分界线是**服务器机箱**，不是机架。' +
          '对照 GB300 NVL72：那一代的分界线才是机架。',
      ),
      aggregateBandwidthPerNodeTBs: hgx<number>(
        14.4,
        'TB/s',
        BU_DATASHEET,
        '第 5 页 Technical Specifications，HGX B300 列「Total NVLink Switch Bandwidth | 14.4 TB/s」',
        '对照 GB300 NVL72 同表为 130 TB/s——但那是 72 卡机架口径，不是同一层的数字。',
      ),
      perGpuLinkBandwidthGBs: hgx<number>(
        1800,
        'GB/s',
        BU_DATASHEET,
        '第 3 页 NVIDIA HGX B300 Key Features，「1,800 GBps NVLink between GPUs via NVSwitch™ chip」',
      ),
      chipsPerBaseboard: hgxNull(
        '颗',
        HGX_RA,
        '★ NVIDIA 未公布 HGX B300 基板上的 NVSwitch 芯片数量（见 cmp.hgx.baseboard.nvswitchChipCount 的同款说明）。' +
          '⚠️ 参照值：DGX B300 产品页规格表「NVIDIA NVLink™ Switch System | 2x」——DGX 整机口径，非 HGX 规格。',
      ),
      portCount: hgxNull(
        '端口',
        HGX_RA,
        'NVIDIA 未公布第五代 NVSwitch 的端口数与单芯片吞吐（GB300 那一代的参考架构同样没给）。',
      ),
    },
  },
  {
    id: 'cmp.hgx.server',
    kind: 'tray',
    name: 'NVIDIA-Certified HGX B300 服务器（OEM 整机）',
    vendor: 'OEM（NVIDIA-Certified）',
    status: 'shipping',
    summary:
      'OEM 用 HGX B300 基板做成的风冷整机：1 块基板（8 GPU + 板载 NVSwitch + 8 张 CX-8）' +
      '+ 2 颗 x86 主机 CPU（≥48 核/插槽、≥2 TB 系统内存）+ 1 张 BlueField-3 B3240 DPU ' +
      '+ 本地 NVMe（1 TB 启动盘 + 每插槽 ≥1 TB 数据盘）+ BMC。这就是 RA 说的「2-8-9-800」节点。',
    presalesNote:
      '★ 这台机器才是客户真正下单的东西，而它的规格**一半由 NVIDIA 定、一半由 OEM 定**：' +
      'GPU 侧（8 卡 / NVSwitch / 8 张 CX-8）在基板上，动不了；' +
      'CPU / 内存 / 存储 / 电源 / 机箱高度 / 风道全是 OEM 的活。' +
      '因此比价时要盯住三件事：' +
      '① CPU 与内存是否达到 RA 下限（2 插槽 × ≥48 核、≥2 TB、≥500 GB/s、balanced PCIe topology）——' +
      '低于下限会在数据加载/预处理侧拖住 GPU；' +
      '② 本地 NVMe 的档位（RA 按用途分档：推理 ≥1 TB/插槽、训练 ≥2 TB/插槽，另加 1 TB 启动盘）；' +
      '③ **机箱高度与整机功率**——RA 一个字都没提，必须问 OEM 要铭牌。' +
      '数量级参照：NVIDIA 自家的 DGX B300 是 10U / ~14 kW，' +
      '按这个量级算，一个 60 kW 级的风冷机架大约放得下 4 台。' +
      '⚠️ 这个「4 台」是本项目 3D 的示意口径，不是官方规格——官方原话是' +
      '「The number of GPU servers per rack depends on available rack power」。',
    visual: { shape: 'tray-slab', colorToken: null },
    imageUrl: null,
    sourceIds: [HGX_RA, DGX_PAGE],
    specs: {
      nodeConfiguration: hgx<string>(
        '2-8-9-800（2 CPU / 8 GPU / 9 网卡 / 每 GPU 800 Gb/s）',
        null,
        HGX_RA,
        'Abstract，「It is based on a 2-8-9-800 infrastructure configuration (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU) with NVIDIA HGX™ B300 Servers」',
        '★ 全场最好记的口诀。9 张网卡 = 8 张板载 ConnectX-8（East/West）+ 1 张 BlueField-3（North/South）。',
      ),
      cpuSockets: hgxCount(
        2,
        HGX_RA,
        'Abstract，「2-8-9-800 ... (2 CPUs, 8 GPUs, 9 NICs ...)」（appendix Table 8「CPUs | 2」同口径）',
        '⚠️ RA components.html Table 2 的「CPU」与「CPU sockets」两行内容被误填成了 NVLink 的值' +
          '（「Total Aggregate Bandwidth 14.4TB/s」/「GPU-to-GPU Bandwidth 1800GB/s」），' +
          '显然是排版事故。本项目因此改引 Abstract 与 appendix Table 8。',
      ),
      cpuCoresPerSocket: hgx<number>(
        48,
        '核',
        HGX_RA,
        'Components 节 Table 2「CPU cores | Minimum of 48 physical CPU cores per socket. Recommendation of 56 physical CPU cores per socket.」',
        '⚠️ 官方文档自相矛盾：appendix Table 8 写「Minimum of 32 physical CPU cores per socket. ' +
          'Recommendation of 56 physical CPU cores per socket.」。本项目取正文 Table 2 的 48 并留痕。' +
          '两处都推荐 56 核/插槽，报方案按 56 核更稳。',
      ),
      cpuBaseClockGHz: hgx<number>(
        2.0,
        'GHz',
        HGX_RA,
        'Components 节 Table 2「CPU speed | 2.0 GHz minimum base CPU clock」',
      ),
      systemMemoryTB: hgx<number>(
        2,
        'TB',
        HGX_RA,
        'Components 节 Table 2「System memory (total across all CPU sockets) | Minimum of 2TB system memory. Minimum of 500GB/s memory bandwidth. For optimal performance, system memory should be evenly distributed across all CPU sockets and memory channels...」',
        '下限口径。★ 与 GB300 NVL72 的一个关键差别：那一代的 Grace LPDDR5X 经 NVLink-C2C 对 GPU ' +
          '一致寻址（官方叫「快内存」），HGX 这一代主机内存与显存是两个地址空间，' +
          '2 TB 系统内存不能当成「显存的延伸」讲。',
      ),
      dpusPerServer: hgxCount(
        1,
        HGX_RA,
        'Components 节 Table 2「DPU (North/South) | One NVIDIA® BlueField®-3 DPU per server」' +
          '（Table 5 更具体：「One NVIDIA BlueField-3 B3240 dual port 400 GbE DPU」）',
        '⚠️ 与 DGX B300 不同：DGX 规格表是「2x dual-port QSFP112 NVIDIA BlueField-3 DPU」（两张）。',
      ),
      localStoragePolicy: hgx<string>(
        '推理 ≥1 TB NVMe/插槽、训练 ≥2 TB NVMe/插槽、HPC ≥1 TB NVMe/插槽，另加 1 TB NVMe 启动盘',
        null,
        HGX_RA,
        'Components 节 Table 2「Local storage | • Inference Servers: Minimum 1 TB NVMe drive per CPU socket • Training / DL Servers: Minimum 2 TB NVMe drive per CPU socket • HPC Servers: Minimum 1 TB NVMe drive per CPU socket • 1 TB NVMe boot drive」',
      ),
      remoteManagement: hgx<string>(
        'BMC（SMBPBI over SMBus 带外协议，支持 PLDM T5 与 SPDM），另配 TPM 2.0 安全启动',
        null,
        HGX_RA,
        'Components 节 Table 2「Remote systems management | SMBPBI over SMBus (OOB) protocol to BMC. PLDM T5-enabled. SPDM-enabled.」+「Security | TPM 2.0 module (secure boot)」',
      ),
      oobPortsPerServer: hgx<number>(
        6,
        '个',
        HGX_RA,
        'Networking Logical Architecture 节 4-Node SU，「For the Out-of-band Management fabric, 4 servers, each with 6x 1Gb/s connections providing 24x 1Gb/s for management」',
        '6 个 1 Gb 带外口/台（BMC + DPU 管理口 + 其余板载管理接口）。',
      ),
      chassisHeightU: hgxNull(
        'U',
        HGX_RA,
        '★ NVIDIA 未在 HGX 参考架构里规定服务器机箱高度——那是 OEM 的设计空间。' +
          '⚠️ 数量级参照：NVIDIA 自家 DGX B300 产品页规格表「Rack Units | 10U」。' +
          '本项目 3D 按 10U/台摆位（4 台占 40U），是**用 DGX 参照做的示意**，不是 HGX 规格。',
      ),
      serverPowerKW: hgxNull(
        'kW',
        HGX_RA,
        '★ NVIDIA 未公布 HGX B300 整机功率（RA 全篇只在机架层面说「depends on available rack power」）。' +
          '⚠️ 数量级参照：DGX B300 产品页「Power Consumption | ~14 kW」（10U 整机，含 2 张 BF-3）。' +
          '真实配电必须按 OEM 整机铭牌算。',
      ),
      cpuModel: hgxNull(
        null,
        HGX_RA,
        'NVIDIA 未指定 HGX B300 服务器的主机 CPU 型号，只给了下限（2 插槽、≥48 核/插槽、≥2.0 GHz 基频、' +
          '≥2 TB 系统内存、≥500 GB/s 内存带宽、balanced PCIe topology）。' +
          '⚠️ 参照：DGX B300 用的是「Intel® Xeon® 6776P Processors」——DGX 的选型，不是 HGX 的要求。',
      ),
    },
  },
  {
    id: 'cmp.hgx.host-cpu',
    kind: 'cpu',
    name: 'HGX 服务器主机 CPU（x86，型号由 OEM 选型）',
    vendor: 'OEM（Intel / AMD）',
    status: 'shipping',
    summary:
      '每台服务器 2 颗 x86 主机 CPU。NVIDIA 只给下限要求（≥48 核/插槽、≥2.0 GHz 基频、' +
      '两插槽合计 ≥2 TB 系统内存与 ≥500 GB/s 内存带宽、PCIe 拓扑要在两个插槽间均衡），' +
      '不指定型号——这一格是 OEM 的选型空间。',
    presalesNote:
      '★ 与 GB300 NVL72 最容易被忽略的差别就在这一颗：那一代是 **NVIDIA Grace**，' +
      '经 NVLink-C2C（900 GB/s）与 GPU 一致寻址；HGX 这一代是 **x86 + PCIe**，' +
      '主机内存与显存是两个独立地址空间。' +
      '于是「37 TB 快内存」「CPU 内存当显存延伸」这类 NVL72 的话术在 HGX 上一句都不能用。' +
      '选型上盯三条 RA 下限：≥48 核/插槽（推荐 56）、≥2 TB 系统内存、≥500 GB/s 内存带宽，' +
      '外加「balanced PCIe topology with connectivity spread evenly across CPU sockets and PCIe root ports」' +
      '——最后这条最常被 OEM 配置单踩坑：8 张 GPU + 9 张网卡全挂到一个插槽上，跑起来会莫名其妙地慢。',
    visual: { shape: 'chip', colorToken: null },
    imageUrl: null,
    sourceIds: [HGX_RA, DGX_PAGE],
    specs: {
      socketsPerServer: hgxCount(
        2,
        HGX_RA,
        'Abstract，「2-8-9-800 ... (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU)」（appendix Table 8「CPUs | 2」）',
      ),
      minCoresPerSocket: hgx<number>(
        48,
        '核',
        HGX_RA,
        'Components 节 Table 2「CPU cores | Minimum of 48 physical CPU cores per socket. Recommendation of 56 physical CPU cores per socket.」',
        '⚠️ appendix Table 8 同一项写的是 32 核下限——官方文档自身不一致，本项目取正文 Table 2 的 48。',
      ),
      recommendedCoresPerSocket: hgx<number>(
        56,
        '核',
        HGX_RA,
        'Components 节 Table 2「Recommendation of 56 physical CPU cores per socket.」（appendix Table 8 同值）',
        '两处官方表格在「推荐值」上是一致的（56），只在「下限」上打架。报方案按 56 核。',
      ),
      minBaseClockGHz: hgx<number>(
        2.0,
        'GHz',
        HGX_RA,
        'Components 节 Table 2「CPU speed | 2.0 GHz minimum base CPU clock」',
      ),
      minSystemMemoryTB: hgx<number>(
        2,
        'TB',
        HGX_RA,
        'Components 节 Table 2「System memory (total across all CPU sockets) | Minimum of 2TB system memory.」',
      ),
      minMemoryBandwidthGBs: hgx<number>(
        500,
        'GB/s',
        HGX_RA,
        'Components 节 Table 2「System memory ... Minimum of 500GB/s memory bandwidth.」',
      ),
      pcieTopologyRequirement: hgx<string>(
        'PCIe 拓扑需在两个 CPU 插槽与各 root port 之间均衡分布',
        null,
        HGX_RA,
        'Components 节 Table 2「PCIe topology | Balanced PCIe topology with connectivity spread evenly across CPU sockets and PCIe root ports.」',
        '★ 配置单审核必查项：8 张 GPU + 8 张 SuperNIC + 1 张 DPU 若全挂在同一插槽下，' +
          'GPUDirect RDMA 会被迫跨 UPI/Infinity Fabric 绕行，实测吞吐会显著低于标称。',
      ),
      hostGpuInterconnect: hgx<string>(
        'PCIe Gen5 ×16（每 GPU / 每张 SuperNIC / 每张 DPU 各一条）',
        null,
        HGX_RA,
        'Components 节 Table 2「PCI Express | Eight Gen5 x16 links and one Gen4 x2 link per NVIDIA HGX B300 baseboard. One Gen5 x16 link per DPU, SuperNIC or adapter.」',
        '★ 与 GB300 NVL72 的 NVLink-C2C（900 GB/s，CPU/GPU 一致寻址）是完全不同的东西。' +
          '本代主机与 GPU 之间只有 PCIe，没有内存一致性。',
      ),
      model: hgxNull(
        null,
        HGX_RA,
        '★ NVIDIA 未指定 HGX B300 主机 CPU 的型号与厂商——RA 只给性能下限，选型属于 OEM。' +
          '⚠️ 不要拿 DGX B300 的「Intel® Xeon® 6776P」当 HGX 的答案：那是 NVIDIA 自家整机的选型。' +
          '⚠️ 也不要说成 NVIDIA Grace——HGX B300 是 x86 平台（数据手册第 5 页 HGX B300 列的' +
          '「Blackwell Ultra GPUs | Grace CPUs」一格写的就是「8 | 0」，Grace 数量为零）。',
      ),
      tdpW: hgxNull('W', HGX_RA, 'NVIDIA 未公布主机 CPU 的 TDP（型号都由 OEM 定，功耗自然也是）。'),
    },
  },
  {
    id: 'cmp.hgx.hbm3e',
    kind: 'hbm',
    name: 'HBM3E 堆栈（12-Hi）',
    vendor: 'NVIDIA（封装内）',
    status: 'shipping',
    summary:
      'Blackwell Ultra 封装内的 HBM3E：8 个 12-Hi 堆栈、16 个 512-bit 控制器（总位宽 8,192 bit），' +
      'HGX B300 SKU 口径为每卡 270 GB / 7.7 TB/s。',
    presalesNote:
      '这一层要讲的不是容量数字，而是**为什么同一颗芯片有三个显存数字**：' +
      '芯片博客 288 GB（芯片上限）、数据手册 GB300 NVL72 列 279 GB、HGX B300 列 270 GB。' +
      '官方自己给了答案——博客图 1 脚注：「Available SM count and HBM capacity varies by SKU」。' +
      '客户拿着不同来源的数字来质疑时，先问「你看的是哪个平台的哪张表」，' +
      '这一句就能把场面稳住。' +
      '★ 顺带一个能落地的点：8 个 12-Hi 堆栈是**官方明写**的配置（前四代的 3D 里 HBM 数量都是视觉示意），' +
      '所以这一代下钻到 HBM 时，那 8 颗是真的 8 颗。',
    visual: { shape: 'chip-stack', colorToken: 'accent-2' },
    imageUrl: null,
    sourceIds: [BU_BLOG, BU_DATASHEET, HGX_RA],
    specs: {
      stacksPerGpu: hgxCount(
        8,
        BU_BLOG,
        'Memory 节 High bandwidth memory features，「HBM configuration: Eight 12-Hi stacks, 16 × 512-bit controllers (8,192-bit total width)」',
      ),
      stackHeight: hgx<string>(
        '12-Hi',
        null,
        BU_BLOG,
        'Memory 节，「HBM configuration: Eight 12-Hi stacks」',
      ),
      totalBusWidthBits: hgx<number>(
        8192,
        'bit',
        BU_BLOG,
        'Memory 节，「16 × 512-bit controllers (8,192-bit total width)」',
      ),
      capacityPerGpuGB: hgx<number>(
        270,
        'GB',
        BU_DATASHEET,
        '第 5 页 Technical Specifications，HGX B300 列「GPU Memory | Bandwidth | 270 GB HBM3E | 7.7 TB/s」',
        SKU_MEMORY_NOTE,
      ),
      bandwidthPerGpuTBs: hgx<number>(
        7.7,
        'TB/s',
        BU_DATASHEET,
        '第 5 页 Technical Specifications，HGX B300 列「270 GB HBM3E | 7.7 TB/s」',
        '⚠️ 芯片博客与 RA 的口径是 8 TB/s（芯片上限）。',
      ),
      memoryType: hgx<string>(
        'HBM3E',
        null,
        HGX_RA,
        'Components 节 Table 1「Memory per GPU | NVIDIA B300 SXM | 288GB HBM3e」',
        '⚠️ 与 Vera Rubin 的 HBM4 是两代显存。B300 仍是 HBM3E。',
      ),
      perStackCapacityGB: hgxNull(
        'GB',
        BU_BLOG,
        'NVIDIA 未公布单个 HBM3E 堆栈的容量与厂商。按 270 / 8 或 288 / 8 反推会得到非标称值，' +
          '本项目不做这种反推。',
      ),
    },
  },
  {
    id: 'cmp.hgx.connectx-8',
    kind: 'nic',
    name: 'NVIDIA ConnectX-8 SuperNIC（板载，HGX 口径）',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary:
      '焊在 HGX B300 基板上的单端口 800 GbE SuperNIC，与 GPU 1:1 配比；' +
      '双平面部署时把 800 Gb/s 拆成 2×400 Gb/s，两个接口分别接到两张独立的 leaf 交换网。',
    presalesNote:
      '★ 与 GB300 NVL72 的同款网卡对着讲，差别在**装在哪、怎么配**：' +
      'NVL72 是每个计算托盘 4 张双口 CX-8 装在夹层板上；HGX 是每块基板 8 张单口 CX-8 **焊在 GPU 基板上**' +
      '（官方原话「The NVIDIA ConnectX-8 SuperNIC is integrated onto the NVIDIA HGX B300 baseboard, ' +
      'maintaining a 1:1 GPU-to-NIC ratio」）。1:1 配比两代都一样。' +
      '★ 双平面 vs 单平面是本代最实在的一个成本旋钮：' +
      '双平面把每张卡的 800 Gb/s 拆成 2×400 Gb/s 接到两张独立 fabric，好处是没有单点故障、' +
      '由 ConnectX-8 在硬件层做负载均衡与故障切换；单平面只用 1×400 Gb/s，' +
      '「reduces the total GPU bandwidth by 50%」但省一半交换与光模块。' +
      '官方明说用 OSFP 光模块可以在两者之间平滑迁移——先上单平面、后扩双平面是可行路径。' +
      '★ 还有一条更狠的省钱建议来自官方本身：**纯推理部署可以完全不建计算网**' +
      '（「For the use case of pure inference, a compute network may not be necessary」），' +
      '代价是以后想跑训练要停机改造。这个取舍必须让客户自己拍板。',
    visual: { shape: 'nic-card', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      bandwidthGbs: hgx<number>(
        800,
        'Gb/s',
        HGX_RA,
        'Networking Hardware 节 NVIDIA ConnectX-8 HCA (on baseboard)，「With support for Ethernet networking up to 800 Gb/s (2x400 Gb/s), the NVIDIA ConnectX-8 SuperNIC delivers extremely fast, efficient network connectivity」',
      ),
      gpuToNicRatio: hgx<string>(
        '1:1',
        null,
        HGX_RA,
        'Components 节，「The NVIDIA ConnectX-8 SuperNIC is integrated onto the NVIDIA HGX B300 baseboard, maintaining a 1:1 GPU-to-NIC ratio to ensure optimal bandwidth and direct connectivity for each GPU.」',
      ),
      nicsPerBaseboard: hgxCount(
        8,
        HGX_RA,
        'Components 节 Table 2「Eight NVIDIA® ConnectX-8 SuperNICs per NVIDIA HGX B300 baseboard. Up to 800 Gbps per adapter.」',
        '★ 单位是 **per baseboard**（每块 GPU 基板），不是 per tray——这一代没有托盘。',
      ),
      mountingPlace: hgx<string>(
        '集成在 HGX B300 基板上（非主机 PCIe 插卡）',
        null,
        HGX_RA,
        'Components 节，「This connectivity is provided by 8x ConnectX-8 SuperNICs on the HGX baseboard for the East/West (East/West) networking」' +
          '+「The NVIDIA ConnectX-8 SuperNIC is integrated onto the NVIDIA HGX B300 baseboard」',
      ),
      dualPlaneSplit: hgx<string>(
        '双平面：800 Gb/s 拆成 2×400 Gb/s，两个接口分别连到两张独立 fabric 的不同 leaf',
        null,
        HGX_RA,
        'Networking Physical Topologies 节 Dual Plane Topology，「With each GPU generating 800 Gb/s bandwidth through the NVIDIA ConnectX-8 SuperNICs, dual plane topology involves breaking the interface to 2x400 Gb/s interfaces. Every such interface is then connected to a different leaf switch, and every such leaf switch is part of an independent fabric that scales to 1024 interfaces of 400 Gb/s」',
        '「Tracking of each plane, load balancing, and failure handling is handled by the ConnectX-8 SuperNIC ' +
          'on the hardware level.」——平面故障时带宽线性下降，不掉线。',
      ),
      singlePlaneOption: hgx<string>(
        '单平面：每 GPU 1×400 Gb/s，总 GPU 带宽减半但网络成本更低，可经 OSFP 光模块平滑迁移到双平面',
        null,
        HGX_RA,
        'Networking Physical Topologies 节 Single Plane Topology，「each GPU operates at 400 Gb/s of bandwidth through the NVIDIA ConnectX-8 SuperNIC without breaking the interface ... While this approach reduces the total GPU bandwidth by 50%, it is well-suited for workloads that do not warrant maximum throughput ... The use of OSFP transceiver modules enables seamless migration between single plane and dual plane topologies」',
      ),
      minComputeBandwidthGBs: hgx<number>(
        400,
        'GB/s',
        HGX_RA,
        'Components 节 Compute (Node East/West) Ethernet Networking，「Total Minimum Compute Network Bandwidth | 400 GB/s (8x 400 Gb/s Ethernet NICs)」',
        '每节点口径下限。',
      ),
      recommendedComputeBandwidthGBs: hgx<number>(
        800,
        'GB/s',
        HGX_RA,
        'Components 节，「Total Recommended Compute Network Bandwidth | 800 GB/s (16x 400 Gb/s Ethernet NICs using breakout)」',
        '每节点推荐口径 = 8 张卡 × 2×400 Gb/s breakout = 16 个 400 Gb/s 接口。',
      ),
      offloads: hgx<string>(
        'RDMA / RoCE 加速、GPUDirect 与 GPUDirect Storage、VXLAN/NVGRE 硬件卸载、拥塞控制与遥测路由、IPSec/MACSec 硬件加速',
        null,
        HGX_RA,
        'Components 节 Compute (Node East/West) Ethernet Networking 全节，' +
          '「featuring RDMA and RoCE acceleration, with NVIDIA® GPUDirect® and GPUDirect Storage technologies ... ' +
          'advanced hardware offloads for overlay networks such as VXLAN and NVGRE ... advanced congestion control, ' +
          'telemetry-based routing, and quality of service (QoS) capabilities ... hardware acceleration for cryptographic protocols like IPSec and MACSec」',
      ),
    },
  },
  {
    id: 'cmp.hgx.sn5600',
    kind: 'switch',
    name: 'NVIDIA Spectrum-4 SN5600 以太网交换机',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary:
      '128 端口 400 GbE 的 Spectrum-X 交换机，在这一代 RA 里同型号分饰三层：' +
      '计算网（East/West）的 leaf 与 spine，以及汇聚网（North/South）的 leaf。',
    presalesNote:
      '★ 这一代的网络故事和 NVL72 完全不同，因为**跨 GPU 通信全靠它**：' +
      'NVL72 里 72 张卡的集合通信走机架内 NVLink，交换机只管跨机架；' +
      'HGX 里出了 8 卡就得上以太网，所以 leaf/spine 的设计直接决定多机训练能不能跑。' +
      '官方给的形态是「full non-blocking fat tree」+「rail-optimized」：' +
      '同编号的 rail 接同一台 leaf（32 节点设计点是「4 leaf switches per plane, each supporting ' +
      '2 rails (1+5, 2+6, 3+7, 4+8)」），让同 rail 的 GPU 之间只有一跳。' +
      '⚠️ 官方文档在型号上自相矛盾：Table 5 与 appendix Table 9 写 SN5600（128 端口 400 GbE / Spectrum-4），' +
      'networking-hardware 一节写 SN5610（64 端口 800 Gbps）。' +
      '两者是同一代 Spectrum-4 芯片的不同端口配置（128×400G ≡ 64×800G，总容量一致），' +
      '对客户就说「Spectrum-4，51.2 Tb/s 那一档」最安全，具体型号以订单 BOM 为准。',
    visual: { shape: 'switch-box', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      ports: hgx<number>(
        128,
        '端口',
        HGX_RA,
        'Networking Logical Architecture 节 Table 5「Compute (East/West) Spine-Leaf Fabric | NVIDIA SN5600 128-port 400 GbE switches」',
        '⚠️ networking-hardware 一节写的是「The NVIDIA SN5610 switch offers 64 total ports of 800 Gbps」' +
          '——同一份文档里的两个型号/两种端口配置。128×400G 与 64×800G 的总容量相同。',
      ),
      portSpeedGbs: hgx<number>(
        400,
        'Gb/s',
        HGX_RA,
        'Networking Logical Architecture 节 Table 5「NVIDIA SN5600 128-port 400 GbE switches」',
      ),
      siliconGeneration: hgx<string>(
        'NVIDIA Spectrum-4',
        null,
        HGX_RA,
        'Appendix: Node Configurations 节 Table 9「NVIDIA Spectrum-4 SN5600 Ethernet switch, compute core fabric」',
      ),
      roles: hgx<string>(
        '计算网（East/West）leaf 与 spine；汇聚网（North/South）leaf',
        null,
        HGX_RA,
        'Networking Logical Architecture 节 Table 5，「Compute (East/West) Spine-Leaf Fabric | NVIDIA SN5600 ...」+「Converged (North/South) Spine-Leaf Fabric | NVIDIA SN5600 ...」',
      ),
      topology: hgx<string>(
        '无阻塞 fat-tree / leaf-spine，GPU 侧 rail-optimized',
        null,
        HGX_RA,
        'Networking Physical Topologies 节，「The compute fabric (East/West) is built using switches with NVIDIA Spectrum technology in a full non-blocking fat tree topology ... in a leaf-spine manner, where the GPUs are connected using a rail-optimized network topology through their respective NVIDIA ConnectX-8 SuperNICs」',
      ),
      switchCount32Node: hgx<number>(
        12,
        '台',
        HGX_RA,
        'Appendix: Node Configurations 节 Table 9，32 Server Nodes 列「NVIDIA Spectrum-4 SN5600 Ethernet switch, compute core fabric | 12」（汇聚核心网另有 12 台）',
        '⚠️ 与 Table 6 的「Leaf 8 + Spine 4 = 12」闭合（双平面合计口径）。64 节点为 24 台、128 节点为 48 台。',
      ),
      leafSpineSplit32Node: hgx<string>(
        '32 节点设计点：计算网 8 台 leaf + 4 台 spine（双平面合计），每台 leaf 32 条 400G 上联',
        null,
        HGX_RA,
        'Networking Logical Architecture 节 Table 6，Nodes=32 行「Leaf | 8」「Spine | 4」「Uplinks per leaf to spine @ 400G | 32」+ 表下注「Figures shown are aggregate amounts for both planes.」',
      ),
    },
  },
  {
    id: 'cmp.hgx.rack',
    kind: 'rack',
    name: '标准风冷机架（19 英寸，OEM/客户提供）',
    vendor: 'OEM / 客户机房',
    status: 'shipping',
    summary:
      '普通的风冷数据中心机架——**不是** NVIDIA 定义的机架级产品。装几台 HGX B300 服务器' +
      '由可用机架功率决定，NVIDIA 明确不给这个数字，也不规定机架立面。',
    presalesNote:
      '★ 这一格的教学价值恰恰在于「它没什么可讲的」：' +
      'GB300 NVL72 那一代，机架本身是 NVIDIA 的产品（Oberon / MGX，带铜背板、母排、歧管、142 kW 口径）；' +
      'HGX 这一代，机架退回成**普通家具**——没有背板、没有母排、没有水路，' +
      '就是一个装服务器、走风、接 PDU 的铁架子。' +
      '客户听懂这一句，就理解了「为什么 HGX 能进现有机房，NVL72 要新建」。' +
      '⚠️ 唯一要认真做的功课是配电：官方三处都写「The number of GPU servers per rack depends on ' +
      'available rack power」与「Rack layout must provide power supply redundancy」。' +
      '按 DGX B300 的 ~14 kW/台量级估，30 kW 机架放 2 台、60 kW 放 4 台——' +
      '这条算术必须拿客户机房的真实数字重算一遍。',
    visual: { shape: 'rack-frame', colorToken: null },
    imageUrl: null,
    sourceIds: [HGX_RA, DGX_PAGE],
    specs: {
      rackType: hgx<string>(
        '标准风冷机架（无 NVIDIA 专属机架规格）',
        null,
        HGX_RA,
        'Abstract，「industry-leading performance in an air-cooled form factor」；Overview，' +
          '「Flexible rail-optimized end-of-row network architecture that can accommodate modifications in the rack layout and number of servers per rack.」',
        '★ 与 GB300 NVL72（Oberon 液冷机架）/ LPX（MGX ETL 机架）最大的形态差别：' +
          '这一代 NVIDIA 不卖机架，也不规定机架。' +
          '⚠️ 参照：DGX B300 产品页称其「Compatible with NVIDIA MGX™ and traditional enterprise racks」' +
          '「deployable in NVIDIA MGX racks for the first time」——DGX 可以进 MGX，但那是 DGX 的事。',
      ),
      serversPerRack: hgxNull('台', HGX_RA, SERVERS_PER_RACK_NOTE),
      rackPowerKW: hgxNull(
        'kW',
        HGX_RA,
        '★ NVIDIA 未公布 HGX 部署的机架功率——它是输入不是输出：官方把「每机架几台」写成' +
          '「可用机架功率」的函数，等于把这个数字交还给客户机房。' +
          '⚠️ 量级参照：DGX B300「~14 kW」/台（10U 整机）。',
      ),
      powerRedundancy: hgx<string>(
        '机架布局必须提供供电冗余，否则需改用其它机架布局',
        null,
        HGX_RA,
        'Networking Logical Architecture 节 32/64/128 三个设计点的 Additional Considerations，' +
          '「Rack layout must provide power supply redundancy; otherwise, consider an alternative rack layout」',
      ),
      heightU: hgxNull(
        'U',
        HGX_RA,
        'NVIDIA 未规定机架 U 高与逐 U 布局（这一代机架不是 NVIDIA 的产品）。' +
          '本项目 3D 沿用与前四代相同的 48U 示意占位。',
      ),
      liquidCooling: hgx<boolean>(
        false,
        null,
        HGX_RA,
        'Abstract，「designed to support enterprise AI inference workloads with industry-leading performance in an air-cooled form factor」',
        '整份参考架构里没有 CDU、分液歧管、冷板或进液温度要求——这一代是纯风冷。',
      ),
    },
  },
  {
    id: 'cmp.hgx.rack-pdu',
    kind: 'power',
    name: '机架 PDU（配电插排，A/B 双路）',
    vendor: 'OEM / 客户机房',
    status: 'shipping',
    summary:
      '风冷机架里的交流配电插排。服务器自带电源模块直接从 PDU 取电——' +
      '**没有直流母排、没有机架级电源架**，这两样是 NVL72 液冷机架才有的东西。',
    presalesNote:
      '★ 用「少了什么」来讲最快：GB300 NVL72 机架里有 8 个电源架 + 一条直流母排，' +
      '托盘盲插即取电；HGX 机架里这两样都没有，就是普通的 A/B 双路 PDU + 服务器自带 PSU。' +
      '好处是维护模型和普通服务器完全一样，运维不用学新东西；' +
      '代价是没有机架级的功率调度与削峰能力（那是 NVL72 与 Vera Rubin 那条线在做的事）。' +
      '⚠️ NVIDIA 未给 PDU 的型号、路数与容量，只提了一条硬要求：' +
      '「Rack layout must provide power supply redundancy」。本项目 3D 按 A/B 双路示意。',
    visual: { shape: 'busbar', colorToken: 'plane-power' },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      redundancyRequirement: hgx<string>(
        '机架布局必须提供供电冗余（官方唯一的硬性配电要求）',
        null,
        HGX_RA,
        'Networking Logical Architecture 节 32/64/128 三个设计点的 Additional Considerations，「Rack layout must provide power supply redundancy; otherwise, consider an alternative rack layout」',
      ),
      distributionForm: hgx<string>(
        '交流配电到服务器自带电源（无直流母排、无机架级电源架）',
        null,
        HGX_RA,
        'Components / Networking 全篇——RA 中没有任何 busbar、power shelf 或 PSU shelf 的描述，' +
          '配电只在「rack power / power supply redundancy」层面出现',
        '★ 「官方没写」在这里是**结论**而不是缺口：NVL72 那一代的参考架构把电源架数量与单架功率' +
          '写得很细（8 架 × 6 × 5.5 kW），HGX 这一代整篇没有，因为供电确实退回到了常规服务器形态。',
      ),
      pduCount: hgxNull(
        '路',
        HGX_RA,
        'NVIDIA 未公布机架 PDU 的路数与型号。本项目 3D 按 A/B 双路示意，仅为表达「冗余」这一条官方要求。',
      ),
      pduCapacityKW: hgxNull('kW', HGX_RA, 'NVIDIA 未公布 PDU 容量（整机架功率本身就没给）。'),
      inputVoltage: hgxNull(null, HGX_RA, 'NVIDIA 未规定输入电压/相数——由客户机房与 OEM 整机的电源规格决定。'),
    },
  },
  {
    id: 'cmp.hgx.air-handler',
    kind: 'cooling',
    name: '机房空调 / 送风单元（CRAH，示意）',
    vendor: '客户机房',
    status: 'shipping',
    summary:
      '把热通道回风带走的机房级空调。这一代的整条散热链就是「服务器风扇 → 热通道 → 机房空调」，' +
      '没有冷板、没有 CDU、没有二次侧水路。',
    presalesNote:
      '★ 这个盒子存在的意义是让「风冷」这件事在画面上有个落点——切到 cooling 平面时，' +
      '客户能直接看到 NVL72 那三代（冷板 → 歧管 → CDU → 一次侧水）与这一代（服务器 → 机房空调）' +
      '的链路长度差了多少。' +
      '售前落点只有一句：**现有风冷机房大概率不用改造**。这往往比任何算力数字更能决定项目节奏——' +
      '液冷改造动辄以季度计，风冷方案可以按周排期。' +
      '⚠️ NVIDIA 的 HGX 参考架构**完全没有**机房侧散热设计（只有 Abstract 里「air-cooled form factor」' +
      '一句形态描述），因此本组件的全部规格为 null，数量与形态都是示意。' +
      '客户真正要算的是「每机架 40–60 kW 的风冷散热，你的机房气流组织撑不撑得住」——' +
      '这个问题要交给机电顾问，不是 NVIDIA 文档能回答的。',
    visual: { shape: 'cdu-cabinet', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      coolingMode: hgx<string>(
        '风冷（air-cooled form factor）',
        null,
        HGX_RA,
        'Abstract，「The NVIDIA HGX AI Factory is designed to support enterprise AI inference workloads with industry-leading performance in an air-cooled form factor, AI training and fine-tuning, and high-performance computing (HPC) applications.」',
        '★ 这是整份 RA 里关于散热的**唯一一句话**。没有进风温度、没有风量、没有机房气流设计。',
      ),
      unitCount: hgxNull(
        '台',
        HGX_RA,
        'NVIDIA 未给出机房空调的数量与选型（HGX 参考架构不涉及机房侧机电设计）。3D 里的数量为示意。',
      ),
      coolingCapacityKW: hgxNull(
        'kW',
        HGX_RA,
        'NVIDIA 未给出散热量要求。原因也很直接——整机架功率本身就没公布，散热量自然无从谈起。',
      ),
      supplyAirTempC: hgxNull(
        '°C',
        HGX_RA,
        'NVIDIA 未规定送风温度与温升范围（对照：Vera Rubin 那一代官方明确了 45°C 进液温度）。',
      ),
      airflowDesign: hgxNull(
        null,
        HGX_RA,
        'NVIDIA 未给出冷/热通道封闭、地板下送风还是行级空调等气流组织建议——这属于机房机电设计范畴。',
      ),
    },
  },
  {
    id: 'cmp.hgx.control-plane-node',
    kind: 'tray',
    name: '控制面 / 管理节点',
    vendor: 'OEM（x86）',
    status: 'shipping',
    summary:
      '运行 Base Command Manager / Slurm / Kubernetes 控制面的管理服务器。' +
      'RA 支持最多 8 台，给出的示例配置是 7 台（2 台 BCM 高可用 + 2 台 Slurm head + 3 台 K8s 控制面）。',
    presalesNote:
      '★ 报价单里最常被漏掉的一项。RA 说得很具体：' +
      '「a configuration using NVIDIA Base Command Manager, Slurm, and Kubernetes together can include ' +
      'seven control plane nodes in total: two for Base Command Manager (with high availability configured), ' +
      'two for Slurm head nodes, and three for Kubernetes control plane nodes」——' +
      '这 7 台是实打实要买的机器，还得配 BlueField-3 与 4 TB 本地盘。' +
      '★ 另一条容易忽略的官方建议：「In cases where the existing control plane nodes are missing, ' +
      'the Enterprise RA recommends deploying one set per cluster. Configure these nodes for high ' +
      'availability」——客户如果说「我们已经有管理集群了」，要确认它是不是高可用配置。' +
      '⚠️ 与 GB300 NVL72 参考架构的 12 台不同（那一代是 12 台且 x86/Grace 两种都行），' +
      '这一代是 7 台示例 / 8 台上限、纯 x86。数字讲错会被懂行的客户抓住。',
    visual: { shape: 'tray-slab', colorToken: 'plane-mgmt' },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      maxNodes: hgxCount(
        8,
        HGX_RA,
        'Components 节 Control Plane/Management Nodes，「The cluster design specified in this Enterprise RA can support up to eight control plane nodes.」',
      ),
      exampleNodeCount: hgxCount(
        7,
        HGX_RA,
        'Components 节 Control Plane/Management Nodes，「a configuration using NVIDIA Base Command Manager, Slurm, and Kubernetes together can include seven control plane nodes in total: two for Base Command Manager (with high availability configured), two for Slurm head nodes, and three for Kubernetes control plane nodes. This uses seven of the eight available control plane nodes possible.」',
      ),
      cpu: hgx<string>(
        '2 × 32 核 Intel Xeon Gold 6448Y 或同级 / 32 核 AMD EPYC 9354',
        null,
        HGX_RA,
        'Components 节 Table 3: Control plane node components，「CPU | 2 | 32C Intel Xeon Gold 6448Y or equivalent / 32C AMD EPYC 9354」',
      ),
      dpu: hgx<string>(
        '1 × BlueField-3 B3220（双 200G 口 + 1 Gb RJ45 管理口）',
        null,
        HGX_RA,
        'Components 节 Table 3，「North/South (DPU) | 1 | NVIDIA BlueField-3 B3220 DPU with two 200G ports and 1Gb RJ45 management port. Other variants can be supported as per Compute Node alternatives - Table 4」',
        '⚠️ 注意与计算节点不同：计算节点用 B3240（双 400G），管理节点用 B3220（双 200G）。',
      ),
      systemMemoryGB: hgx<number>(
        256,
        'GB',
        HGX_RA,
        'Components 节 Table 3，「System Memory | – | Minimum of 256 GB DDR5」',
        '下限口径。',
      ),
      bootDriveTB: hgx<number>(
        1,
        'TB',
        HGX_RA,
        'Components 节 Table 3，「Boot Drive | 1 | 1 TB NVMe SSD」',
      ),
      localStorageTB: hgx<number>(
        4,
        'TB',
        HGX_RA,
        'Components 节 Table 3，「Local storage | 1 | 4 TB NVMe SSD. More may be required if image storage is required」',
      ),
      networkPortSpeedGbE: hgx<number>(
        200,
        'GbE',
        HGX_RA,
        'Networking Logical Architecture 节 Spine-Leaf Networking，「each management node is connected with two 200 GbE ports to two separate switches to provide redundancy and high storage throughput」',
        '对照：计算节点是双 400 GbE。',
      ),
    },
  },
  {
    id: 'cmp.hgx.boot-nvme',
    kind: 'storage',
    name: '本地 NVMe 启动盘（1 TB）',
    vendor: 'OEM',
    status: 'shipping',
    summary: '每台服务器 1 块 1 TB NVMe 启动盘，与数据盘分开。',
    presalesNote:
      '小项，但 RA 把它单列出来是有道理的：启动盘与数据盘混用在批量部署/重装镜像时会很难受。' +
      '配置单上确认它是独立的一块，别被 OEM 用「总容量 X TB」糊过去。',
    visual: { shape: 'ssd-stick', colorToken: null },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      capacityTB: hgx<number>(
        1,
        'TB',
        HGX_RA,
        'Components 节 Table 2「Local storage | ... • 1 TB NVMe boot drive」（appendix Table 8「Storage | 3 | ... 1×1 TB NVMe boot drive」）',
      ),
      countPerServer: hgxCount(
        1,
        HGX_RA,
        'Components 节 Table 2「• 1 TB NVMe boot drive」',
      ),
      formFactor: hgxNull(
        null,
        HGX_RA,
        'NVIDIA 未规定启动盘的形态（M.2 / E1.S / U.2）与接口代际——由 OEM 整机设计决定。',
      ),
    },
  },
  {
    id: 'cmp.hgx.local-nvme',
    kind: 'storage',
    name: '本地 NVMe 数据盘（按 CPU 插槽配）',
    vendor: 'OEM',
    status: 'shipping',
    summary:
      '按 CPU 插槽配置的本地 NVMe：推理 ≥1 TB/插槽、训练/深度学习 ≥2 TB/插槽、HPC ≥1 TB/插槽。' +
      '2 插槽机器因此至少 2 块。',
    presalesNote:
      '★ 这一项是「买来干什么」直接决定容量的少数几项之一，值得在需求澄清阶段就问清：' +
      '客户如果说「先做推理，以后可能训练」，那就按训练档（2 TB/插槽）配，' +
      '事后加盘意味着停机。' +
      '★ 另一条与本代强相关的官方提示（在 BF-3 选型那一段）：' +
      '「For HGX B300 deployments, it can be helpful to consider future workloads such as distributed ' +
      'inference that may use KV cache offloads to highspeed, network attached storage. In these cases, ' +
      'having higher burst I/O capacity per GPU can be advantageous」——' +
      'KV cache 往网络存储卸载是这一代明确点名的未来负载，本地盘与 DPU 侧的突发 I/O 都要留余量。',
    visual: { shape: 'ssd-stick', colorToken: null },
    imageUrl: null,
    sourceIds: [HGX_RA],
    specs: {
      inferenceCapacityPerSocketTB: hgx<number>(
        1,
        'TB',
        HGX_RA,
        'Components 节 Table 2「Local storage | • Inference Servers: Minimum 1 TB NVMe drive per CPU socket」',
      ),
      trainingCapacityPerSocketTB: hgx<number>(
        2,
        'TB',
        HGX_RA,
        'Components 节 Table 2「• Training / DL Servers: Minimum 2 TB NVMe drive per CPU socket」',
      ),
      hpcCapacityPerSocketTB: hgx<number>(
        1,
        'TB',
        HGX_RA,
        'Components 节 Table 2「• HPC Servers: Minimum 1 TB NVMe drive per CPU socket」',
      ),
      kvCacheOffloadNote: hgx<string>(
        '官方点名的未来负载：分布式推理把 KV cache 卸载到高速网络存储，需要更高的每 GPU 突发 I/O 能力',
        null,
        HGX_RA,
        'Components 节 Converged (Node North/South) Ethernet Networking 的 Note，「For HGX B300 deployments, it can be helpful to consider future workloads such as distributed inference that may use KV cache offloads to highspeed, network attached storage. In these cases, having higher burst I/O capacity per GPU can be advantageous, even if the average bandwidth needs for typical training workloads are not very high.」',
        '这条 Note 出现的位置是「为什么推荐 B3240 而不是 B3220」——官方用它来论证 DPU 要选 400G 那档。',
      ),
      driveCountPerServer: hgxNull(
        '块',
        HGX_RA,
        'NVIDIA 按「每 CPU 插槽」给容量下限，没有直接给盘数。2 插槽 ⇒ 本项目 3D 按 2 块数据盘示意；' +
          'appendix Table 8 的「Storage | 3」是「2 块数据盘 + 1 块启动盘」的合计口径。',
      ),
    },
  },
]

// ─────────────────────────── 装配树 ───────────────────────────

const RACK_U_PLACEHOLDER =
  '机架内 U 位为 3D 摆位示意占位：NVIDIA 未规定 HGX 部署的机架立面（这一代机架不是 NVIDIA 的产品）。'

export const HGX_B300_ASSEMBLIES: AssemblyNode[] = [
  // ── cluster 层 ──
  {
    id: 'asm.hgx.facility',
    systemId: SYSTEM_ID,
    parentId: null,
    componentId: 'cmp.shared.facility-room',
    roleKey: 'facility',
    label: '机房',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '装配树根节点。★ 与前三代的机房相比，这里**没有** CDU、没有一次侧水路——这一代是风冷。',
  },
  {
    // 与前四代同构：机房配电必须有一个真实存在的盒子，供电连接才不会从装配树根
    //（从不渲染）长出来。见 content.test.ts 的「各代…机房配电」用例。
    id: 'asm.hgx.facility-power',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.shared.facility-power',
    roleKey: 'facility-power',
    label: '机房配电（列头柜）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: 'NVIDIA 未公布 HGX 部署的机房侧配电要求（连整机架功率都刻意不给），数量与形态为示意。',
  },
  {
    id: 'asm.hgx.air-handler',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.hgx.air-handler',
    roleKey: 'room-air-handler',
    label: '机房空调（CRAH）',
    count: 2,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '★ 这一代 cooling 平面的唯一终点。官方只有 Abstract 里「air-cooled form factor」一句形态描述，' +
      '没有任何机房侧散热设计，因此数量与形态均为示意。' +
      '把它与前三代的 CDU/一次侧水路放在同一格看，就是「风冷 vs 液冷」最直白的对照。',
  },
  {
    id: 'asm.hgx.storage',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.shared.storage-array',
    roleKey: 'external-storage',
    label: '外部存储集群',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '经汇聚网接入。官方给的目标值是「minimum 12.5Gb bandwidth per GPU」的存储侧连接' +
      '与「up to 40 GB/s per node」的节点侧吞吐；具体阵列选型由客户方案决定。',
  },
  {
    id: 'asm.hgx.scaleout-spine',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.hgx.sn5600',
    roleKey: 'scaleout-spine',
    label: '计算网 Spine（SN5600）',
    count: 4,
    countClaim: hgxCount(
      4,
      HGX_RA,
      'Networking Logical Architecture 节 Table 6，Nodes=32 行「Spine | 4」（表下注：「Figures shown are aggregate amounts for both planes.」）',
      '32 节点设计点的双平面合计台数。64 节点为 8 台、128 节点为 16 台。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note: '★ 这一代 spine/leaf 承担的是**跨服务器的全部 GPU 通信**，不像 NVL72 那样只管跨机架。',
  },
  {
    id: 'asm.hgx.scaleout-leaf',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.hgx.sn5600',
    roleKey: 'scaleout-leaf',
    label: '计算网 Leaf（SN5600，rail-optimized）',
    count: 8,
    countClaim: hgxCount(
      8,
      HGX_RA,
      'Networking Logical Architecture 节 Table 6，Nodes=32 行「Leaf | 8」（双平面合计；同节 32 节点设计点正文：「4 leaf switches per plane, each supporting 2 rails (1+5, 2+6, 3+7, 4+8)」）',
      '每平面 4 台、每台承载 2 条 rail。64 节点为 16 台、128 节点为 32 台。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note:
      'rail-optimized：同编号的 SuperNIC 接到同一台 leaf，同 rail 的 GPU 之间只有一跳。' +
      '这是 HGX 集群里能做的最强的「拓扑亲和」——但仍然比机架内 NVLink 慢一个数量级。',
  },
  {
    id: 'asm.hgx.converged-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.hgx.sn5600',
    roleKey: 'converged-switch',
    label: '汇聚交换层（业务 + 存储 + 带内管理）',
    count: 2,
    countClaim: hgxCount(
      2,
      HGX_RA,
      'Networking Logical Architecture 节 Table 7，Nodes=32 行「Leaf | 2」「Spine | N/A」（同节正文：「Cost-efficient converged two-switch fabric for CPU (North/South) Network」）',
      '32 节点设计点用两台交换机做汇聚网，不设 spine 层；64 节点起才有 spine（4 leaf + 2 spine）。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note:
      '存储、客户业务与带内管理共用这一张网（官方靠 VLAN 做逻辑隔离），' +
      '与计算网物理分离——「independent of the compute fabric to maximize both storage and application performance」。',
  },
  {
    id: 'asm.hgx.oob-fabric-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'oob-mgmt-switch',
    label: '带外管理交换机（SN2201）',
    count: 4,
    countClaim: hgxCount(
      4,
      HGX_RA,
      'Networking Logical Architecture 节 32 Nodes 设计点 Management，「SN2201 switch for every 2 SUs (4 switches total)」（appendix Table 9 同值：「SN2201 leaf switches for OOB management fabric | 4」）',
      '64 节点起改为每 SU 一台（8 台 / 32 台）。每台经 2 × 100G 上联核心。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note:
      '★ 与前四代不同：这一代**没有机架内管理交换机**这一层。' +
      'RA 只描述了「SN2201 汇聚全部 BMC/OOB 1 Gb 端口，再经 25/100 Gbps spine 层扩展」，' +
      '没有把它放进机架。「未收录」在这里是如实反映来源，不是遗漏。',
  },
  {
    id: 'asm.hgx.control-plane-node',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.hgx.control-plane-node',
    roleKey: 'control-plane-node',
    label: '控制面管理节点',
    count: 7,
    countClaim: hgxCount(
      7,
      HGX_RA,
      'Components 节 Control Plane/Management Nodes，「a configuration using NVIDIA Base Command Manager, Slurm, and Kubernetes together can include seven control plane nodes in total ... This uses seven of the eight available control plane nodes possible.」',
      '官方示例配置：2 台 BCM（高可用）+ 2 台 Slurm head + 3 台 K8s 控制面。上限是 8 台。' +
        '⚠️ 与 GB300 NVL72 参考架构的 12 台不是同一个数字。',
    ),
    lodLevel: 'cluster',
    rackU: null,
    note: '报价单必须单列的一项：7 台 x86 服务器，各配 1 张 BlueField-3 B3220 与 4 TB 本地盘。',
  },
  {
    id: 'asm.hgx.row',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.facility',
    componentId: 'cmp.shared.rack-row',
    roleKey: 'rack-row',
    label: '机架列',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: 'RA 的网络形态是「end-of-row」（列尾交换），因此机架列是这一代真实存在的组织单位。',
  },
  {
    id: 'asm.hgx.rack',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.row',
    componentId: 'cmp.hgx.rack',
    roleKey: 'rack',
    label: '风冷机架（示意：1 机架 = 1 SU = 4 台）',
    count: 8,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      `★ 这里的 8 是**示意**，没有官方 countClaim。${RACK_AS_SU_NOTE}` +
      '★ 与 GB300 NVL72 的 8 机架看起来一样、含义完全不同：那一代「1 机架 = 1 SU = 1 台机器」，' +
      '这一代「1 SU = 4 台独立机器」，机架只是把它们摞在一起。',
  },

  // ── rack 层 ──
  {
    id: 'asm.hgx.rack-pdu',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.rack',
    componentId: 'cmp.hgx.rack-pdu',
    roleKey: 'rack-pdu',
    label: '机架 PDU（A/B 双路）',
    count: 2,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note:
      '竖直贯穿机架背部两侧，不占用 U 位。★ 数量为示意——NVIDIA 只给了一条硬要求' +
      '「Rack layout must provide power supply redundancy」，没有给 PDU 型号、路数与容量。' +
      '★ 与 NVL72 三代的对照：那边是「电源架 + 直流母排」，这边是「PDU + 服务器自带 PSU」。',
  },
  {
    id: 'asm.hgx.gpu-server',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.rack',
    componentId: 'cmp.hgx.server',
    roleKey: 'gpu-server',
    label: 'HGX B300 服务器（2-8-9-800 节点）',
    count: 4,
    countClaim: null,
    lodLevel: 'rack',
    rackU: { start: 3, height: 40 },
    note:
      `★ count = 4 是**示意**，没有官方 countClaim。${RACK_AS_SU_NOTE}` +
      `U 位跨度 40U（4 台 × 10U）中的 10U/台同样是示意，取自 DGX B300 产品页的官方「Rack Units | 10U」` +
      `作数量级参照——HGX 服务器的机箱高度由 OEM 决定，RA 里没有。${RACK_U_PLACEHOLDER}`,
  },

  // ── server（tray）层 ──
  {
    id: 'asm.hgx.baseboard',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.gpu-server',
    componentId: 'cmp.hgx.baseboard',
    roleKey: 'hgx-baseboard',
    label: 'HGX B300 基板',
    count: 1,
    countClaim: hgxCount(
      1,
      HGX_RA,
      'Components 节 Table 2「GPU configuration | Eight NVIDIA B300 GPUs on an HGX B300 baseboard with up to 2304 GB of GPU memory」（单数 baseboard）',
      '每台服务器 1 块基板。',
    ),
    lodLevel: 'tray',
    rackU: null,
    note:
      '★★ 「HGX 到底是什么」的答案就是这一层：NVIDIA 卖给 OEM 的是这块板，' +
      '8 颗 GPU、板载 NVSwitch、8 张 ConnectX-8 都焊在上面。' +
      '下钻到这里再往下一层，就能看到 NVLink 域的**全部**成员——一共 8 张卡，没有第 9 张。',
  },
  {
    id: 'asm.hgx.host-cpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.gpu-server',
    componentId: 'cmp.hgx.host-cpu',
    roleKey: 'host-cpu',
    label: '主机 CPU（x86 × 2）',
    count: 2,
    countClaim: hgxCount(
      2,
      HGX_RA,
      'Abstract，「a 2-8-9-800 infrastructure configuration (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU)」（appendix Table 8「CPUs | 2」）',
      '⚠️ RA components.html Table 2 的「CPU sockets」一行内容被误填成 NVLink 的值，因此改引 Abstract 与 appendix。',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '★ 注意它挂在**服务器**下、不在 HGX 基板上——CPU 是 OEM 主机板的一部分，' +
      '与基板之间是 PCIe Gen5 ×16（不是 NVLink-C2C）。这与 GB300 NVL72 的 Grace 超级芯片是两种拓扑。',
  },
  {
    id: 'asm.hgx.bf3-dpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.gpu-server',
    componentId: 'cmp.gb300.bluefield-3',
    roleKey: 'north-south-dpu',
    label: 'BlueField-3 B3240 DPU',
    count: 1,
    countClaim: hgxCount(
      1,
      HGX_RA,
      'Components 节 Table 2「DPU (North/South) | One NVIDIA® BlueField®-3 DPU per server」（Table 5：「One NVIDIA BlueField-3 B3240 dual port 400 GbE DPU」）',
      '⚠️ DGX B300 是 2 张 BF-3，HGX 参考架构是 1 张。',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '★ 与 GB300 NVL72 复用**同一个组件定义**（cmp.gb300.bluefield-3，同为 B3240 双 400G），' +
      '因此在跨代比较里这一行会判为「无变化」——这是本代与 GB300 之间少数几个真正没变的部件之一。' +
      '⚠️ 官方在这一代特意加了一条选型提示：推荐用 B3240 而不是 HGX H100/H200/B200 上常见的 B3220，' +
      '理由是要为「KV cache 卸载到网络存储」这类分布式推理负载留出突发 I/O 余量。',
  },
  {
    id: 'asm.hgx.boot-nvme',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.gpu-server',
    componentId: 'cmp.hgx.boot-nvme',
    roleKey: 'os-storage',
    label: '本地启动盘（1 TB NVMe）',
    count: 1,
    countClaim: hgxCount(
      1,
      HGX_RA,
      'Components 节 Table 2「Local storage | ... • 1 TB NVMe boot drive」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '与数据盘分开的独立启动盘（官方单列了这一项）。形态（M.2 / E1.S / U.2）由 OEM 决定。',
  },
  {
    id: 'asm.hgx.local-nvme',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.gpu-server',
    componentId: 'cmp.hgx.local-nvme',
    roleKey: 'cache-storage',
    label: '本地数据盘（NVMe，按插槽配）',
    count: 2,
    countClaim: null,
    lodLevel: 'board',
    rackU: null,
    note:
      '★ 数量为示意：RA 按「每 CPU 插槽」给容量下限（推理 ≥1 TB、训练 ≥2 TB），没有直接给盘数；' +
      '2 插槽 ⇒ 本项目按 2 块画。appendix Table 8 的「Storage | 3」是「2 数据盘 + 1 启动盘」的合计。',
  },

  // ── board 层（HGX 基板上） ──
  {
    id: 'asm.hgx.b300-gpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.baseboard',
    componentId: 'cmp.hgx.b300-sxm',
    roleKey: 'accelerator',
    label: 'B300 SXM（Blackwell Ultra）',
    count: 8,
    countClaim: hgxCount(
      8,
      HGX_RA,
      'Components 节，「HGX B300 is a unified platform consisting of 8 Blackwell GPUs internally connected by NVLink」（Table 2「Eight NVIDIA B300 GPUs on an HGX B300 baseboard」）',
      '★ 这 8 张就是整个 NVLink 域的全部成员。',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '★ roleKey 沿用「accelerator」，因此在跨代比较里它与 GB300 的 B300、Rubin GPU、LPX 的 LP30 同行对照。' +
      '与 GB300 那一行的对比尤其值得看：**同一颗芯片，两个平台的官方规格不同**' +
      '（270 vs 279 GB、7.7 vs 8 TB/s、FP4 稠密 14 vs 15 PFLOPS、TDP 1,100 vs 1,400 W）。',
  },
  {
    id: 'asm.hgx.hbm',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.b300-gpu',
    componentId: 'cmp.hgx.hbm3e',
    roleKey: 'gpu-hbm',
    label: 'HBM3E 堆栈（8 × 12-Hi）',
    count: 8,
    countClaim: hgxCount(
      8,
      BU_BLOG,
      'Memory 节 High bandwidth memory features，「HBM configuration: Eight 12-Hi stacks, 16 × 512-bit controllers (8,192-bit total width)」',
      '★ 与前四代不同：这一代的 8 是**官方数字**，不是视觉示意。',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '封装内 8 个 12-Hi HBM3E 堆栈，总位宽 8,192 bit。HGX B300 SKU 口径为每卡 270 GB / 7.7 TB/s。',
  },
  {
    id: 'asm.hgx.nvswitch',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.baseboard',
    componentId: 'cmp.hgx.nvswitch5',
    roleKey: 'nvswitch-asic',
    label: 'NVSwitch ASIC（第五代，板载）',
    count: 2,
    countClaim: null,
    lodLevel: 'board',
    rackU: null,
    note:
      '★★ 复用 roleKey「nvswitch-asic」是刻意的：跨代比较表里它会与 GB300 NVL72 的 NVSwitch 排在同一行，' +
      '一眼读出「同名角色，位置从**机架级交换托盘**搬进了**服务器基板**」——这正是本代际要教的东西。' +
      '⚠️ count = 2 是**示意**，没有官方 countClaim：RA 只说「a combination of fifth-generation NVSwitch ' +
      'and fifth-generation NVLink」，数据手册用单数「via NVSwitch chip」，都没给数量。' +
      'DGX B300 产品页写「NVLink Switch System | 2x」，本项目据此按 2 颗画，但那是 DGX 整机口径，' +
      '不作为 HGX 基板的官方规格登记。',
  },
  {
    id: 'asm.hgx.cx8-nic',
    systemId: SYSTEM_ID,
    parentId: 'asm.hgx.baseboard',
    componentId: 'cmp.hgx.connectx-8',
    roleKey: 'scaleout-nic',
    label: 'ConnectX-8 SuperNIC（板载 × 8）',
    count: 8,
    countClaim: hgxCount(
      8,
      HGX_RA,
      'Components 节 Table 2「Network Adapters/NICs speed (East/West) | Eight NVIDIA® ConnectX-8 SuperNICs per NVIDIA HGX B300 baseboard. Up to 800 Gbps per adapter.」',
      '1:1 GPU:NIC。★ 单位是 per **baseboard**——网卡焊在 GPU 基板上，不是主机插卡。',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '★ 挂在基板下（不是服务器下）是刻意建模：官方原话「The NVIDIA ConnectX-8 SuperNIC is integrated ' +
      'onto the NVIDIA HGX B300 baseboard」。与 GB300 NVL72 把 CX-8 装在计算托盘的夹层板上是两种做法，' +
      '因此这一代**没有** nic-mezzanine 这一层。',
  },
]

// ─────────────────────────── 连接 ───────────────────────────

export const HGX_B300_CONNECTIONS: Connection[] = [
  // ── nvlink 平面（★ 全部两端都在服务器内部：rack / cluster 深度下一条都画不出来） ──
  //
  // 这不是建模疏漏，是这一代的定义特征。`lib/routing.ts` 会把「两端收缩到同一个可见盒子」
  // 的连接判为退化边丢弃：rack 深度下 board 级节点全部上浮到 asm.hgx.gpu-server，
  // 于是下面三条边的两端都变成同一个服务器盒子 ⇒ 全部退化 ⇒ 机架级 nvlink 平面为空。
  {
    id: 'con.hgx.gpu-nvswitch',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.b300-gpu',
    toAssemblyId: 'asm.hgx.nvswitch',
    plane: 'nvlink',
    topology: 'all-to-all',
    medium: 'pcb-trace',
    protocol: 'NVLink 第五代',
    bandwidth: hgx<number>(
      1800,
      'GB/s',
      HGX_RA,
      'Components 节 Table 2「NVIDIA® NVLink™ and NVSwitch™ | ... • GPU-to-GPU Bandwidth 1800GB/s」' +
        '（数据手册第 3 页：「1,800 GBps NVLink between GPUs via NVSwitch™ chip」）',
    ),
    direction: 'bidirectional',
    label: 'B300 ↔ 板载 NVSwitch（8 卡全互联）',
    summary:
      '★★ 这一条边就是整个 HGX 代际的主题：8 张 B300 经**基板上的** NVSwitch 两两全互联，' +
      '聚合 14.4 TB/s、每卡 1.8 TB/s。' +
      '注意介质是 **pcb-trace**——不是 GB300 那样的机架铜背板，就是基板上的走线；' +
      '因为域根本没有离开这块板。第 9 张 GPU 开始，通信必须换成 800 Gb/s 以太网。',
    sourceIds: [HGX_RA, BU_DATASHEET],
  },
  {
    id: 'con.hgx.nvswitch-baseboard',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.nvswitch',
    toAssemblyId: 'asm.hgx.baseboard',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'pcb-trace',
    protocol: 'NVLink 第五代（基板内互连）',
    bandwidth: hgx<number>(
      14.4,
      'TB/s',
      HGX_RA,
      'Components 节 Table 2「• Total Aggregate Bandwidth 14.4TB/s」（HGX 产品页「Total NVLink Bandwidth | 14.4 TB/s」）',
    ),
    direction: 'bidirectional',
    label: 'NVSwitch → HGX 基板（域的物理边界）',
    summary:
      'NVSwitch 的全部链路都落在这块基板的 PCB 走线上，聚合 14.4 TB/s。' +
      '★ 与 GB300 NVL72 的「NVSwitch → 铜背板」对照着看：那一代链路落到**机架**背板上，' +
      '于是域是 72 卡；这一代落在**基板**上，于是域是 8 卡。' +
      '同一个动作，落点差一层，整台机器的定位就完全不同了。',
    sourceIds: [HGX_RA, HGX_PAGE],
  },
  {
    id: 'con.hgx.cpu-gpu-pcie',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.host-cpu',
    toAssemblyId: 'asm.hgx.baseboard',
    plane: 'nvlink',
    topology: 'star',
    medium: 'pcb-trace',
    protocol: 'PCIe Gen5 ×16（8 条）+ Gen4 ×2（1 条）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '主机 CPU ↔ HGX 基板（PCIe，不是 C2C）',
    summary:
      '★ 本代最容易被 NVL72 话术带偏的一处：主机与 GPU 之间只有 **PCIe**，没有 NVLink-C2C。' +
      '官方原话「Eight Gen5 x16 links and one Gen4 x2 link per NVIDIA HGX B300 baseboard」。' +
      '因此这一代**没有**「CPU 内存对 GPU 一致寻址」这回事——' +
      'GB300 NVL72 的「37 TB 快内存」是 Grace + C2C 的产物，别搬到 HGX 上讲。' +
      '⚠️ RA 未给 PCIe 链路的聚合带宽数值，故 bandwidth 为 null。',
    sourceIds: [HGX_RA],
  },

  // ── scaleout 平面（East/West 计算网：这一代跨 GPU 通信的唯一出路） ──
  {
    id: 'con.hgx.cpu-cx8-pcie',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.host-cpu',
    toAssemblyId: 'asm.hgx.cx8-nic',
    plane: 'scaleout',
    topology: 'star',
    medium: 'pcb-trace',
    protocol: 'PCIe Gen5 ×16（每张 SuperNIC 一条）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '主机 CPU ↔ ConnectX-8（PCIe 均衡拓扑）',
    summary:
      '每张 SuperNIC 各占一条 PCIe Gen5 ×16。官方对这条链路有一条硬要求：' +
      '「Balanced PCIe topology with connectivity spread evenly across CPU sockets and PCIe root ports」' +
      '——8 张 GPU + 8 张网卡 + 1 张 DPU 若全挂在同一插槽下，GPUDirect RDMA 要跨插槽绕行，' +
      '实测吞吐会明显低于标称。配置单审核必查。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.cx8-leaf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.cx8-nic',
    toAssemblyId: 'asm.hgx.scaleout-leaf',
    plane: 'scaleout',
    topology: 'rail-optimized',
    medium: 'optical-fiber',
    protocol: 'Spectrum-X 以太网 / RoCE（800 Gb/s，双平面拆 2×400 Gb/s）',
    bandwidth: hgx<number>(
      800,
      'Gb/s',
      HGX_RA,
      'Components 节，「externally connected by a network interface of 800 Gb/s (2 x 400Gb/s Ethernet) per GPU」' +
        '（Networking Physical Topologies 节 Dual Plane Topology：「dual plane topology involves breaking the interface to 2x400 Gb/s interfaces. Every such interface is then connected to a different leaf switch」）',
      '每 GPU 口径。双平面下两个 400 Gb/s 接口分别落到两张独立 fabric 的不同 leaf。',
    ),
    direction: 'bidirectional',
    label: 'ConnectX-8 → 计算网 Leaf（rail-optimized）',
    summary:
      '★★ 这条线是 HGX 代际的另一半主题：**出了服务器，GPU 之间就只能走它**。' +
      '每 GPU 800 Gb/s，同编号 rail 接同一台 leaf（32 节点设计点：每平面 4 台 leaf、' +
      '每台承载 2 条 rail「1+5, 2+6, 3+7, 4+8」）。' +
      '与机架内 NVLink 的 1.8 TB/s 相比是 1/18 的带宽——' +
      '「并行策略能不能塞进 8 卡」因此成了这一代方案设计的第一问题。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.leaf-spine',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.scaleout-leaf',
    toAssemblyId: 'asm.hgx.scaleout-spine',
    plane: 'scaleout',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: 'Spectrum-X 以太网（400 Gb/s 上联）',
    bandwidth: hgx<number>(
      400,
      'Gb/s',
      HGX_RA,
      'Networking Logical Architecture 节 Table 6，Nodes=32 行「Uplinks per leaf to spine @ 400G | 32」',
      '每台 leaf 32 条 400G 上联 spine（32 节点设计点；64 节点 16 条、128 节点 8 条）。',
    ),
    direction: 'bidirectional',
    label: '计算网 Leaf ↔ Spine（无阻塞 fat-tree）',
    summary:
      '两级 leaf-spine 构成无阻塞 fat-tree。官方推荐双平面：两张完全独立的 fabric 各承担 50% 流量，' +
      '由 ConnectX-8 在硬件层做负载均衡与故障切换，「A failing or degraded plane will carry an impact ' +
      'linearly associated with the dropped bandwidth」——坏一张网只掉带宽，不掉线。',
    sourceIds: [HGX_RA],
  },

  // ── business 平面（North/South：客户业务 + 存储 + 带内管理，与计算网物理分离） ──
  {
    id: 'con.hgx.cpu-bf3-pcie',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.host-cpu',
    toAssemblyId: 'asm.hgx.bf3-dpu',
    plane: 'business',
    topology: 'star',
    medium: 'pcb-trace',
    protocol: 'PCIe Gen5 ×16',
    bandwidth: null,
    direction: 'bidirectional',
    label: '主机 CPU ↔ BlueField-3 DPU',
    summary:
      '「One Gen5 x16 link per DPU, SuperNIC or adapter」。' +
      '⚠️ 配电上有一条容易漏的官方提示：部分 BF-3 的南北向配置功耗超过 75 W，' +
      '除 PCIe 槽供电外还需要额外的 ≥75 W PCIe 供电接口——机箱选型时要确认有这条线。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.bf3-converged',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.bf3-dpu',
    toAssemblyId: 'asm.hgx.converged-switch',
    plane: 'business',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: '以太网 / RoCE（双 400 GbE）',
    bandwidth: hgx<number>(
      400,
      'GbE',
      HGX_RA,
      'Networking Physical Topologies 节 CPU Converged (Node North/South) Network，「Each compute and management node is connected with two 400 GbE ports to two separate switches to provide redundancy and high storage throughput that can reach up to 40 GB/s per node.」',
      '每节点两个 400 GbE 口接到两台不同交换机（冗余），节点侧存储吞吐可达 40 GB/s。',
    ),
    direction: 'bidirectional',
    label: 'BlueField-3 → 汇聚交换层',
    summary:
      '南北向流量（客户业务、存储读写、带内管理）全部经 BF-3 卸载后上汇聚网。' +
      '这张网与计算网**物理分离**——「independent of the compute fabric to maximize both storage and ' +
      'application performance」，避免业务流量抢占东西向带宽。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.converged-storage',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.converged-switch',
    toAssemblyId: 'asm.hgx.storage',
    plane: 'business',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: '以太网 / RoCE 存储 fabric',
    bandwidth: null,
    direction: 'bidirectional',
    label: '汇聚交换层 ↔ 外部存储',
    summary:
      '32 节点设计点给出的存储侧连接是「32x 100G/200G connections for storage (minimum 12.5Gb bandwidth per GPU)」。' +
      '★ 这一代对存储有个特别值得说的前瞻：官方点名「分布式推理把 KV cache 卸载到高速网络存储」' +
      '会是未来负载，建议 DPU 选 400G 的 B3240 而不是 200G 的 B3220，为突发 I/O 留余量。' +
      '⚠️ 具体存储阵列的带宽目标由客户方案决定，RA 只给了每 GPU 的下限。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.converged-control-plane',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.converged-switch',
    toAssemblyId: 'asm.hgx.control-plane-node',
    plane: 'business',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: '以太网（双 200 GbE）',
    bandwidth: hgx<number>(
      200,
      'GbE',
      HGX_RA,
      'Networking Logical Architecture 节 Spine-Leaf Networking，「each management node is connected with two 200 GbE ports to two separate switches to provide redundancy and high storage throughput」',
      '⚠️ 与计算节点的双 400 GbE 不同，管理节点是双 200 GbE。',
    ),
    direction: 'bidirectional',
    label: '汇聚交换层 ↔ 控制面节点',
    summary:
      '控制面节点也挂在汇聚网上——集群部署与镜像分发（RA 称「High performance networking is used here ' +
      'due to requirements such as cluster deployment and imaging」）靠的就是这条路径。',
    sourceIds: [HGX_RA],
  },

  // ── mgmt 平面（带外：全部 BMC / DPU 管理口 / 交换机管理口） ──
  {
    id: 'con.hgx.server-bmc-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.gpu-server',
    toAssemblyId: 'asm.hgx.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet 1 Gb（BMC / Redfish，SMBPBI over SMBus）',
    bandwidth: hgx<number>(
      1,
      'Gb/s',
      HGX_RA,
      'Networking Logical Architecture 节 4-Node SU，「For the Out-of-band Management fabric, 4 servers, each with 6x 1Gb/s connections providing 24x 1Gb/s for management」' +
        '（Out-of-Band (OOB) Management Network 节：「The NVIDIA SN2201 switch is used to connect to the BMC/OOB 1 Gbps ports of these components.」）',
      '每台服务器 6 个 1 Gb 带外口。',
    ),
    direction: 'bidirectional',
    label: '服务器 BMC → 带外管理交换机',
    summary:
      '★ 与前四代的形态差别：这一代**没有机架内管理交换机**，服务器的 BMC 直接进 SN2201 汇聚层。' +
      'RA 只描述了「SN2201 汇聚全部 BMC/OOB 1 Gb 端口，再经 25/100 Gbps spine 层扩展」，' +
      '没有把管理交换机放进机架——「未收录」在这里是如实反映来源。' +
      '带外通道本身是 SMBPBI over SMBus 到 BMC，支持 PLDM T5 与 SPDM。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.bf3-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.bf3-dpu',
    toAssemblyId: 'asm.hgx.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet 1 Gb（DPU 板载 BMC / Redfish）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'BlueField-3 板载 BMC → 带外管理交换机',
    summary:
      'DPU 独立于主机的管理通道。官方原话：「many NVIDIA BlueField products integrate an onboard ' +
      'Baseboard Management Controller (BMC) ... connects to the management network through a dedicated ' +
      '1GbE out-of-band port」，可用 Redfish API 同时管理 DPU 与 HGX 平台。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.switch-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.scaleout-leaf',
    toAssemblyId: 'asm.hgx.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet 1 Gb（交换机管理口）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '交换机管理口 → 带外管理交换机',
    summary:
      '带外网不只连服务器：官方明确它要连「BMC ports of the server nodes / BMC ports of the ' +
      'Bluefield-3 DPU and SuperNICs / OOB management ports of switches」——交换机自己的管理口也在里面。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.control-plane-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.control-plane-node',
    toAssemblyId: 'asm.hgx.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet 1 Gb（BMC RJ45）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '控制面节点 BMC → 带外管理交换机',
    summary: '控制面节点各带 1 个 1 Gb RJ45 管理口（RA Table 3「BMC | 1 | 1 Gb RJ45 management port」）。',
    sourceIds: [HGX_RA],
  },

  // ── power 平面（★ 没有电源架、没有直流母排：PDU → 服务器自带 PSU） ──
  {
    id: 'con.hgx.facility-power-pdu',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.facility-power',
    toAssemblyId: 'asm.hgx.rack-pdu',
    plane: 'power',
    topology: 'bus',
    medium: 'ac-feed',
    protocol: '机房交流配电（A/B 双路）',
    bandwidth: null,
    direction: 'unidirectional',
    label: '机房配电 → 机架 PDU',
    summary:
      '⚠️ NVIDIA 未公布 HGX 部署的整机架功率，而且是刻意不公布：官方把「每机架几台」' +
      '写成「可用机架功率」的函数（「The number of GPU servers per rack depends on available rack power」）。' +
      '官方唯一的硬要求是「Rack layout must provide power supply redundancy」，因此这里画 A/B 双路。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.pdu-server',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.rack-pdu',
    toAssemblyId: 'asm.hgx.gpu-server',
    plane: 'power',
    topology: 'star',
    medium: 'ac-feed',
    protocol: '机架 PDU → 服务器自带电源',
    bandwidth: null,
    direction: 'unidirectional',
    label: '机架 PDU → HGX 服务器',
    summary:
      '★ 与 NVL72 三代最直白的对照：那边是「电源架 → 直流母排 → 托盘盲插取电」，' +
      '这边就是普通服务器的电源线。没有母排、没有电源架、没有机架级功率调度。' +
      '好处是运维模型与普通 x86 服务器完全一致；' +
      '代价是没有 Vera Rubin 那条线在做的机架级削峰与动态功率调度能力。' +
      '⚠️ 单机功率 RA 未给（DGX B300 的 ~14 kW 只能当量级参照）。',
    sourceIds: [HGX_RA, DGX_PAGE],
  },

  // ── cooling 平面（★ 风冷：这是内容包里第一次用 medium: 'airflow'） ──
  {
    id: 'con.hgx.gpu-chassis-air',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.b300-gpu',
    toAssemblyId: 'asm.hgx.gpu-server',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '散热器导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'B300 → 机箱散热器 / 风道',
    summary:
      '★ 这一代**没有冷板**：GPU 的热量经散热器交给机箱风道，再由服务器风扇吹进热通道。' +
      '单卡 TDP 最高可配置到 1,100 W（对照 GB300 NVL72 液冷档位的 1,400 W）——' +
      '那 300 W 的差额就是「风冷能带走多少热」的物理天花板。',
    sourceIds: [HGX_RA, BU_DATASHEET],
  },
  {
    id: 'con.hgx.nvswitch-chassis-air',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.nvswitch',
    toAssemblyId: 'asm.hgx.gpu-server',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '散热器导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: '板载 NVSwitch → 机箱风道',
    summary:
      '板载 NVSwitch 同样走风冷。对照 GB300 NVL72：那一代交换托盘里的 NVSwitch 有专属冷板' +
      '（roleKey nvswitch-cold-plate），这一代整条液冷链路都不存在。',
    sourceIds: [HGX_RA],
  },
  {
    id: 'con.hgx.server-air-handler',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.hgx.gpu-server',
    toAssemblyId: 'asm.hgx.air-handler',
    plane: 'cooling',
    topology: 'bus',
    medium: 'airflow',
    protocol: '热通道回风 → 机房空调',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'HGX 服务器 → 机房空调（热通道回风）',
    summary:
      '★★ 整条散热链就这一段：服务器风扇把热风推进热通道，机房空调收走。' +
      '对照 NVL72 三代的四段链路（冷板 → 分液歧管 → CDU → 机房一次侧水），' +
      '这就是「现有风冷机房不用改造」的物理含义。' +
      '⚠️ 介质 airflow 是 v1.4 为这一代新增的枚举——此前八种介质全是液冷/接触语义。' +
      'NVIDIA 的 HGX 参考架构对机房侧散热只有 Abstract 里「air-cooled form factor」一句话，' +
      '没有送风温度、风量与气流组织要求，因此这一段的形态完全是示意。',
    sourceIds: [HGX_RA],
  },
]

// ─────────────────────────── 导览场景 ───────────────────────────

export const HGX_B300_SCENES: ScenePreset[] = [
  {
    id: 'scene.hgx.server-anatomy',
    systemId: SYSTEM_ID,
    title: 'HGX 到底是什么：打开一台服务器，NVIDIA 卖的是这块基板',
    narration:
      '① 你应该看到什么：机架里抽出一台服务器，机箱前半部躺着一块板——' +
      '8 颗 B300 SXM、板载 NVSwitch、8 张 ConnectX-8 全焊在上面；' +
      '机箱后半部才是 OEM 的地盘：2 颗 x86 主机 CPU、1 张 BlueField-3、本地 NVMe。' +
      '**那块板就是 HGX**——NVIDIA 卖给戴尔/HPE/超微的是它，不是整机。' +
      '② 谁连谁 + 关键数字：8 张卡经板载第五代 NVSwitch 两两全互联，聚合 14.4 TB/s、每卡 1.8 TB/s；' +
      '每张卡 270 GB HBM3E / 7.7 TB/s（HGX SKU 口径）、稠密 FP4 14 PFLOPS、TDP 最高可配 1,100 W；' +
      '8 张 ConnectX-8 与 GPU 1:1，每 GPU 800 Gb/s 出网；' +
      '主机 CPU 与基板之间是 **8 条 PCIe Gen5 ×16**——注意，**不是** NVLink-C2C。' +
      '整台机器的口诀是 **2-8-9-800**：2 CPU、8 GPU、9 网卡（8 张 CX-8 + 1 张 BF-3）、每 GPU 800 Gb/s。' +
      '③ 断了会怎样：板载 NVSwitch 是这 8 张卡成为「一台机器」的唯一原因。' +
      '它一停，8 张卡就退化成 8 张各自为战的 PCIe 卡——' +
      '而且**没有备份路径**，因为机架里没有第二级 NVLink 交换。',
    lodLevel: 'board',
    focusAssemblyId: 'asm.hgx.baseboard',
    planes: ['nvlink', 'scaleout'],
    highlightAssemblyIds: [
      'asm.hgx.baseboard',
      'asm.hgx.b300-gpu',
      'asm.hgx.nvswitch',
      'asm.hgx.cx8-nic',
    ],
    presalesNote:
      '★ 开场先把 HGX / DGX 这个混淆点解决掉，后面才讲得下去：' +
      '**HGX = NVIDIA 卖基板，OEM 出整机（NVIDIA-Certified System）；DGX = NVIDIA 自己出整机**' +
      '（DGX B300 固定 10U、Intel Xeon 6776P、2 张 BF-3、~14 kW）。' +
      '客户说「我要买 HGX」时，先问是要基板方案（多 OEM 比价、按自己标准堆规模）' +
      '还是整机方案（开箱即用、单一责任方）。' +
      '★ 第二句必须说的是 CPU：这一代是 **x86 + PCIe**，不是 Grace + C2C。' +
      'RA 只给下限（2 插槽 × ≥48 核、推荐 56 核、≥2 TB 内存、≥500 GB/s 带宽、balanced PCIe topology），' +
      '型号由 OEM 定——这既是比价空间，也是最容易配歪的地方。',
  },
  {
    id: 'scene.hgx.rack-no-nvlink',
    systemId: SYSTEM_ID,
    title: '机架里没有 NVLink：切到这个平面，一条线都没有',
    narration:
      '① 你应该看到什么：一个普通的风冷机架，里面 4 台 HGX B300 服务器摞在一起，' +
      '背部两侧是 A/B 双路 PDU。**没有铜背板、没有直流母排、没有分液歧管、没有交换托盘**。' +
      '② 现在做一件事：把平面切到 **NVLink**——' +
      '**这个机架里一条线都没有。域在服务器里面，不在机架里。**' +
      '再切回 scale-out：线全回来了，每台服务器的 8 张 ConnectX-8 各出 800 Gb/s 上 leaf，' +
      'rail-optimized（同编号网卡接同一台 leaf）。' +
      '这就是这一代的全部结构真相：**8 卡以内走 NVLink（1.8 TB/s/卡），第 9 张卡开始走以太网（800 Gb/s/卡）**，' +
      '中间差 18 倍带宽，没有过渡档。' +
      '③ 断了会怎样 / 每机架放几台：官方**刻意不给**每机架台数——' +
      '32 / 64 / 128 三个设计点的注意事项里都写着「The number of GPU servers per rack depends on ' +
      'available rack power」，外加一条「Rack layout must provide power supply redundancy」。' +
      '画面里的 4 台是本工具按「1 机架 = 1 个 4 节点 SU」做的示意' +
      '（DGX B300 官方 ~14 kW/台，4 台约 56 kW），不是官方规格。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.hgx.rack',
    planes: ['nvlink', 'scaleout'],
    highlightAssemblyIds: ['asm.hgx.gpu-server', 'asm.hgx.rack-pdu'],
    presalesNote:
      '★ 这一站是整个代际的核心，务必让客户亲眼看到那个「空平面」——' +
      '讲一百句「NVLink 域只有 8 卡」，不如切一次平面看到机架里真的没有线。' +
      '★ 讲完空平面立刻接上业务含义：' +
      '① 模型/并行策略能塞进 8 卡 ⇒ HGX 完全够用，而且是风冷、能进现有机房；' +
      '② 一旦要跨服务器做张量并行或专家并行 ⇒ 通信立刻掉到 800 Gb/s 以太网，' +
      '这时该谈的是 GB300 NVL72，不是加机器。' +
      '★ 每机架台数这一项，报方案时必须拿客户机房的实测配电重算，' +
      '不能套模板——官方把这个数字明确交还给了机房侧。',
  },
  {
    id: 'scene.hgx.two-domains',
    systemId: SYSTEM_ID,
    title: '两种域怎么选：服务器域 8 卡 vs 机架域 72 卡',
    narration:
      '① 你应该看到什么：整座机房——8 个风冷机架（示意 32 台服务器 = 官方 32 节点设计点 / 256 GPU）、' +
      '列尾的计算网 leaf/spine、汇聚交换层与外部存储、7 台控制面节点、' +
      '以及热通道端头的机房空调。**没有 CDU、没有一次侧水路**，cooling 平面只有一段「服务器 → 空调」。' +
      '② 关键对照（同一颗 B300，两种域）：' +
      '**HGX B300** = 域 8 卡 / 14.4 TB/s、风冷、跨机通信 800 Gb/s 以太网、机架级什么都没有、' +
      '官方 AI 工厂产出 30×（对比 Hopper）；' +
      '**GB300 NVL72** = 域 72 卡 / 130 TB/s、液冷、机架内铜背板全互联、整机架 142 kW、产出 50×。' +
      '★ 注意每卡 NVLink 都是 1.8 TB/s——**差的不是链路速度，是域里有几张卡**。' +
      '③ 怎么选，三个问题就够：' +
      '**第一问「模型多大」**：官方说单张 B300 SXM 能装约 120B 参数、超出也基本在单机 8 卡内解决' +
      '（「This parallelism will still reside within the same node」）⇒ 走 HGX；' +
      '**第二问「要不要跨机并行」**：万亿参数 MoE 的专家并行、长上下文推理的张量并行一旦跨出 8 卡，' +
      '每一步 all-to-all 都要走 1/18 带宽的以太网 ⇒ 该上 NVL72；' +
      '**第三问「机房什么条件」**：能否液冷改造、单机架给得起多少 kW——' +
      'HGX 进现有风冷机房按周排期，液冷改造按季度排期。',
    lodLevel: 'cluster',
    focusAssemblyId: 'asm.hgx.facility',
    planes: ['scaleout', 'cooling'],
    highlightAssemblyIds: [
      'asm.hgx.rack',
      'asm.hgx.scaleout-leaf',
      'asm.hgx.scaleout-spine',
      'asm.hgx.air-handler',
    ],
    presalesNote:
      '★ 这一站的落点是**选型话术**，三句话讲完：' +
      '①「不是谁强谁弱，是域该多大」——同一颗 B300，HGX 把域做到 8 卡、NVL72 做到 72 卡，' +
      '选错方向不是浪费钱就是跑不动；' +
      '②「先问工作负载，再问机房」——≤120B 推理选 HGX（官方自己都说纯推理可以不建计算网），' +
      '万亿参数 MoE / 大规模训练选 NVL72；' +
      '③「风冷是隐藏卖点」——很多单子最后卡在机房改造而不是算力，' +
      'HGX 能进现有风冷机房这件事，在时间表上的价值经常超过算力差。' +
      '★ 两个必须自己先算清的数：' +
      '每机架台数（官方不给，按客户实测配电算）与集群规模档位' +
      '（官方只验证到 32 / 64 / 128 节点三档，32 SU 是完整测试上限）。' +
      '★ 最后提醒一句 30× vs 50×：这两个都是厂商营销口径（对比 Hopper 的 AI 工厂综合产出），' +
      '不是算力比，不能直接换算成 token 产能——但它们的**相对关系**（机架域 > 服务器域）是真的。',
  },
]

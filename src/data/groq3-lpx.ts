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
 * NVIDIA Groq 3 LPX 内容包（v1.3 W3 新增的第四个代际，`announced`）。
 *
 * 这一代与前三代在**架构类别上**就不同，读这个文件前先记住三条：
 *
 * 1. **它不是 GPU 机架**。加速器是 LPU（Language Processing Unit，芯片代号 LP30），
 *    `kind: 'lpu'`，没有 HBM、没有 NVSwitch、没有 NVLink 域——scale-up 走的是
 *    LPU 之间的直连 C2C 链路 + 托盘间的 C2C spine。因此内容里凡是 `nvlink` 平面，
 *    在 UI 上一律经 `lib/planeLabel.ts` 显示为「C2C scale-up」（持久化键仍是 `nvlink`）。
 * 2. **它不单独出产能**。`capacityPolicy: 'paired-only'`——官方对 LPX 的全部性能口径
 *    都是「与 Vera Rubin NVL72 配对」（AFD：GPU 跑 attention、LPU 跑 FFN/MoE）。
 *    脱离配对谈「LPX 一个机架能出多少 token」没有官方语义，`lib/capacity.ts` 因此在
 *    查找 GPU 组件**之前**就按策略拒绝，`missing` 恒为空数组。
 * 3. **官方两处算力口径不完全闭合**：机架 315 PFLOPS（表 1）与每托盘 9.6 PFLOPS（表 2），
 *    而 32 × 9.6 = 307.2 ≠ 315。两条各自独立建 Claim，**不互推、不加相等不变量**，
 *    差值在 note 里留痕。
 *
 * ⚠️ 官方未公布、因而一律 null 的关键项：
 * - **托盘主机 CPU 的型号与规格**：官方托盘图里它是一个独立部件（与 BlueField-4 并列），
 *   但 NVIDIA 没有说它是 Vera、Grace 还是 x86。**不得拿 BlueField-4 内嵌的 CPU 冒充主机
 *   CPU**——图上它们是两个盒子。
 * - 整机架功率（kW）、单 LPU TDP、机架 U 高与逐 U 布局、LPX↔NVL72 之间的物理介质与带宽。
 * - 单芯片晶体管数：只在主题演讲里出现过，官方文字材料没有，因此**整条不建**。
 */

const SYSTEM_ID = 'sys.groq3-lpx'

// ─────────────────────────── 源与 Claim 小工具 ───────────────────────────

const LPX_PAGE = 'src.nvidia-lpx-page'
const LPX_BLOG = 'src.nvidia-lpx-blog'
const GTC26_PRESS = 'src.nvidia-vera-rubin-gtc26-press'
const GROQ_NEWS = 'src.groq-nvidia-licensing'

/** 各源的抓取/发布时间（与 sources.ts 保持一致）。 */
const AS_OF: Record<string, string> = {
  [LPX_PAGE]: '2026-08',
  [LPX_BLOG]: '2026-03',
  [GTC26_PRESS]: '2026-03',
  [GROQ_NEWS]: '2025-12',
}

/**
 * LPX 的官方数字一律 `vendor_claim`（不是 `verified_spec`）。
 *
 * 理由：NVIDIA 至今没有为 LPX 发过规格表 / 参考架构 / 数据手册，全部数字来自产品页
 * 卡片文案、技术博客的两张表与发布稿段落——是厂商宣称口径，不是可验收的规格行。
 * 徽章上因此显示「厂商宣称」，提醒对外引用时连同前提一起说。
 */
function lpx<T extends ClaimValue>(
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
    status: 'announced',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence: 'medium',
    note,
  })
}

/** 关键数量（必带 locator）。 */
function lpxCount(value: number, sourceId: string, locator: string, note: string | null = null): Claim<number> {
  return lpx<number>(value, '个', sourceId, locator, note)
}

/** 「官方未公布，本项目不编数」。 */
function lpxNull(unit: string | null, sourceId: string, note: string, locator: string | null = null): Claim {
  return claim({
    value: null,
    unit,
    sourceId,
    locator,
    evidence: 'vendor_claim',
    status: 'announced',
    asOf: AS_OF[sourceId] ?? '2026-08',
    confidence: 'low',
    note,
  })
}

const COMPUTE_MISMATCH_NOTE =
  '⚠️ 官方两处算力口径不完全闭合：技术博客表 1 给整机架 315 PFLOPS，表 2 给每托盘 9.6 PFLOPS，' +
  '而 32 × 9.6 = 307.2 ≠ 315。NVIDIA 没有解释这 7.8 PFLOPS 的差值（可能是 binning、可能是两表口径不同）。' +
  '本项目两条数字各自独立成立、互不推导，报数时按需要引用其中一条并说明它的出处，不要拿一条去「验算」另一条。'

const NO_SPEC_SHEET =
  '⚠️ NVIDIA 至今未发布 LPX 的规格表 / 参考架构文档，本条为产品页或技术博客的厂商宣称口径。'

// ─────────────────────────── 系统 ───────────────────────────

export const GROQ3_LPX_SYSTEM: FactorySystem = {
  id: SYSTEM_ID,
  name: 'NVIDIA Groq 3 LPX',
  vendor: 'NVIDIA',
  status: 'announced',
  capacityPolicy: 'paired-only',
  generation: 'groq3-lpx',
  referenceUrl: 'https://www.nvidia.com/en-us/data-center/lpx/',
  summary:
    '与 Vera Rubin NVL72 配对使用的低时延推理加速机架：MGX ETL 机架内 32 个 1U 液冷托盘 × 8 颗 LP30 = 256 颗 LPU，' +
    '全部工作集放在片上 SRAM（机架 128 GB / 40 PB/s），靠直连 C2C 链路组成 640 TB/s 的 scale-up 域。' +
    '它不做 prefill，也不独立服务——在 AFD（attention–FFN 分离）里专吃 decode 的 FFN/MoE 那一段。',
  presalesNote:
    '讲 LPX 只需要说清「它补的是哪一段」：GPU 擅长吞吐与大内存（prefill、decode 的 attention），' +
    'LPU 擅长小 batch 下的确定性低时延（decode 的 FFN/MoE）。官方把两者绑在一起卖，宣称配对后' +
    '**每兆瓦吞吐最高 35×**（对比 GB200 NVL72，在 400 TPS/用户 这个交互度上）。' +
    '★ 三个最容易说错的地方：① 它**没有 HBM**，工作集靠 500 MB/颗的片上 SRAM 与层间切分撑起来，' +
    '「装得下多大模型」不能按单卡显存算；② 它**不单独出产能**——本工具对它一律拒绝出数，' +
    '谁给你一个「LPX 一个机架多少 token/s」的独立数字都要问口径；③ NVIDIA 与 Groq 是' +
    '**非排他技术许可 + 团队加入**，不是收购，Groq 仍作为独立公司运营 GroqCloud，别讲成「NVIDIA 买了 Groq」。',
  sourceIds: [LPX_PAGE, LPX_BLOG, GTC26_PRESS, GROQ_NEWS],
  keySpecs: {
    // ⚠️ 历史命名：`gpuCount` 是 GPU 语义的键，LPX 没有 GPU。按 types.ts 的约定仍然填写
    // （值为 null），真正的加速器数量走下面语义准确的 `acceleratorCount`。
    gpuCount: lpxNull(
      '张',
      LPX_PAGE,
      '★ LPX 机架里没有 GPU——加速器是 256 颗 LPU（见 acceleratorCount）。这个键只是为了满足内容包' +
        '「keySpecs 至少含 gpuCount / rackPowerKW」的历史约定而存在，恒为 null，任何下游都不得把它当 0。',
    ),
    acceleratorCount: lpx<number>(
      256,
      '颗',
      LPX_PAGE,
      'NVIDIA Groq 3 LPU Inference Accelerator 节，「Each LPX rack features 256 interconnected LPU accelerators」' +
        '（发布稿同口径：「The LPX rack with 256 LPU processors」；技术博客表 1「Scale-up density | 256 chips」）',
      '三处官方材料互相印证的唯一一个数字。',
    ),
    rackPowerKW: lpxNull(
      'kW',
      LPX_PAGE,
      '★ NVIDIA 未公布 LPX 的整机架功率。官方给的全部能效口径都是**相对值**（「35× TPS/MW」「10× 收入/瓦」），' +
        '没有绝对功率。本项目因此不出任何 tokens/W——何况 LPX 是 paired-only，独立能效本身也没有官方语义。',
    ),
    lpuTrayCount: lpx<number>(
      32,
      '个',
      LPX_BLOG,
      'Inside the NVIDIA Groq 3 LPX compute tray 节，「The LPX rack-scale accelerator houses 32 liquid-cooled 1U compute trays」',
    ),
    lpusPerTray: lpx<number>(
      8,
      '颗',
      LPX_BLOG,
      '表 2「LP30 chips | 8」（正文同口径：「Every tray integrates eight LPU accelerators, a host processor, and fabric expansion logic」）',
      '32 托盘 × 8 = 256 颗，与机架级口径闭合。',
    ),
    sramTotalGB: lpx<number>(
      128,
      'GB',
      LPX_BLOG,
      '表 1「Total SRAM capacity | 128 GB」（产品页 Fusion Memory Architecture 卡片：「LPX delivers 128 GB of SRAM for low-latency processing」）',
      '★ 这就是 LPX 的「显存」总量——对照 Vera Rubin NVL72 的 20.7 TB HBM4，少了两个数量级。' +
        'LPX 不是用来装模型的，是用来把 decode 中最怕抖动的那一段跑得又快又稳的。',
    ),
    sramBandwidthPBs: lpx<number>(
      40,
      'PB/s',
      LPX_BLOG,
      '表 1「On-chip SRAM bandwidth | 40 PB/s」（产品页 High-Velocity SRAM 卡片：「40 petabytes per second (PB/s) of SRAM bandwidth per rack」）',
      '★ 与容量正好相反的一面：Vera Rubin NVL72 机架级显存带宽是 1,580 TB/s ≈ 1.58 PB/s，' +
        'LPX 是它的约 25 倍。容量换带宽，这是 SRAM-first 架构的全部交易内容。',
    ),
    scaleUpBandwidthTBs: lpx<number>(
      640,
      'TB/s',
      LPX_BLOG,
      '表 1「Scale-up bandwidth | 640 TB/s」（发布稿与产品页同口径：「640 TB/s of scale-up bandwidth」）',
      '产品页措辞是「Direct chip-to-chip links deliver 640 TB/s of scale-up bandwidth across the LPX rack」' +
        '——是 LPU↔LPU 直连，不经过任何交换芯片；对照 Vera Rubin NVL72 经 NVLink 6 交换层的 260 TB/s。',
    ),
    ddr5TotalTB: lpx<number>(
      12,
      'TB',
      LPX_PAGE,
      'Fusion Memory Architecture 卡片，「In each rack, LPX delivers 128 GB of SRAM for low-latency processing and 12 TB of DDR5 memory for large models and workloads」',
      '与技术博客表 2 的每托盘 DRAM 口径闭合：32 × (256 GB 经 fabric expansion logic + 128 GB 经 host CPU) = 12,288 GB = 12 TB。',
    ),
    fp8RackPflops: lpx<number>(
      315,
      'PFLOPS',
      LPX_BLOG,
      '表 1「AI inference compute | 315 PFLOPS」（图 1 图注同口径：「315 PFLOPS of FP8 compute」）',
      COMPUTE_MISMATCH_NOTE,
    ),
    fp8PerTrayPflops: lpx<number>(
      9.6,
      'PFLOPS',
      LPX_BLOG,
      '表 2「AI inference compute (FP8) | 9.6 PFLOPS」',
      COMPUTE_MISMATCH_NOTE,
    ),
    pairedThroughputGain: lpx<string>(
      '与 Vera Rubin NVL72 配对后，每兆瓦吞吐最高 35×（对比 GB200 NVL72，在 400 TPS/用户 交互度上）',
      null,
      LPX_BLOG,
      'Unlocking a new category of AI experiences on the Pareto frontier 节，「the combination of Vera Rubin NVL72 and LPX delivers up to 35x higher TPS per megawatt at 400 TPS per user compared with the NVIDIA GB200 NVL72」',
      '★ 这是**配对系统**的相对指标，不是 LPX 单独的能力。「400 TPS/用户」这个前提必须一起说：' +
        '在低交互度（普通聊天）区间，同构 GPU 方案本来就够用，35× 不成立。',
    ),
    availability: lpx<string>(
      '2026 年下半年',
      null,
      GTC26_PRESS,
      'NVIDIA Groq 3 LPX Rack 节，「Fully liquid cooled and built on MGX infrastructure, LPX integrates seamlessly into next-generation Vera Rubin AI factories to be available in the second half of this year.」',
      '发布稿发布于 2026-03，因此「this year」= 2026。',
    ),
    groqRelationship: lpx<string>(
      'NVIDIA 与 Groq 签署非排他推理技术许可协议；Groq 创始人 Jonathan Ross、总裁 Sunny Madra 与部分团队加入 NVIDIA；Groq 作为独立公司继续运营，GroqCloud 不中断',
      null,
      GROQ_NEWS,
      '全文三段，「entered into a non-exclusive licensing agreement with Nvidia for Groq\'s inference technology」/「will join Nvidia to help advance and scale the licensed technology」/「Groq will continue to operate as an independent company with Simon Edwards stepping into the role of Chief Executive Officer」',
      '★ 对外口径纪律：这**不是收购**。说成「NVIDIA 收购了 Groq」既不准确，也会让客户对 GroqCloud 的存续产生错误预期。' +
        'Groq 发布稿没有提到任何金额，本项目因此不建金额 Claim（坊间流传的数字没有官方出处）。',
    ),
  },
  // 与前三代一致的示意高度：官方同样未公布 LPX 机架的 U 高与逐 U 布局。
  rackUnitsForLayout: 48,
}

// ─────────────────────────── 组件 ───────────────────────────

export const GROQ3_LPX_COMPONENTS: HardwareComponent[] = [
  {
    id: 'cmp.lpx.lp30-lpu',
    // ★ kind: 'lpu' 走 HardwareComponent 的 non-GPU 分支 ⇒ 类型层面就不可能有 mathSpecs。
    //   这是刻意的：产能估算的 roofline 数学是按 GPU（HBM 容量/带宽 + 稠密 TFLOPS）建的，
    //   把 SRAM-first 的 LPU 套进去会得出彻底错误的数字。
    kind: 'lpu',
    name: 'NVIDIA Groq 3 LPU（LP30）',
    vendor: 'NVIDIA / Groq',
    status: 'announced',
    summary:
      'SRAM-first 的推理加速芯片：500 MB 片上 SRAM 作为主工作存储（没有 HBM）、150 TB/s 片上带宽、' +
      '96 条 112 Gbps 的直连 C2C 链路凑出 2.5 TB/s scale-up，执行完全由编译器静态调度。',
    presalesNote:
      '一句话：**它把「内存墙」换成了「容量墙」**。没有 HBM，工作集全在 500 MB 片上 SRAM 里，' +
      '于是 decode 时不再有不可预测的访存停顿——官方主打的就是这个「确定性」：' +
      '时延稳、尾延迟稳、小 batch 下也稳。代价是单颗装不下什么东西，' +
      '大模型必须按层切到许多颗 LPU 上（官方原话是 layer-wise partitioning），' +
      '所以 LPU 天生是「一机架当一颗芯片用」，不像 GPU 可以一张卡起步。',
    visual: { shape: 'chip', colorToken: 'accent-2' },
    imageUrl: 'https://www.nvidia.com/en-us/data-center/lpx/',
    sourceIds: [LPX_PAGE, LPX_BLOG],
    specs: {
      sramPerChipMB: lpx<number>(
        500,
        'MB',
        LPX_BLOG,
        'MEM enables extreme on-chip memory bandwidth 节，「a flat, SRAM-first memory architecture where 500 MB of high-speed on-chip SRAM serves as the primary working storage for inference」' +
          '（产品页同口径：「Each LPU accelerator delivers 500 megabytes (MB) of SRAM」）',
        `★ 注意单位是 **MB 不是 GB**：对照 Rubin GPU 的 288 GB HBM4，单颗容量差约 576 倍。${NO_SPEC_SHEET}`,
      ),
      sramBandwidthTBs: lpx<number>(
        150,
        'TB/s',
        LPX_PAGE,
        'NVIDIA Groq 3 LPU Inference Accelerator 节，「150 terabytes per second (TB/s) of SRAM bandwidth」' +
          '（技术博客同口径：「the LPX pairs 150 TB/s of on-chip memory bandwidth with high bandwidth scale-up… per LPU」）',
        '对照 Rubin GPU 单卡 22 TB/s 显存带宽：单颗约 6.8 倍。这一项直接决定 decode 的 FFN 段能跑多快。',
      ),
      scaleUpBandwidthTBs: lpx<number>(
        2.5,
        'TB/s',
        LPX_PAGE,
        'NVIDIA Groq 3 LPU Inference Accelerator 节，「2.5 TB/s scale-up bandwidth」' +
          '（技术博客：「high aggregate I/O bi-directional bandwidth of 2.5 TB/s」）',
        '双向聚合口径。对照 Rubin GPU 每卡 3.6 TB/s NVLink 6。',
      ),
      c2cLinkCount: lpxCount(
        96,
        LPX_BLOG,
        'C2C scaling with predictable communication 节，「Each LPU connects through 96 C2C links running at 112 Gbps each」',
        '★ high-radix（高基数）设计：链路多、每条慢，用「多路并行 + 确定性到达」换低抖动，' +
          '而不是用少数几条超高速链路。',
      ),
      c2cLinkGbps: lpx<number>(
        112,
        'Gb/s',
        LPX_BLOG,
        'C2C scaling with predictable communication 节，「96 C2C links running at 112 Gbps each」',
      ),
      vectorWidthBytes: lpx<number>(
        320,
        '字节',
        LPX_BLOG,
        'Tensor-first compute and explicit data movement 节，「Compute and communication in the LPU are organized around 320-byte vectors as the unit of work」',
        '算术、访存与跨芯片传输统一以 320 字节向量为工作单元——调度与同步因此可以静态算出来。',
      ),
      executionModules: lpx<string>(
        'MXM（矩阵）/ VXM（向量）/ SXM（结构化数据搬移）',
        null,
        LPX_BLOG,
        'Tensor-first compute and explicit data movement 节，「Matrix execution modules (MXM)… Vector execution modules (VXM)… Switch execution modules (SXM)」',
      ),
      executionModel: lpx<string>(
        '编译器静态编排（spatial execution）+ plesiosynchronous C2C 协议对齐时钟漂移',
        null,
        LPX_BLOG,
        'Deterministic, compiler-orchestrated execution 节，「the compiler relies on plesiosynchronous, chip-to-chip protocol in hardware that cancels natural clock drift and aligns hundreds of LPU accelerators to act as a single coordinated system」',
        '★ 这是 LPU 与 GPU 最本质的分野：没有运行期动态调度器，指令时序在编译期就定死。' +
          '好处是抖动小、可预测；代价是模型/形状变化时要重新编译。',
      ),
      memoryHierarchy: lpx<string>(
        '扁平 SRAM（MEM 块），无硬件管理的 cache，权重/激活/KV 由编译器与运行时显式放置',
        null,
        LPX_BLOG,
        'MEM enables extreme on-chip memory bandwidth 节，「Rather than relying on hardware-managed caches, the compiler and runtime place the active working set, including weights, activations, and KV state, into on-chip memory and move data explicitly」',
      ),
      // ⚠️ 键名刻意**不叫** hbm*：pack.test.ts 锁住「LPU 组件不得出现 HBM 语义的规格键」，
      //    免得哪天有人顺手加一条 hbmPerChipGB 把 GPU 的容量语义带进来。
      memoryTechnology: lpx<string>(
        '无 HBM（SRAM-first 架构，主工作存储是片上 SRAM）',
        null,
        LPX_BLOG,
        'MEM enables extreme on-chip memory bandwidth 节全文——LPU 的主工作存储是片上 SRAM；机架级 DRAM 走托盘上的 fabric expansion logic 与 host CPU（表 2）',
        '★ 售前最容易被追问的一条：LPX 机架没有 HBM。跨颗扩容靠 layer-wise partitioning' +
          '（官方原话）把模型切到多颗 LPU 上，而不是靠单颗堆容量。',
      ),
      tdpW: lpxNull('W', LPX_BLOG, 'NVIDIA 未公布单颗 LP30 的 TDP（整机架功率同样未公布）。'),
      processNode: lpxNull(null, LPX_BLOG, 'NVIDIA 未公布 LP30 的制程节点与晶体管数（技术博客与产品页都没有这两项）。'),
    },
  },
  {
    id: 'cmp.lpx.host-cpu',
    kind: 'cpu',
    name: 'LPX 托盘主机 CPU（型号未公布）',
    vendor: '未公布',
    status: 'announced',
    summary:
      '官方托盘图里与 8 颗 LP30、fabric expansion logic、BlueField-4 并列的独立主机处理器；' +
      'NVIDIA 只说了它存在、并挂着最高 128 GB DRAM，没有公布型号、核数与架构。',
    presalesNote:
      '★ 这个部件的正确讲法是「官方图上有这么一个盒子，但没说它是什么」。' +
      '**不要**替 NVIDIA 猜成 Vera 或 Grace——技术博客的托盘图里 Host CPU 与 BlueField-4 是**两个独立部件**，' +
      '而 BlueField-4 自己内含 CPU（官方两处说法还互相冲突：一处 64 核 Grace、一处 Vera）。' +
      '把 BF-4 里那颗当成托盘主机 CPU 是本项目明令禁止的推断。客户问起就答「官方未公布，需要向 NVIDIA 确认」。',
    visual: { shape: 'chip', colorToken: null },
    imageUrl: null,
    sourceIds: [LPX_BLOG],
    specs: {
      presence: lpx<string>(
        '每托盘 1 颗（官方托盘图中的独立部件）',
        null,
        LPX_BLOG,
        'Inside the NVIDIA Groq 3 LPX compute tray 节，「Every tray integrates eight LPU accelerators, a host processor, and fabric expansion logic」' +
          '（图 2 图注：「eight Groq 3 LPU modules connected to an on-tray Fabric Expansion Logic, DRAM, Host CPU, BlueField-4 DPU…」）',
        '★ 图注把 Host CPU 与 BlueField-4 DPU 并列列出 ⇒ 两个独立部件，不是同一颗。',
      ),
      dramViaHostGB: lpx<number>(
        128,
        'GB',
        LPX_BLOG,
        '表 2「DRAM via host CPU | Up to 128 GB」',
        '官方措辞是「Up to」（上限口径，不是标配值）。',
      ),
      model: lpxNull(
        null,
        LPX_BLOG,
        '★ NVIDIA 未公布 LPX 托盘主机 CPU 的型号。官方材料只在托盘图与正文里称它为「host processor / Host CPU」，' +
          '既没说是 NVIDIA Vera、也没说是 Grace 或第三方 x86。本项目不猜，也不允许拿 BlueField-4 内嵌的 CPU 顶替。',
      ),
      coreCount: lpxNull('核', LPX_BLOG, 'NVIDIA 未公布该主机 CPU 的核数。'),
      architecture: lpxNull(null, LPX_BLOG, 'NVIDIA 未公布该主机 CPU 的指令集架构（Arm / x86 均未说明）。'),
      tdpW: lpxNull('W', LPX_BLOG, 'NVIDIA 未公布该主机 CPU 的 TDP。'),
    },
  },
  {
    id: 'cmp.lpx.fabric-expansion',
    kind: 'switch',
    name: 'Fabric Expansion Logic（托盘内扩展逻辑）',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '托盘上的扩展逻辑：一边把 8 颗 LP30 的 C2C 链路引到背板与前面板（跨托盘、跨机架），' +
      '一边挂最高 256 GB DRAM 作为片上 SRAM 之外的第二层容量。',
    presalesNote:
      '它是 LPX「无线缆」设计能成立的关键件——托盘内 LPU 直连、跨托盘经它上背板到 C2C spine，' +
      '整机架不需要一根 scale-up 线缆。对客户的意义与 Vera Rubin 的 PCB 中板一样：装配与更换托盘不用重新走线。' +
      '另外它挂的 256 GB DRAM 是「大模型/大工作集」的兜底层，但要说清楚——那不是给 decode 主路径用的，' +
      'decode 的热数据必须在 SRAM 里，掉到 DRAM 就失去 LPX 的意义了。',
    visual: { shape: 'chip', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [LPX_BLOG],
    specs: {
      role: lpx<string>(
        '托盘内 C2C 扩展 + DRAM 挂载，配合无线缆（cableless）托盘设计',
        null,
        LPX_BLOG,
        'Inside the NVIDIA Groq 3 LPX compute tray 节，「Every tray integrates eight LPU accelerators, a host processor, and fabric expansion logic in a cableless design」' +
          '（图 2 图注：「connected to an on-tray Fabric Expansion Logic, DRAM, Host CPU, BlueField-4 DPU, and backplane and front-panel connections」）',
      ),
      dramViaFabricGB: lpx<number>(
        256,
        'GB',
        LPX_BLOG,
        '表 2「DRAM via fabric expansion logic | Up to 256 GB」',
        '官方措辞是「Up to」（上限口径）。与 host CPU 侧的 128 GB 合计每托盘最高 384 GB，' +
          '× 32 托盘 = 12 TB，与产品页机架级「12 TB of DDR5」闭合。',
      ),
      c2cScope: lpx<string>(
        '托盘内直连 / 经 LPU C2C spine 跨托盘 / 随系统规模跨机架',
        null,
        LPX_BLOG,
        'Inside the NVIDIA Groq 3 LPX compute tray 节，「LPU chip-to-chip (C2C) links provide direct communication within the tray, across trays via the LPU C2C spine, and across racks as systems scale」',
      ),
      vendorPart: lpxNull(
        null,
        LPX_BLOG,
        'NVIDIA 未公布 fabric expansion logic 的具体形态（ASIC / FPGA / 交换芯片）与型号，官方只给了功能描述。',
      ),
    },
  },
  {
    id: 'cmp.lpx.compute-tray',
    kind: 'tray',
    name: 'Groq 3 LPX 计算托盘（1U 液冷）',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '1U 液冷无线缆托盘：8 颗 LP30（4 GB SRAM / 1.2 PB/s / FP8 9.6 PFLOPS / 20 TB/s scale-up）' +
      '+ 1 颗主机 CPU + 1 个 fabric expansion logic + 1 张 BlueField-4 DPU。',
    presalesNote:
      '和 Vera Rubin 计算托盘对着讲最省事：**同样是 1U 无线缆液冷托盘，但里面装的东西完全不同**——' +
      'VR 托盘是 2 CPU + 4 GPU + 8 网卡 + 1 DPU；LPX 托盘是 8 加速器 + 1 主机 CPU + 1 扩展逻辑 + 1 DPU，' +
      '没有 scale-out 网卡（LPX 的对外流量走 BF-4 与前面板）。' +
      '密度差异也要说：VR 机架 18 个计算托盘，LPX 机架 32 个——1U 塞得下 8 颗 LPU，是因为没有 HBM 也没有 800 W 级的芯片。',
    visual: { shape: 'tray-slab', colorToken: null },
    imageUrl: null,
    sourceIds: [LPX_BLOG],
    specs: {
      lpusPerTray: lpxCount(
        8,
        LPX_BLOG,
        '表 2「LP30 chips | 8」（正文：「Every tray integrates eight LPU accelerators」）',
      ),
      hostCpusPerTray: lpxCount(
        1,
        LPX_BLOG,
        'Inside the NVIDIA Groq 3 LPX compute tray 节，「eight LPU accelerators, a host processor, and fabric expansion logic」（图 2 图注中 Host CPU 为独立部件）',
        '★ 型号未公布，见 cmp.lpx.host-cpu。不得与同托盘的 BlueField-4 混为一谈。',
      ),
      bluefield4PerTray: lpxCount(
        1,
        LPX_BLOG,
        '图 2 图注，「…an on-tray Fabric Expansion Logic, DRAM, Host CPU, BlueField-4 DPU, and backplane and front-panel connections」',
      ),
      sramPerTrayGB: lpx<number>(4, 'GB', LPX_BLOG, '表 2「On-chip SRAM | 4 GB」', '= 8 × 500 MB，与单芯片口径闭合。'),
      sramBandwidthPerTrayPBs: lpx<number>(1.2, 'PB/s', LPX_BLOG, '表 2「SRAM bandwidth | 1.2 PB/s」'),
      dramViaFabricGB: lpx<number>(256, 'GB', LPX_BLOG, '表 2「DRAM via fabric expansion logic | Up to 256 GB」'),
      dramViaHostGB: lpx<number>(128, 'GB', LPX_BLOG, '表 2「DRAM via host CPU | Up to 128 GB」'),
      fp8PflopsPerTray: lpx<number>(
        9.6,
        'PFLOPS',
        LPX_BLOG,
        '表 2「AI inference compute (FP8) | 9.6 PFLOPS」',
        COMPUTE_MISMATCH_NOTE,
      ),
      scaleUpBandwidthPerTrayTBs: lpx<number>(
        20,
        'TB/s',
        LPX_BLOG,
        '表 2「Scale-up bandwidth | 20 TB/s」',
        '⚠️ 与机架级 640 TB/s 同样不是简单倍数关系（32 × 20 = 640，这一对恰好闭合）。',
      ),
      formFactor: lpx<string>(
        '1U，液冷，无线缆（cableless）',
        null,
        LPX_BLOG,
        'Inside the NVIDIA Groq 3 LPX compute tray 节，「32 liquid-cooled 1U compute trays」+「in a cableless design that simplifies rack-scale deployment」',
      ),
      scaleOutNic: lpxNull(
        null,
        LPX_BLOG,
        'NVIDIA 未公布 LPX 托盘是否配备独立的 scale-out 网卡（官方托盘图里只有 BlueField-4 与「backplane and front-panel connections」，' +
          '没有出现 ConnectX 系列）。本项目因此不为 LPX 建 scale-out 网卡组件——「未收录」不等于「没有」。',
      ),
      trayPowerW: lpxNull('W', LPX_BLOG, 'NVIDIA 未公布单个 LPX 计算托盘的功耗。'),
    },
  },
  {
    id: 'cmp.lpx.c2c-spine',
    kind: 'rack',
    name: 'LPU C2C Spine（机架内 scale-up 背板）',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      '机架内承载跨托盘 LPU 直连链路的 spine：32 个托盘经它把各自的 8 颗 LP30 连成一个 640 TB/s 的' +
      'scale-up 域，全程无交换芯片、无线缆。',
    presalesNote:
      '这是 LPX 与 NVLink 体系最值得对比的一处：**Vera Rubin 靠 36 颗 NVLink 6 交换芯片做全互联，' +
      'LPX 干脆不要交换层**——LPU 之间是直连 C2C，spine 只是把链路引过去的无源通路。' +
      '好处是少一跳、时延与抖动都更可控；代价是拓扑固定，扩展方式由编译器的切分策略决定。' +
      '⚠️ 官方只说了「无线缆」与「经背板/spine 连接」，**没有公布 spine 的物理介质**（铜背板还是光），' +
      '3D 里的形态是示意。',
    visual: { shape: 'backplane', colorToken: 'plane-nvlink' },
    imageUrl: null,
    sourceIds: [LPX_BLOG, LPX_PAGE],
    specs: {
      medium: lpxNull(
        null,
        LPX_BLOG,
        '★ NVIDIA 未公布 LPU C2C spine 的物理介质。官方原话只有「across trays via the LPU C2C spine」与' +
          '托盘的「cableless design」「backplane and front-panel connections」——能确定的是无线缆、经背板，' +
          '但是铜背板还是光背板没有说明。3D 里按无源背板形态示意。',
      ),
      switchless: lpx<string>(
        '无交换芯片：LPU 之间直连 chip-to-chip',
        null,
        LPX_PAGE,
        'Massive Scale-Up Bandwidth 卡片，「Direct chip-to-chip links deliver 640 TB/s of scale-up bandwidth across the LPX rack for low-latency chip communication」',
        '★ 与 Vera Rubin NVL72 的根本差异：那一代是 72 GPU × 36 颗 NVLink 6 交换芯片的交换式全互联，' +
          'LPX 这一代没有交换层这个东西。',
      ),
      aggregateBandwidthTBs: lpx<number>(
        640,
        'TB/s',
        LPX_BLOG,
        '表 1「Scale-up bandwidth | 640 TB/s」',
        'GB300 NVL72 同口径 130 TB/s、Vera Rubin NVL72 260 TB/s——但那两代是 NVLink 交换域，此处是 C2C 直连域，不同物。',
      ),
      topologyDetail: lpxNull(
        null,
        LPX_BLOG,
        'NVIDIA 未公布 C2C scale-up 的具体拓扑形态（每颗 96 条链路怎么分配给托盘内/跨托盘/跨机架），' +
          '官方只说是「streamlined LPX scale-up topology」。',
      ),
    },
  },
  {
    id: 'cmp.lpx.mgx-etl-rack',
    kind: 'rack',
    name: 'NVIDIA MGX ETL 机架',
    vendor: 'NVIDIA / OEM',
    status: 'announced',
    summary:
      '全液冷的 MGX ETL 机架，容纳 32 个 1U LPX 计算托盘；与 Vera Rubin 部署共用同一套 MGX 基础设施，' +
      '让 token factory 只规划一种通用机架。',
    presalesNote:
      '对机房侧最重要的一句官方话是「单一通用机架」：LPX 与 Vera Rubin NVL72 共用 MGX 基础设施，' +
      '客户不需要为这条低时延路径单独设计一套机柜/水路标准。⚠️ 但整机架功率官方**没有**公布，' +
      '配电与冷量还是要按实际配置向 OEM 确认——这一点与 Vera Rubin 一模一样。',
    visual: { shape: 'rack-frame', colorToken: null },
    imageUrl: 'https://www.nvidia.com/en-us/data-center/lpx/',
    sourceIds: [LPX_PAGE, LPX_BLOG, GTC26_PRESS],
    specs: {
      mgxGeneration: lpx<string>(
        'NVIDIA MGX ETL 机架',
        null,
        LPX_PAGE,
        'Technology Breakthroughs 的 NVIDIA MGX ETL Rack 卡片标题；技术博客正文同口径：「Integrated with the NVIDIA MGX ETL rack architecture」',
        '⚠️ 官方产品页自身拼写不一致：卡片标题写「MGX ETL Rack」，同卡片正文写「MGX™ ELT rack」。' +
          '技术博客用的是 ETL，本项目取 ETL 并在此留痕——对外引用时建议直接说「MGX 机架」避开这个字母顺序。',
      ),
      trayCount: lpxCount(
        32,
        LPX_BLOG,
        'Inside the NVIDIA Groq 3 LPX compute tray 节，「The LPX rack-scale accelerator houses 32 liquid-cooled 1U compute trays」',
        '对照 Vera Rubin NVL72 的 18 个计算托盘 + 9 个交换托盘 = 27 个 U 位托盘。',
      ),
      lpuCount: lpxCount(
        256,
        LPX_PAGE,
        'NVIDIA Groq 3 LPU Inference Accelerator 节，「Each LPX rack features 256 interconnected LPU accelerators」',
      ),
      liquidCooled: lpx<boolean>(
        true,
        null,
        GTC26_PRESS,
        'NVIDIA Groq 3 LPX Rack 节，「Fully liquid cooled and built on MGX infrastructure」（技术博客同口径：「32 liquid-cooled 1U compute trays」）',
      ),
      universalRack: lpx<string>(
        '与 Vera Rubin 部署共用同一套 MGX 基础设施（单一通用机架）',
        null,
        LPX_PAGE,
        'NVIDIA MGX ETL Rack 卡片，「LPX leverages the NVIDIA MGX™ ELT rack, enabling token factories to plan for a single universal rack in their NVIDIA Vera Rubin platform deployments.」',
      ),
      sramTotalGB: lpx<number>(128, 'GB', LPX_BLOG, '表 1「Total SRAM capacity | 128 GB」'),
      ddr5TotalTB: lpx<number>(12, 'TB', LPX_PAGE, 'Fusion Memory Architecture 卡片，「12 TB of DDR5 memory for large models and workloads」'),
      fp8Pflops: lpx<number>(315, 'PFLOPS', LPX_BLOG, '表 1「AI inference compute | 315 PFLOPS」', COMPUTE_MISMATCH_NOTE),
      rackPowerKW: lpxNull('kW', LPX_PAGE, 'NVIDIA 未公布 LPX 的整机架功率（官方只给相对能效倍数，没有绝对功率）。'),
      heightU: lpxNull('U', LPX_BLOG, 'NVIDIA 未公布 MGX ETL 机架的 U 高与逐 U 布局；本项目 3D 摆位使用与前三代相同的示意占位高度。'),
      weightKg: lpxNull('kg', LPX_BLOG, 'NVIDIA 未公布 LPX 机架的整备重量（Vera Rubin 那一代官方给了「roughly 4,000 lbs」，LPX 没有对应说法）。'),
      coolantSupplyTempC: lpxNull(
        '°C',
        LPX_BLOG,
        'NVIDIA 未公布 LPX 的进液温度要求（Vera Rubin 那一代官方明确 45°C，LPX 只说了「fully liquid cooled」）。',
      ),
    },
  },
  {
    id: 'cmp.lpx.power-shelf',
    kind: 'power',
    name: 'LPX 机架供电层',
    vendor: 'NVIDIA / OEM',
    status: 'announced',
    summary: '机架级供电层。⚠️ NVIDIA 未公布 LPX 的电源架数量、单架功率与整机架功率，本组件全部规格为 null。',
    presalesNote:
      '这一层现在**没有任何可讲的官方数字**——LPX 的功率口径全是相对值（35× TPS/MW、10× 收入/瓦），' +
      '绝对功率一个都没公布。客户做机房规划时，这一项必须挂起来向 NVIDIA/OEM 单独确认，' +
      '不要用 Vera Rubin 的数字套（何况那一代的整机架功率官方也没公布）。',
    visual: { shape: 'psu-brick', colorToken: 'plane-power' },
    imageUrl: null,
    sourceIds: [LPX_PAGE],
    specs: {
      shelvesPerRack: lpxNull('个', LPX_PAGE, 'NVIDIA 未公布 LPX 机架的电源架数量（3D 里的数量是摆位示意）。'),
      shelfPowerKW: lpxNull('kW', LPX_PAGE, 'NVIDIA 未公布单个电源架的输出功率。'),
      psusPerShelf: lpxNull('个', LPX_PAGE, 'NVIDIA 未公布每个电源架的电源模块数。'),
      psuPowerKW: lpxNull('kW', LPX_PAGE, 'NVIDIA 未公布单个电源模块的功率。'),
      redundancyMode: lpxNull(null, LPX_PAGE, 'NVIDIA 未声明 LPX 的供电冗余模式与掉电保持策略。'),
    },
  },
  {
    id: 'cmp.lpx.afd-peer-rack',
    kind: 'rack',
    name: '配对的 Vera Rubin NVL72 机架（AFD 对端，示意）',
    vendor: 'NVIDIA',
    status: 'announced',
    summary:
      'LPX 的产能与性能口径全部以「与 Vera Rubin NVL72 配对」为前提。这个节点是那台配对 GPU 机架在' +
      'LPX 场景里的**示意对端**，用来把 AFD 的两端画在同一屏里——它本身的规格请看 Vera Rubin NVL72 代际。',
    presalesNote:
      '★ 这个盒子存在的唯一目的，是提醒「LPX 从来不是单独卖的」。官方对 LPX 的每一条性能宣称都带着' +
      '「paired with Vera Rubin」这个前提；把它从画面里拿掉，35× 与 10× 就都不成立了。' +
      '真正的 Vera Rubin NVL72 建模在它自己的代际里，切过去看。',
    visual: { shape: 'rack-frame', colorToken: 'plane-scaleout' },
    imageUrl: null,
    sourceIds: [LPX_PAGE, LPX_BLOG, GTC26_PRESS],
    specs: {
      pairing: lpx<string>(
        '与 Vera Rubin NVL72 协同解码：GPU 跑 attention，LPU 跑 FFN/MoE',
        null,
        GTC26_PRESS,
        'NVIDIA Groq 3 LPX Rack 节，「Deployed with Vera Rubin NVL72, Rubin GPUs and LPUs boost decode by jointly computing every layer of the AI model for every output token.」',
      ),
      latency: lpx<string>(
        'LPX 与 NVL72 之间的高速连接把时延压到接近零',
        null,
        LPX_PAGE,
        'High-Speed Connection With NVIDIA NVL72 卡片，「LPX\'s high-speed connections to NVL72 reduce latency to near zero.」',
        '⚠️ 「near zero」是营销措辞，没有给出数值口径（既没有 μs 也没有 GB/s）。不要在方案里换算成具体时延。',
      ),
      linkSpec: lpxNull(
        null,
        LPX_PAGE,
        '★ NVIDIA 未公布 LPX↔Vera Rubin NVL72 之间的物理介质、端口数与带宽，只说了「high-speed connections」。' +
          '本项目的这条连线是示意，不代表任何具体接线方案。',
      ),
    },
  },
]

// ─────────────────────────── 装配树 ───────────────────────────

const RACK_U_PLACEHOLDER = '机架内 U 位为 3D 摆位示意占位，NVIDIA 未公布 LPX 的逐 U 布局。'
const RACK_COUNT_PLACEHOLDER =
  '机架数量为 3D 场景的示意规模，NVIDIA 未公布 LPX 的 POD 规模上限（官方只说了「across racks as systems scale」）。'

export const GROQ3_LPX_ASSEMBLIES: AssemblyNode[] = [
  // ── cluster 层 ──
  {
    id: 'asm.lpx.facility',
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
    id: 'asm.lpx.facility-water',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.shared.facility-water-loop',
    roleKey: 'facility-water-loop',
    label: '机房一次侧冷却水回路',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '官方口径为「fully liquid cooled」，但未公布进液温度与流量要求。',
  },
  {
    // 与前三代同构：机房配电必须有一个真实存在的盒子，供电连接才不会从装配树根
    //（从不渲染）长出来。见 content.test.ts 的「三代…机房配电」用例。
    id: 'asm.lpx.facility-power',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.shared.facility-power',
    roleKey: 'facility-power',
    label: '机房配电（列头柜 / 母线）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: 'NVIDIA 未公布 LPX 的机房侧配电要求（整机架功率都没公布），数量与形态为示意。',
  },
  {
    id: 'asm.lpx.cdu',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.shared.cdu',
    roleKey: 'cdu',
    label: 'CDU 冷量分配单元',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: 'NVIDIA 未公布 LPX 的 CDU 型号与数量，此处按每部署 1 台示意。',
  },
  {
    id: 'asm.lpx.afd-peer',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.lpx.afd-peer-rack',
    roleKey: 'afd-peer-rack',
    label: '配对的 Vera Rubin NVL72 机架（AFD 对端）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '★ 示意对端，不是 LPX 自身的部件：官方对 LPX 的全部性能口径都以「与 Vera Rubin NVL72 配对」为前提，' +
      '把它画出来才能讲清 AFD 的两端。真正的 NVL72 建模在 sys.vera-rubin-nvl72 代际里。',
  },
  {
    id: 'asm.lpx.converged-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.rubin.scaleout-switch',
    roleKey: 'converged-switch',
    label: '汇聚交换层（业务与存储网）',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note:
      '承载 BlueField-4 的 North/South 流量。⚠️ LPX 没有专属参考架构文档，此处沿用 Vera Rubin 平台的' +
      '交换层组件示意（LPX 与 VR 共用 MGX 基础设施是官方口径，交换机型号与台数则未公布）。',
  },
  {
    id: 'asm.lpx.oob-fabric-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'oob-mgmt-switch',
    label: '带外管理汇聚交换机',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '带外管理网沿用前几代形态；NVIDIA 未发布 LPX 专属的管理网设计。',
  },
  {
    id: 'asm.lpx.storage',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
    componentId: 'cmp.shared.storage-array',
    roleKey: 'external-storage',
    label: '外部存储集群',
    count: 1,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: '存储选型与规模由客户方案决定；LPX 侧官方未给出任何存储带宽目标值。',
  },
  {
    id: 'asm.lpx.row',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.facility',
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
    id: 'asm.lpx.rack',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.row',
    componentId: 'cmp.lpx.mgx-etl-rack',
    roleKey: 'rack',
    label: 'Groq 3 LPX 机架（MGX ETL）',
    count: 8,
    countClaim: null,
    lodLevel: 'cluster',
    rackU: null,
    note: RACK_COUNT_PLACEHOLDER,
  },

  // ── rack 层 ──
  {
    id: 'asm.lpx.inrack-mgmt-switch',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.rack',
    componentId: 'cmp.shared.sn2201',
    roleKey: 'inrack-mgmt-switch',
    label: '机架内管理交换机',
    count: 2,
    countClaim: null,
    lodLevel: 'rack',
    rackU: { start: 1, height: 2 },
    note: `数量沿用前几代形态示意，NVIDIA 未公布 LPX 机架内管理交换机的数量。${RACK_U_PLACEHOLDER}`,
  },
  {
    id: 'asm.lpx.power-shelf',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.rack',
    componentId: 'cmp.lpx.power-shelf',
    roleKey: 'power-shelf',
    label: '供电层（电源架）',
    count: 8,
    countClaim: null,
    lodLevel: 'rack',
    rackU: { start: 3, height: 8 },
    note: `⚠️ 数量为 3D 摆位示意：NVIDIA 未公布 LPX 的电源架数量与整机架功率。${RACK_U_PLACEHOLDER}`,
  },
  {
    id: 'asm.lpx.lpu-tray',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.rack',
    componentId: 'cmp.lpx.compute-tray',
    roleKey: 'lpu-tray',
    label: 'LPX 计算托盘（1U）',
    count: 32,
    countClaim: lpxCount(
      32,
      LPX_BLOG,
      'Inside the NVIDIA Groq 3 LPX compute tray 节，「The LPX rack-scale accelerator houses 32 liquid-cooled 1U compute trays」',
    ),
    lodLevel: 'rack',
    rackU: { start: 11, height: 32 },
    note:
      `★ roleKey 用 lpu-tray 而不是 compute-tray：LPX 托盘与 NVLink 域三代的计算托盘不是同一类东西` +
      `（没有 GPU、没有 scale-out 网卡、8 加速器 vs 4），硬配对只会在代际比较里制造误导性的「数量变化」行。${RACK_U_PLACEHOLDER}`,
  },
  {
    id: 'asm.lpx.busbar',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.rack',
    componentId: 'cmp.shared.busbar',
    roleKey: 'dc-busbar',
    label: '直流母排',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '纵向贯穿机架背部，不占用 U 位。NVIDIA 未公布 LPX 的母排规格。',
  },
  {
    id: 'asm.lpx.manifold',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.rack',
    componentId: 'cmp.shared.manifold',
    roleKey: 'liquid-manifold',
    label: '分液歧管',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note: '官方口径为全液冷，歧管规格与进液温度未公布。',
  },
  {
    id: 'asm.lpx.c2c-spine',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.rack',
    componentId: 'cmp.lpx.c2c-spine',
    roleKey: 'nvlink-backplane',
    label: 'LPU C2C Spine',
    count: 1,
    countClaim: null,
    lodLevel: 'rack',
    rackU: null,
    note:
      '★ 复用 roleKey「nvlink-backplane」是刻意的：这一格在跨代比较里的语义是「机架内 scale-up 互连底板」' +
      '——GB300 是铜背板、Vera Rubin 是 PCB 中板、LPX 是 C2C spine。三代放在同一行对比才看得出' +
      '「交换式 → 无线缆中板 → 无交换直连」这条演进。位于机架中部，不占用 U 位。',
  },

  // ── tray / board 层 ──
  {
    id: 'asm.lpx.tray-cold-plate',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.lpu-tray',
    componentId: 'cmp.shared.cold-plate',
    roleKey: 'cold-plate',
    label: 'LPX 托盘冷板',
    count: 1,
    countClaim: null,
    lodLevel: 'tray',
    rackU: null,
    note: '按托盘内一套冷板回路建模；官方未公布逐器件冷板数量。',
  },
  {
    id: 'asm.lpx.host-cpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.lpu-tray',
    componentId: 'cmp.lpx.host-cpu',
    roleKey: 'host-cpu',
    label: '主机 CPU（型号未公布）',
    count: 1,
    countClaim: lpxCount(
      1,
      LPX_BLOG,
      'Inside the NVIDIA Groq 3 LPX compute tray 节，「eight LPU accelerators, a host processor, and fabric expansion logic」（图 2 图注中 Host CPU 为独立部件）',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '★ 官方托盘图里 Host CPU 与 BlueField-4 DPU 是**两个并列的独立部件**。' +
      '本项目严禁把 BF-4 内嵌的 CPU 当成托盘主机 CPU——型号未公布就是未公布。',
  },
  {
    id: 'asm.lpx.lp30',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.lpu-tray',
    componentId: 'cmp.lpx.lp30-lpu',
    roleKey: 'accelerator',
    label: 'Groq 3 LPU（LP30）',
    count: 8,
    countClaim: lpxCount(
      8,
      LPX_BLOG,
      '表 2「LP30 chips | 8」（正文：「Every tray integrates eight LPU accelerators」）',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '32 托盘 × 8 = 全机架 256 颗。★ roleKey 沿用「accelerator」，因此在跨代比较里它会与 B300 / Rubin GPU ' +
      '同行对照——那正是要看的东西（GPU 288 GB HBM vs LPU 500 MB SRAM，两种完全不同的加速器哲学）。',
  },
  {
    id: 'asm.lpx.fabric-expansion',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.lpu-tray',
    componentId: 'cmp.lpx.fabric-expansion',
    roleKey: 'fabric-expansion',
    label: 'Fabric Expansion Logic',
    count: 1,
    countClaim: lpxCount(
      1,
      LPX_BLOG,
      'Inside the NVIDIA Groq 3 LPX compute tray 节，「eight LPU accelerators, a host processor, and fabric expansion logic」',
    ),
    lodLevel: 'board',
    rackU: null,
    note: '把托盘内 8 颗 LP30 的 C2C 链路引到背板与前面板，同时挂最高 256 GB DRAM。',
  },
  {
    id: 'asm.lpx.bf4-dpu',
    systemId: SYSTEM_ID,
    parentId: 'asm.lpx.lpu-tray',
    componentId: 'cmp.rubin.bluefield-4',
    roleKey: 'north-south-dpu',
    label: 'BlueField-4 DPU',
    count: 1,
    countClaim: lpxCount(
      1,
      LPX_BLOG,
      '图 2 图注，「…an on-tray Fabric Expansion Logic, DRAM, Host CPU, BlueField-4 DPU, and backplane and front-panel connections」',
    ),
    lodLevel: 'board',
    rackU: null,
    note:
      '与 Vera Rubin 计算托盘同一颗 BlueField-4（因此直接复用那个组件定义，规格 Claim 都是 NVIDIA 官方口径）。' +
      '★ 它是 North/South 卸载部件，**不是**托盘的主机 CPU——那是旁边另一个盒子。',
  },
]

// ─────────────────────────── 连接 ───────────────────────────

export const GROQ3_LPX_CONNECTIONS: Connection[] = [
  // ── nvlink 平面（UI 上显示为「C2C scale-up」，见 lib/planeLabel.ts） ──
  {
    id: 'con.lpx.lpu-lpu-c2c',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.lp30',
    toAssemblyId: 'asm.lpx.fabric-expansion',
    plane: 'nvlink',
    topology: 'all-to-all',
    medium: 'pcb-trace',
    protocol: 'LPU C2C（96 × 112 Gb/s）',
    bandwidth: lpx<number>(
      2.5,
      'TB/s',
      LPX_BLOG,
      'C2C scaling with predictable communication 节，「Each LPU connects through 96 C2C links running at 112 Gbps each, enabling a streamlined LPX scale-up topology with high aggregate I/O bi-directional bandwidth of 2.5 TB/s」',
    ),
    direction: 'bidirectional',
    label: 'LP30 ↔ LP30 / Fabric Expansion（托盘内 C2C 直连）',
    summary:
      '托盘内 8 颗 LP30 之间是**直连**的 chip-to-chip 链路，不经过任何交换芯片；' +
      '每颗 96 条 112 Gb/s 链路，双向聚合 2.5 TB/s。跨托盘的部分经 fabric expansion logic 上到 C2C spine。',
    sourceIds: [LPX_BLOG, LPX_PAGE],
  },
  {
    id: 'con.lpx.fabric-spine',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.fabric-expansion',
    toAssemblyId: 'asm.lpx.c2c-spine',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'copper-backplane',
    protocol: 'LPU C2C（跨托盘）',
    bandwidth: lpx<number>(20, 'TB/s', LPX_BLOG, '表 2「Scale-up bandwidth | 20 TB/s」（每托盘口径）'),
    direction: 'bidirectional',
    label: 'Fabric Expansion → LPU C2C Spine',
    summary:
      '每个托盘 20 TB/s 上到机架 spine，32 托盘合计 640 TB/s。⚠️ 官方只说了「无线缆」与「经背板/spine」，' +
      '**没有公布 spine 的物理介质**（铜还是光），此处按无源背板形态示意。',
    sourceIds: [LPX_BLOG],
  },
  {
    id: 'con.lpx.tray-spine',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.lpu-tray',
    toAssemblyId: 'asm.lpx.c2c-spine',
    plane: 'nvlink',
    topology: 'bus',
    medium: 'copper-backplane',
    protocol: 'LPU C2C（无线缆盲插）',
    bandwidth: lpx<number>(
      640,
      'TB/s',
      LPX_BLOG,
      '表 1「Scale-up bandwidth | 640 TB/s」（机架级口径）',
    ),
    direction: 'bidirectional',
    label: 'LPX 计算托盘 → C2C Spine（机架级 scale-up 域）',
    summary:
      '32 个托盘盲插到 spine 即组成 640 TB/s 的 scale-up 域——**没有交换层**，全部是 LPU 之间的直连链路。' +
      '这是与 Vera Rubin NVL72（72 GPU × 36 颗 NVLink 6 交换芯片 / 260 TB/s）最本质的结构差异。',
    sourceIds: [LPX_BLOG, LPX_PAGE],
  },
  {
    id: 'con.lpx.host-lpu',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.host-cpu',
    toAssemblyId: 'asm.lpx.lp30',
    plane: 'nvlink',
    topology: 'star',
    medium: 'pcb-trace',
    protocol: '主机侧互连（官方未公布）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '主机 CPU ↔ LP30',
    summary:
      '托盘上唯一一颗主机 CPU 面向 8 颗 LP30，并挂最高 128 GB DRAM。' +
      '⚠️ NVIDIA 未公布这颗 CPU 的型号，也未公布它与 LPU 之间走什么互连（PCIe？C2C？官方都没说），此处为示意。',
    sourceIds: [LPX_BLOG],
  },

  // ── scaleout 平面：AFD 配对（LPX 存在的全部理由） ──
  {
    id: 'con.lpx.afd-exchange',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.rack',
    toAssemblyId: 'asm.lpx.afd-peer',
    plane: 'scaleout',
    topology: 'point-to-point',
    medium: 'optical-fiber',
    protocol: 'AFD 中间激活交换（NVIDIA Dynamo 编排）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'LPX 机架 ↔ Vera Rubin NVL72（AFD decode 循环）',
    summary:
      '★ 这条线就是 LPX 的存在理由：decode 每出一个 token，GPU 先在累积的 KV cache 上算完 attention，' +
      '把中间激活交给 LPU 跑 FFN/MoE，结果再回到 GPU 继续生成——官方称之为 attention–FFN 分离（AFD），' +
      '由 NVIDIA Dynamo 做 KV-aware 路由与编排。' +
      '⚠️ NVIDIA 未公布这条链路的物理介质、端口数与带宽（只说「high-speed connections… reduce latency to near zero」），' +
      '此处按 POD 内跨机架惯例示意。',
    sourceIds: [LPX_BLOG, LPX_PAGE, GTC26_PRESS],
  },

  // ── business 平面 ──
  {
    id: 'con.lpx.bf4-converged',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.bf4-dpu',
    toAssemblyId: 'asm.lpx.converged-switch',
    plane: 'business',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'InfiniBand 或以太网（North/South）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'BlueField-4 → 汇聚交换机',
    summary:
      '每托盘 1 张 BlueField-4 承载存储与业务流量。⚠️ NVIDIA 未公布 LPX 侧 BF-4 的端口配置与上联速率' +
      '（Vera Rubin 那一代 DGX 规格表给了双口 400 Gb/s，LPX 没有对应文档）。',
    sourceIds: [LPX_BLOG],
  },
  {
    id: 'con.lpx.converged-storage',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.converged-switch',
    toAssemblyId: 'asm.lpx.storage',
    plane: 'business',
    topology: 'fat-tree',
    medium: 'optical-fiber',
    protocol: '存储 fabric',
    bandwidth: null,
    direction: 'bidirectional',
    label: '汇聚交换机 ↔ 外部存储',
    summary: '模型权重与编译产物的进出路径。LPX 尚无官方存储带宽目标值。',
    sourceIds: [LPX_PAGE],
  },

  // ── mgmt 平面 ──
  {
    id: 'con.lpx.tray-bmc-mgmt',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.lpu-tray',
    toAssemblyId: 'asm.lpx.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish（BMC）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'LPX 计算托盘 BMC → 机架管理交换机',
    summary: '带外管理沿用前几代形态；NVIDIA 尚未发布 LPX 的管理网参考设计，速率未公布。',
    sourceIds: [LPX_BLOG],
  },
  {
    id: 'con.lpx.bf4-oob',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.bf4-dpu',
    toAssemblyId: 'asm.lpx.inrack-mgmt-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'dac-cable',
    protocol: 'Ethernet / Redfish（DPU BMC）',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'BlueField-4 板载管理 → 机架管理交换机',
    summary: 'DPU 独立于主机的管理通道；BF-4 的带外口速率官方未公布。',
    sourceIds: [LPX_BLOG],
  },
  {
    id: 'con.lpx.inrack-oob-uplink',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.inrack-mgmt-switch',
    toAssemblyId: 'asm.lpx.oob-fabric-switch',
    plane: 'mgmt',
    topology: 'star',
    medium: 'optical-fiber',
    protocol: 'Ethernet（OOB 上联）',
    bandwidth: null,
    direction: 'bidirectional',
    label: '机架管理交换机 → 带外管理汇聚',
    summary: '机架内管理交换机上联到集群统一的带外管理平面。',
    sourceIds: [LPX_BLOG],
  },

  // ── power 平面 ──
  {
    id: 'con.lpx.facility-power-shelf',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.facility-power',
    toAssemblyId: 'asm.lpx.power-shelf',
    plane: 'power',
    topology: 'bus',
    medium: 'ac-feed',
    protocol: '机房交流配电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '机房配电 → 供电层',
    summary:
      '⚠️ NVIDIA 未公布 LPX 的整机架功率——官方给的全是相对能效倍数（35× TPS/MW、10× 收入/瓦）。' +
      '机房侧容量必须按实际配置与 OEM 确认。',
    sourceIds: [LPX_PAGE],
  },
  {
    id: 'con.lpx.power-shelf-busbar',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.power-shelf',
    toAssemblyId: 'asm.lpx.busbar',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排',
    bandwidth: null,
    direction: 'unidirectional',
    label: '供电层 → 直流母排',
    summary: '沿用 MGX 机架的母排取电形态；LPX 侧的电源架数量与功率官方未公布。',
    sourceIds: [LPX_PAGE],
  },
  {
    id: 'con.lpx.busbar-tray',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.busbar',
    toAssemblyId: 'asm.lpx.lpu-tray',
    plane: 'power',
    topology: 'bus',
    medium: 'busbar',
    protocol: '直流母排取电',
    bandwidth: null,
    direction: 'unidirectional',
    label: '母排 → LPX 计算托盘',
    summary: '托盘盲插即取电，无独立电源线（无线缆设计的一部分）。单托盘功耗官方未公布。',
    sourceIds: [LPX_BLOG],
  },

  // ── cooling 平面 ──
  {
    id: 'con.lpx.lpu-cold-plate',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.lp30',
    toAssemblyId: 'asm.lpx.tray-cold-plate',
    plane: 'cooling',
    topology: 'point-to-point',
    medium: 'thermal-contact',
    protocol: '导热界面',
    bandwidth: null,
    direction: 'unidirectional',
    label: 'LP30 → 冷板',
    summary: '官方口径「32 liquid-cooled 1U compute trays」/「Fully liquid cooled」；进液温度要求未公布。',
    sourceIds: [LPX_BLOG, GTC26_PRESS],
  },
  {
    id: 'con.lpx.tray-cold-plate-manifold',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.tray-cold-plate',
    toAssemblyId: 'asm.lpx.manifold',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'LPX 托盘冷板 ↔ 分液歧管',
    summary: '无线缆设计同样体现在流体接口上：托盘推入即完成液冷对接。',
    sourceIds: [LPX_BLOG],
  },
  {
    id: 'con.lpx.manifold-cdu',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.manifold',
    toAssemblyId: 'asm.lpx.cdu',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '二次侧冷却液回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: '分液歧管 ↔ CDU',
    summary: '机架歧管与 CDU 构成二次侧闭环；LPX 的供液温度官方未给出数值。',
    sourceIds: [LPX_BLOG],
  },
  {
    id: 'con.lpx.cdu-facility-water',
    systemId: SYSTEM_ID,
    fromAssemblyId: 'asm.lpx.cdu',
    toAssemblyId: 'asm.lpx.facility-water',
    plane: 'cooling',
    topology: 'loop',
    medium: 'liquid-loop',
    protocol: '一次侧冷却水回路',
    bandwidth: null,
    direction: 'bidirectional',
    label: 'CDU ↔ 机房一次侧水',
    summary: 'CDU 把机架热量换给机房冷冻水系统，完成整条散热链。',
    sourceIds: [LPX_BLOG],
  },
]

// ─────────────────────────── 导览场景 ───────────────────────────

export const GROQ3_LPX_SCENES: ScenePreset[] = [
  {
    id: 'scene.lpx.rack-anatomy',
    systemId: SYSTEM_ID,
    title: 'LPX 机架：32 个托盘、256 颗 LPU、没有交换层',
    narration:
      '① 你应该看到什么：一个 MGX ETL 机架里 32 个 1U 液冷托盘整齐排开——比 Vera Rubin NVL72 的 18 个计算托盘多得多，' +
      '而且**找不到交换托盘**。' +
      '② 谁连谁 + 关键数字：每个托盘 8 颗 LP30，32 × 8 = 256 颗 LPU；' +
      '每颗 500 MB 片上 SRAM（机架合计 128 GB）、150 TB/s 片上带宽（机架合计 40 PB/s）；' +
      'LPU 之间是**直连** C2C——每颗 96 条 112 Gb/s 链路凑 2.5 TB/s，托盘内直连、跨托盘经 C2C spine，机架级 640 TB/s。' +
      '整机架 FP8 算力 315 PFLOPS（官方另给每托盘 9.6 PFLOPS，两条口径不完全闭合，见数字旁的说明）。' +
      '③ 断了会怎样：C2C spine 是这台机器成立的前提——256 颗 LPU 必须像一颗芯片一样被编译器统一调度，' +
      '任何一段链路抖动都会让「确定性低时延」这个卖点失效。',
    lodLevel: 'rack',
    focusAssemblyId: 'asm.lpx.rack',
    planes: ['nvlink', 'power'],
    highlightAssemblyIds: ['asm.lpx.lpu-tray', 'asm.lpx.c2c-spine', 'asm.lpx.lp30'],
    presalesNote:
      '客户最常问的第一个问题是「它和 GPU 机架比谁强」。正确答法是「不比较，它们不做同一件事」——' +
      'LPX 里没有 HBM、没有交换层、也不跑 prefill。它是 AFD 里专吃 decode FFN/MoE 那一段的引擎。' +
      '★ 别忘了说：本工具对 LPX **不出独立产能数字**，因为官方口径就没有「LPX 单独跑」这回事。',
  },
  {
    id: 'scene.lpx.afd-pairing',
    systemId: SYSTEM_ID,
    title: 'AFD：LPX 与 Vera Rubin NVL72 怎么一起出一个 token',
    narration:
      '① 你应该看到什么：画面里有两个机架——左边是 LPX，右边是标着「AFD 对端」的 Vera Rubin NVL72，' +
      '中间那条 scale-out 线就是它们协同的通道。' +
      '② 三段流（NVIDIA Dynamo 做 KV-aware 路由与编排）：' +
      '**第一段 prefill** ——大上下文进来，Dynamo 把它路由到 GPU，由 Vera Rubin NVL72 吃下长上下文并建好 KV cache；' +
      '**第二段 decode 的 attention** ——每出一个 token，GPU 在累积的 KV cache 上算全上下文注意力（吃带宽与容量，GPU 的强项）；' +
      '**第三段 decode 的 FFN/MoE** ——中间激活交给 LPX，256 颗 LPU 用片上 SRAM 把稀疏专家前馈跑完，结果回传 GPU 继续生成。' +
      '这一来一回每个 token 都要走一遍，官方称之为 attention–FFN 分离（AFD）。' +
      '③ 断了会怎样 / 值多少：官方宣称配对后在 **400 TPS/用户** 这个交互度上，' +
      '每兆瓦吞吐最高 **35×**（对比 GB200 NVL72），收入机会最高 10×。' +
      '⚠️ 但「35×」是**配对系统**的数字，且死死绑在 400 TPS/用户 这个前提上——' +
      '低交互度场景里同构 GPU 方案本来就够用，这个倍数不成立。',
    lodLevel: 'cluster',
    focusAssemblyId: 'asm.lpx.facility',
    planes: ['scaleout', 'nvlink'],
    highlightAssemblyIds: ['asm.lpx.rack', 'asm.lpx.afd-peer'],
    presalesNote:
      '这一站是 LPX 全部叙事的落点，三句话讲完：①「GPU 管理解，LPU 管吐字」——prefill 与 decode-attention 在 GPU，' +
      'decode 的 FFN/MoE 在 LPU；②「贵的是交互度不是吞吐」——35× 只在高 TPS/用户 区间成立，要先问客户的目标交互度；' +
      '③「它俩是一套」——LPX 不单独报产能，方案里必须成对出现。' +
      '⚠️ 另外记住 NVIDIA 与 Groq 是非排他技术许可 + 团队加入，不是收购。',
  },
]

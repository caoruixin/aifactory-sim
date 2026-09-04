import type { ComparisonDefinition } from './types'

/**
 * 代际比较定义。
 *
 * ★ 这里**不放 diff 数据**——两个系统之间哪些部件新增/减少/改规格，全部由
 * `lib/compare.ts` 按 `AssemblyNode.roleKey` 自动配对算出来（内容改了，diff 自动跟着变）。
 * 本文件只放两样机器算不出来的东西：
 *   1. `summary`：给老板汇报时的三到五句结论；
 *   2. `rows[].narrative`：某些 roleKey 的自动文案会误导人，用人话覆盖掉。
 *
 * 最常见的误导有两类，凡命中必须写 narrative：
 * - **「未收录」不等于「没有」**：右侧系统没建模某个 roleKey，通常是官方/资料没公布，
 *   不代表那台机器上没这个部件；
 * - **「无变化」不等于「确认没变」**：一侧规格官方未公布时，本项目把它当「未知」而不是
 *   「变化」，于是行会落在「无变化」里——必须说明这是「无法比较」。
 */
export const COMPARISONS: ComparisonDefinition[] = [
  {
    id: 'cmpdef.gb300-to-vera-rubin',
    leftSystemId: 'sys.gb300-nvl72',
    rightSystemId: 'sys.vera-rubin-nvl72',
    title: 'GB300 NVL72 → Vera Rubin NVL72',
    summary: [
      '机架骨架没变：还是 18 个计算托盘 + 9 个交换托盘、每托盘 2 CPU + 4 GPU、每机架 72 张 GPU。想象中的「推倒重来」并没有发生。',
      '真正翻倍的是三条带宽：单卡显存带宽 8 → 22 TB/s（官方称相对 Blackwell 2.8×）、NVLink 每卡 1.8 → 3.6 TB/s、每 GPU 出机架带宽 800 Gb/s → 1.6 Tb/s（网卡从 1 张变 2 张）。',
      '密度变化集中在两处：交换托盘内的交换芯片 2 → 4 颗（每机架 18 → 36 颗），托盘正面网卡 4 → 8 张（每机架 72 → 144 张）。',
      '显存容量**没有**变化：单卡都是 288 GB。「装得下多大模型」是同一量级，快的是吐 token 的速度。',
      '⚠️ 口径纪律：Vera Rubin 的官方规格表明确标注「Preliminary information」，且**整机架功率至今未公布**——本工具因此拒绝给它算 tokens/W。',
    ],
    rows: [
      {
        roleKey: 'accelerator',
        label: '加速器（GPU）',
        narrative:
          '288 GB HBM3e → 288 GB HBM4：容量不变、带宽 8 → 22 TB/s。稠密算力 FP4 15 → 35 PFLOPS/卡、FP8 5 → 17.5 PFLOPS/卡（两代都取带「dense」标注的官方值）。两代的单卡 TDP 官方都没公布，因此那一行是「无法比较」而不是「没变」。',
      },
      {
        roleKey: 'nvswitch-asic',
        label: 'NVLink 交换芯片',
        narrative:
          '★ 高风险数字：每托盘从 2 颗变 4 颗，托盘数不变（9 个），所以每机架 18 → 36 颗，scale-up 总带宽 130 → 260 TB/s。注意 GB300 那代「每卡 18 条 NVLink，每颗 NVSwitch 一条」的漂亮对应关系在 Vera Rubin 上**无法验证**——官方没公布每卡链路条数。',
      },
      {
        roleKey: 'scaleout-nic',
        label: 'Scale-out 网卡',
        narrative:
          'ConnectX-8 → ConnectX-9，单口速率都是 800 Gb/s，变的是配比：GPU:NIC 从 1:1 变成 1:2，每 GPU 出机架带宽翻倍到 1.6 Tb/s，每机架网卡 72 → 144 张。',
      },
      {
        roleKey: 'north-south-dpu',
        label: 'North/South DPU',
        narrative:
          'BlueField-3 → BlueField-4：官方给的对比是「2× 网络、6× 算力、3× 内存带宽」，带宽按同一篇技术博客的 Table 5 是 **400 Gb/s → 800 Gb/s**（正好对上那个 2×），算力是 16 核 Arm A78 → 64 核 Arm Neoverse V2。⚠️ v1.5 订正：此前这里写「约 480 Gb/s → 800 Gb/s」，那个 480 出自 GB300 参考架构的「aggregate bandwidth of approximately 480 Gb/s」——说的是**节点南北向汇聚网带宽**，不是 BlueField-3 的芯片规格，两者不同口径不能对比。⚠️ 另有两条官方说法互相冲突：2026-01 技术博客说 BF-4 内含 64 核 Grace，2026-03 发布稿与 POD 博客说它整合 Vera CPU（2 篇 2026-03 材料 vs 1 篇 2026-01）——本项目原样记录不做取舍。',
      },
      {
        roleKey: 'power-shelf',
        label: '供电层',
        narrative:
          '⚠️ 这一行看起来「无变化」，其实是**无法比较**：NVIDIA 没有公布 Vera Rubin 的电源架数量、单架功率与整机架功率。官方唯一说了的是两项能力——动态机架级功率调度与智能功率平滑（削峰）。',
      },
      {
        roleKey: 'os-storage',
        label: '本地系统盘',
        narrative:
          '⚠️ 「未收录」不等于「没有」：NVIDIA 尚未公布 Vera Rubin 计算托盘的本地 NVMe 配置，本项目因此不建模，不代表托盘上没有系统盘。',
      },
      {
        roleKey: 'cache-storage',
        label: '本地缓存盘',
        narrative: '⚠️ 同上，「未收录」不等于「没有」：官方未公布该层配置，本项目不猜。',
      },
      {
        // v1.6 W-A：GB300 侧新增了 L3 对象存储（存储切面建模），VR 侧未建 ⇒ removed 行。
        roleKey: 'object-storage',
        label: 'L3 对象存储（模型货仓）',
        narrative:
          '⚠️ 「未收录」不等于「没有」：这一层本身就是**行业通行架构的建模示意**（两代参考架构都不涉及' +
          '对象存储选型），本项目只在 GB300 与 HGX 两代挂了它用于存储切面教学，Vera Rubin 代未重复建模' +
          '——这一行是建模范围差异，不是产品差异。',
      },
      {
        roleKey: 'control-plane-node',
        label: '控制面管理节点',
        narrative:
          '⚠️ 「未收录」不等于「没有」：GB300 的 12 台管理节点来自其企业参考架构文档，Vera Rubin 目前还没有对应的参考架构，因此本项目不建模——这一行是资料差异，不是产品差异。',
      },
      {
        roleKey: 'nvlink-backplane',
        label: '机架内互连底板',
        narrative:
          '★ 这一行最容易讲反（v1.5 已按官方原文订正）：**两代的机架级 NVLink 同为铜缆形态，代际差异在托盘内部**。' +
          'GB300 是无源铜背板；Vera Rubin 是机架**后部**的模块化铜缆脊柱——官方原话「four modular preintegrated ' +
          'cable cartridges housing 5,000 copper cables over two miles in length」，' +
          '外加托盘**内部**新增的 PCB 中板（官方点名连接的是超级芯片 ↔ 前部网卡仓）。' +
          '真正变了的是**托盘侧免走线**：官方的 cable-free 修饰的是 compute and NVLink switch **trays**，' +
          '不是整台机架——「机架没有线缆了」是错的说法。' +
          '⚠️ 装配提速官方有两版口径：2026-01 材料与 CES 发布稿写「1.5 小时以上 → 约 5 分钟、最高 18×」，' +
          '2026-03 POD 博客写「from nearly two hours to just five minutes—up to 20x」。报数时说明取的是哪一版。',
      },
    ],
    sourceIds: [
      'src.nvidia-nvl72-ra',
      'src.nvidia-gb300-page',
      'src.nvidia-vera-rubin-page',
      'src.nvidia-rubin-pod-blog',
      'src.nvidia-rubin-gpu-blog',
    ],
  },
  {
    id: 'cmpdef.vera-rubin-to-rubin-ultra',
    leftSystemId: 'sys.vera-rubin-nvl72',
    rightSystemId: 'sys.rubin-ultra-nvl576',
    title: 'Vera Rubin NVL72 → Vera Rubin Ultra NVL576',
    summary: [
      '★ 分水岭在于 **NVLink 域跨出了机架**，且这一点 NVIDIA 官方已经证实（2026-03 POD 博客）：8 个 MGX NVL 机架「all in a single 576-GPU NVLink domain with copper and direct optical connections」。⚠️ 官方还**点名了拓扑类别**——「a new two-layer all-to-all NVLink topology」（两层全互连），这一点此前本项目误记为「官方没有点名任何拓扑」。SemiAnalysis 用的「Dragonfly」是分析师自己的归类，与官方措辞**不等价**，讲的时候先说官方词再说分析师词。机架内仍然是铜——铜没有被取代，只是被限制在机架内。',
      '★ 规模阶梯与命名口径：NVIDIA 官方给出三档 Vera Rubin Ultra scale-up 域——NVL72、NVL144（Kyber，单机架）、旗舰 NVL576（本代，8 机架）。Kyber 的定位按官方原话是「the next-generation MGX NVL rack design」（OCP 博客：「the successor to NVIDIA Oberon」）——它是本代机架的**下一代/继任者**，不是与 MGX NVL 并列的另一条产品线（v1.5 订正）。但防混淆的结论不变：Kyber 首发形态是「standalone NVL144 system」单机架，与 8 机架的 NVL576 是同一份三档菜单里的**两档不同产品**，「Kyber」不是 NVL576 机架的代号。另：2025-10 OCP 博客留有编者按「This blog has been updated to reflect a branding change from Vera Rubin NVL144 to Vera Rubin NVL72.」，记录了上一代命名口径的调整（官方只说是 branding change，没给原因）。同一篇 OCP 博客提到 Kyber「到 2027 年将容纳 576 张 Rubin Ultra GPU」——这是 2025 年时点的早期措辞，本项目**推断**它是 2026-03 拆分出 Kyber(NVL144)/NVL576 两条线之前的统称，具体对应关系官方未澄清。',
      '机架内部具体怎么重排（9+18+9 分层、交换托架 9→18 个且高度压到 0.75U）、功率密度跳档（电源架 8×33kW→4×110kW、单卡 TDP 到 1.8–2.6 kW）——这些都只有 SemiAnalysis 一家分析师文章描述，NVIDIA 官方规格表还没出来，**不能当规格数字讲**，只能讲方向。',
      '⚠️ capacityPolicy = analyst-modeled：即便拓扑骨架已官宣，机架内部规格仍主要来自第三方分析师，本工具对这一代**拒绝出任何产能数字**。',
      '⚠️ 反常识留痕：分析师表格里 Rubin Ultra 的单封装显存是 192 GB HBM4，**比 Rubin 的 288 GB 还少**（且不是 HBM4e）。原样记录，不做「修正」。',
    ],
    rows: [
      {
        roleKey: 'accelerator',
        label: '加速器（GPU）',
        narrative:
          '⚠️ 左侧是 NVIDIA 官方规格，右侧是分析师预测，两列证据强度不同，不要放在同一张表里当同级数据引用。按该文表格：单封装显存 288 → 192 GB、带宽 22 → 21 TB/s、稠密算力不变（FP4 35 PFLOPS），变的是 TDP（1.8–2.6 kW）与封装（少了 C2C I/O die）。',
      },
      {
        roleKey: 'nvswitch-tray',
        label: 'NVLink 交换托架',
        narrative:
          '★ 本代最大的结构变化：9 个 1U 托盘 → 18 个 0.75U 托盘（代号 Portia），每托架交换芯片 4 → 4 颗但托架数翻倍，每机架交换芯片 36 → 72 颗。多出来的交换容量全部用于跨机架光互连。⚠️ 这一层的具体实现（Portia 代号、0.75U、托架数量）仍是 SemiAnalysis 的分析师推测，官方只证实了「交换容量支持跨机架光互连」这个方向。',
      },
      {
        roleKey: 'power-shelf',
        label: '供电层',
        narrative:
          'Vera Rubin 的供电规格官方未公布（无法比较）；分析师给 Rubin Ultra 的是每机架 4 个 3U/110 kW 电源架（6 × 18.3 kW）。⚠️ 4 × 110 = 440 kW 是算术推论，文中没有给出机架总功率。',
      },
      {
        roleKey: 'scaleup-optics',
        label: 'NPO / CPO 光互连模块',
        narrative:
          '这一层要分两句话讲：**「机架间要走光」是 NVIDIA 官方证实的**（POD 博客「direct optical connections」）；**「NPO 插槽式还是 CPO 共封装」是分析师推测**——NPO 版每颗交换芯片旁 4 个模块，CPO 版是芯片内嵌 4 个不可更换光引擎 + 外置激光源，文中判断 NPO 会先上市。运维含义是故障域变了——CPO 版换不了单个光引擎，但这一点本身也还没有官方规格表验证。',
      },
      {
        roleKey: 'scaleout-nic',
        label: 'Scale-out 网卡',
        narrative:
          '⚠️ 「未收录」不等于「取消」：该 SemiAnalysis 文章只谈 scale-up 网络，全文没有 ConnectX / BlueField / Spectrum-X 的任何内容，因此本项目对 Rubin Ultra 的 scale-out 一律不建模。',
      },
      {
        roleKey: 'north-south-dpu',
        label: 'North/South DPU',
        narrative: '⚠️ 同上：来源文章未涉及 DPU 与 North/South 网络。',
      },
    ],
    sourceIds: [
      'src.nvidia-vera-rubin-page',
      'src.nvidia-rubin-pod-blog',
      'src.nvidia-ocp-vera-rubin-blog',
      'src.semianalysis-nvl576',
    ],
  },
  {
    // v1.3 W3：唯一一条**不是「换代」而是「配对」**的比较定义——左右两边不是前后两代，
    // 而是同一套 AI Factory 里分工不同的两台机器。narrative 的写法因此也不同：
    // 不讲「从 A 变成了 B」，讲「什么时候用哪一台」。
    id: 'cmpdef.vera-rubin-to-groq3-lpx',
    leftSystemId: 'sys.vera-rubin-nvl72',
    rightSystemId: 'sys.groq3-lpx',
    title: 'Vera Rubin NVL72 ↔ Groq 3 LPX（配对，不是换代）',
    summary: [
      '★ 先说最重要的一句：**这两台机器不是「谁取代谁」，是配对使用的**。NVIDIA 对 LPX 的每一条性能宣称都带着「paired with Vera Rubin」这个前提；本工具因此对 LPX 的 capacityPolicy 设为 paired-only，**拒绝给它出独立产能数字**。下面这张表读的是「分工」，不是「升级」。',
      '分工的边界很清楚（官方技术博客原话）：**Rubin GPU 负责 prefill 与 decode 的 attention**（吃长上下文与 KV cache，靠 HBM 容量与带宽），**LPU 负责 decode 的 FFN/MoE**（吃小 batch 下的确定性低时延，靠片上 SRAM）。这个拆法官方叫 attention–FFN 分离（AFD），由 NVIDIA Dynamo 做 KV-aware 路由与编排：每生成一个 token，中间激活在两台机器之间来回一趟。',
      '两种加速器的哲学正好相反：Rubin GPU 单卡 **288 GB HBM4 / 22 TB/s**；LP30 单颗 **500 MB SRAM / 150 TB/s**——容量差约 576 倍，带宽高约 6.8 倍。机架级同样如此：VR 20.7 TB HBM4 @ 1,580 TB/s vs LPX 128 GB SRAM @ 40 PB/s（约 25 倍带宽）。**容量换带宽**就是这笔交易的全部内容，所以 LPX 里的大模型必须按层切到许多颗 LPU 上（官方原话 layer-wise partitioning），不能按「单卡装得下多少」来算。',
      '机架内互连也是两条路线：**Vera Rubin 是交换式**（9 个交换托盘 × 4 颗 NVLink 6 芯片 = 36 颗，260 TB/s）；**LPX 干脆没有交换层**——256 颗 LPU 之间是直连 C2C（每颗 96 条 112 Gb/s 链路），机架级 640 TB/s。少一跳换来的是更可控的时延与抖动，代价是拓扑固定、由编译器静态切分。',
      '⚠️ 口径纪律四条：① 官方对 LPX **没有发过规格表**，所有数字都是产品页/技术博客/发布稿的**厂商宣称**（证据徽章是 vendor_claim，不是 verified_spec）；② 算力两条官方口径不完全闭合（机架 315 PFLOPS vs 每托盘 9.6 PFLOPS，32 × 9.6 = 307.2 ≠ 315），本项目两条并存、不互推；③ **带宽同样不闭合**（v1.5 补上的对称留痕）：机架 40 PB/s vs 单颗 150 TB/s vs 每托盘 1.2 PB/s，而 256 × 150 TB/s = 32 × 1.2 PB/s = 38.4 PB/s ≠ 40，同样并存不互推（对照：128 GB = 256 × 500 MB、640 TB/s = 256 × 2.5 TB/s 这两对确实闭合）；④ 「35× TPS/MW」有**三个前提**——**万亿参数模型**（官方原文 for trillion-parameter models，技术博客给的具体口径是 2-trillion-parameter MoE + 400K 上下文）、**400 TPS/用户** 交互度、对比 **GB200 NVL72**，且是**配对系统**的数字。三个里少说一个就是超范围引用：模型只有几十 B、或交互度不高时，同构 GPU 方案本来就够。',
      '⚠️ 还有一条容易讲错的：NVIDIA 与 Groq 是**非排他技术许可 + 团队加入**（2025-12 Groq 官方新闻室），Groq 仍作为独立公司运营 GroqCloud。不要说成「NVIDIA 收购了 Groq」。',
    ],
    rows: [
      {
        roleKey: 'accelerator',
        label: '加速器（GPU ↔ LPU）',
        narrative:
          '★ 这一行是整张表的核心，但它**不是一次升级**——是两种加速器哲学的对照。左：Rubin GPU，每托盘 4 张、每机架 72 张，288 GB HBM4 / 22 TB/s，跑 prefill 与 decode-attention。右：Groq 3 LP30，每托盘 8 颗、每机架 256 颗，**500 MB 片上 SRAM**（不是 GB，也没有 HBM）/ 150 TB/s / 2.5 TB/s C2C，跑 decode 的 FFN/MoE。⚠️ 自动 diff 会把它标成「数量变化 72 → 256」，那个数字**没有可比性**：一颗 LPU 不等于一张 GPU，别拿它讲「密度提升 3.5 倍」。另外 LPU 走内容模型里的 `kind: "lpu"` 分支，类型层面就不带 GPU 的 roofline 数学参数，产能估算不会误把它当 GPU 用。',
      },
      {
        roleKey: 'nvlink-backplane',
        label: '机架内 scale-up 互连底板',
        narrative:
          '★ 三代演进在这一行看得最清楚，但**变的不是介质**（v1.5 订正：三代的机架脊柱其实都是铜）：GB300 无源铜背板 → Vera Rubin 机架后部铜缆脊柱（4 个线缆匣、约 5,000 根铜缆，仍是交换式 NVLink）→ LPX 的 **LPU C2C Spine（2 个铜缆匣、数千对铜缆，无交换芯片、LPU 之间直连）**。真正变的是两件事：**有没有交换层**（左侧 260 TB/s 要经过 36 颗 NVLink 6 交换芯片，右侧 640 TB/s 一颗都不经过），以及**托盘侧要不要手工走线**（两代新机架的托盘都是 cable-free / cableless）。⚠️ 「无线缆」在两边说的都是**托盘**，不是机架——官方对 LPX 的原话是「connected by a direct chip-to-chip spine, which consists of two copper cable cartridges…over thousands of paired copper cable connections」，此前本项目记作「介质未公布」是漏检。官方没给 LPX 的铜缆根数，本项目不编数。',
      },
      {
        roleKey: 'host-cpu',
        label: '主机 CPU',
        narrative:
          '左：NVIDIA Vera，88 核自研 Olympus，每托盘 2 颗、每机架 36 颗，经 NVLink-C2C 与 GPU 共享内存空间——是这台机器的一等公民。右：**型号官方未公布**，每托盘 1 颗，官方托盘图里只标了「Host CPU」四个字，挂最高 128 GB DRAM。⚠️ 这一行绝大多数规格会落进「无法比较」而不是「变化」——因为右侧根本没有数字。★ 特别提醒：LPX 托盘上的 BlueField-4 **自带 CPU**，但它和这颗主机 CPU 在官方图里是两个并列的盒子，不能拿 BF-4 里那颗去填这一行的空。',
      },
      {
        roleKey: 'north-south-dpu',
        label: 'North/South DPU',
        narrative:
          '唯一一个两边**完全相同**的关键部件：都是 NVIDIA BlueField-4，每托盘 1 张（本内容包直接复用同一个组件定义，因此判为无变化）。数量上左 18 张、右 32 张，只是因为托盘数不同。它也是 LPX 与外界（存储、业务网）唯一的官方通路——官方托盘图里没有出现任何 ConnectX 系列网卡。',
      },
      {
        roleKey: 'compute-tray',
        label: '计算托盘',
        narrative:
          '⚠️ 「未收录」在这里的含义特殊：LPX **有**托盘，只是本项目给它单列了 `lpu-tray` 这个 roleKey（见下一行），没有和 NVLink 域三代的 `compute-tray` 配对。理由是两者不是同一类东西——VR 托盘 = 2 CPU + 4 GPU + 8 网卡 + 1 DPU；LPX 托盘 = 8 加速器 + 1 主机 CPU + 1 扩展逻辑 + 1 DPU，没有 scale-out 网卡。硬配对只会产出一条误导性的「18 → 32」。',
      },
      {
        roleKey: 'lpu-tray',
        label: 'LPX 计算托盘（1U）',
        narrative:
          '★ 右侧独有：32 个 1U 液冷无线缆托盘，每个 8 颗 LP30 + 1 颗主机 CPU + 1 个 fabric expansion logic + 1 张 BlueField-4，单托盘 4 GB SRAM / 1.2 PB/s / FP8 9.6 PFLOPS / 20 TB/s scale-up。1U 塞得下 8 颗加速器，是因为既没有 HBM 也没有 800 W 级的芯片。对照左侧的 18 个计算托盘 + 9 个交换托盘。',
      },
      {
        roleKey: 'nvswitch-tray',
        label: 'NVLink 交换托盘',
        narrative:
          '★ 这条「未收录」是**真的没有**，不是资料缺失：LPX 架构里不存在交换层，256 颗 LPU 之间是直连 C2C。这是本表最能说明「两条不同技术路线」的一行——左侧 9 个交换托盘是 NVLink 域成立的物理前提，右侧把这一层整个取消了。',
      },
      {
        roleKey: 'nvswitch-asic',
        label: 'NVLink 交换芯片',
        narrative:
          '★ 同上，这也是**真的没有**：LPX 架构里不存在交换芯片这个部件。左侧每机架 36 颗，右侧 0 颗——不是没建模，是架构里就没有。',
      },
      {
        roleKey: 'gpu-hbm',
        label: 'HBM 显存堆栈',
        narrative:
          '★ 又一条「真的没有」：LP30 不带 HBM，工作集全在 500 MB 片上 SRAM 里，机架级 DRAM（12 TB DDR5）挂在托盘的 fabric expansion logic 与主机 CPU 上，属于第二层容量而不是 decode 主路径。客户问「LPX 能装多大模型」时，答案不能按显存算，要按「切到多少颗 LPU 上」算。',
      },
      {
        roleKey: 'scaleout-nic',
        label: 'Scale-out 网卡',
        narrative:
          '⚠️ 「未收录」不等于「没有」：NVIDIA 的 LPX 托盘图里只画了 BlueField-4 与「backplane and front-panel connections」，没有出现 ConnectX 系列，官方正文也没提 scale-out 网卡。本项目因此不建模——这是资料缺口，不是产品结论。',
      },
      {
        roleKey: 'fabric-expansion',
        label: 'Fabric Expansion Logic',
        narrative:
          '★ 右侧独有：托盘上的扩展逻辑，一边把 8 颗 LP30 的 C2C 链路引到背板与前面板（跨托盘、跨机架），一边挂最高 256 GB DRAM。它是 LPX**托盘**无线缆（cableless）设计能成立的关键件，作用位置约等于 Vera Rubin 那边的 PCB 中板接口层（⚠️ 机架后部的 C2C spine 本身是 2 个铜缆匣、数千对铜缆，不是「无线缆机架」）。⚠️ 官方只给了功能描述，没有公布它是 ASIC、FPGA 还是交换芯片。',
      },
      {
        roleKey: 'afd-peer-rack',
        label: 'AFD 对端机架（示意）',
        narrative:
          '★ 右侧独有，而且它指的**就是左侧这台机器**：LPX 场景里画出配对的 Vera Rubin NVL72，是为了提醒「LPX 从来不是单独部署的」。这个节点没有自己的规格，真正的建模在 sys.vera-rubin-nvl72 代际里。',
      },
      {
        roleKey: 'power-shelf',
        label: '供电层',
        narrative:
          '⚠️ 这一行两边**都是空的**：Vera Rubin 的电源架数量与整机架功率官方未公布，LPX 更彻底——官方给的能效口径全是相对值（35× TPS/MW、10× 收入/瓦），一个绝对功率数字都没有。因此「无变化」在这里的真实含义是「两边都无法比较」。客户做配电规划时，这两代都必须向 NVIDIA/OEM 单独确认。',
      },
      {
        roleKey: 'rack',
        label: '机架',
        narrative:
          '左：第三代 MGX 单宽液冷机架（约 1.8 吨，45°C 液冷）。右：MGX ETL 机架，全液冷，容纳 32 个 1U 托盘。官方特别强调两者共用同一套 MGX 基础设施，让「token factory 只规划一种通用机架」——这是配对部署在机房侧最实在的好处。⚠️ LPX 的机架重量、U 高与进液温度官方都没公布。另注：官方产品页同一张卡片里 ETL / ELT 两种拼写都出现过，对外建议直接说「MGX 机架」。',
      },
      {
        roleKey: 'scaleout-leaf',
        label: 'Leaf 交换层（计算网）',
        narrative:
          '⚠️ 「未收录」不等于「没有」：LPX 没有官方参考架构，NVIDIA 未说明它的 scale-out 接入方案。本项目只建模了官方明确画出的部分（BlueField-4 的 North/South 通路，以及与 NVL72 之间的 AFD 交换）。',
      },
      {
        roleKey: 'scaleout-spine',
        label: 'Spine 交换层（计算网）',
        narrative: '⚠️ 同上：LPX 侧的 scale-out 主干官方未公布，本项目不猜。',
      },
      {
        roleKey: 'nic-mezzanine',
        label: '网卡夹层板',
        narrative: '⚠️ 「未收录」不等于「没有」：LPX 托盘的前面板连接形态官方未细化到板级，本项目不建模。',
      },
      {
        roleKey: 'nvswitch-cold-plate',
        label: '交换托盘冷板',
        narrative: '★ 随交换托盘一起消失：LPX 没有交换托盘，自然也没有它的冷板。托盘冷板本身两边都有（cold-plate 行）。',
      },
    ],
    sourceIds: [
      'src.nvidia-lpx-page',
      'src.nvidia-lpx-blog',
      'src.nvidia-vera-rubin-gtc26-press',
      'src.groq-nvidia-licensing',
      'src.nvidia-vera-rubin-page',
      'src.nvidia-rubin-pod-blog',
    ],
  },
  {
    id: 'cmpdef.gb300-to-rubin-ultra',
    leftSystemId: 'sys.gb300-nvl72',
    rightSystemId: 'sys.rubin-ultra-nvl576',
    title: 'GB300 NVL72 → Vera Rubin Ultra NVL576（跨两代）',
    summary: [
      '跨两代看，「一台机器」的边界从 72 张 GPU 扩到 576 张：GB300 的 8 个机架是 8 个独立 NVLink 域，NVL576 的 8 个机架是**一个**域——这一点已由 NVIDIA 官方证实（2026-03 POD 博客），不再只是分析师推测。',
      '供电密度是最直观的对比：8 × 33 kW（264 kW 供电能力，服务最高 142 kW 负载）→ 4 × 110 kW；单个电源模块 5.5 → 18.3 kW；单卡 TDP 从官方未公布（B300）到分析师预期的 1.8–2.6 kW。⚠️ 右侧这组数字仍全部来自 SemiAnalysis，官方没有公布 NVL576 的功率规格表。',
      '交换层从 9 托盘 × 2 芯片（18 颗）变成 18 托架 × 4 芯片（72 颗），四倍于 GB300——这一层的具体托架/芯片数仍是分析师推测。',
      '⚠️ 证据强度按行拆开看：拓扑骨架（8 机架合一域、机架内铜/机架间光）已经官宣，但绝大多数具体规格（功率、托架层数、连接器型号）仍全部来自第三方分析师文章。这张对比能用来讲趋势与骨架，不能拿具体数字做方案。',
    ],
    rows: [
      {
        roleKey: 'accelerator',
        label: '加速器（GPU）',
        narrative:
          'B300（官方 288 GB / 8 TB/s / FP4 稠密 15 PFLOPS）→ Rubin Ultra（分析师预测 192 GB / 21 TB/s / FP4 稠密 35 PFLOPS）。左官方、右预测，不同级证据。',
      },
      {
        roleKey: 'power-shelf',
        label: '供电层',
        narrative:
          '8 个 33 kW 电源架（每架 6 × 5.5 kW）→ 4 个 110 kW 电源架（每架 6 × 18.3 kW）。这是整份对比里最能说明「机房要重新设计」的一行。',
      },
      {
        roleKey: 'scaleup-optics',
        label: 'NPO / CPO 光互连模块',
        narrative: '★ GB300 时代 NVLink 出不了机架；这一层的出现意味着 scale-up 域第一次跨机架。',
      },
      {
        roleKey: 'scaleout-nic',
        label: 'Scale-out 网卡',
        narrative: '⚠️ 「未收录」不等于「取消」：来源文章只谈 scale-up，未涉及 scale-out 网络。',
      },
      {
        // v1.6 W-A：GB300 侧新增的 L3 对象存储（存储切面建模），NVL576 侧未建 ⇒ removed 行。
        roleKey: 'object-storage',
        label: 'L3 对象存储（模型货仓）',
        narrative:
          '⚠️ 「未收录」不等于「没有」：这一层是**行业通行架构的建模示意**（存储切面教学用，' +
          '只在 GB300 与 HGX 两代建模），NVL576 的来源文章只谈 scale-up 网络，更不涉及存储选型' +
          '——这一行是建模范围差异，不是产品差异。',
      },
    ],
    sourceIds: [
      'src.nvidia-nvl72-ra',
      'src.nvidia-gb300-page',
      'src.nvidia-rubin-pod-blog',
      'src.semianalysis-nvl576',
    ],
  },
  {
    /**
     * v1.4 W-C：这一条**不是换代比较**，是**同代同芯片的两种域架构比较**。
     *
     * 左右两侧用的是同一颗 Blackwell Ultra，同一年在售，都是 shipping。
     * 变量只有一个：NVLink 域做到 72 卡（机架级）还是 8 卡（服务器级）。
     * 因此这张表里那一大排 `removed` 全部来自「机架级机器 → 普通服务器」这一个原因，
     * 每一条都写了 narrative——否则会被读成「HGX 是个缩水版」，那是彻底的误读。
     */
    id: 'cmpdef.gb300-to-hgx-b300',
    leftSystemId: 'sys.gb300-nvl72',
    rightSystemId: 'sys.hgx-b300',
    title: 'GB300 NVL72 → HGX B300（同一颗 B300，两种 NVLink 域）',
    summary: [
      '★ 唯一的变量是**域有多大**：72 卡机架域 vs 8 卡服务器域。每卡 NVLink 带宽两边**完全相同**（1.8 TB/s），' +
        '变的不是链路速度，是「这条链路通到多少张卡」——机架级 130 TB/s vs 服务器级 14.4 TB/s，' +
        '比值 9 : 1 正好等于 72 : 8。',
      '★ 结构上这是「机架级机器 → 普通服务器」：计算托盘 / 交换托盘 / NVLink 铜背板 / 直流母排 / 电源架 / ' +
        '分液歧管 / 冷板 / CDU / 一次侧水路**全部消失**，换成 4 台 8–10U 风冷整机 + A/B 双路 PDU + 机房空调。' +
        'NVSwitch 没有消失，它从机架的交换托盘搬进了服务器的 HGX 基板。',
      '★ 同一颗芯片，两个平台的**官方规格不同**：数据手册按平台分列——GB300 NVL72 是 279 GB / 8 TB/s / ' +
        'FP4 稠密 15 PFLOPS / TDP 最高 1,400 W，HGX B300 是 270 GB / 7.7 TB/s / FP4 稠密 14 PFLOPS / ' +
        'TDP 最高 1,100 W。差的那约 7% 算力就是「不做液冷改造」的价格。',
      '★ HGX 家族沿革（H200 → B200 → B300，RA Table 1 三代同表并列）：每 GPU 显存 141 → 180 → 288 GB ' +
        'HBM3e，带宽 4.8 → 8 → 8 TB/s。带宽跳变在 H200→B200，容量跳变在 B200→B300——' +
        '从 B200 升 B300 买的是「更大的模型/上下文装进单域」，不是「同模型跑得更快」。' +
        'H200/B200 不单独建系统，世代对照落在 HGX 基板组件的 specs 里' +
        '（generationalMemoryPerGpu / generationalBandwidthPerGpu）。',
      '★ 对 MoE 与长上下文推理的含义：万亿参数 MoE 的专家并行、长上下文的张量并行一旦跨出 8 卡，' +
        '每一步 all-to-all / all-reduce 就从 1.8 TB/s 的 NVLink 掉到 800 Gb/s 的以太网（1/18 带宽）。' +
        '反过来，官方自己说单张 B300 SXM 约能装 120B 参数、超出也「will still reside within the same node」' +
        '——≤120B 的推理场景里那 72 卡域是买了用不上的钱，甚至「a compute network may not be necessary」。',
      '⚠️ 口径纪律：HGX 这一代的 `gpuCount` 填的是**每台服务器 8 张**，不是每机架——' +
        'NVIDIA 在三个设计点上都写着「The number of GPU servers per rack depends on available rack power」，' +
        '官方拒绝给出每机架台数。因此本工具对 HGX 出产能数字时，数量输入框直接显示为「服务器台数」' +
        '（v1.4 QA 返工点：证据标签与外推 caveat 也全部用每台服务器口径），' +
        '且**不出 tokens/W**（单台服务器整机功率同样未公布）。',
      '⚠️ 两个 30×/50× 都是厂商营销口径（对比 Hopper 的 AI 工厂综合产出，各自带不同的负载前提），' +
        '不是算力比，不可直接换算成 token 产能——但「机架域 > 服务器域」这个相对关系是真的。',
    ],
    rows: [
      {
        roleKey: 'accelerator',
        label: '加速器（GPU）',
        narrative:
          '★ **同一颗 Blackwell Ultra，但两侧官方数字不同**，这不是数据错误：Blackwell Ultra 数据手册第 5 页' +
          '按平台分列——GB300 NVL72 列 279 GB / 8 TB/s / FP4 稠密 15 PFLOPS / 最高 1,400 W，' +
          'HGX B300 列 270 GB / 7.7 TB/s / FP4 稠密 14 PFLOPS / 最高 1,100 W。' +
          '原因是功率档位（液冷 vs 风冷）。另外芯片技术博客还有第三个显存数字 288 GB，' +
          '官方脚注已说明「Available SM count and HBM capacity varies by SKU」。' +
          '★ 顺带一提：HGX 这一侧是本项目**第一个有官方单卡 TDP 的加速器**（前四代官方都没给）。',
      },
      {
        roleKey: 'nvswitch-asic',
        label: 'NVLink 交换芯片',
        narrative:
          '★★ 整张表最该看的一行：**同名角色，位置从机架级交换托盘搬进了服务器基板**。' +
          'GB300 是 9 个交换托盘 × 2 颗 = 每机架 18 颗，把 72 张卡连成 130 TB/s 的域；' +
          'HGX 是基板上的板载 NVSwitch，把 8 张卡连成 14.4 TB/s 的域。' +
          '⚠️ HGX 侧的数量是**示意**：RA 只说「a combination of fifth-generation NVSwitch and ' +
          'fifth-generation NVLink」，数据手册用单数「via NVSwitch chip」，官方都没给数量' +
          '（DGX B300 规格表写 2x，但那是 DGX 整机口径）。所以这一行的「数量变化」不要当规格引用。',
      },
      {
        roleKey: 'gpu-server',
        label: 'GPU 服务器（整机）',
        narrative:
          '★ 「新增」在这里的正确读法是**形态回退，不是能力升级**：GB300 那一代根本没有「服务器」这个概念' +
          '——整个机架就是一台机器，18 个计算托盘是它的抽屉。HGX 这一代退回成一台台独立的 8 卡服务器' +
          '（官方口诀 2-8-9-800：2 CPU / 8 GPU / 9 网卡 / 每 GPU 800 Gb/s），每台自成一个 NVLink 域。' +
          '⚠️ 每机架放几台官方**刻意不给**（「depends on available rack power」），' +
          '本项目按「1 机架 = 1 个 4 节点 SU」示意画 4 台，不是规格。',
      },
      {
        roleKey: 'compute-tray',
        label: '计算托盘',
        narrative:
          '★ 「未收录」在这里既不是「官方没公布」也不是「缩水」，而是**这个部件在 HGX 上不存在**：' +
          '计算托盘是「机架即计算机」形态的产物——18 个抽屉共享一个机架级 NVLink 域。' +
          'HGX 的对应物是上一行的 `gpu-server`（整机服务器），两者刻意用不同 roleKey，' +
          '因为把「1U 抽屉」和「10U 整机」配成一行会得出「托盘 18 → 4」这种毫无意义的数量变化。',
      },
      {
        roleKey: 'nvswitch-tray',
        label: 'NVLink 交换托盘',
        narrative:
          '★ 这一行的消失就是本代际的定义特征，`pack.test.ts` 甚至对 nvlink-node-domain 这一族' +
          '**强制禁用** nvswitch-tray 与 nvlink-backplane 两个 roleKey——写进来反而是建模错误。' +
          '交换芯片本身没消失（见 nvswitch-asic 行），消失的是「机架级交换层」这个层次。',
      },
      {
        roleKey: 'nvlink-backplane',
        label: '机架内 scale-up 互连底板',
        narrative:
          '★ 同上，属于「机架级 NVLink 域」的配套物：GB300 用无源铜背板把 18 个计算托盘与 9 个交换托盘' +
          '连成一个域。HGX 的域止步于基板 PCB 走线，机架背部只剩 PDU。' +
          '**切到 NVLink 平面看机架，会发现一条线都没有——这就是这一代最该讲的一张图。**',
      },
      {
        roleKey: 'hgx-baseboard',
        label: 'HGX 基板',
        narrative:
          '★ 「新增」的这一块板，就是「HGX 到底是什么」的答案：NVIDIA 卖给 OEM 的不是整机，' +
          '是 8 颗 B300 SXM + 板载 NVSwitch + 8 张 ConnectX-8 焊在一起的这一块，' +
          '经 8 条 PCIe Gen5 ×16 挂到 OEM 主机板上。' +
          'GB300 NVL72 那一代没有对应物——那一代 NVIDIA 卖的是整个机架。' +
          '★ 售前顺带澄清 HGX vs DGX：DGX B300 是 NVIDIA 用同类基板做的自有整机（固定 10U、' +
          'Intel Xeon 6776P、2 张 BF-3、~14 kW），HGX 是基板方案、整机由 OEM 做成 NVIDIA-Certified System。',
      },
      {
        roleKey: 'host-cpu',
        label: '主机 CPU',
        narrative:
          '★ 这一行的变化比看上去大得多：**Grace（Arm）+ NVLink-C2C → x86 + PCIe Gen5**。' +
          'GB300 每托盘 2 颗 Grace 经 900 GB/s C2C 与 GPU 一致寻址（官方「37 TB 快内存」由此而来）；' +
          'HGX 每台 2 颗 x86，与基板之间只有 PCIe，主机内存与显存是两个独立地址空间。' +
          '**「快内存」话术在 HGX 上一句都不能用。**' +
          '⚠️ HGX 侧型号由 OEM 选型，RA 只给下限（≥48 核/插槽、推荐 56、≥2 TB 内存、≥500 GB/s 带宽、' +
          'balanced PCIe topology）——最后那条最容易被 OEM 配置单踩坑。',
      },
      {
        roleKey: 'scaleout-nic',
        label: 'Scale-out 网卡',
        narrative:
          '★ 同为 ConnectX-8、同为 1:1 GPU:NIC，差别在**装在哪、怎么拆口**：' +
          'GB300 是每托盘 4 张双口 CX-8 装在夹层板上（每机架 72 张）；' +
          'HGX 是每块基板 8 张单口 CX-8 **焊在 GPU 基板上**（官方「integrated onto the NVIDIA HGX B300 baseboard」），' +
          '双平面下把 800 Gb/s 拆成 2×400 Gb/s 接到两张独立 fabric。' +
          '★ 真正的差异不在网卡本身，而在**它承担什么**：GB300 里跨机架流量才走它，' +
          'HGX 里出了 8 卡的一切都走它。',
      },
      {
        roleKey: 'nic-mezzanine',
        label: '网卡夹层板',
        narrative:
          '★ 「未收录」= 这个部件在 HGX 上不存在，不是没公布：网卡直接焊在 HGX 基板上，' +
          '不需要夹层板这一层。参见上一行。',
      },
      {
        roleKey: 'north-south-dpu',
        label: 'North/South DPU',
        narrative:
          '★ 两侧**复用同一个组件定义**（BlueField-3 B3240，双 400 GbE），因此判为无变化——' +
          '这是两代之间少数几个真正没变的部件。' +
          '差别只在数量口径：GB300 每计算托盘 1 张（每机架 18 张），HGX 每台服务器 1 张。' +
          '⚠️ HGX 的 RA 特意加了一条选型提示：推荐 B3240 而不是 HGX H100/H200/B200 上常见的 B3220，' +
          '理由是要为「分布式推理把 KV cache 卸载到高速网络存储」这类未来负载留突发 I/O 余量。' +
          '⚠️ 另注意 DGX B300 是 2 张 BF-3，与 HGX 参考架构的 1 张不同。',
      },
      {
        roleKey: 'gpu-hbm',
        label: 'GPU 显存堆栈',
        narrative:
          '★ 数量看起来都是 8，但证据强度不同：GB300 那一侧的 8 是**视觉示意**（官方未公布堆栈数），' +
          'HGX 这一侧的 8 是**官方数字**——Blackwell Ultra 技术博客写明「Eight 12-Hi stacks, ' +
          '16 × 512-bit controllers (8,192-bit total width)」。' +
          '容量口径两侧不同（288 GB vs 270 GB），原因见 accelerator 行。',
      },
      {
        roleKey: 'power-shelf',
        label: '机架电源架',
        narrative:
          '★ 「未收录」= 不存在：GB300 机架里有 8 个电源架（每架 6 × 5.5 kW PSU）把交流转成直流上母排；' +
          'HGX 是普通服务器形态，每台自带电源，机架里只有 PDU。' +
          '运维含义是正面的——换电源就是换普通服务器电源，不需要学机架级供电那套。',
      },
      {
        roleKey: 'dc-busbar',
        label: '直流母排',
        narrative:
          '★ 「未收录」= 不存在，与上一行同源。GB300 的托盘盲插到母排即取电；' +
          'HGX 服务器插的是普通电源线。' +
          '⚠️ 代价是这一代**没有**机架级功率调度与智能削峰能力（那是 NVL72 / Vera Rubin 那条线在做的事）。',
      },
      {
        roleKey: 'rack-pdu',
        label: '机架 PDU',
        narrative:
          '★ 「新增」的其实是最普通的东西——A/B 双路交流配电插排。' +
          'NVIDIA 对这一层只有一条硬要求：「Rack layout must provide power supply redundancy」，' +
          '型号、路数、容量一概不给，因为整机架功率本身就交还给客户机房了。' +
          '⚠️ 本项目画 2 路是示意，不是规格。',
      },
      {
        roleKey: 'liquid-manifold',
        label: '分液歧管',
        narrative:
          '★ 「未收录」= 不存在：这一代是风冷。官方 RA 原话「industry-leading performance in an ' +
          'air-cooled form factor」，整篇文档里没有 CDU、歧管、冷板或进液温度要求。',
      },
      {
        roleKey: 'cold-plate',
        label: '冷板',
        narrative:
          '★ 「未收录」= 不存在，同为风冷所致。HGX 的对应物是机箱散热器 + 风扇——' +
          '内容包里那条 `con.hgx.gpu-chassis-air`（GPU → 机箱风道）就是它。' +
          '⚠️ 这也解释了两侧 TDP 档位的差别：液冷 1,400 W vs 风冷 1,100 W。',
      },
      {
        roleKey: 'nvswitch-cold-plate',
        label: 'NVSwitch 冷板',
        narrative: '★ 「未收录」= 不存在：板载 NVSwitch 与 GPU 共用机箱风冷，没有专属液冷回路。',
      },
      {
        roleKey: 'cdu',
        label: 'CDU 冷量分配单元',
        narrative:
          '★ 「未收录」= 不存在。这一行与下一行合起来是 HGX 最大的**商务**卖点：' +
          '整条二次侧液冷链路（冷板 → 歧管 → CDU → 机房一次侧水）在这一代全部不需要，' +
          '现有风冷机房大概率不用改造。液冷改造按季度排期，风冷方案按周排期——' +
          '很多单子最后卡在这里，而不是算力。',
      },
      {
        roleKey: 'facility-water-loop',
        label: '机房一次侧冷却水回路',
        narrative:
          '★ 「未收录」= 不存在，同上。HGX 这一侧的对应物是 `room-air-handler`（机房空调），' +
          'cooling 平面只有一段「服务器 → 空调」。',
      },
      {
        roleKey: 'room-air-handler',
        label: '机房空调（CRAH）',
        narrative:
          '★ 「新增」的这一格代表整条散热链：服务器风扇 → 热通道 → 机房空调，完。' +
          '⚠️ NVIDIA 的 HGX 参考架构对机房侧散热**只有一句话**（Abstract 的「air-cooled form factor」），' +
          '没有送风温度、风量与气流组织要求，因此本项目这一层的数量与形态完全是示意，全部规格为 null。' +
          '客户真正要算的「每机架 40–60 kW 风冷散热撑不撑得住」，要交给机电顾问。',
      },
      {
        roleKey: 'inrack-mgmt-switch',
        label: '机架内管理交换机',
        narrative:
          '⚠️ 这一行是**资料差异**，不是产品差异：GB300 参考架构明写每机架 2 台 SN2201；' +
          'HGX 参考架构只描述「SN2201 汇聚全部 BMC/OOB 1 Gb 端口，再经 25/100 Gbps spine 层扩展」' +
          '（32 节点设计点共 4 台，每 2 个 SU 一台），没有把它放进机架。' +
          '本项目因此把 HGX 的 SN2201 建在集群层（`oob-mgmt-switch`），机架内不建——' +
          '「未收录」在这里是如实反映来源，不代表 HGX 机架里没有管理交换机。',
      },
      {
        roleKey: 'control-plane-node',
        label: '控制面管理节点',
        narrative:
          '★ 两侧都有，但数字不同、别记混：GB300 参考架构是 **12 台**（x86 或 Grace 两种配置皆可）；' +
          'HGX 参考架构是 **7 台示例 / 8 台上限**，纯 x86，各配 1 张 BlueField-3 B3220（双 200G）与 4 TB 本地盘。' +
          'HGX 的 7 台拆解是官方明写的：2 台 Base Command Manager（高可用）+ 2 台 Slurm head + ' +
          '3 台 Kubernetes 控制面。这是报价单必须单列的一项。',
      },
      {
        roleKey: 'os-storage',
        label: '本地系统盘',
        narrative:
          '两侧都有 1 块本地启动盘。GB300 侧是 M.2 NVMe；HGX 侧 RA 只写「1 TB NVMe boot drive」，' +
          '未规定形态（M.2 / E1.S / U.2 由 OEM 定），因此这一行的规格差异有一部分是「未公布」而非「不同」。',
      },
      {
        roleKey: 'cache-storage',
        label: '本地缓存 / 数据盘',
        narrative:
          '★ 口径不同，别直接比数量：GB300 是每托盘 4 块 E1.S（参考架构正文口径，Table 10 另写 8 块，' +
          '该冲突已在 GB300 侧留痕）；HGX 是**按 CPU 插槽给容量下限**——推理 ≥1 TB/插槽、' +
          '训练/DL ≥2 TB/插槽、HPC ≥1 TB/插槽，官方没有直接给盘数，本项目按 2 插槽画 2 块。' +
          '★ 需求澄清阶段就要问清「以后要不要训练」：按推理档配完事后加盘意味着停机。',
      },
      {
        roleKey: 'scaleout-leaf',
        label: '计算网 Leaf',
        narrative:
          '★ 两侧都有 leaf，但**在体系里的分量完全不同**：GB300 里 leaf/spine 只管跨机架，' +
          '机架内 72 卡的集合通信走 NVLink；HGX 里出了 8 卡的一切都走 leaf/spine，' +
          '它直接决定多机训练/推理能不能跑。' +
          'HGX 的 32 节点设计点是双平面合计 8 台 leaf + 4 台 spine，每平面 4 台 leaf、' +
          '每台承载 2 条 rail（1+5, 2+6, 3+7, 4+8）。' +
          '⚠️ 型号一栏两侧写法不同（SN5610 vs SN5600）源自官方文档本身：HGX 的 RA 里 Table 5 / ' +
          'appendix Table 9 写 SN5600（128×400 GbE，Spectrum-4），networking-hardware 一节写 SN5610' +
          '（64×800 Gbps）——两者总容量一致，对客户说「Spectrum-4，51.2 Tb/s 那一档」最安全。',
      },
    ],
    sourceIds: [
      'src.nvidia-hgx-ra',
      'src.nvidia-hgx-page',
      'src.nvidia-blackwell-ultra-datasheet',
      'src.nvidia-blackwell-ultra-blog',
      'src.nvidia-dgx-b300-page',
      'src.nvidia-nvl72-ra',
      'src.nvidia-gb300-page',
    ],
  },
]

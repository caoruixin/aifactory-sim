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
          'BlueField-3 → BlueField-4：官方给的对比是「2× 网络、6× 算力、3× 内存带宽」，聚合带宽约 480 Gb/s → 800 Gb/s。⚠️ 两条官方说法互相冲突：技术博客说 BF-4 内含 64 核 Grace，发布稿说它整合 Vera CPU——本项目原样记录不做取舍。',
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
        roleKey: 'control-plane-node',
        label: '控制面管理节点',
        narrative:
          '⚠️ 「未收录」不等于「没有」：GB300 的 12 台管理节点来自其企业参考架构文档，Vera Rubin 目前还没有对应的参考架构，因此本项目不建模——这一行是资料差异，不是产品差异。',
      },
      {
        roleKey: 'nvlink-backplane',
        label: '机架内互连底板',
        narrative:
          '铜背板 → PCB 中板（midplane）+ 无线缆托盘设计。官方称这让装配/维护最快提速 18×，单托盘装配从 1.5 小时降到约 5 分钟。',
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
      '★ 分水岭在于 **NVLink 域跨出了机架**，且这一点 NVIDIA 官方已经证实（2026-03 POD 博客）：8 个 MGX NVL 机架经「direct optical connections」组成单一 576-GPU NVLink 域。机架内仍然是铜背板——铜没有被取代，只是被限制在机架内。这是本代唯一同时有官方与分析师两个独立来源互相佐证的结构事实。',
      '★ 规模阶梯与命名口径：NVIDIA 官方给出三档 Vera Rubin Ultra scale-up 域——NVL72、NVL144（新机型 Kyber，单机架）、旗舰 NVL576（本代，8 机架）。Kyber 与 NVL576 是**并列的两条产品线**，不是同一机架的两种叫法；2025-10 OCP 博客还留有编者按「本文已更新，将品牌从 Vera Rubin NVL144 改为 Vera Rubin NVL72」，记录了上一代命名口径的调整。同一篇 OCP 博客提到 Kyber「到 2027 年将容纳 576 张 Rubin Ultra GPU」——这是 2025 年时点的早期措辞，本项目**推断**它是 2026-03 拆分出 Kyber(NVL144)/NVL576 两条线之前的统称，具体对应关系官方未澄清。',
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
      '⚠️ 口径纪律三条：① 官方对 LPX **没有发过规格表**，所有数字都是产品页/技术博客的**厂商宣称**（证据徽章是 vendor_claim，不是 verified_spec）；② 机架 315 PFLOPS 与每托盘 9.6 PFLOPS 两条官方口径不完全闭合（32 × 9.6 = 307.2 ≠ 315），本项目两条并存、不互推；③ 「35× TPS/MW」是**配对系统**在 **400 TPS/用户** 交互度上对比 GB200 NVL72 的数字——前提拿掉就不成立，低交互度场景用同构 GPU 方案本来就够。',
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
          '★ 三代演进在这一行看得最清楚：GB300 铜背板 → Vera Rubin PCB 中板（无线缆盲插，仍是交换式 NVLink）→ LPX 的 **LPU C2C Spine（无交换芯片，LPU 之间直连）**。左侧 260 TB/s 要经过 36 颗 NVLink 6 交换芯片；右侧 640 TB/s 一颗交换芯片都不经过。⚠️ 官方只说了 LPX「无线缆」「经背板/spine 连接」，**没有公布 spine 的物理介质**（铜还是光），3D 里的形态是示意。',
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
          '★ 右侧独有：托盘上的扩展逻辑，一边把 8 颗 LP30 的 C2C 链路引到背板与前面板（跨托盘、跨机架），一边挂最高 256 GB DRAM。它是 LPX「无线缆机架」能成立的关键件，作用位置约等于 Vera Rubin 那边的 PCB 中板接口层。⚠️ 官方只给了功能描述，没有公布它是 ASIC、FPGA 还是交换芯片。',
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
    ],
    sourceIds: [
      'src.nvidia-nvl72-ra',
      'src.nvidia-gb300-page',
      'src.nvidia-rubin-pod-blog',
      'src.semianalysis-nvl576',
    ],
  },
]

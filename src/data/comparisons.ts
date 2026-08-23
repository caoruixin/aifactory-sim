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

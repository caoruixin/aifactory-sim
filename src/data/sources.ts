import type { SourceRef } from './types'

/**
 * 全部数据源登记处。每条 Claim 的 sourceId 必须落在这里（pack.test.ts 强制）。
 *
 * 证据分级纪律（测试强制，见 pack.test.ts / content.test.ts）：
 * - `verified_spec` / `vendor_claim` 只能引用 `official_doc` / `official_press`。
 * - **非官方来源分两档，纪律强度不同**（v1.5 订正：此前这段注释把两档写成一档，
 *   与 `BROKER_SOURCE_IDS` 的实际内容和 `rubin-ultra-nvl576.ts` 的设计相矛盾，
 *   照旧注释「修 bug」会把 NVL576 整代内容改坏）：
 *   ① **券商/业绩会档**（`BROKER_SOURCE_IDS`：Marvell / GS / JPM）——禁止出现在任何
 *      `countClaim` 或组件 `specs` 里，只能做背景叙述（`management_guidance` 等）。
 *   ② **分析师研究档**（SemiAnalysis，`src.semianalysis-nvl576`）——**可以**进
 *      `countClaim` 与组件 `specs`，但恒为 `evidence: 'analyst_estimate' | 'forecast'`
 *      + `status: 'forecast'` + `locator` 必带页码（`content.test.ts` 的「SemiAnalysis
 *      专项证据纪律」四重锁）。**禁止**进入 `GpuMathSpecs` 与 `lib/capacity.ts` 的产能估算
 *      （该代际 `capacityPolicy: 'analyst-modeled'` 直接拒绝出数）。
 *      之所以留这条口子：NVL576 目前只有分析师文章描述机架内部结构，一刀切禁掉等于
 *      整代无法建模；而 forecast 口径 + 页码 locator 已经让读者看得出「这不是官方规格」。
 */
export const SOURCES: SourceRef[] = [
  {
    id: 'src.nvidia-nvl72-ra',
    title: 'NVIDIA GB300 NVL72 Enterprise Reference Architecture',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html',
    localFile: null,
    asOf: '2026-08',
    note:
      'GB300 部件清单/数量/网络拓扑/供电的母版来源。抓取于 2026-08，含 abstract、overview、components、' +
      'networking-hardware、networking-physical-topologies、network-logical-architecture、' +
      'appendix-node-configurations 等页。核心口径：**2-4-5-800**（Overview 首句原文「The NVIDIA ' +
      'Enterprise RA using 2-4-5-800 (dual plane) node architecture with NVIDIA GB300 NVL72 and ' +
      'NVIDIA Spectrum-X Networking offers a fully integrated, rack-scale solution optimized for the ' +
      'most demanding AI workloads.」——即 2 CPU / 4 GPU / 5 网卡（4 张 ConnectX-8 + 1 张 BlueField-3）/ ' +
      '每 GPU 800 Gb/s，与 HGX RA 的 2-8-9-800 正好是同一套记法的两代对照）。' +
      '⚠️ 已发现四处该文档自身的内部不一致，引用时须留痕：' +
      '① 每托盘 HBM：components Table 1 写「1,152 GB aggregated HBM3」，appendix Table 10 写' +
      '「720 GB of aggregated HBM3」（另：两处写的都是 HBM3，不是 HBM3e）；' +
      '② 每托盘 E1.S：components 正文写「4 E1.S NVMe storage devices」，Table 10 写「8 x 4 TB E1.S」；' +
      '③ **交换机型号**：network-logical-architecture Table 5 与 appendix Table 11 写 SN5600' +
      '（Table 5「NVIDIA SN5600 128-port 400 Gb/s switches」），networking-hardware 一节写 SN5610' +
      '（「The NVIDIA SN5610 switch both offer 64 total ports of 800 Gbps」）——同一份文档两种写法并存，' +
      '本项目取 SN5610 作主值（理由见 cmp.gb300.sn5610 的 note），但两种写法都在数据里留痕；' +
      '④ 双平面的负载均衡由谁做：networking-physical-topologies 同一页里，Multi-Plane Topology ' +
      'Approach 一节写「the resiliency and the load balancing between the two planes is handled by ' +
      'the NCCL on the host」，Dual Plane Topology 一节写「Tracking of each plane, load balancing, ' +
      'and failure handling is handled by the ConnectX-8 SuperNIC on the hardware level」——主机软件与' +
      '网卡硬件两说并存（HGX RA 同一页有完全相同的两说）。' +
      '★ 另需注意本文档**不涉及**的范围：全篇零出现 CDU / manifold / cold plate / coolant / ' +
      'quick disconnect / Oberon，液冷只写到「the GB300 NVL72 rack is liquid cooled, based on the ' +
      'MGX architecture」与「Integrated tray-level and rack-level liquid leakage detection」两句。',
  },
  {
    id: 'src.nvidia-gb300-page',
    title: 'NVIDIA GB300 NVL72 产品页规格表',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/gb300-nvl72/',
    localFile: null,
    asOf: '2026-08',
    note: '系统级规格：GPU/CPU 数量、20TB 显存、576TB/s 带宽、130TB/s NVLink、FP4 1440(稀疏)/1080(稠密) PFLOPS。脚注 1 声明「除特别说明外所有 Tensor Core 规格均含稀疏」。',
  },
  {
    id: 'src.nvidia-rubin-press',
    title: 'NVIDIA Kicks Off the Next Generation of AI With Rubin（Rubin 平台发布稿）',
    publisher: 'NVIDIA Newsroom',
    kind: 'official_press',
    url: 'https://nvidianews.nvidia.com/news/rubin-platform-ai-supercomputer',
    localFile: null,
    asOf: '2026-01',
    note: 'CES 2026 发布稿（另有同内容 PDF：nvidianews.nvidia.com/_gallery/download_pdf/695c39b23d633240d175d8e6/）。给出「72 Rubin GPU + 36 Vera CPU + NVLink 6 + ConnectX-9 + BlueField-4」的官方组合口径与「full production / 2026 下半年上市」。',
  },
  {
    id: 'src.nvidia-vera-rubin-page',
    title: 'NVIDIA Vera Rubin NVL72 产品页规格表',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/',
    localFile: null,
    asOf: '2026-08',
    note: '⚠️ 规格表脚注 1：「Preliminary information. All values are up to and subject to change.」脚注 2：「Dense specification.」——本项目只取带脚注 2 的稠密值进产能数学，NVFP4 Inference 一列未标稠密口径，不用于计算。',
  },
  {
    id: 'src.nvidia-rubin-pod-blog',
    title: 'NVIDIA Vera Rubin POD: Seven Chips, Five Rack-Scale Systems, One AI Supercomputer',
    publisher: 'NVIDIA Developer Blog',
    kind: 'official_doc',
    url: 'https://developer.nvidia.com/blog/nvidia-vera-rubin-pod-seven-chips-five-rack-scale-systems-one-ai-supercomputer/',
    localFile: null,
    asOf: '2026-03',
    note:
      'NVIDIA 官方技术博客。机架级结构的唯一官方出处：18 计算托盘 + 9 NVLink 交换托盘、每托盘 2 个 Vera Rubin ' +
      '超级芯片 + 8 ConnectX-9 + 1 BlueField-4，以及「Rubin Ultra NVL576 = 8 个 MGX NVL 机架 × 72 GPU」的官方拓扑口径。' +
      '★ v1.5 逐字复核后新增三条关键留痕（此前应用把前两条讲反了）：' +
      '① **机架级 NVLink 走后部铜缆脊柱**——「This high-speed data transfer happens in the NVLink spine at the ' +
      'back of the rack, which features four modular preintegrated cable cartridges housing 5,000 copper cables ' +
      'over two miles in length.」；通用形态另有「The rack features a highly modular spine as its backplane, ' +
      'consisting of up to four preintegrated and prevalidated copper cable cartridges that connect each tray as one.」' +
      '② **「cable-free」修饰的是托盘、不是机架**——「The compute trays inside the Vera Rubin NVL72 are completely ' +
      'redesigned from NVIDIA Blackwell. It features a robust PCB midplane designed to fit in a single-wide rack ' +
      'that unlocks a cable-free, hose-free, and fanless design.」；**PCB 中板连的是超级芯片 ↔ 前部网卡仓**——' +
      '「The superchips are connected to the front modular bays that house eight ConnectX-9 SuperNICs and one ' +
      'BlueField-4 DPU through the PCB midplane.」官方**没有**说明这 5,000 根铜缆与 PCB 中板在电气上如何分工，' +
      '也没说中板完全不参与 NVLink——两句都要如实呈现，不得用一句否定另一句。' +
      '③ **LPX 的 C2C spine 物理介质官方已公布**——「…connected by a direct chip-to-chip spine, which consists of ' +
      'two copper cable cartridges that create an intricate point-to-point topology over thousands of paired copper ' +
      'cable connections.」' +
      '④ **NVL576 拓扑官方已命名**——「NVIDIA Vera Rubin Ultra introduces a new two-layer all-to-all NVLink topology ' +
      'that will enable developers to scale-up to 576 GPUs.」（导语同口径：「with a two-layer all-to-all NVLink ' +
      'topology across eight racks」）；Kyber 的定位是「NVIDIA Kyber is the next-generation MGX NVL rack design ' +
      'that will double the NVLink domain per rack to fit 144 GPUs.」' +
      '⑤ 装配时间在本文更新为「This simplification drops compute tray assembly time from nearly two hours to just ' +
      'five minutes—up to 20x faster assembly and serviceability.」（2026-01 六芯片博客与数据手册写的是 18×，两版并存）。',
  },
  {
    id: 'src.nvidia-rubin-chips-blog',
    title: 'Inside the NVIDIA Vera Rubin Platform: Six New Chips, One AI Supercomputer',
    publisher: 'NVIDIA Developer Blog',
    kind: 'official_doc',
    url: 'https://developer.nvidia.com/blog/inside-the-nvidia-rubin-platform-six-new-chips-one-ai-supercomputer/',
    localFile: null,
    asOf: '2026-01',
    note: 'NVIDIA 官方技术博客。交换托盘 4 颗 NVLink 6 交换芯片、单托盘 28.8 TB/s、ConnectX-9 单口 800 Gb/s、BlueField-4 细节。⚠️ 该文称 BlueField-4 内含 64 核 Grace，2026-03 发布稿则称其整合 Vera CPU——两条官方说法互相冲突，已在组件 note 中留痕。',
  },
  {
    id: 'src.nvidia-rubin-gpu-blog',
    title: 'Inside NVIDIA Rubin GPU Architecture: Powering the Era of Agentic AI',
    publisher: 'NVIDIA Developer Blog',
    kind: 'official_doc',
    url: 'https://developer.nvidia.com/blog/inside-nvidia-rubin-gpu-architecture-powering-the-era-of-agentic-ai/',
    localFile: null,
    asOf: '2026-07',
    note: 'NVIDIA 官方技术博客。Rubin GPU 芯片级口径：288 GB HBM4 / 22 TB/s、双 die 经 NV-HBI 合封为「一张 GPU」、NVLink 6 每卡 3.6 TB/s、NVLink-C2C 1.8 TB/s、第三代 MGX 机架 45°C 液冷。',
  },
  {
    id: 'src.nvidia-vera-rubin-datasheet',
    title: 'NVIDIA Vera Rubin 数据手册（PDF）',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://dam-cdn.nvd.orangelogic.com/AssetLink/v5rf2icnf86o26e464tf6djn23r8ibhe.pdf',
    localFile: null,
    asOf: '2026-08',
    note:
      '由 Vera Rubin NVL72 产品页「Read the NVIDIA Vera Rubin Datasheet」链接。第 1 页 Key Features 给出 ' +
      '20.7 TB HBM4 / 54 TB LPDDR5X / 75 TB 快内存 / NVLink 域 260 TB/s。' +
      '⚠️ Technical Specifications¹ 表的脚注 1 **比产品页多一句**，逐字为：' +
      '「Preliminary information. All values are up to and subject to change. NVFP4 Inference specification is sparse.」' +
      '——这是「NVFP4 Inference 那一列是稀疏口径」的**官方硬证据**（产品页脚注 1 没有这后半句），' +
      '本项目据此把该列排除在 mathSpecs 与产能数学之外。脚注 2 仍为「Dense specification.」，' +
      '脚注 3「Peak performance using NVIDIA Tensor Core-based emulation algorithms.」',
  },
  {
    id: 'src.nvidia-dgx-rubin-page',
    title: 'NVIDIA DGX Vera Rubin NVL72 产品页规格表',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/dgx-vera-rubin-nvl72/',
    localFile: null,
    asOf: '2026-08',
    note: '⚠️ 同样标注「Preliminary information」。给出机架级网卡数量口径：144 张单口 ConnectX-9（800 Gb/s）、18 张双口 BlueField-4（400 Gb/s）、9 台 L1 NVLink 交换机。',
  },
  {
    id: 'src.nvidia-gtc25-keynote-blog',
    title: 'NVIDIA Keynote at GTC 2025: AI News, Live Updates',
    publisher: 'NVIDIA Blog',
    kind: 'official_doc',
    url: 'https://blogs.nvidia.com/blog/nvidia-keynote-at-gtc-2025-ai-news-live-updates/',
    localFile: null,
    asOf: '2025-03',
    note: 'GTC 2025-03 主题演讲官方直播博客（现场逐句记录）。Rubin Ultra 一节原话：「Systems built on Rubin Ultra, including the Vera Rubin NVL 144, will arrive in the second half of next year. And due for the second half of 2027: systems built on Rubin Ultra.」——本项目仅取「2027 下半年」这一时间点用作 vendor_claim，note 中必须同时说明 2026 年的官方材料（POD/OCP 博客）已不再给出具体日期。15EF/365TB/600kW 等 2025 现场数字不引入（口径已被后续官方材料替换）。',
  },
  {
    id: 'src.nvidia-ocp-vera-rubin-blog',
    title: 'NVIDIA, Partners Drive Next-Gen Efficient Gigawatt AI Factories in Buildup for Vera Rubin',
    publisher: 'NVIDIA Blog',
    kind: 'official_doc',
    url: 'https://blogs.nvidia.com/blog/gigawatt-ai-factories-ocp-vera-rubin/',
    localFile: null,
    asOf: '2025-10',
    note: 'OCP Global Summit 2025-10 官方博客。含编者按「This blog has been updated to reflect a branding change from Vera Rubin NVL144 to Vera Rubin NVL72.」（NVL144→NVL72 改名的官方留痕）；另称 Kyber「will house a high-density platform of 576 NVIDIA Rubin Ultra GPUs by 2027」——★ 这是 2025-10 时点的早期措辞，与 2026-03 POD 博客把 Kyber（NVL144 单机架）和 NVL576（8×MGX 机架 Dragonfly）分成两个不同产品的口径不完全一致，本项目只作为「命名沿革」背景引用，不据此给 NVL576 建带日期的 Claim。',
  },
  {
    id: 'src.cnbc-kyber-delay',
    title: "Nvidia's next-gen AI rack system delayed to 2028 on manufacturing snags, SemiAnalysis says",
    publisher: 'CNBC',
    kind: 'media_report',
    url: 'https://www.cnbc.com/2026/07/06/nvidia-kyber-rack-system-delays-manufacturing-taiwan-rubin-chips-.html',
    localFile: null,
    asOf: '2026-07',
    note:
      '⚠️ 媒体报道（转引 SemiAnalysis 研究），非 NVIDIA 官方材料。原文「2028」延期指的是 **Kyber NVL144**，' +
      '原因逐字为「Kyber NVL144 rack architecture has been delayed to 2028 as the PCB midplane remains ' +
      'challenging from a manufacturability standpoint」——是**可制造性**（manufacturability），' +
      '原文没有出现 yield / 良率（v1.5 订正：此前本项目写作「良率问题」，属转述失真）。' +
      '对 **NVL576** 原文只说「is also likely delayed or limited to small volumes」——不带具体年份。' +
      '文中 NVIDIA 的表态逐字为「Nvidia rejected the SemiAnalysis report and said, "Our roadmap is intact."」' +
      '——是**驳斥**（rejected）而不是中性「回应」；这仍是媒体转述的官方表态，' +
      '只能以「媒体转述」的身份出现在 Claim 的 note 里，不可当作独立的官方声明引用。',
  },
  {
    id: 'src.nvidia-vera-rubin-fullprod-press',
    title: 'NVIDIA Vera Rubin Ramps Into Full Production to Power Agentic AI Factories Worldwide',
    publisher: 'NVIDIA Newsroom',
    kind: 'official_press',
    url: 'https://nvidianews.nvidia.com/news/vera-rubin-full-production-agentic-ai-factory',
    localFile: null,
    asOf: '2026-05',
    note:
      'GTC Taipei 发布稿（2026-05-31，链接挂在 Vera Rubin NVL72 产品页上）。比 CES 2026-01 发布稿更新更具体的' +
      '上市口径：正文「NVIDIA today announced the NVIDIA Vera Rubin platform is ramping into full production to ' +
      'power agentic AI factories worldwide.」，Availability 一节只有一句「Production shipments of Vera Rubin are ' +
      'set to begin starting this fall.」' +
      '★ 口径要点：「ramping into full production」说的是**制造**已经起量，而**客户出货**是「set to begin ' +
      'starting this fall」——是前瞻性承诺，不是「已开始出货」的事实陈述。本项目因此把系统 status 保持在 ' +
      'announced（详见 sys.vera-rubin-nvl72 的 availability Claim note），并把这条与 CES 发布稿的' +
      '「available from partners the second half of 2026」两版口径一起留痕。' +
      '⚠️ 全篇末尾带 Safe Harbor 前瞻性声明段，因此上市时间只能是 vendor_claim，不是 verified_spec。',
  },
  {
    id: 'src.nvidia-lpx-page',
    title: 'NVIDIA Groq 3 LPX 产品页',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/lpx/',
    localFile: null,
    asOf: '2026-08',
    note: 'LPX 系统级口径的官方产品页：「Each LPX rack features 256 interconnected LPU accelerators」、单 LPU「500 megabytes (MB) of SRAM, 150 terabytes per second (TB/s) of SRAM bandwidth, and 2.5 TB/s scale-up bandwidth」、机架「128 GB of SRAM… 12 TB of DDR5 memory」「40 petabytes per second (PB/s) of SRAM bandwidth per rack」「640 TB/s of scale-up bandwidth」、以及「up to 35x higher throughput per megawatt (MW) for trillion-parameter models」。⚠️ 页面同一张卡片里机架名一处写 MGX ETL（标题）、一处写 MGX ELT（正文），属官方页自身的拼写不一致，本项目取标题的 ETL 并留痕。',
  },
  {
    id: 'src.nvidia-lpx-blog',
    title:
      'Inside NVIDIA Groq 3 LPX: The Low-Latency Inference Accelerator for the NVIDIA Vera Rubin Platform',
    publisher: 'NVIDIA Developer Blog',
    kind: 'official_doc',
    url: 'https://developer.nvidia.com/blog/inside-nvidia-groq-3-lpx-the-low-latency-inference-accelerator-for-the-nvidia-vera-rubin-platform/',
    localFile: null,
    asOf: '2026-03',
    note: 'NVIDIA 官方技术博客（2026-03-16）。LPX 机架/托盘/芯片三级规格的唯一官方出处：表 1 机架级（315 PFLOPS / 128 GB SRAM / 40 PB/s / 256 chips / 640 TB/s）、表 2 每托盘（8 颗 LP30 / 4 GB SRAM / 1.2 PB/s / 9.6 PFLOPS FP8 / 20 TB/s）、「32 liquid-cooled 1U compute trays」「eight LPU accelerators, a host processor, and fabric expansion logic」、LPU「500 MB of high-speed on-chip SRAM」「96 C2C links running at 112 Gbps each… 2.5 TB/s」，以及 AFD（attention–FFN disaggregation）与 Dynamo 编排、「35x higher TPS per megawatt at 400 TPS per user compared with the NVIDIA GB200 NVL72」。⚠️ 机架 315 PFLOPS 与每托盘 9.6 PFLOPS 是表 1/表 2 各自给出的独立口径（32 × 9.6 = 307.2 ≠ 315），官方没有解释差值，本项目两条并存、不互推。',
  },
  {
    id: 'src.nvidia-lpx-fullprod-press',
    title: 'NVIDIA Groq 3 LPX Now in Full Production With World-Class Speed for Agentic AI',
    publisher: 'NVIDIA Newsroom',
    kind: 'official_press',
    url: 'https://nvidianews.nvidia.com/news/nvidia-groq-3-lpx-now-in-full-production-with-world-class-speed-for-agentic-ai',
    localFile: null,
    asOf: '2026-08',
    note:
      'Hot Chips 发布稿（2026-08-24，产品页首屏「Read Press Release」按钮直达）。**取代 GTC 2026-03 的' +
      '「2026 下半年上市」口径**：首句逐字「NVIDIA today announced that NVIDIA Groq 3 LPX, the interactive AI ' +
      'inference accelerator, is now in full production.」' +
      '★ 另两条可用事实：① 云侧落地强度弱于加速器本身——「Nebius, a leading AI cloud, plans to bring NVIDIA ' +
      'Groq 3 LPX to Nebius Token Factory」「Following Nebius, purpose-built AI inference cloud Groq plans to be ' +
      'among the platform\'s earliest adopters.」（都是 plans to，不是 is）；' +
      '② **「许可而非收购」的第二处官方证据**——商标行「Groq and LPU are used under license from Groq, Inc.」' +
      '（第一处是 2025-12 Groq 官方新闻室的非排他许可协议发布稿）。' +
      '⚠️ 全篇末尾带 Safe Harbor 前瞻性声明段。',
  },
  {
    id: 'src.nvidia-lpx-longcontext-blog',
    title:
      'How NVIDIA Groq 3 LPX Unlocks Ultrafast Interactivity at Long Context on NVIDIA Vera Rubin',
    publisher: 'NVIDIA Developer Blog',
    kind: 'official_doc',
    url: 'https://developer.nvidia.com/blog/how-nvidia-groq-3-lpx-unlocks-ultrafast-interactivity-at-long-context-on-nvidia-vera-rubin/',
    localFile: null,
    asOf: '2026-08',
    note:
      'NVIDIA 官方技术博客（2026-08-24，与量产发布稿同日）。与本项目已有的 LPX 数据**逐条一致、无矛盾**：' +
      '仍是「the 256 LP30 local processing units (LPUs)」「The 128 GB of total SRAM-based memory collectively in ' +
      'those chips」。新增的是配对分工的一种更细说法：「Standard prefill-decode disaggregation: Vera Rubin NVL72 ' +
      'handles prefill and hands off the KV cache once per turn. Groq 3 LPX uses this KV cache, along with weights ' +
      'held in SRAM, to perform the entire decode step.」' +
      '⚠️ 注意这与 2026-03 技术博客的 AFD（attention–FFN 分离，每 token 往返一次）**不是同一种切分方式**——' +
      '官方在这里把它列为「standard」的那一档，本项目不据此改写既有的 AFD 叙述，两种编排方式并存留痕。' +
      '本源另有第三方 benchmark（Artificial Analysis，Gemma 4 31B）数字，属他方跑分，本项目不建 Claim。',
  },
  {
    id: 'src.nvidia-vera-rubin-gtc26-press',
    title: 'NVIDIA Vera Rubin Opens Agentic AI Frontier（GTC 2026 平台发布稿）',
    publisher: 'NVIDIA Newsroom',
    kind: 'official_press',
    url: 'https://nvidianews.nvidia.com/news/nvidia-vera-rubin-platform',
    localFile: null,
    asOf: '2026-03',
    note: 'GTC 2026-03-16 发布稿。五种机架（NVL72 GPU / Vera CPU / Groq 3 LPX / BlueField-4 STX / Spectrum-6 SPX）与「seven new chips now in full production」的官方口径；「NVIDIA Groq 3 LPX Rack」一节给出「The LPX rack with 256 LPU processors features 128GB of on-chip SRAM and 640 TB/s of scale-up bandwidth」「Deployed with Vera Rubin NVL72, Rubin GPUs and LPUs boost decode by jointly computing every layer of the AI model for every output token」与上市时间「Fully liquid cooled and built on MGX infrastructure, LPX integrates seamlessly into next-generation Vera Rubin AI factories to be available in the second half of this year.」（发布于 2026 年 ⇒ 2026 下半年）。',
  },
  {
    id: 'src.groq-nvidia-licensing',
    title:
      'Groq and Nvidia Enter Non-Exclusive Inference Technology Licensing Agreement to Accelerate AI Inference at Global Scale',
    publisher: 'Groq Newsroom',
    kind: 'official_press',
    url: 'https://groq.com/newsroom/groq-and-nvidia-enter-non-exclusive-inference-technology-licensing-agreement-to-accelerate-ai-inference-at-global-scale',
    localFile: null,
    asOf: '2025-12',
    note: 'Groq 官方新闻室（2025-12-24）。三句原话决定了「Groq 3 LPX 为什么会挂 NVIDIA 的名字」：「entered into a non-exclusive licensing agreement with Nvidia for Groq\'s inference technology」、「Jonathan Ross, Groq\'s Founder, Sunny Madra, Groq\'s President, and other members of the Groq team will join Nvidia」、「Groq will continue to operate as an independent company with Simon Edwards stepping into the role of Chief Executive Officer」+「GroqCloud will continue to operate without interruption」。⚠️ 是**收购以外**的另一种关系（非排他技术许可 + 团队加入），对外讲的时候不要说成「NVIDIA 收购了 Groq」。发布稿没有提到金额，本项目因此不建任何金额 Claim。',
  },
  {
    id: 'src.nvidia-hgx-ra',
    title: 'NVIDIA HGX AI Factory Enterprise Reference Architecture',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/components.html',
    localFile: null,
    asOf: '2026-08',
    note:
      'HGX B300（第五个代际）的部件清单/网络拓扑/规模设计点母版。抓取于 2026-08，含 abstract、overview、' +
      'components、network-logical-architecture、networking-hardware、networking-physical-topologies、' +
      'appendix-node-configurations 等页。核心口径：**2-8-9-800**（Abstract 原文「a 2-8-9-800 infrastructure ' +
      'configuration (2 CPUs, 8 GPUs, 9 NICs at 800 Gb/s bandwidth per GPU)」）、8 张 ConnectX-8 SuperNIC ' +
      '焊在 HGX 基板上 + 每台 1 张 BlueField-3、Spectrum-X 以太网、**风冷**（「industry-leading performance ' +
      'in an air-cooled form factor」）、4 节点 SU、32/64/128 节点三个设计点。' +
      '⚠️ 已发现七处该文档自身的内部不一致，引用时须留痕：① components.html Table 2 的「CPU」「CPU sockets」' +
      '两行被误填成 NVLink 的值（「Total Aggregate Bandwidth 14.4TB/s」「GPU-to-GPU Bandwidth 1800GB/s」）；' +
      '② CPU 核数下限 Table 2 写「Minimum of 48 physical CPU cores per socket」、appendix Table 8 写' +
      '「Minimum of 32 physical CPU cores per socket」；③ 交换机型号 network-logical-architecture Table 5 与 ' +
      'appendix Table 9 写 SN5600（128-port 400 GbE / Spectrum-4），networking-hardware 一节写 SN5610' +
      '（64 × 800 Gbps）；④ 汇聚网交换机台数 network-logical-architecture Table 7（Nodes=32）写' +
      '「Leaf | 2」「Spine | N/A」、同节正文写「Cost-efficient converged two-switch fabric for CPU ' +
      '(North/South) Network」，而 appendix Table 9 的「NVIDIA Spectrum-4 SN5600 Ethernet switch, ' +
      'converged core fabric」一行写 12 / 24 / 48；⑤ 128 节点的 SN2201 台数正文写「NVIDIA SN2201 switch ' +
      'per SU (32 switches total)」、appendix Table 9 写 16（32 与 64 节点两处则一致，分别是 4 与 8）；' +
      '⑥ 管理节点的汇聚网口速率 network-logical-architecture 写「Each compute node is connected with two ' +
      '400 GbE ports and each management node is connected with two 200 GbE ports」，' +
      'networking-physical-topologies 写「Each compute and management node is connected with two 400 GbE ' +
      'ports」；⑦ 双平面的负载均衡由谁做：networking-physical-topologies 同一页里，Multi Plane Topology ' +
      'Approach 一节写「the resiliency and the load balancing between the two planes is handled by the ' +
      'NCCL on the host」，Dual Plane Topology 一节写「Tracking of each plane, load balancing, and ' +
      'failure handling is handled by the ConnectX-8 SuperNIC on the hardware level」' +
      '（GB300 NVL72 RA 同一页有完全相同的两说）。' +
      '另：appendix Table 8 的标题误写成「RTX PRO Server system components」。' +
      '★ 还有一处**不是矛盾但极易误引**：「Rack layout must provide power supply redundancy」在 32/64/128 ' +
      '三个设计点都出现，但只有 32 节点那一处带后半句「; otherwise, consider an alternative rack layout」。' +
      '★ 全篇零出现「Spectrum-4」以外的交换芯片代际标注（SN5610 从未被标过代际），也零出现「51.2」。',
  },
  {
    id: 'src.nvidia-hgx-page',
    title: 'NVIDIA HGX Platform 产品页规格表',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/hgx/',
    localFile: null,
    asOf: '2026-08',
    note:
      'HGX 平台页的「NVIDIA Blackwell」规格表给出 HGX B300 / HGX B200 的**整板（8 GPU）**口径：' +
      'FP4 Tensor Core「144 PFLOPS | 108 PFLOPS」、FP8/FP6「72 PFLOPS」、Total Memory「2.1 TB」、' +
      'NVLink 第五代 + NVLink 5 Switch、GPU-to-GPU 1.8 TB/s、Total NVLink Bandwidth 14.4 TB/s、' +
      'Networking Bandwidth 1.6 TB/s。脚注 1「Specification in Sparse | Dense」、脚注 2「Specification in ' +
      'Sparse. Dense is ½ sparse spec shown.」、脚注 4「HGX B300 and HGX B200 shipping now.」' +
      '——本项目只把带稠密标注的值送进产能数学，并据脚注 4 把 HGX B300 记为 shipping。' +
      '同页另有 Rubin NVL8 一栏（HGX 的下一代），本项目不据此建系统。',
  },
  {
    id: 'src.nvidia-blackwell-ultra-datasheet',
    title: 'NVIDIA Blackwell Ultra 数据手册（PDF）',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://resources.nvidia.com/en-us-blackwell-architecture/blackwell-ultra-datasheet',
    localFile: null,
    asOf: '2025-10',
    note:
      '官方落地页（v1.4 QA 建议：URL 挂落地页而非 DAM 资产直链——直链' +
      'dam-cdn.nvd.orangelogic.com/AssetLink/1k0p832eq8r5ca0u5383ie5o4tp3bst1.pdf 已实证为该页内嵌的' +
      '官方 DAM 资产，但资产 ID 会随版本轮换）。页脚版本 OCT25。Key Offerings 只有两项：GB300 NVL72 与 **HGX B300**。第 5 页 Technical ' +
      'Specifications 表是本项目 HGX B300 产能数学的唯一口径来源，且**按平台分列**：HGX B300 列的' +
      '单卡口径为「FP4 Tensor Core 18 PFLOPS | 14 PFLOPS」「FP8/FP6 9 PFLOPS（稀疏）」' +
      '「GPU Memory | Bandwidth 270 GB HBM3E | 7.7 TB/s」「Max TDP Configurable up to 1,100 W」，' +
      '而同表 GB300 NVL72 列是 20|15 PFLOPS / 279 GB / 8 TB/s / up to 1,400 W。' +
      '★ 同一颗 Blackwell Ultra 芯片在两个平台上的官方数字不同（风冷 vs 液冷的功率档位差异），' +
      '本项目因此为 HGX B300 单独建 GPU 组件，不复用 GB300 那一份 mathSpecs。' +
      '第 3 页 HGX B300 Key Features：「8 NVIDIA Blackwell Ultra GPUs」「Over 2 TB of HBM3E memory」' +
      '「1,800 GBps NVLink between GPUs via NVSwitch™ chip」「2.6x faster training performance (vs. H100)」。',
  },
  {
    id: 'src.nvidia-blackwell-ultra-blog',
    title: 'Inside NVIDIA Blackwell Ultra: The Chip Powering the AI Factory Era',
    publisher: 'NVIDIA Technical Blog',
    kind: 'official_doc',
    url: 'https://developer.nvidia.com/blog/inside-nvidia-blackwell-ultra-the-chip-powering-the-ai-factory-era/',
    localFile: null,
    asOf: '2025-08',
    note:
      'NVIDIA 官方技术博客（2025-08-22，作者 Kyle Aubrey / Nick Stam）。Blackwell Ultra **芯片级**口径的出处：' +
      '双 reticle 双 die 经 NV-HBI（10 TB/s）合封为一颗 CUDA GPU、TSMC 4NP、208B 晶体管、160 SM / ' +
      '640 个第五代 Tensor Core、每 SM 256 KB TMEM、NVFP4 稠密 15 PFLOPS、注意力层 SFU 吞吐翻倍' +
      '（「up to 2x faster attention-layer compute compared to Blackwell GPUs」）、' +
      'HBM3e「Eight 12-Hi stacks, 16 × 512-bit controllers (8,192-bit total width)」、8 TB/s、' +
      'NVLink 5「1.8 TB/s bidirectional (18 links x 100 GB/s)」、PCIe Gen6 ×16 256 GB/s。' +
      '★ 图 1 脚注是本项目解释「288 / 279 / 270 GB 三个官方显存数字并存」的关键出处：' +
      '「Blackwell Ultra GPUs contain up to 160 SMs and 288GB HBM3E Memory. Available SM count and ' +
      'HBM capacity varies by SKU.」——官方明说容量随 SKU 变，因此三个数字不是互相矛盾，是不同 SKU 口径。',
  },
  {
    id: 'src.nvidia-dgx-b300-page',
    title: 'NVIDIA DGX B300 产品页规格表',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/data-center/dgx-b300/',
    localFile: null,
    asOf: '2026-08',
    note:
      '★ 只用于两件事：① 讲清 HGX（NVIDIA 卖基板、OEM 出整机）vs DGX（NVIDIA 自己出整机）这个售前常见混淆点；' +
      '② 为「HGX 服务器有多高、多耗电」提供**唯一一个官方数量级参照**——HGX 参考架构自身没有机架立面，' +
      '也没有单机功率。规格表原文：「Rack Units | 10U」「Power Consumption | ~14 kW」' +
      '「NVIDIA NVLink™ Switch System | 2x」「Total GPU Memory | 2.1 TB」「CPU | Intel® Xeon® 6776P Processors」' +
      '「8x OSFP ports serving 8x single-port NVIDIA ConnectX-8 VPI」「2x dual-port QSFP112 NVIDIA BlueField-3 DPU」。' +
      '⚠️ DGX B300 ≠ HGX B300：DGX 是 2 张 BF-3、固定 Intel Xeon 6776P、10U 固定形态，' +
      'HGX 参考架构则是 1 张 BF-3、CPU 由 OEM 选型、机箱高度未规定。' +
      '本项目**不拿 DGX 的数字当 HGX 的规格**，只在明确标注「DGX 参照」的 Claim 里出现。',
  },
  {
    id: 'src.semianalysis-nvl576',
    title: 'Rubin Ultra NVL576 架构：快速概览',
    publisher: 'SemiAnalysis',
    kind: 'analyst_report',
    url: null,
    localFile: 'sources/Rubin Ultra NVL576 架构：快速概览.pdf',
    asOf: '2026-08',
    note: '⚠️ 第三方分析师文章，非 NVIDIA 官方。引用它的 claim 一律 forecast/analyst_estimate，且其规格表禁止流入 GpuMathSpecs 与产能估算。B4 批次使用。',
  },
  {
    id: 'src.waic2026-deck',
    title: '超节点 — WAIC 2026 内部材料',
    publisher: '内部',
    kind: 'internal_deck',
    url: null,
    localFile: 'sources/超节点-WAIC2026.pptx',
    asOf: '2026-07',
    note: '导览文案、MoE 数据流叙述与「能跑→跑对→跑快→跑稳→跑省」售前话术来源（B3 批次）；v1.4 W-B 起另供 /report「国产超节点对照」段与 LEARNING.md 七问章纯文案转述。仅限文案层——content.test 有锁：本源不得出现在任何 Claim.sourceId。',
  },
  {
    id: 'src.marvell-fy27q1-call',
    title: 'Marvell FY2027 Q1 业绩电话会',
    publisher: 'Marvell Technology',
    kind: 'earnings_call',
    url: null,
    localFile: 'sources/Marvell 2027 Q1 业绩电话会.pdf',
    asOf: '2026-06',
    note: '⚠️ 非官方 NVIDIA 源。仅可用于定制 ASIC / 互联市场的背景 claim（management_guidance），禁止进入任何 countClaim 或组件 specs。',
  },
  {
    id: 'src.gs-marvell-note',
    title: 'Goldman Sachs — Marvell Technology (MRVL.US) 研究报告',
    publisher: 'Goldman Sachs',
    kind: 'analyst_report',
    url: null,
    localFile:
      'sources/Goldman Sachs-Marvell Technology Inc. （MRVL.US）：Uptick to medium_term guidance， with signif.pdf',
    asOf: '2026-06',
    note: '⚠️ 券商报告。仅背景路线图，禁止进入 countClaim 或组件 specs。',
  },
  {
    id: 'src.jpm-asic-report',
    title: 'J.P. Morgan — AI Drives Resurgence in Custom Chips (ASICs)',
    publisher: 'J.P. Morgan',
    kind: 'analyst_report',
    url: null,
    localFile:
      'sources/20260618-J.P. Morgan-Semiconductors：AI Drives Resurgence in Custom Chips （ASICs） _ASIC Market Overv (1).pdf',
    asOf: '2026-06',
    note: '⚠️ 券商报告。仅背景路线图，禁止进入 countClaim 或组件 specs。',
  },

  // ═══════════════ v1.6 W-A：切面/技术注册表新源（9 条，2026-09 逐一实访核实） ═══════════════
  {
    id: 'src.nvidia-dynamo-docs',
    title: 'NVIDIA Dynamo 官方文档（含 KVBM / 分离式 serving）',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://docs.nvidia.com/dynamo/latest/',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09。⚠️ docs 站已改版：latest/architecture/ 下的 kvbm_intro.html / ' +
      'kvbm_architecture.html 均已 404，KVBM 实质内容页在版本化路径 ' +
      'docs.nvidia.com/dynamo/v-0-8-1/components/kvbm/overview（引用时 locator 用该路径）。' +
      'KVBM 定义原句：「The Dynamo KV Block Manager (KVBM) is a scalable runtime component designed to ' +
      'handle memory allocation, management, and remote sharing of Key-Value (KV) blocks for inference ' +
      'tasks across heterogeneous and distributed environments.」统一内存 API 覆盖的层级原句：' +
      '「GPU memory (in future), pinned host memory, remote RDMA-accessible memory, local or distributed ' +
      'pool of SSDs and remote file/object/cloud storage systems」；「Integration with NIXL, a dynamic ' +
      'memory exchange layer used for remote registration, sharing, and access of memory blocks over ' +
      'RDMA/NVLink.」GitHub ai-dynamo/dynamo README 另有分离式 serving 描述「Separates prefill and ' +
      'decode into independently scalable GPU pools」与 KV 卸载「Offloads KV cache across GPU → CPU → ' +
      'SSD → remote storage」。★ 纪律：架构描述可 verified_spec；README/营销页上的性能倍数只能 ' +
      'vendor_claim 且逐字核到原文才可引用——本项目未逐字核到的倍数一律不建 Claim。',
  },
  {
    id: 'src.nvidia-nixl-repo',
    title: 'NIXL（NVIDIA Inference Xfer Library）GitHub 仓库 README',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://github.com/ai-dynamo/nixl',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09。定位原句：「NVIDIA Inference Xfer Library (NIXL) is targeted for accelerating ' +
      'point to point communications in AI inference frameworks such as NVIDIA Dynamo, while providing ' +
      'an abstraction over various types of memory (e.g., CPU and GPU) and storage (e.g., file, block ' +
      'and object store) through a modular plug-in architecture.」插件清单（2026-09 时点）：UCX / GDS / ' +
      'POSIX / OBJ / AZURE_BLOB / HF3FS / MOONCAKE / GUSLI / UCCL / GPUNETIO / LIBFABRIC / NVSHMEM。' +
      '★ README **没有任何硬性能数字**——本源只能承载能力清单类 verified_spec（字符串值），' +
      '任何数值型 Claim 从本源引出都是编造。',
  },
  {
    id: 'src.nvidia-sharp-docs',
    title: 'NVIDIA SHARP（Scalable Hierarchical Aggregation and Reduction Protocol）文档 Rev 3.0.0',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://networking-docs.nvidia.com/sharpum/300',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09。⚠️ 旧入口 docs.nvidia.com/networking/display/sharpv300 现为 302 重定向，' +
      '本条登记重定向终点。SHARP 作用原句：「improves the performance of MPI and Machine Learning ' +
      'collective operation, by offloading collective operations from CPUs and GPUs to the network and ' +
      'eliminating the need to send data multiple times between endpoints」「This innovative approach ' +
      'decreases the amount of data traversing the network as aggregation nodes are reached, and ' +
      'dramatically reduces collective operations time.」★ 该文档**无硬数字**——NVLink 6 SHARP 的 ' +
      '14.4 TFLOPS FP8 数字出处是 src.nvidia-rubin-chips-blog（已登记），不从本源引。',
  },
  {
    id: 'src.nvidia-gds-docs',
    title: 'NVIDIA GPUDirect Storage Overview Guide（v1.18）',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://docs.nvidia.com/gpudirect-storage/overview-guide/index.html',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09。定义原句：「GPUDirect® Storage (GDS) enables a direct data path for direct ' +
      'memory access (DMA) transfers between GPU memory and storage, which avoids a bounce buffer ' +
      'through the CPU.」带宽收益句**自带限定语**：「a direct path between local or remote storage ' +
      'that goes through a PCIe switch or a NIC acting as a PCIe switch offers at least twice the peak ' +
      'bandwidth as compared to taking a data path through the CPU」（限定「on some systems」）；' +
      '「The latency improvements from GDS are most apparent with small transfers.」' +
      '★ 引用「2 倍」时必须把限定语一起带上（v1.5 教训：官方原句被截半）。',
  },
  {
    id: 'src.nvidia-spectrumx-docs',
    title: 'NVIDIA Spectrum-X Ethernet 官方产品页',
    publisher: 'NVIDIA',
    kind: 'official_doc',
    url: 'https://www.nvidia.com/en-us/networking/spectrumx/',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09。adaptive routing 定义原句：「Adaptive routing is a feature where the Spectrum-X ' +
      'Ethernet switch and SuperNIC work in tight coordination to dynamically route traffic, enabling ' +
      'the highest effective bandwidth and network resiliency for AI fabrics.」性能倍数（营销口径，' +
      '仅 vendor_claim）：「Accelerate AI network performance by 1.6x over off-the-shelf (OTS) ' +
      'Ethernet」。⚠️ 页面**没有** rail-optimized 字样，也没有「95% 有效带宽」——rail-optimized ' +
      '双平面的官方出处是 src.nvidia-nvl72-ra（GB300 参考架构），不要从本页硬凑。',
  },
  {
    id: 'src.runai-model-streamer',
    title: 'Run:ai Model Streamer 官方基准测试文档（GitHub docs/src/benchmarks.md）',
    publisher: 'NVIDIA（Run:ai）',
    kind: 'official_doc',
    url: 'https://github.com/run-ai/runai-model-streamer/blob/master/docs/src/benchmarks.md',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09，数字逐字核对。测试配置：Meta-Llama-3-8B（15 GB，单 Safetensors 文件）、' +
      'AWS g5.12xlarge（4×A10G，仅用 1 卡）、CUDA 12.4 / vLLM 0.5.5 / Model Streamer 0.6.0 / ' +
      'Tensorizer 2.9.0；存储三档：GP3 SSD（16K IOPS / 1,000 MiB/s）、IO2 SSD（100K IOPS / ' +
      '4,000 MiB/s）、同区 Amazon S3。结果：S3 上 Model Streamer 最优 4.88 秒（concurrency 32）vs ' +
      'Tensorizer 最优 37.36 秒（16 workers）；GP3 上 Streamer 14.34s（16）vs Safetensors Loader ' +
      '47.99s vs Tensorizer 16.11s；IO2 上 7.53s / 47s / 10.36s。方法论：「Each experiment was ' +
      'conducted under cold-start conditions」，S3 每次测试间隔 ≥2 分钟避免 AWS 侧缓存。' +
      '★★ 两条纪律：① **4.88s 的对照对象是 Tensorizer，不是 Safetensors Loader**（HF loader 不支持 ' +
      'S3 直读，S3 实验里根本没有它）——引用时不得写成「vs safetensors」；② 这是厂商自测 benchmark，' +
      'evidence 恒 benchmark，locator 必带盘型/实例/模型配置。',
  },
  {
    id: 'src.mooncake-fast25',
    title: 'Mooncake: Trading More Storage for Less Computation — A KVCache-centric Architecture for Serving LLM Chatbot（FAST 2025）',
    publisher: 'USENIX / Moonshot AI & 清华大学',
    kind: 'official_doc',
    url: 'https://www.usenix.org/conference/fast25/presentation/qin',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09（⚠️ 该页对普通 fetch 返回 403，需用 firecrawl 抓取）。FAST 25 **Best Paper**。' +
      '⚠️ 厂商自述系统论文（Kimi 的 serving 平台，作者为 Moonshot AI + 清华），非独立评测——' +
      '数字一律 benchmark 档。摘要逐字数字：「Mooncake increases the effective request capacity by ' +
      '59%~498% when compared to baseline methods, all while complying with SLOs」（real traces）、' +
      '「enables Kimi to handle 115% and 107% more requests on NVIDIA A800 and H800 clusters, ' +
      'respectively」、「processing over 100 billion tokens daily」。' +
      '★★ 版本纪律：arXiv 版（2407.00079 v4）摘要写的是「up to a 525% increase in throughput」与' +
      '「75% more requests」——**与 FAST25 正式版数字不同**。本项目登记的是 FAST25 页，' +
      '只允许引用 FAST25 版数字；摘要没有 TTFT 专项数字，不得替它编一个。',
  },
  {
    id: 'src.weka-materials',
    title: 'WEKA 官方博客：Unlocking Scalable Inference with WEKA Augmented Memory Grid',
    publisher: 'WEKA',
    kind: 'official_doc',
    url: 'https://www.weka.io/blog/ai-ml/unlocking-scalable-inference-with-weka-augmented-memory-grid/',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09（发布于 2025-05-15）。⚠️ 存储厂商营销材料——数字**只能 vendor_claim**，' +
      '且只进 technique/lens 的 figures，永不进组件 specs。核到的口径：TTFT「achieving a 41x ' +
      'improvement based on a 128,000-token context window」（Llama-405B Int4，图示对比）；' +
      '测试环境 DGX H100、WEKApod（72 NVMe）、「direct Warehouse-to-GPU data access at ~300GB/s」；' +
      '「~68% cache hit rate」。技术路径：KV cache 经 RDMA/GPUDirect Storage 分层到共享 NVMe。',
  },
  {
    id: 'src.vast-materials',
    title: 'VAST Data 官方博客：NVIDIA Dynamo + VAST = Scalable, Optimized Inference',
    publisher: 'VAST Data',
    kind: 'official_doc',
    url: 'https://www.vastdata.com/blog/nvidia-dynamo-vast-scalable-optimized-inference',
    localFile: null,
    asOf: '2026-09',
    note:
      '实访于 2026-09（发布于 2025-12-16）。⚠️ 存储厂商营销材料——数字**只能 vendor_claim**，' +
      '且只进 technique/lens 的 figures，永不进组件 specs。核到的口径（HGX H100 8 卡、' +
      'Llama 3.1-405B、127,188-token prompt，经 Dynamo NIXL + GDS/RoCE）：「TTFT with prefill ' +
      'compute: 62 seconds」vs「TTFT with KV$ load from VAST: 3 seconds」（约 20 倍）；链路利用率' +
      '「over 90% of line rate (181 Gbps)」峰值「~99% (198 Gbps)」（200 Gbps 链路）。' +
      '★ 沿革留痕：VAST 原「Introducing: Undivided Attention」博客页已重定向失效（2026-09 实访），' +
      'GitHub vast-data/VUA 仓库已于 2026-07 archived（README 注明 vLLM connector 功能并入 LMCache ' +
      'GDS backend）——本条登记的是仍可达且有硬数字的 Dynamo+VAST 博客。',
  },
]

/** 官方源：只有这些 kind 能承载 verified_spec / vendor_claim。 */
export const OFFICIAL_SOURCE_KINDS = ['official_doc', 'official_press'] as const

/** 券商/分析师源 ID：禁止出现在 countClaim 与组件 specs 中。 */
export const BROKER_SOURCE_IDS = [
  'src.marvell-fy27q1-call',
  'src.gs-marvell-note',
  'src.jpm-asic-report',
] as const

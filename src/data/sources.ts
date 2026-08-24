import type { SourceRef } from './types'

/**
 * 全部数据源登记处。每条 Claim 的 sourceId 必须落在这里（pack.test.ts 强制）。
 *
 * 证据分级纪律（测试强制，见 pack.test.ts）：
 * - `verified_spec` / `vendor_claim` 只能引用 `official_doc` / `official_press`。
 * - `analyst_report` / `earnings_call` 类（SemiAnalysis / Marvell / GS / JPM）属于
 *   **非官方**来源，禁止出现在任何 `countClaim` 或组件 `specs` 里，只能做背景叙述。
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
    note: 'GB300 部件清单/数量/网络拓扑/供电的母版来源。抓取于 2026-08，含 components、networking-hardware、networking-physical-topologies、appendix-node-configurations 等页。',
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
    note: 'NVIDIA 官方技术博客。机架级结构的唯一官方出处：18 计算托盘 + 9 NVLink 交换托盘、每托盘 2 个 Vera Rubin 超级芯片 + 8 ConnectX-9 + 1 BlueField-4，以及「Rubin Ultra NVL576 = 8 个 MGX NVL 机架 × 72 GPU」的官方拓扑口径。',
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
    note: '由 Vera Rubin NVL72 产品页「Read the NVIDIA Vera Rubin Datasheet」链接。第 1 页 Key Features 给出 20.7 TB HBM4 / 54 TB LPDDR5X / 75 TB 快内存 / NVLink 域 260 TB/s。⚠️ 同样带「Preliminary information」脚注。',
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
    note: '⚠️ 媒体报道（转引 SemiAnalysis 研究），非 NVIDIA 官方材料。原文「2028」延期指的是 **Kyber NVL144**（PCB 中板良率问题），对 **NVL576** 原文只说「is also likely delayed or limited to small volumes」——不带具体年份。文中记录 NVIDIA 对 SemiAnalysis 报道的回应「Our roadmap is intact」，这是媒体转述的官方回应，只能以「媒体转述」的身份出现在 Claim 的 note 里，不可当作独立的官方声明引用。',
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
      '⚠️ 已发现三处该文档自身的内部不一致，引用时须留痕：① components.html Table 2 的「CPU」「CPU sockets」' +
      '两行被误填成 NVLink 的值（「Total Aggregate Bandwidth 14.4TB/s」「GPU-to-GPU Bandwidth 1800GB/s」）；' +
      '② CPU 核数下限 Table 2 写「Minimum of 48 physical CPU cores per socket」、appendix Table 8 写' +
      '「Minimum of 32 physical CPU cores per socket」；③ 交换机型号 network-logical-architecture Table 5 与 ' +
      'appendix Table 9 写 SN5600（128-port 400 GbE / Spectrum-4），networking-hardware 一节写 SN5610' +
      '（64 × 800 Gbps）。另：appendix Table 8 的标题误写成「RTX PRO Server system components」。',
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
    url: 'https://dam-cdn.nvd.orangelogic.com/AssetLink/1k0p832eq8r5ca0u5383ie5o4tp3bst1.pdf',
    localFile: null,
    asOf: '2025-10',
    note:
      '由 resources.nvidia.com/en-us-blackwell-architecture/blackwell-ultra-datasheet 链接的官方数据手册' +
      '（页脚版本 OCT25）。Key Offerings 只有两项：GB300 NVL72 与 **HGX B300**。第 5 页 Technical ' +
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
]

/** 官方源：只有这些 kind 能承载 verified_spec / vendor_claim。 */
export const OFFICIAL_SOURCE_KINDS = ['official_doc', 'official_press'] as const

/** 券商/分析师源 ID：禁止出现在 countClaim 与组件 specs 中。 */
export const BROKER_SOURCE_IDS = [
  'src.marvell-fy27q1-call',
  'src.gs-marvell-note',
  'src.jpm-asic-report',
] as const

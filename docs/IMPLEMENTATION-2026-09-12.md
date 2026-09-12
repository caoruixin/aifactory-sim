# Token Factory UI 与模拟准确性改进

核验日期：2026-09-12。保留浅色、三栏和详情 / 产能页签，定位仍为架构学习与方案讲解。计算输出是带假设的参数计算时间与 decode 吞吐估算，不是端到端 TTFT、调度器或生产性能预测。

## 已交付的交互

- 共享场景包括模型、权重 / 计算 / KV 精度、已有上下文、输入和输出长度、每副本 batch、单位数量、TP 和 Rubin 规格版本。轻 / 中 / 重预设均可继续编辑。页签、比较和报告共用输入；显式重置与版本化分享链接支持恢复场景。分享保留当前系统、层级、平面、负载视图和减少动态效果设置。
- 底部提供流程讲解与负载演示。五套系统均有请求、prefill、逐层 MoE、逐 token decode 和返回流程。负载演示显示首个 token、后续输出、KV 增长、层内阶段、参与 GPU 和瓶颈。播放速度只改变演示进度，不改变估算结果；仅点击“定位瓶颈”才导航视角。
- 搜索组件后可打开详情；当前装配路径高亮，恢复总览会清理旧路径。来源链接指向对应网页或 RA 章节，核验状态、配置条件和关键假设可见。
- ≥1200px 使用三栏，较窄窗口通过抽屉访问两侧。抽屉支持 Escape、焦点进入、Tab 约束、嵌套关闭和焦点恢复。390 / 768 / 900 / 1024 / 1280 / 1440px 均纳入操作与溢出检查。2D 降级、减少动态效果和既有深链继续可用。
- Vera CPU Rack、BlueField-4 STX / CMX、Spectrum-6 SPX 是 Rubin 集群根节点下的独立 POD 配套示意，放在计算机架行之外。数量 1 是展示实例，不是每个 NVL72 固定 BOM，也不是新增顶栏代际。
- 按“交互效果优于之前版本”的补充要求，增加固定的实时产能反馈、预设选中态、窄屏就地播放、逐 token 回看与键盘操作；负载播放联动粒子和硬件强调，2D 总览提供清晰可点击的部件图例。具体行为与验收见 [交互改进记录](INTERACTION-QUALITY-2026-09-12.md)。

## 硬件参数与来源

| 对象 | 采纳口径与处理 | 直接来源 |
| --- | --- | --- |
| GB300 GPU | 默认 279 GB、8 TB/s、最高可配置 1,400 W、FP16/BF16 稠密 2.5 PFLOPS；288 GB 保留架构 / RA 口径 | [Blackwell Ultra 数据手册，第 5 页](https://dam-cdn.nvd.orangelogic.com/AssetLink/1k0p832eq8r5ca0u5383ie5o4tp3bst1.pdf) |
| HGX B300 GPU | 270 GB、7.7 TB/s、最高可配置 1,100 W、FP16/BF16 稠密 2.25 PFLOPS；单卡 FP4 与整板公布值各自留证据 | 同上 |
| Grace / GB300 HBM | 每 CPU 72 核、双 CPU 托盘 144 核、整架 2,592 核；GPU 封装 8 个 12-Hi HBM 堆栈 | [GB300](https://www.nvidia.com/en-us/data-center/gb300-nvl72/) · [Blackwell Ultra 架构](https://developer.nvidia.com/blog/inside-nvidia-blackwell-ultra-the-chip-powering-the-ai-factory-era/) |
| Vera Rubin NVL72 | 默认 MaxLPS：单 GPU HBM 19.2 TB/s、NVLink 3 TB/s；数据手册配置：22 TB/s、3.6 TB/s。整架 HBM / NVLink / scale-out 同组切换 | [当前产品页](https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/) · [数据手册](https://dam-cdn.nvd.orangelogic.com/AssetLink/56p68o47y6f1yucpubl0ump1c0aif422.pdf) |
| Rubin 交换托盘 | 数据手册 28.8 TB/s 保留为上限；MaxLPS 实际托盘带宽未确认，不从整架端点聚合值倒推 | 同上 |
| SN5600 / SN5610 / SN2201 | 区分 64 个 OSFP 物理连接器与 128×400G breakout 逻辑端口；SN2201 补齐 4×100G 上联。51.2 Tb/s 的厂商方向口径歧义留注，不进入路径数学 | [SN5000](https://networking-docs.nvidia.com/sn5000hw/introduction) · [SN2201](https://networking-docs.nvidia.com/sn2201hw/specifications) |
| BlueField-4 DPU | Grace CPU、1GbE OOB、最高 128 GB LPDDR5X、PCIe Gen6×16；与 Vera CPU 的 STX 独立建模 | [DPU 手册](https://dam-cdn.nvd.orangelogic.com/AssetLink/whs8mhb340t412js4612g3356607hapf.pdf) |
| POD 配套 | CPU 执行 Agent、STX / CMX 存储 KV、Spectrum-6 SPX 连接网络；系统配置和通用模块规格分列 | [官方 POD 架构](https://developer.nvidia.com/blog/nvidia-vera-rubin-pod-seven-chips-five-rack-scale-systems-one-ai-supercomputer/) |
| 模型 | Llama 3 70B 为 8K；Qwen3 235B 原生 32K，不默认假设 YaRN 扩展 | [Llama 模型卡](https://huggingface.co/meta-llama/Meta-Llama-3-70B) · [Qwen 模型卡](https://huggingface.co/Qwen/Qwen3-235B-A22B) |

共享存储组件不再携带 GB300 的每节点 40 GB/s 部署目标；目标移到 GB300 系统。营销倍数与装配速度保留为厂商声明，不当作可计算规格。HGX 供电形式、CPU 数量等存在 OEM 或范围限制的项目单独标注。

## Claim 清单

原始快照有 **610 条 Claim、107 个空值**；最终内容包有 **645 条 Claim**。核验表另有 1 行记录从共享组件迁移的历史字段，因此表共 646 行。计数按 Claim 出现位置统计，不是独立物理事实数量。

| 当前处理结论 | 数量 |
| --- | ---: |
| 本轮核验并采纳 | 358 |
| 非官方规格（厂商声明、作者解释或分析师预测） | 173 |
| 来源 / 型号范围待确认 | 10 |
| 本次未找到可靠公开依据 | 60 |
| OEM / 部署决定 | 42 |
| 不适用 | 2 |

107 个原空值中，4 项补齐：GB300 GPU TDP、HBM 堆栈数、Vera CPU 通用 TDP 范围、BlueField-4 OOB。Vera CPU 的 250–450 W 是产品范围，不代表 NVL72 实际配置功率。其余原空值：59 项本次未找到依据、41 项部署决定、1 项范围冲突、2 项不适用。新增待确认字段使当前空值合计为 106，不能用净减少数量衡量核验完成度。

每行提供原值 / 采纳值、原始 Claim、系统与组件、单位、范围、方向、精度、稀疏 / 稠密口径、限定条件、来源 URL / 章节位置、来源日期、核验日期、处置结论。没有把空值统一解释为“官方未公布”，也没有用 0 或无限速替代。

- [完整 JSON](../public/audit/claims-2026-09-12.json) / [CSV](../public/audit/claims-2026-09-12.csv)
- [原始快照](audit/claims-before-2026-09-12.json)
- [主要网页再次读取的记录与摘要哈希](audit/source-checks-2026-09-12.json)
- 重新生成：`npm run audit:data`。新增未复核的来源不会自动继承旧值的核验状态。

仍待确认的重点：LPX 主机 CPU 型号与 GPU / LPU 配对物理链路；NVL576 部分内部装配与性能参数；STX 文档中 84 / 88 核的 SKU 范围差异；Rubin 网卡板卡数量与端口 / GPU 聚合带宽口径；HGX OEM SSD、配电、CDU 与场地容量。这些项目保留原因，排除在已确认的数学输入之外。

## 计算实现与可复核公式

`ScenarioInput` 是共享输入，`ResolvedHardwareProfile` 从带来源的正数官方 Claim 解析计算参数。遗留 `mathSpecs` 只是派生兼容接口，不再维护第二份手写数值。Rubin 展示、比较、计算与报告读取同一组选定规格。

1. **分配**：只允许独立 NVLink 域内 TP=1/2/4/8，选择能放下的最小值。每域副本 `floor(域内 GPU / TP)`，再乘单位数量。两台 HGX 的 Qwen3 FP16 为 4 个四卡副本；单域不适配时，增加独立服务器仍不适配。
2. **显存**：每卡 `总权重 / TP × 1.1 + 2 GB + KV`，不超过该卡 HBM 的 90%。10% 权重开销、2 GB 运行开销及 10% 余量均是教学假设。NVFP4 权重含每 16 参数一个 FP8 scale，按 0.5625 B/参数。
3. **KV**：GQA 按 `min(TP, KV heads)` 分片；超出头数的 rank 复制。MLA latent 在每个 TP rank 上复制，本轮不加入 context parallelism。每副本 batch 与上下文长度共同决定占用。
4. **MoE**：均匀、独立路由下，batch 覆盖专家期望 `E × (1 − (1 − k/E)^batch)`。从总参数与每 token 激活参数分出固定参数和等尺寸专家，提供最小、期望、最大读权重集合；不把整批请求视为只读一份激活权重。
5. **时间**：prefill 使用对应精度的稠密算力估计参数计算。decode 每步取 `max(计算时间, 权重及 KV 的显存访问时间)`，随输出增长 KV。总模型计算时间为 prefill 加 N−1 次 decode：prefill 已产生首个输出，最后输出尚未送回模型，因此峰值 KV 上下文为 `已有 + 输入 + 输出 − 1`。
6. **吞吐**：展示峰值上下文处的 decode 吞吐估算乘副本数，不是包含 prefill 的持续服务产能。INT4 不自动借用 NVFP4 算力；未知计算精度或无法部署时拒绝给数。
7. **路径**：KV 交接以一对发送 / 接收端点比较，NVLink 单 GPU 双向数除以 2；不使用全域聚合值。权重加载按实际 SSD / NIC / PCIe / DMA 路径，分段暂存求和、直达或理想流水取最慢段。HBM 带宽不作为外部数据进入 GPU 的速度，实际 DMA 未确认时保留空值或显式用户假设。
8. **时钟**：`SimulationResult` 是纯函数，输出阶段、生成量、KV、资源、瓶颈和限制。DOM 演示时钟与 3D 帧率分离；无 WebGL 仍可推进。

未建模成本在 UI 常驻或可展开查看：排队与调度、TP collective、MoE all-to-all、通信竞争、注意力随上下文增长的额外 FLOPs、实际 kernel / 采样开销及入站出站延迟。prefill KV 增长及层内阶段按比例做教学展示，不是实测 trace。tokens/W 的功率是所引官方配置 / 上限口径，未计机架外设施与 PUE。

## 验证

- 类型检查与生产构建：`npm run build` 通过。
- 全量单元测试：`npm test`，822 项通过；含单域装箱、GQA / MLA、专家覆盖、精度、输出增长、首 token 与 KV 边界、未知值传播、存储路径的独立手算。旧测试随算法更换为新手算案例，数量不与原 828 项一一对应。
- 浏览器：`npx playwright test --workers=3`，71 项适用用例通过；另 71 项因 desktop / mobile 项目互斥而按配置跳过。覆盖五套系统、6 种宽度、场景往返、2D、减少动态效果、焦点与嵌套抽屉，以及已有 3D 交互回归。包含交互补充的 5 项用例。
- 手机报告及展开核验表实测宽度均为 390px；宽差异表仅在自己的区域内滚动，并验证了键盘滚动。自由下钻后窄屏不再显示与当前部件不符的导览解说。
- 手动验证负载进度跳转时相机位姿不变，点击“定位瓶颈”才移动视角；POD / 负载走查无浏览器运行错误。
- 17 张截图先输出到临时目录逐张检查，修正 POD 重叠、机架连接标签间距、比较页配置占位后才采纳基线；记录见下表。
- 交互补充另增加 4 张截图，逐张检查后采纳；桌面与手机实际 WebGL 画面也已走查。见 [交互截图记录](audit/interaction-visual-checks-2026-09-12.json)。

[已审阅截图清单及 SHA-256](audit/visual-checks-2026-09-12.json)

| 截图 | 审查重点 |
| --- | --- |
| gb300-cluster / gb300-cluster-facility-planes | 集群干线、供电液冷平面、底部循环与详情 |
| gb300-rack-allplanes | 端点标签不重叠、当前路径 |
| gb300-tray-explode / gb300-board-ingress | 封装拆解、出界连接截断、详情可读性 |
| hgx-rack / hgx-board | 八卡服务器域与机架示意的区分 |
| nvl576-cluster / lpx-rack | 定性边界、LPX 配对与已知拓扑 |
| compare-gb300-vera / compare-gb300-vera-diffonly | POD 独立摆放、差异高亮、收起配置后可见产能 |
| fallback-structure / fallback-tree / fallback-connections | 2D 操作、层级、待确认带宽 |
| lens-network-ch1 | 原有切面与来源说明 |
| mobile-tour-stop1 | 窄屏导航、抽屉入口与底部控制 |
| report-page | 五系统、当前配置、核验清单与来源 |

生产包仍有 Vite 大 chunk 提示（3D 依赖和内容包）；构建成功，首屏 / 报告不加载 three 的原有检查继续保留。本轮未部署或提交代码。

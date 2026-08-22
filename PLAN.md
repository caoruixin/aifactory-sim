> **📌 状态说明（2026-08）**
>
> 本文档是最初的需求草稿，**其实现方案部分已由正式的独立应用实施计划落地取代**：
> 计划文件为 `~/.claude/plans/the-goal-toasty-charm.md`。
>
> 主要变更：
> - 落地位置由「在 llms-study 中新增 `/factory` 模块」改为 **`~/projects/aifactory` 独立新应用**
>   （llms-study 仅作只读参考，不做任何修改）。
> - 交付方式由「四周逐周开发」压缩为 **5 个批次交付**（B1 脚手架+引擎+GB300 数据 →
>   B2 3D 下钻 → B3 六平面+数据流 → B4 代际比较+产能+报告 → B5 移动端+降级+E2E）。
> - 技术栈升级为 Vite 7 + React 19 + Tailwind v4（新项目无版本墙）。
>
> **本文档中仍然有效的部分**：第 4 章起的**四周学习节奏**与 **15 分钟汇报脚本**，
> 它们描述的是使用者的学习与汇报计划，不受实现方案变更影响，继续按原文执行。
> 下方涉及 `/factory` 路由、llms-study 目录结构与逐周开发排期的描述已过时，仅作历史参考。

---

# NVIDIA AI Factory 数字孪生与学习闭环计划

## 1. 目标与验收标准

在现有 LLM Infra Studio 中新增独立一级模块 `/factory`，首版用四周完成一个“结构拓扑准确、外观为高质量示意”的 NVIDIA AI Factory 三维展厅。

首版验收标准：

- 从“多机架集群 → GB300 NVL72 机架 → Compute Tray → 板卡 → GPU/HBM/NIC/DPU”连续下钻。
- 任意部件可点击，查看作用、规格、物理位置、上下级、相邻连接、实物参考和来源。
- 可切换 NVLink、Scale-Out、业务网络、管理、供电、液冷六类连接平面。
- 可播放推理过程：请求进入 → Prefill → KV Cache 写入 → Decode → MoE All-to-All → Token 返回。
- 同屏比较：
  - GB300 NVL72：实线、`shipping/verified`。
  - Vera Rubin NVL72：蓝色、`announced`。
  - Rubin Ultra NVL576：琥珀色线框、`forecast`。
- 生成一页可打印汇报：需求背景、当前架构、推理数据流、代际变化、证据边界、下一阶段。
- 桌面端提供完整三维交互；手机端提供自动导览、热点列表和详情，不要求复杂旋转拆解。
- 不在首版输出正式报价、采购 BOM 或伪精确 Token 产能。

GB300 的母版以 NVIDIA 官方 NVL72 AI Factory 资料为准，包括 18 个 Compute Tray、9 个 NVSwitch Tray、供电、液冷及多机架参考拓扑。[NVIDIA NVL72 AI Factory](https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html)  
Rubin 只录入 NVIDIA 已正式发布的 NVL72、NVLink 6、Rubin GPU、Vera CPU、ConnectX-9 和 BlueField-4 信息。[NVIDIA Rubin 官方发布](https://nvidianews.nvidia.com/_gallery/download_pdf/695c39b23d633240d175d8e6/)

## 2. 产品与技术实现

### 三维工作台

- 使用 `three`、`@react-three/fiber`、`@react-three/drei` 构建程序化三维模型；不依赖不存在的厂商 CAD。
- `/factory` 懒加载，避免 Three.js 进入其他页面首屏包。
- 采用语义 LOD：
  - 集群层只渲染机柜外形与 Scale-Out 网络。
  - 机架层渲染托盘、交换、供电、液冷和管理设备。
  - 托盘/板级才渲染 CPU、GPU、HBM、NIC/DPU、NVMe 等内部组件。
- 重复部件使用实例化渲染；动画运行时才开启连续帧，静止时按需渲染。
- WebGL 不可用时降级为 2D Rack Elevation、组件树和连接列表，不出现空白页。

页面由四个区域组成：

- 顶部：物理层级面包屑、产品状态和当前/未来切换。
- 中央：主三维场景。
- 左侧：场景导览与网络平面开关。
- 右侧：组件详情、邻居、参数、来源与“售前怎么解释”。
- 底部：推理数据流步骤条与播放控制。

比较模式在同一 Canvas 中放置两个同步视角的系统，按组件稳定 ID 对齐差异，显示“新增、移除、数量变化、连接变化、规格变化”，避免两个 WebGL 场景重复消耗资源。

### 推理数据流

动画明确区分逻辑层和物理层，避免形成“每次请求都会重新加载权重”等错误认识：

1. 请求从逻辑 Gateway 进入业务网络，经 DPU/NIC 到达计算托盘。
2. 模型权重已经驻留 HBM；Prefill 读取权重并写入 KV Cache。
3. Decode 循环读取权重和 KV，逐步生成 Token。
4. MoE 场景展示 Router、Dispatch、NVLink/NVSwitch All-to-All、Expert、Combine。
5. 跨机架默认演示 DP/副本扩展；不暗示每个 Token 必须跨机架通信。
6. 动画时间仅作教学节奏，不冒充真实时延。

### 版本化内容包

在 `src/data/factory/` 建立 JSON 内容包，由 Zod 在加载和测试时校验；三维组件只识别通用视觉类型，不写死产品型号。

核心公开类型：

- `FactoryContentPack`：版本、来源、组件、装配、连接、场景、数据流、比较定义。
- `Claim`：值、单位、证据类型、产品状态、来源定位、日期、置信度。
- `HardwareComponent`：GPU、CPU、HBM、Tray、Rack、Switch、NIC/DPU、Storage、Power、Cooling、Facility 的判别联合。
- `AssemblyNode`：父子关系、数量、Rack U/位置、可见层级和通用三维外形。
- `Connection`：端点、端口、网络平面、介质、协议、带宽方向和拓扑。
- `FlowEpisode`：推理阶段、经过的连接 ID、说明、动画节奏。
- `ComparisonDefinition`：代际间组件匹配和差异规则。

证据类型固定为：

`verified_spec | vendor_claim | benchmark | management_guidance | analyst_estimate | forecast | author_opinion`

官方规格才能进入未来配置规则；券商和供应链材料只能进入背景与路线图。Rubin Ultra 资料明确按预测处理：:codex-file-citation{path="/Users/caoruixin/projects/aifactory/Rubin Ultra NVL576 架构：快速概览.pdf" purpose="source"}。Marvell 管理层摘要 :codex-file-citation{path="/Users/caoruixin/projects/aifactory/Marvell 2027 Q1 业绩电话会.pdf" purpose="source"} 与 Goldman Sachs 预测 :codex-file-citation{path="/Users/caoruixin/projects/aifactory/Goldman Sachs-Marvell Technology Inc. （MRVL.US）：Uptick to medium_term guidance， with signif.pdf" purpose="source"} 只作为未来供应链层输入，不能反推部件数量。

PPT 的超节点定义、MoE 流程和“能跑→跑对→跑快→跑稳→跑省”分别转化为导览、动画和售前检查框架：:codex-file-citation{path="/Users/caoruixin/projects/aifactory/超节点-WAIC2026.pptx" purpose="source" artifact_kind="presentation" slide_number="3"} :codex-file-citation{path="/Users/caoruixin/projects/aifactory/超节点-WAIC2026.pptx" purpose="source" artifact_kind="presentation" slide_number="5"} :codex-file-citation{path="/Users/caoruixin/projects/aifactory/超节点-WAIC2026.pptx" purpose="source" artifact_kind="presentation" slide_number="17"}。

## 3. 四周实施与个人学习计划

每周个人投入 5 小时：官方资料 1.5 小时、内容包与模拟器实践 2 小时、脱稿讲解 1 小时、一页方案更新 0.5 小时。

### 第 1 周：建立唯一主线

- 完成 `/factory` 路由、内容包 Schema、来源登记和 GB300 装配树。
- 把所有术语挂到以下主线上：

  `业务负载 → 模型/SLA → 推理软件 → 并行与副本 → Scale-Up/Out → 服务器/托盘/机架 → 供电液冷 → 产能/TCO → POC`

- 学习产出：一张 AI Factory 总图和 30 个核心术语卡；每个术语只要求回答“在哪里、做什么、影响哪个指标”。

### 第 2 周：看懂物理系统

- 完成集群、机架、托盘、板卡四级三维下钻与详情面板。
- 补齐计算、互联、存储、管理、供电、液冷六类组件。
- 学习产出：能在 5 分钟内从 GPU 讲到 NVSwitch、ConnectX、BlueField、Spectrum-X、Power Shelf 和 CDU。

### 第 3 周：看懂推理如何落在硬件上

- 完成 Prefill、KV Cache、Decode、MoE All-to-All 五段动画。
- 完成网络平面切换和物理/逻辑视图映射。
- 加入 GB300、Rubin、Rubin Ultra 的代际比较。
- 学习产出：能解释“容量、算力、带宽、通信、尾延迟、功率”分别怎样限制 Token 生产。

### 第 4 周：汇报与质量收口

- 完成移动导览、降级视图、视觉打磨、测试和性能优化。
- 加入打印友好的一页方案与 15 分钟老板演示脚本：
  - 2 分钟：AI Factory 要解决什么业务问题。
  - 4 分钟：硬件从集群下钻到板卡。
  - 4 分钟：一次推理如何使用这些部件。
  - 3 分钟：GB300 到 Rubin 的变化。
  - 2 分钟：哪些是事实、哪些是预测、下一阶段如何做容量规划。
- 学习验收：脱稿完成演示，并能回答“为什么不能只看卡数、FLOPS 和原始 tokens/s”。

## 4. 测试与验收

- 内容包测试：Schema、唯一 ID、父子引用、连接端点、来源定位、状态与证据类型完整。
- 结构测试：装配数量、Rack U 占位、部件边界、相机预设和比较映射确定性。
- 数据流测试：路径连续、阶段顺序正确、暂停/重播正确；减少动态效果设置下不播放粒子动画。
- 交互测试：集群→机架→托盘→板卡下钻，热点选择、邻居跳转、网络平面切换、未来态比较。
- Playwright 固定相机截图回归：桌面 1440×900、移动端 390×844、WebGL 降级模式。
- 性能验收：重复组件实例化；8 机架总览不展开板级细节；页面隐藏时暂停动画；限制设备像素比。
- 工程门禁：现有 `typecheck`、Vitest、生产构建全部通过，其他页面行为和初始包大小不回退。

## 5. 后续闭环与边界

### 第二里程碑：可行配置与 Token 产能

在首版三维数据模型上增加：

- `SolutionBlueprint`、兼容矩阵、必选数量、端口/倍数、NVLink 域、功率和液冷规则。
- `WorkloadProfile`：模型、精度、输入/输出长度分布、并发、QPS、P95/P99 SLA、可用性和增长。
- `ParallelPlan`：TP、PP、EP、DP、Prefill/Decode 分离与 HA 副本。
- 输出 `ResolvedBOM`、配置错误说明和容量区间。
- Token 产能分为 Prefill、Decode、raw tokens/s、满足质量与 SLA 的 goodput、tokens/W、tokens/成本。
- 有实测 Profile 时优先校准；否则才使用带低/中/高区间的 roofline 估算，不把峰值 FLOPS 直接换算成 tokens/s。
- 当前引擎对未知 KV 参数输出偏乐观吞吐的问题必须先修正，再允许进入方案计算。

“Token 数量不等于业务价值”的业务层独立建模，不混入硬件公式；其指标框架参考 :codex-file-citation{path="/Users/caoruixin/projects/aifactory/AI Dark Output- The Visible Cost of Invisible Output 中英.pdf" purpose="source"}。

### 第三里程碑：多方案和供应链

- 增加 HGX H200/B200/B300 参考方案。
- 增加 Google TPU7x 内容包和 3D Torus 拓扑，依据 [Google Cloud TPU7x 官方文档](https://docs.cloud.google.com/tpu/docs/tpu7x)。
- 国产超节点仅在获得官方规格后升级为可配置模板；二手材料先保留为 `reported_claim`。
- 增加供应商、交期、替代件、生命周期和路线图差异，但券商收入预测不自动转换为供应量。
- 提供场景 JSON 导入/导出和内容包版本迁移；应用内拖拽编辑器不在当前范围。

默认约束：

- “支持任何硬件”指任何已经注册到内容包且通过兼容规则校验的硬件，不承诺未知设备任意拼装。
- “数字孪生”指结构、层级、数量、连接和系统语义准确，不代表制造级尺寸或 CAD 精度。
- 官方实物图片以外链和来源标注展示；未明确许可的图片不复制进发布包。
- TPU、国产方案、正式 BOM、报价、TCO 和可承诺产能不属于四周首版。
- 当前附件中没有独立的技术分享会议程截图；PPT 第 18 页为无关噪声，不纳入内容包。

# v1.3 数据核正 + NVL576 叙事重构 + 手册↔应用融合 + Groq 3 LPX 建模（两轮 codex 评审后定稿）

> 评审记录：R1 5P0/7P1、R2 4P0/9P1，全部采纳修入。批准后：固化为仓库 PLAN-v1.3.md → W1(sonnet)→W2(opus)→W3(opus) 派发 → QA 核验 → 部署 + 手册 artifact 重发。

## Context

用户三诉求：**①** 学习手册操作步骤与应用脱节（环节 2.1 术语密集）；**②** 对照 NVIDIA 简报照片审查参数、体现最新情况；**③** NVL576 靠谱吗。

研究+审计+两轮评审后的事实基线（实施直接采信；研究存档 `/private/tmp/claude-501/-Users-caoruixin-projects-aifactory/ebcb3f1b-5a28-455c-b95b-b059fed6b149/scratchpad/.firecrawl/`）：

1. **VR NVL72 已最新**；缺口仅 SHARP 14.4 TFLOPS/托盘（复用已登记源 `src.nvidia-rubin-chips-blog`）、机架 C2C 65TB/s、BF-4 口径冲突注。**GB300 零改动**（37TB 已现值；142kW 已按官方 RA「up to 142 kW」登记）。
2. **NVL576**：GTC 2025-03 官宣；GTC 2026-03 POD 博客口径为三档 NVLink 域 NVL72/NVL144(Kyber 单机架)/**NVL576=8×MGX 机架×72（两层全互联 NVLink，原型 Polyphe）**，上探 Kyber NVL1152。官方全名 **NVIDIA Vera Rubin Ultra NVL576**（R2 P1-2）。官方 2026 无日期。**媒体延期报道（CNBC/SemiAnalysis 2026-07）说的 2028 指 Kyber NVL144；对 NVL576 只说 "likely delayed or limited volumes"——不得给 NVL576 建带年份的延期 Claim**（R2 P0-1）；「roadmap intact」是媒体转述的 NVIDIA 回应，只能以此身份出现在 note。GTC 2025 的 15EF/365TB/600kW 不引入。
3. **Groq 3 LPX 官方属实**（产品页+技术博客，H2 2026）：256×LP30、128GB SRAM、40PB/s、640TB/s C2C、**机架 315 PF FP8 与每托盘 9.6 PF 并存（32×9.6=307.2≠315，两条各自建 Claim、不得加相等不变量、note 注明官方口径不完全闭合**——R2 P2-2）；**托盘 host CPU 是官方图中的独立部件（型号未公布→unknown 组件），BF4 是另一独立部件，不得让 BF4 内嵌 Grace 冒充主机 CPU**（R2 P0-4）。98B 晶体管不建。Dynamo AFD、35×TPS/MW@400TPS/user 为 vendor_claim 叙事。
4. **关键代码事实**：材质分档读**组件** status 而非系统 status（GenericShapes.tsx:120；NVL576 组件全 forecast 且显式 wireframe——R2 P0-2）；`HardwareComponent` 是判别联合，`'lpu'` 必须加进 `NonGpuComponentKind`（或新分支）否则 typecheck 失败（R2 P0-3）；`highlightAssemblyIds` 无运行时消费者（R1 P0-2）；RackInstances 现状优先级是「悬停>选中」需一并矫正（R2 P1-3）；**仓库现无任何 NVL576 WebGL 截图基线**（R2 P1-9）；Fallback2D/RackElevationSvg 只消费 flow 高亮（R2 P1-4）；DetailPanel 也直读 PLANE_LABEL（R2 P1-7）；CapacityBands 固定「缺官方数据」文案（R2 P1-6）；ReportPage 三系统硬编码；移动端无代际选择器。

## 硬约束

- src/lib 零 three；颜色经 palette；每帧值不进 store；锁定测试（routing.test.ts:81-97/:282-284/:116-128）不删改。
- types.ts 只增：允许追加必填字段（+`| null` 或枚举）与 union 成员（`NonGpuComponentKind`+`'lpu'`、`SourceKind`+`'media_report'`、`System`+`capacityPolicy`）；LPU 分支**锁定不得携带 GPU mathSpecs**。
- 证据纪律：照片不可引用；verified_spec/vendor_claim 只引官方 kind 源；keynote-only 数字不建；媒体数字只能 media_report 源+forecast 或不建；数字不得只放 note 绕过测试；每条新 Claim 的 sourceId 真实登记并进系统 sourceIds。
- 非锁定测试更新属预期，提交注明。测试引用同时写测试名防行号漂移。

## W1 NVL576 叙事重构 + VR 小补（sonnet）

**文件**：types.ts、sources.ts、rubin-ultra-nvl576.ts、vera-rubin-nvl72.ts、comparisons.ts、BreadcrumbBar.tsx、capacity.ts、CapacityBands.tsx、ReportPage.tsx、content/pack/compare/capacity 四个测试文件。

1. **类型**：`System` 增必填 `capacityPolicy: 'standard' | 'analyst-modeled' | 'paired-only'`（GB300/VR=standard、NVL576=analyst-modeled；补枚举合法性与三策略拒绝/放行矩阵测试，types.ts:178 gpuCount 注释同步——R2 P2-1）；`SourceKind` 增 `'media_report'`；**ReportPage 源类型标签映射改为 `Record<SourceKind,string>` 并补 media_report 文案**（R2 P1-1）。
2. **NVL576 重构**：
   - 系统层：status→`'announced'`、name `'NVIDIA Vera Rubin Ultra NVL576'`、vendor `'NVIDIA'`；**summary 只陈述官方确认事实**（8×MGX、NVL576 域、Polyphe），Oberon/NPO/CPO/Dragonfly 等分析师结构细节从 summary 移出、单列低置信 forecast Claim（R2 P1-2）。
   - **组件层证据分层（R2 P0-2）**：官方确认的壳层/拓扑组件升 announced（蓝调实体），分析师限定组件保持 forecast+wireframe；系统级蓝色只用于 badge/外框。**新增一张 NVL576 WebGL 截图基线**（现无）。
   - Claim：官宣事实/三档域/拓扑/NVL1152 = vendor_claim（POD/OCP 博客；「NVL144(Kyber)=2025 die 计数 NVL576 同物」标推断）；「2027H2」= vendor_claim 引 GTC 2025 keynote 博客（新登记 official_doc）+ note「2026 官方不再给日期」；**延期叙事 = 无年份定性 forecast 引 media_report（CNBC 2026-07，注明 2028 指 Kyber NVL144），note 含媒体转述的官方回应**；分析师规格原样保留。
   - **pack.test.ts:262-295 规则重写（R2 P1-1 措辞）**：通用遍历反查 Claim 所属系统集合，非官方源 Claim 强制「evidence ∈ {analyst_estimate, forecast} **且 claim.status==='forecast'** 且所有使用系统非 shipping」；SemiAnalysis 专项 low-confidence 四重锁保留在 content.test。
   - 产能门禁按 capacityPolicy：**capacity 拒绝结果增稳定 `reasonCode`**；CapacityBands 按 reasonCode 渲染（analyst-modeled→「已官宣但规格主要来自第三方分析师（forecast 数据），不出产能」，保留「分析师」「forecast」关键词供 capacity.test.ts:139-142 同步；`missing=[]` 时禁止显示缺数据文案——R2 P1-6）；BreadcrumbBar banner 按 status×capacityPolicy 出文案；compare.test.ts:175/:144、content.test.ts NVL576 断言组更新。
3. **VR 小补**：SHARP 14.4/托盘（复用 six-chips 源）、C2C 65TB/s、BF-4 口径冲突 note。
4. **阶梯知识**：comparisons/report 增「规模阶梯与命名口径」叙事（OCP 改名编者按可引）。ReportPage footer 措辞更新。

## W2 手册↔应用融合（opus）

**文件**：useShotParams.ts、SceneRoot.tsx、Fallback2D.tsx/RackElevationSvg.tsx、Hotspot.tsx、store.ts、三代数据文件（scenes 尾部追加）、LEARNING.md、factory.spec.ts、parseShotParams/高亮单测。

1. **场景高亮接线（先行）**：纯函数（src/lib，附单测）从当前场景派生高亮集合（经 visibleAncestorAt 折叠），**SceneRoot 与 Fallback2D/RackElevationSvg 共用**（R2 P1-4）；**scene 与 flow 分通道下传（`sceneActive`/`flowActive` 或统一 enum），脉冲只认 flow；全部渲染端（Hotspot/普通 mesh/RackInstances）锁定优先级 `selected > hovered > flow > scene`，顺带矫正 RackInstances 现有「悬停>选中」倒置；补重叠集合单测**（R2 P1-3）。E2E：3D 断像素变化；`?tour=…&gl=off` 断结构图高亮标记（R2 P1-4）。
2. **`?tour=` 深链**：优先级矩阵——tour 基座（applyScene）→ 显式 gen/planes/focus/level/mode 逐项覆盖（显式 mode 覆盖强制的 'tour'）；focus 校验属最终 generation 否则忽略；**跨系统规则（R2 P1-5）：显式 gen 指向他系统时绝不复用场景序号——清空原场景，按最终显式 mode 决定进入新系统首站或退出 tour；补 tour+cross-gen 有/无显式 mode 两组测试**。parseShotParams 单测（known/unknown/冲突矩阵）。附录 B 加行。
3. **学习场景（尾部追加）**：GB300 +7（learn-plane-×6 rack 级单平面，narration「预期看到/谁连谁+关键数字/断了会怎样」，数字全取既有 Claim；learn-switch-layers cluster 级，highlight leaf/spine/converged）；VR +1（learn-gen-delta）。
4. **手册同步（全在 W2）**：环节 1.2/2.1/3.1 任务卡化（?tour 链 + 预期看到 + 三问 + 核对）；站数文案改「3 讲解站 + 7 练习站」；附录 A：Q17-20 重写、Q18 补七档说明、Q8 注 VR 3.6TB/s；第 4 周补阶梯与命名口径。`mobile-tour-stop1.png` 因「第 1/N 站」变化重拍。LPX/AFD 内容不在本批。

## W3 Groq 3 LPX 第四系统（opus；可延后至 v1.4，但**顺序依赖 W1 的 capacityPolicy/media_report 类型**——R2 P2-3）

**文件**：groq3-lpx.ts（新）、sources.ts（LPX 三源本批登记）、types.ts（NonGpuComponentKind+`'lpu'`）、index.ts、comparisons.ts、layout.ts、capacity.ts、CapacityBands、ReportPage（动态四系统）、ComparePanel/store、MobileFactoryView、DetailPanel/PlaneToggles/连接表（planeLabel helper）、content.test.ts:542、pack.test.ts:472-478、E2E。

1. **建模**：`sys.groq3-lpx`，status announced、capacityPolicy paired-only；LP30 `kind:'lpu'`（进 NonGpuComponentKind，锁不得带 GPU mathSpecs——R2 P0-3）；**托盘 = 8×LP30 + 1×独立 host CPU（型号未公布，claim value null）+ 1×BF4（独立部件）**（R2 P0-4）；无 HBM/无 NVSwitch/C2C 铜 spine 如实；keySpecs 用 acceleratorCount（pack 系统不变量按加速器类型分型）；315 PF 与 9.6 PF/托盘并存不互推。
2. **产能**：capacity 在 GPU 查找前按 paired-only 拒绝（专属 reasonCode+文案：AFD 配对语义，不提供独立产能）；capacity.test 补用例。
3. **测试锁**：content.test.ts:542 四项；pack.test.ts:472-478 按架构分型（NVLink 域必须 nvswitch-tray；LPX 豁免并强制自有核心角色）。
4. **UI 全链路**：ReportPage 动态四系统 + LPX 拒绝卡 + VR↔LPX 配对段（E2E 断内容）；store 增 `swapCompareSides` + **setCompare/?right= 清洗 unknown/同侧 ID；compare 测试参数化全部 12 个有序组合 + 每对 swap 两次复原 + UI 每个左侧恰三个右侧选项**（R2 P1-8）；MobileFactoryView 紧凑代际选择器；**`planeLabel(systemId, plane)` 单一 helper 替换 PlaneToggles/连接表/DetailPanel 的全部 PLANE_LABEL 直读**（LPX 显示「C2C scale-up」，持久化键不变——R2 P1-7）+ LPX DOM 测试。
5. **比较与场景**：comparisons.ts VR↔LPX 配对 narrative（GPU vs LPU、AFD、35×@400TPS）；场景 2 站；手册「NVIDIA 2026 更新」小节本批写入。
6. **E2E 分账列表（R2 P1-9，替换「~12」）**：现有 12 张基线中受第四代顶栏按钮影响的逐张列出重拍；新增：NVL576 3D 基线（W1）、LPX rack 基线、LPX compare 内容断言；**四系统 × desktop `?gl=off` 扫查（三页签 + 不加载 three-vendor）、四系统 × 移动端切换（根节点/站数/无横向溢出）**。

## 验证与执行

- 顺序 W1→W2→W3，各批独立提交+全绿门禁（typecheck / 单测基线 421 起 / build / E2E 25+25 起；preview `--host 127.0.0.1`，勿改 playwright.config）。
- QA 核验重点：新 Claim URL 逐条可访问且措辞相符、keynote-only 与媒体数字零混入 vendor_claim、NVL576 组件分层（官方壳 announced vs 分析师件 wireframe）目视、四系统全 UI 走查、优先级链单测覆盖。
- 主循环终审 → build:pages 部署 → 线上验证 → 手册 artifact 重发（?tour 链接 + 新章节）→ PLAN-v1.3.md 加 ✅。

## 关键文件

- src/data/{types,sources,rubin-ultra-nvl576,vera-rubin-nvl72,comparisons,index}.ts、groq3-lpx.ts（新）
- src/lib/capacity.ts、src/components/panels/{BreadcrumbBar,ComparePanel,CapacityBands,DetailPanel,PlaneToggles}.tsx、src/pages/{ReportPage,useShotParams}、src/components/mobile/MobileFactoryView.tsx、src/components/scene/{SceneRoot,Hotspot}.tsx、src/components/fallback/{Fallback2D,RackElevationSvg}.tsx
- src/data/{content,pack}.test.ts、src/lib/{capacity,compare}.test.ts、store 测试、parseShotParams 测试
- LEARNING.md、tests/e2e/factory.spec.ts

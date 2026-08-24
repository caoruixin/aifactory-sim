# v1.4 硬件模块深化:CPO/光模块讲解 + 国产超节点对照 + HGX B300 第五系统 + TPU7x 铺垫

> 状态:**W-A / W-B / W-C 已实施完成并部署 ✅**(评审豁免开工,2026-08-24)。
> 交付:预备提交 ✅ → W-A ✅(2 提交)→ W-B ✅(1 提交)→ W-C ✅(3 提交 + QA 返工 4 提交)。
> 每方向独立 QA 核验通过:W-A 七维度全过(源 PDF p.7–p.10 逐页核对);W-B deck 纪律
> 逐图溯源零渗漏;W-C 30 条 Claim 逐字回源零偏差、5 源实访全 200,两个阻断级显示层
> 缺口(产能单位措辞/平面标签未按域架构分型)已返工修复,H200/B200 世代对照补齐。
> 终态门禁:**616 单测 / E2E 43 passed + 43 skipped / typecheck / build 全绿**;
> 全量基线重拍 16 张 + 新增 hgx-rack/hgx-board 两张,全部人工核对。
> 备注:「桌面·F2 kv-write 脉冲」E2E 在本机当前帧调度下原三点采样 ~100% 假红
> (v1.3 基线提交同样复现,功能经独立诊断正常),已改滚动采样根治,属测试健壮化非行为变更。
> **W-D/E(TPU7x)未实施**——按计划需单独评审后串行开工。

## Context

用户诉求:学习环境中看不到光模块、CPO、超节点等硬件概念。调查结论分两层:

1. **部署落后(已在计划外先行处理)**:远端 main/gh-pages 停在 v1.3 计划固化提交(0c3c2cc),本地领先 6 个提交——NVL576 包、NPO 光模块实体、跨机架光互连、超节点导览全在其中。核验后推送部署即解决大半观感。
2. **真实缺口**:CPO 只以数据注释存在(rubin-ultra-nvl576.ts:942 附近「本项目按 NPO 版建模」),无对比教学;国产超节点、HGX、TPU 一直在第三里程碑 backlog(PLAN.md:161-166)。

范围裁决(已与用户确认):

- **国产超节点降级为对照段+学习场景,不建第五套 3D 包**。`sources/超节点-WAIC2026.pptx` 经逐页审读确认为付费 KOL 二手材料(知识星球「傅里叶的猫」,含 AI 聚合痕迹与 SemiAnalysis 水印图):全部结构数字要么是无 locator 转述、要么在照片标注里(纪律禁用);s11 机架立面与 GB300 官方口径冲突;s13 拿上一代 CloudMatrix384 拓扑垫 Atlas 950 叙事。撞 pack.test 两条锁定规则与 PLAN.md:165 门禁("等官方规格")。
- **CPO 不建 3D 实体,走讲解站**。NPO/CPO 是互斥在研版本,同树并存=建了一台不存在的机器;CPO 关键量化事实缺失(带宽占位符、外置激光源数量无来源),沿用 PLAN-v1.1「无来源部件不建实体」先例。
- **HGX 只建 B300 一个系统**(与 GB300 同芯不同域,选型对比最锐;官方 HGX AI Factory Enterprise RA 与 GB300 母版同文档族,证据最硬);H200/B200 降级为 cmpdef 沿革叙事 + specs 世代对照。
- **TPU7x 是引擎级改造**(torus 实例邻接、三维格阵摆位、多级实例寻址均为新机制,与 CPO 方向物理重叠),HGX 之后严格串行,实施前单独评审。

## 硬约束(承接 v1.3)

- src/lib 零 three;颜色经 palette;每帧值不进 store;锁定测试(routing.test.ts:81-97/:282-284/:116-128)不删改。
- types.ts 只增:本版允许追加 `FactorySystem.architecture` 必填枚举、`ConnectionMedium`+`'airflow'`;TPU 批次再增 `ConnectionTopology`+`'torus-3d'`、`NonGpuComponentKind`+`'tpu'`。
- 证据纪律:照片不可引用;verified_spec/vendor_claim 只引官方 kind 源;WAIC deck(internal_deck)只可进 narration/presalesNote/summary 纯文案层,**不得出现在任何 Claim.sourceId**(本版将其编码为锁定测试);每条新 Claim 的 sourceId 真实登记并进系统 sourceIds,URL 逐条可访问。
- 截图基线是二进制:两个"加系统"的分支绝不并行合入,"合一个、重拍一轮、rebase 下一个"。
- 非锁定测试更新属预期,提交注明;测试引用同时写测试名防行号漂移。

## 预备提交(主干,先于所有并行分支)

**文件**:types.ts、pack.test.ts、四个数据文件(回填字段)。

1. `FactorySystem` 增必填 `architecture: 'nvlink-rack-domain' | 'nvlink-node-domain' | 'lpu-direct-fabric'`(GB300/VR/RU=nvlink-rack-domain、LPX=lpu-direct-fabric;HGX 届时声明 nvlink-node-domain)。
2. pack.test.ts 架构分型规则(:513-549 一带,现用 `capacityPolicy !== 'paired-only'` 当判据强制 compute-tray+nvswitch-tray)改为按 `architecture` 映射各族核心 roleKey;为 nvlink-node-domain 预留分支(强制 gpu-server+hgx-baseboard+nvswitch-asic,禁止 nvswitch-tray/nvlink-backplane)。
3. `ConnectionMedium` 增 `'airflow'`(HGX 风冷 cooling 平面用,现有八种介质全是液冷/接触语义)。
4. 补纪律缺口:`internal_deck` 并入 pack.test.ts:316 非官方源过滤集合(现只覆盖 analyst_report/earnings_call/media_report)。

## W-A CPO vs NPO 讲解深化(worktree `v1.4-cpo`,sonnet,2 提交)

**文件**:rubin-ultra-nvl576.ts、content.test.ts、sceneHighlight.test.ts、LEARNING.md、factory.spec.ts。锁定测试零接触(不动装配树/连接/roleKey)。

提交 1 — 数据 + 场景 + 锁:
1. `cmp.rubin-ultra.optics-module.specs` 用现成 `sa()` 工厂(:64-92)增 2 条 Claim:`cpoExternalLaserSource`(CPO 版配外置激光源模块,locator p.9–p.10)、`fieldReplaceability`(NPO 插槽可换 vs CPO 内嵌不可换,p.10)。
2. `RUBIN_ULTRA_SCENES` 尾部追加第 3 站 `scene.ru.optics-formfactor`:lodLevel 'board'、focus `asm.ru.nvswitch-tray`、planes `['nvlink']`、highlight `['asm.ru.nvswitch-asic','asm.ru.optics']`(参照 scene.gb300.tray-teardown);narration 三段式(预期看到 16 个 NPO 模块 4×4 网格/NPO 每 ASIC 旁 4 插槽 vs CPO 每 ASIC 内嵌 4 光引擎+外置激光源、NPO 先上市为分析师判断/断了会怎样——NPO 换单模块、CPO 整体维保口径改变,⚠️ 标注此段为作者解读、全站为分析师口径);presalesNote 提醒先说证据级别。
3. content.test.ts 新 ★ 锁:①「CPO 只做讲解不建实体」(roleKey 集合无 cpo 类、asm.ru.optics.count===16、nvlink 平面连接集恰为现有 5 条——把 :942 注释裁决升级为可执行锁);②对比事实各归其位(两条新 Claim 存在且 sourceId=SA、firstToMarket.evidence==='forecast'、bandwidthTbs.value===null 续锁「x.xT 不编数」);③第 3 站结构断言(仿 :713-727,narration 同含 'NPO'/'CPO'/'不可更换')。sceneHighlight.test.ts 补 1 条折叠断言(rack 深度折叠为 asm.ru.nvswitch-tray、board 保留原 ID,仿 :79)。

提交 2 — 手册 + E2E:
4. LEARNING.md:任务卡 + 附录 B 深链 `?tour=scene.ru.optics-formfactor`;附录 A 加一问(哪句是分析师说的、哪句是本手册解读)。
5. factory.spec.ts:新 1 条 `?tour=scene.ru.optics-formfactor&gl=off` DOM 断言(data-tour-scene-active 唯一 + narration 含 'CPO',仿 :817);重拍 `nvl576-cluster.png`(RU 站数 2→3 改变 TourPanel 左栏)——本方向唯一受影响基线。

## W-B 国产超节点对照段(worktree `v1.4-cn-report`,sonnet,1 提交)

**文件**:ReportPage.tsx、LEARNING.md、content.test.ts、factory.spec.ts、可选一个数据文件 scenes 尾部。不动 types.ts / index.ts systems / Claim 体系;deck 事实只走纯文案层(flows.ts WAIC_SOURCE 先例)。

1. ReportPage 新段「国产超节点对照(WAIC 2026)」:规模阶梯卡(单柜 32–128 / Scale-Up 域 256–1,024 / 集群万卡+,与 NVL72=72 / NVL576=576 / LPX=256 同尺对照)、厂商四分类名单(平台型:华为/阿里/百度昆仑芯;AI 芯片:摩尔线程/沐曦/燧原/壁仞等;OEM-ICT:中兴/新华三/联想/中科曙光/浪潮/超聚变;推理基础设施:阡视科技)、与 NVL72/576 三点结构差异(跨柜光互连 vs 铜背板、正交无背板 vs NVLink 背板、自研交换 ASIC(灵衢/ALink/凌云)vs NVSwitch);整段挂「内部材料转述,非官方口径,不构成规格」徽标(复用 SOURCE_KIND_LABEL 体系)。
2. LEARNING.md 新章:deck s17「判断超节点七问」改造成对国产方案的练习题(拿平台型三卡当靶子问哪一问答不上来)。
3. 可选:GB300 或 VR scenes 尾部追加 `learn-cn-ladder` 学习场景(纯 narration 合法引用 deck)。
4. content.test.ts 新守卫锁:`src.waic2026-deck` 不得出现在任何 Claim.sourceId(countClaim/specs/keySpecs 全遍历;现状为真,锁防回归)= PLAN.md:165 门禁的测试化。
5. E2E:ReportPage 内容断言 + 受影响基线重拍(1–2 张)。
6. **未来升级条件(写入 backlog)**:拿到华为 Atlas 950 SuperPoD 或阿里磐久 AL128 官方规格(可访问 URL,official_doc)即按 groq3-lpx.ts 剧本升级第五包。设计存档:`sys.atlas950-superpod`、`NonGpuComponentKind`+`'npu'`、新 roleKey `npu-tray`/`scaleup-switch-rack`(华为是计算柜+交换柜多柜结构,不复用 nvswitch-tray)、capacityPolicy 走非 GPU 拒绝分支(roofline 数学只建了 GPU/HBM 口径)、planeLabel 覆写「灵衢 UB scale-up」。

## W-C HGX B300 第五系统(worktree `v1.4-hgx`,opus,3 提交)

**文件**:layout.ts、sources.ts、hgx-b300.ts(新)、index.ts、comparisons.ts、content/pack/compare/capacity 测试、factory.spec.ts。教学主线:同一颗 B300,**服务器级 NVLink 域(8 GPU 板内 NVSwitch)vs 机架级域(NVL72)**;机架 nvlink 平面刻意为空即教学内容(导览词:「切到 NVLink 平面,这个机架里一条线都没有——域在服务器里面」)。

**素材(全部公开官方,实施时逐条登记+实访)**:
- NVIDIA HGX AI Factory Enterprise RA(docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/,重点 components/network-logical-architecture/physical-topologies 各页)→ `src.nvidia-hgx-ra`,official_doc;口径 2-8-9-800(2 CPU、8 GPU、9 NIC、每 GPU 800Gb/s)、ConnectX-8 SuperNIC + BlueField-3 + Spectrum-X、风冷、32/64/128 节点设计点。
- NVIDIA HGX Platform 产品页(nvidia.com/en-us/data-center/hgx/,含 B300/B200 规格表;核对稀疏/稠密脚注)。
- Blackwell Ultra Datasheet(平台页所链 PDF)→ B300 mathSpecs(dense 口径)。
- Blackwell Ultra 官方技术博客(developer.nvidia.com,实施时确认精确标题)。
- (可选)DGX B300 Datasheet——顺带在 presalesNote 讲清 HGX(OEM 基板)vs DGX(NVIDIA 整机)这一常见售前混淆点。

提交 1 — 摆位与源:layout.ts PLACEMENTS 追加 `gpu-server`(8U 级整机,复用 rackUSlots 路径)、`hgx-baseboard`(shape board,「HGX 到底是什么」的答案——NVIDIA 卖的是这块板)、`rack-pdu`(克隆 dc-busbar 竖直规则,power 平面 facility-power→rack-pdu→gpu-server)、`room-air-handler`(cluster 层,cooling 平面 gpu-server→room-air-handler,medium airflow);sources.ts 登记上述 4–5 源。

提交 2 — 数据建模:hgx-b300.ts(约 1,400–1,600 行):`sys.hgx-b300`(architecture 'nvlink-node-domain'、capacityPolicy 'standard'、status shipping)+ ~13 组件 + ~24 装配 + ~20 连接 + 3 场景(①一台 HGX 服务器解剖:rack→server→baseboard 下钻;②机架里没有 NVLink:rack 级 nvlink 平面空 + scaleout rail 高亮;③两种域怎么选:cluster 级对比叙事 + 选型话术)。roleKey 复用 ~19 个(accelerator/host-cpu/gpu-hbm/scaleout-nic(CX-8)/north-south-dpu(BF-3)/nvswitch-asic(板载,刻意复用让跨代对比呈现位置差)/scaleout-leaf/spine(RA rail-optimized 正好落在现有拓扑枚举)等);刻意不用 compute-tray/nvswitch-tray/nvlink-backplane/dc-busbar/液冷类。每机架服务器数以 RA rack elevation 为准(多档取参考配置建 countClaim+note)。index.ts 五处 spread 尾部追加(systems[0]/[1] 顺序不许漂移);comparisons.ts +`cmpdef.gb300-to-hgx-b300`(summary 直击选型:域 72 vs 8、液冷 vs 风冷、背板 vs 以太 rail、对 MoE/长上下文推理的含义;rows 对 gpu-server added / compute-tray removed 写 narrative 防误读;H200/B200 沿革叙事入 summary+specs 世代对照)。B300 mathSpecs 官方 datasheet 填全——第二个能出产能数字的系统,capacity.test 加正例。

提交 3 — 五系统收口 + E2E:compare 有序组合 12→20、「左侧恰 3 右侧」→4;五系统 × `?gl=off` 扫查 + 移动端代际选择器;HGX rack/board 新基线 + 顶栏第五按钮波及的**全量基线重拍**。

## W-D/E TPU7x + 3D Torus(HGX 后严格串行,opus,约 5–7 提交,实施前单独评审)

引擎级改造依据:Connection 是「装配节点类型→类型」的边,表达不了 accelerator 实例 i↔j 的 torus 邻接(routing.ts:404-408 对折叠退化边直接跳过);worldPositionOf(layout.ts:438-454)只有一级实例寻址,torus 邻居跨托盘需 (tray_i, chip_j) 二级寻址;grid() 只有二维,缺 4×4×4 格阵摆位与沿轴直线+环回弧路径生成器。好消息:`RoutedConnection.instancePaths`(一条连接、一组几何路径)容器现成,渲染端 ConnectionLayer 大概率不动。

- T1 数据批次(~3 提交):tpu7x.ts 包(官方源 docs.cloud.google.com/tpu/docs/tpu7x + system-architecture 文档 + Ironwood 官方博客:4×4×4 torus / 64 芯片一机架 / 每芯片 6 邻居 / ICI 每轴带宽 / OCS 跨 cube);types 增 `ConnectionTopology:'torus-3d'` + `NonGpuComponentKind:'tpu'` + architecture 枚举新族;planeLabel 覆写 nvlink→「ICI scale-up」;capacity 非 GPU 拒绝分支(LPU 先例);torus 暂以聚合节点渲染(T1 不做格阵)。
- T2 引擎批次(~3-4 提交):layout 三维格阵摆位 + 多级实例寻址;routing torus 实例网格生成器(±X/±Y/±Z 邻居 + wrap 环回弧);现有锁定测试按条数锁、新增分支不改旧行为,但 routing/layout 是 v1.4 全部方向的共享底座,QA 需重点核验。

## 并行与合并纪律

- 预备提交先落主干;三个 worktree(v1.4-cpo / v1.4-cn-report / v1.4-hgx)从其后的 main 拉出并行。
- **合并顺序:W-A → W-B → W-C → W-D/E**。前两个不加系统、不触发系统数敏感测试;HGX 全量基线重拍放最后一轮,覆盖前两者;TPU 与 CPO 物理重叠(layout/routing),必须串行。
- 共享冲突文件:content.test.ts(三方向都追加,文本冲突可解)、LEARNING.md(W-A/W-B 都动,rebase 人工合)。
- 各批次落地后同步更新 LEARNING.md「之后(工具的二期方向)」段与本文件勾选状态。

## 验证与执行

- 每提交门禁:typecheck / 单测(基线 554 起)/ build;批次末 E2E:先 `npm run build`,手动 `vite preview --host 127.0.0.1 --port 4173 --strictPort` 起服务再 `npx playwright test`(勿改 playwright.config);基线重拍 `--update-snapshots` 后人工核对图。
- QA 核验重点:HGX 新源 URL 逐条实访且措辞相符;WAIC deck 零进 Claim(新守卫锁全绿);CPO 讲解站证据三分(Claim/分析师叙述/作者解读)目视;五系统全 UI 走查;合并后全量 E2E。
- 主循环终审 → `npm run build:pages` → dist 强推 gh-pages(既有命令,PROMPT-v1.1.md:30)→ 线上验证(五代际顶栏、`?tour=scene.ru.optics-formfactor`、ReportPage 对照段徽标、HGX 机架 nvlink 平面为空)→ 手册 artifact 重发 → 本文件加 ✅。

## 关键文件

- src/data/{types,sources,rubin-ultra-nvl576,comparisons,index}.ts、hgx-b300.ts(新)、tpu7x.ts(新,W-D)
- src/lib/layout.ts(:148-300 PLACEMENTS;T2 :438-454 实例寻址)、src/lib/routing.ts(HGX 零改动基准;T2 :351-356/:404-408)
- src/pages/ReportPage.tsx、src/data/{content,pack}.test.ts、src/lib/{compare,capacity}.test.ts、src/lib/sceneHighlight.test.ts
- LEARNING.md、tests/e2e/factory.spec.ts

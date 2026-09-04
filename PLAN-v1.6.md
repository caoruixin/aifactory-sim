# v1.6 领域切面学习板块：网络切面 + 存储切面

> 状态：**已实施完成（本地提交，待推送/部署）**（2026-09-04）。
> 提交序列：`8c846fa` 计划固化 → `86d59a3` W-A 数据层 → `421fecd` W-B 框架与桌面 UI →
> `896f9c3` W-C 计算器 + W-D1 移动端/手册 → `bb692b3` W-D2 E2E 收口。
> 终态门禁（独立复核）：**822 单测（667 → +155）/ E2E 54 passed + 54 skipped（连跑三遍全绿，
> 基线字节稳定）/ typecheck / build 全绿**；17 张基线 `--update-snapshots=all` 全量重拍并
> 逐张目检（15 变 / report-page 逐字节同 / lens-network-ch1 新增）。
> 文档同步：LEARNING.md 新增「第 6 周 · 领域切面」11 张任务卡 + 附录 B lens 深链速查。
>
> 实施期已知副作用与订正（详见各提交）：① Model Streamer 37.36s 的对照对象是 **Tensorizer**
> （非 Safetensors loader）；Mooncake 用 FAST'25 正式版数字（+59%~498% 有效请求容量），
> 不用 arXiv 版；VAST 源换用 NVIDIA Dynamo×VAST 官方博客（TTFT 62s→3s）。
> ② 顶栏加第三个模式按钮后，1440px 下 NVL576 的产能警示条会把顶栏首行挤成两行
> （flex-wrap 预期行为，版面完整，未改 src——如需单行可在后续批次微调）。

## Context

现有模拟器只有「整体→局部」纵向下钻视角（cluster→rack→tray→board），缺「横向切面」视角。
目标用户（Token Factory 售前/从业者）想按领域立体地学习：网络/存储硬件的特点、解决的问题、
业务场景，以及**硬件 → 依赖它的 serving runtime 技术（Dynamo NIXL、SHARP、GDS、KVBM、
Model Streamer、PD 分离、EP all-to-all）→ 影响的推理环节与指标（TTFT/TPOT/tok/s/冷启动/
扩展性/MTTR）** 的因果链——这是幻灯片版面装不下的内容。

首批交付**网络切面**与**存储切面**，与现有 3D 工厂深度集成（中央仍是 3D 场景，这是与幻灯片
的差异化）。serving runtime 以「技术注册表 + 因果链」叙事呈现，**不建软件层 3D 实体**（已确认）。
全量一批交付（已确认）。

已有雏形：7 个 `scene.gb300.learn-plane-*` 练习站证明「场景驱动 + 平面开关」的教学路径可行。
网络硬件建模很全；存储几乎空白（只有本地 NVMe、外部存储阵列 40 GB/s、HGX 的 KV offload
官方原句 `hgx-b300.ts` kvCacheOffloadNote）；NIXL/KVBM/Model Streamer/Mooncake/WEKA/VAST/
对象存储/冷启动/MTTR 全仓零命中。

## 设计总纲（关键裁决）

| 决策点 | 结论 |
|---|---|
| 挂载方式 | 第四个 `ExplorerMode = 'lens'`；顶栏加「切面」按钮；左栏换 LensPanel、右栏换 LensChapterPanel、中央 3D 与 FlowBar 不动（照抄 compare 模式的换栏结构） |
| 章节驱动 3D | **LensChapter 内嵌场景字段**（systemId/lodLevel/focusAssemblyId/planes/highlightAssemblyIds/highlightConnectionIds），不引用 ScenePreset——避免污染 TourPanel、避免给 ScenePreset 加必填字段回填 21 个既有场景 |
| 章节激活 | 新 store action `setLensChapter(idx)`：**一次原子 set** 写入 drill（复用 `nextState({type:'applyScene'})`）+ generation + planes + mode，避免两次相机飞行闪跳（`useCameraRig` 效果 A 依赖 `[level, focusPath, systemId]`）；补 applyScene 缺的换代收尾（flow 停播、compare 右侧清洗） |
| 因果链结构 | **ChainLink「链路行」**：每行自含 硬件 roleKeys → techniqueId → phases → metrics + narrative，不做节点图（作者成本与 380px 渲染成本都低，且直接对应「什么硬件支撑什么技术带来什么效果」的心智模型） |
| 硬件锚点 | ChainLink 用 **roleKey 在本章 systemId 内解析**（跨代语义键纪律）；章节 highlight 字段用显式 asm/con id（ScenePreset 先例） |
| 技术注册表 | 新增 `src/data/techniques.ts`（`tech.` 前缀，9 条），跨代实体不属于任何系统文件 |
| 第七平面 | **不加**。存储继续挂 `business` 平面（`NetworkPlane` 是持久化键：localStorage / `?planes=` 深链 / palette / routing 七处联动，成本过高） |
| L4 数据库/向量库 | narrative-only：`hardwareRoleKeys: []` + 不动 3D——「这层不在机架里」本身是教学点；官方源零出现，建 3D 实体违反证据纪律 |
| 计算器口径 | 单点理论下限 + 独立 headline caveat（不复用/不修改 capacity 的 `NOT_MODELED_CAVEAT`），evidence 恒 `author_opinion`，null 传播绝不当 0；带宽口径用 `LinkRate{value,unit,direction}` 显式化双向/单向纪律（LEARNING.md「v1.5 订正记录」18×→9× 教训的代码化） |
| persist | lens 状态**不落盘**（partialize 白名单天然排除） |

## 一、数据层（W-A）

### 1. `src/data/types.ts` 新类型

```ts
export type InferenceMetric = 'ttft' | 'tpot' | 'throughput' | 'cold-start'
  | 'kv-hit' | 'scalability' | 'mttr' | 'cost-per-token'  // cost 仅叙事标注，不出数

export type TechniqueCategory = 'transport' | 'collective' | 'kv-management'
  | 'model-loading' | 'orchestration' | 'routing'

/** 内联中文标签的关键数字行（不进 specLabel 体系——这些数字不参与跨代规格配对） */
export interface FigureRow { key: string; label: string; claim: Claim }

export interface RuntimeTechnique {
  id: string                    // tech.*
  name: string; fullName: string | null; vendor: string
  status: ProductStatus; category: TechniqueCategory
  summary: string; presalesNote: string
  requiresRoleKeys: string[]    // 依赖的硬件角色（至少存在于一个系统的装配树）
  planes: NetworkPlane[]
  affectsPhases: FlowPhase[]    // 复用 flows 的受控枚举
  affectsMetrics: InferenceMetric[]
  figures: FigureRow[]
  docUrl: string | null; sourceIds: string[]
}

/** 因果链一行：硬件 → 技术 → 环节 → 指标 */
export interface ChainLink {
  id: string                    // 章节内唯一
  hardwareRoleKeys: string[]    // 在本章 systemId 内解析；[] = 不经硬件（L4 叙事行）
  techniqueId: string | null    // null = 硬件直达指标（如 OOB → MTTR）
  phases: FlowPhase[]; metrics: InferenceMetric[]
  narrative: string             // RichText
}

export interface LensChapter {
  id: string                    // 必须以父 lens id + '.' 开头
  title: string; narration: string   // 三段式：①看到什么 ②谁连谁+关键数字 ③没有这层会怎样
  systemId: string              // 章节 pin 代际（可跨代）
  lodLevel: LodLevel; focusAssemblyId: string | null
  planes: NetworkPlane[]
  highlightAssemblyIds: string[]
  highlightConnectionIds: string[]   // 新能力：强调连接线（存储路径动线）
  chain: ChainLink[]            // ≥1 行
  keyFigures: FigureRow[]
  calculatorId: 'kv-transfer' | 'model-load' | 'kv-restore' | null
  crossRefs: { label: string; chapterId: string }[]  // 代际对照跳转（跳转自带换代）
  presalesNote: string | null; sourceIds: string[]
}

export interface DomainLens {
  id: string                    // lens.*
  domain: 'network' | 'storage'
  title: string; summary: string; presalesNote: string | null
  chapters: LensChapter[]; sourceIds: string[]
}
```

- `FactoryContentPack` 追加 `techniques: RuntimeTechnique[]`、`lenses: DomainLens[]`；
  `ID_PREFIX` 追加 `techniques: 'tech.'`、`lenses: 'lens.'`。
- `src/data/index.ts`：FACTORY_PACK 挂两个新集合 + `techniqueById`/`lensById` 查询 + packStats。
- **不改 ScenePreset**（v1.6 不给场景加 highlightConnectionIds，波及面留给二期）。

### 2. `src/data/techniques.ts` 首批 9 条

`tech.nixl`（transport）、`tech.kvbm`（kv-management）、`tech.model-streamer`（model-loading）、
`tech.gds`（transport）、`tech.sharp`（collective）、`tech.pd-disagg`（orchestration）、
`tech.ep-alltoall`（collective）、`tech.rail-routing`（routing）、`tech.adaptive-routing`（routing）。

### 3. 存储侧新建模（只加 GB300 + HGX，其余代际章节叙事带过）

- `src/data/shared.ts`：`cmp.shared.object-storage`（kind `storage`，shape `storage-array`，
  specs 全 `notPublished`——RA 不涉及对象存储选型；note 写明「行业通行架构的建模描述」，
  照抄冷板先例）。既有 `roleKey: 'external-storage'` 语义定为 **L2 高性能共享存储**，
  不改名（跨代配对键）。L1 已有（GB300 M.2/E1.S、HGX os/cache-storage），零新建。
- GB300：`asm.gb300.object-storage`（parent=facility，roleKey `object-storage`，lodLevel
  cluster）+ `con.gb300.objstore-converged`（converged-switch↔object-storage，plane business，
  `bandwidth: null`）。
- HGX：`asm.hgx.object-storage` + `con.hgx.objstore-converged` 同构。
- `src/lib/layout.ts` PLACEMENTS 补 `object-storage` 摆位（external-storage x=5.4 旁）。
- `src/lib/specLabel.ts` 补新组件 specs 键中文标签（以 specLabel.test 红灯为准）。

### 4. `src/data/sources.ts` 新登记 9 源

| id | kind / 允许证据档 |
|---|---|
| `src.nvidia-dynamo-docs` | official_doc；架构描述 verified_spec，性能倍数 vendor_claim |
| `src.nvidia-nixl-repo` | official_doc（GitHub README/docs）；能力清单 verified_spec，无硬数则 value:null |
| `src.nvidia-sharp-docs` / `src.nvidia-gds-docs` / `src.nvidia-spectrumx-docs` | official_doc；同上 |
| `src.runai-model-streamer` | official_doc；**benchmark** 档（4.88s vs 37.36s，locator 必带盘型/实例/模型配置） |
| `src.mooncake-fast25` | official_doc（厂商自述系统论文，note 注明非独立评测）；**benchmark**，数字实施时逐字核对论文，核不准则 value:null |
| `src.weka-materials` / `src.vast-materials` | official_doc；**仅 vendor_claim**，note 注明营销口径 |

纪律：WEKA/VAST/Mooncake 的数字**只进 technique/lens 的 figures，永不进
`components[].specs`**（content.test 加锁）。实施方必须实访官方 URL（v1.5 方法论第 3 条；
`developer.nvidia.com` 用 WebFetch 返回空须改 firecrawl）。

### 5. 章节大纲

**`lens.network` 网络切面（6 章）**。证据档：【V】verified_spec【VC】vendor_claim
【B】benchmark【∅】value:null。

| # | 标题 | pin | 因果链要点 | 关键数字 |
|---|---|---|---|---|
| 1 | NVLink 域：72 卡一跳互联的 KV 高速路 | GB300 rack | nvswitch-tray+backplane → tech.ep-alltoall → moe-dispatch/combine → tpot/throughput；→ tech.pd-disagg（域内 KV 直达）→ kv-write → ttft | 1.8 TB/s/卡【V】、130 TB/s【V】，双向口径必标注 |
| 2 | 计算网：rail-optimized 双平面怎么喂跨机并行 | GB300 cluster | cx8-nic(1:1) → tech.rail-routing + tech.adaptive-routing → prefill/moe-dispatch → ttft/scalability | 800 Gb/s/GPU、2×400 双平面【V】；adaptive routing 收益【VC/∅】 |
| 3 | 在网计算：SHARP 把 all-reduce 搬进交换芯片 | VR rack | NVLink6 交换托盘 → tech.sharp → TP all-reduce → ttft/tpot | 14.4 TFLOPS FP8/托盘【V】（既有 `sharpFp8Tflops`）；GB300 代 SHARP 算力【∅】 |
| 4 | 业务存储网：KV 卸载与模型拉取的物理通道 | GB300 cluster | bf3-dpu+converged-switch → tech.kvbm/tech.nixl → kv-write → ttft/kv-hit；→ tech.model-streamer → cold-start | 每节点 40 GB/s【V】、双 400 Gb/s【V】、HGX KV offload 官方原句【V】 |
| 5 | 管理网：带宽最小的网守着 MTTR | GB300 cluster | SN2201+BMC → techniqueId: null → mttr | 48 口/1 Gb/s【V】；MTTR 数字【∅】 |
| 6 | 域的大小决定并行方式（HGX 对照）+ 计算器 | HGX rack | 板载 NVSwitch（域止步 8 卡）→ tech.pd-disagg（跨机 KV 走以太）→ tpot/scalability；`calculatorId: 'kv-transfer'` | 板内 14.4 TB/s vs 跨机 800 Gb/s【V】并排即钩子 |

**`lens.storage` 存储切面（5 章，沿推理业务动线：分发→加载→运行时 KV→归档→RAG）**

| # | 标题 | pin | 因果链要点 | 关键数字 |
|---|---|---|---|---|
| 1 | 模型分发：L3 对象存储是货仓 | GB300 cluster | object-storage(新) → tech.model-streamer（S3 直读）→ cold-start；highlightConnectionIds 点亮 objstore→converged→storage→bf3 全路径 | 对象存储吞吐【∅】；S3 直读 vs 先落盘【B】 |
| 2 | 冷启动：把权重塞进 HBM 要几秒 + 计算器 | GB300 rack | L2 共享+E1.S → tech.gds + tech.model-streamer → cold-start；`calculatorId: 'model-load'` | 40 GB/s【V】、Model Streamer 4.88s vs 37.36s【B】、E1.S 带宽【∅】 |
| 3 | 运行时 KV：显存不够、层级来凑 + 计算器 | HGX rack | HBM→L1 NVMe→L2 共享 → tech.kvbm + tech.nixl → kv-write/decode → ttft/kv-hit；`calculatorId: 'kv-restore'` | KV offload 官方原句【V】、Mooncake TTFT 收益【B】、命中率【∅】（负载相关） |
| 4 | 归档与镜像：MTTR 的另一半 | GB300 cluster | L3 归档/镜像仓 → techniqueId: null → mttr/cost-per-token | 以【∅】为主 |
| 5 | RAG 与 L4：数据库/向量库（纯叙事） | GB300 | `hardwareRoleKeys: []`、focusAssemblyId: null（不动 3D）→ 检索串行叠加 → ttft | 零硬 Claim；WEKA/VAST 数字一律【VC】 |

章节内容文件放 `src/data/lenses/{network,storage}.ts`。

## 二、lib 纯函数（零 three，node 可测，每个配 .test.ts）

- **`src/lib/lens.ts`**：`lensChapterAt(lensId, idx)`、`chapterPlaneFlags(chapter)`、
  `activeLensChapter(mode, lens)`（门条件唯一出处，仿 `activeTourScene`）、
  `isChapterStateDirty(chapter, {level, focusPath, planes})`（偏离提示）、
  roleKey→assemblyId 解析（在章节 systemId 内）。
- **`src/lib/connectionEmphasis.ts`**：`emphasizedConnectionIds({mode, lens, flowPlaying,
  reducedMotion, step})` — flow/lens 连接强调的唯一裁决。优先级：flow.playing 时 FlowStep 赢
  → 否则 lens 章节赢（含 reducedMotion，lens 强调本身是静态的）→ 否则维持现状。3D 与降级共用。
- **`src/lib/metricLabel.ts`**：`METRIC_LABEL: Record<InferenceMetric, string>`（仿 planeLabel
  模式，全枚举测试锁）。
- **`src/lib/storagePath.ts`**（存储计算器，W-C）：
  - `LinkRate { value: number|null; unit: 'GBps'|'Gbps'|'TBps'; direction: 'bidirectional'|
    'unidirectional'; label }` + `toUnidirGBps(rate)`（归一化为单向 GB/s，返回换算 note）。
  - `modelLoadBreakdown(weightGB, segments)` → 各段秒数 + 瓶颈段 + 串行总时长（任一段 null →
    total null）。weightGB 来自 `roofline.memoryBreakdown`。
  - `kvRestoreVsRecompute(model, contextTokens, gpuTflops, gpuCount, tiers)` → 重算侧调
    `roofline.estTTFTms`（可透出 MFU 三档），恢复侧 = `kvBytesPerToken × context ÷ 层级带宽`
    单点。`unsupported` kvSpec 全线 null。
  - 数据适配 `storageLadderOf(systemId, pack)`：从内容包收集官方 Claim（40 GB/s、HBM 带宽），
    产出 `inputClaims`（照抄 `CapacityInputClaim`）；官方没有的段 value:null，UI 允许用户
    手输假设值（假设值只进函数参数，不落数据层）。
- **`src/lib/kvTransfer.ts`**（网络计算器，W-C）：`kvTransferLadder(kvGB, rungs)` — PD 分离
  一次 KV 交接在 NVLink 域内（1.8 TB/s 双向，换算 note 必带）/ 跨域 CX-8（800 Gb/s 单向 =
  100 GB/s）/ 存储网（40 GB/s）三档耗时。
- 口径：两个计算器各自导出独立 `*_HEADLINE_CAVEAT`（固定首条，仿 capacity.ts）+「未建模：
  协议开销、并发争用、条带化、排队」；evidence 恒 `author_opinion`；**不动** capacity 的
  `NOT_MODELED_CAVEAT`。

## 三、UI 集成（W-B）

### store（`src/store.ts`）

```ts
export type ExplorerMode = 'explore' | 'compare' | 'tour' | 'lens'
// state 新增 lens: { lensId: string | null; chapterIdx: number }   // -1 = 无激活章
// actions：setLens(lensId)（进入切面，续读上次章节或第 0 章）
//          setLensChapter(idx)（一次原子 set：nextState applyScene 分支 + generation
//            + planes + mode:'lens' + tourStopIdx:-1 + 换代时 flow 停播/compare 清洗）
// setGeneration 增补：手动换代 → lens.chapterIdx = -1（章节失效，mode 留 lens，空态显式化）
// persist 不落盘 lens；reset() 不动
```

### 面板

- **`src/components/ui/Section.tsx` / `ClaimRow.tsx`**：先从 DetailPanel 提取（DetailPanel
  改 import，DOM 结构不变）——避免第二份证据渲染实现。
- **`src/components/panels/LensPanel.tsx`**（左栏 248px）：SegmentedTabs 切换网络/存储切面
  （`data-lens`）→ 章节列表（照抄 TourPanel 的 `<ol>` + scrollIntoView；每项
  `data-lens-chapter`，副行显示「级别 · 代际短名 · N 平面」——pin 的代际必须可见）→
  偏离提示「已偏离本章视角 · ↺ 恢复」（`isChapterStateDirty` 判定，onClick 幂等重放
  setLensChapter）→ PlaneToggles 保留 → 「退出切面」按钮（setMode('explore')）。
- **`src/components/panels/LensChapterPanel.tsx`**（右栏 380px）：章头（第 i/N 章 + 代际徽章
  + 上/下章按钮 `data-lens-prev/next`）→ narration（RichText）→ **因果链**：每条 ChainLink
  渲染为纵向卡「[硬件 chips] ↓ [技术 chip] ↓ [环节·指标 chips]」+ narrative；硬件 chip
  hover→`hover(asmId)`、click→`select(asmId)`（复用现有通道）；技术 chip 点击展开注册表
  技术卡（summary/figures/docUrl，`data-causal-expanded`）；指标用 METRIC_LABEL →
  **关键数字**（keyFigures → ClaimRow，证据徽章全套）→ **计算器**（按 calculatorId 分发，
  输入控件照抄 CapacityPanel，状态本地 useState 不进 store；`data-lens-calc` /
  `data-lens-calc-out`）→ 代际对照 crossRefs 链接 → presalesNote。部件详情走**右侧 Drawer**
  （`Drawer side='right'` 预留场景）内嵌 DetailPanel。
- **`src/pages/FactoryPage.tsx`**：左 aside `mode==='lens' ? <LensPanel/> : <TourPanel/>`；
  右 aside 三分派 compare/lens/默认双 tab；FlowBar 回调在 lens 模式下只 select + 开详情 Drawer。
- **`src/components/panels/BreadcrumbBar.tsx`**：模式按钮数组加「切面」（onClick=setLens
  续读）；隐藏 span 补 `data-lens-id`/`data-lens-chapter`。

### 3D / 降级联动

- **`src/lib/sceneHighlight.ts`**：`sceneHighlightSet` 增可选 lens 参数——`mode==='lens'`
  走 `activeLensChapter().highlightAssemblyIds`，同一套 `visibleAncestorAt` 折叠；SceneRoot
  与 Fallback2D 各加窄订阅 `s.lens` 透传。高亮观感免费继承（`highlightKindOf` 裁决
  selected>hovered>flow>scene，零新颜色）。
- **`src/components/scene/ConnectionLayer.tsx`**：`activeConnectionIds` 改由
  `emphasizedConnectionIds` 提供，视觉参数复用 `FLOW_EMPHASIS`（×1.8/0.35），invalidate
  依赖数组补 lens。
- **`src/components/fallback/Fallback2D.tsx`**：同一函数供 `ConnectionListTable`
  （零改动，整行 data-active 即降级等价物）。

### 深链（`src/pages/useShotParams.ts`）

`?lens=network&chapter=2`（lens 接受短名或全 id；chapter 1 起算，越界回落第 1 章）。
优先级矩阵重写：**⓪ lens 基座与 ① tour 基座互斥，lens 赢**；② gen 与章节 pin 冲突时：
显式 mode=lens → 跳该 lens 第一个同代章节，无则退 explore；无显式 mode → 清 chapterIdx
退 explore；③planes ④right ⑤focus ⑥level 逐项覆盖；⑦ mode 最后落地，`mode=lens` 仅当
lensId 非空才接受。`MODES` 常量加 'lens'。

### 移动端（`src/components/mobile/MobileFactoryView.tsx`，W-D）

最小可用：头部下加切面入口行（`data-mobile-lens-entry`：网络/存储/退出）；lens 模式下
导览块换「上一章/下一章 + 章标题 + 代际徽章」；「本章内容 ▸」打开底部 Drawer 内嵌
LensChapterPanel（计算器保留）。**必改守卫**：自动 `applyScene(first)` 的 effect 加
`if (mode === 'lens') return`，否则进 lens 后换代被打回 tour。

## 四、测试计划

- **pack.test.ts**：`collections` 加 techniques/lenses 两行（前缀+全局唯一自动生效）；
  techniques 的 category/planes/phases/metrics 合法、requiresRoleKeys 至少存在于一个系统
  装配树、sourceIds 已登记、summary/presalesNote 非空；lenses 的章节 id 前缀与唯一性、
  systemId 存在、focusAssemblyId/highlightAssemblyIds/highlightConnectionIds 存在**且属
  本章 systemId**、chain 的 techniqueId 存在、hardwareRoleKeys 在本章系统内存在、每 lens
  ≥1 章每章 chain ≥1 行；`allClaims()` 加 figures 遍历（官方源限制自动覆盖）；
  `claimsWithSystems()`：章节 figures 挂 `[chapter.systemId]`、technique figures 挂 `[]`。
- **content.test.ts 事实锁**：Model Streamer 4.88s、SHARP 14.4 TFLOPS、40 GB/s（与
  `con.gb300.converged-storage.bandwidth` 数值一致锁）、KV offload 原句；9 条 technique id
  清单锁；`lens.storage` 章节顺序 = 业务动线顺序锁；「六平面不扩」锁；WEKA/VAST/Mooncake
  数字 evidence ∈ {benchmark, vendor_claim} 且绝不出现在 `components[].specs`。
- **lib 单测**：lens.ts（章节解析/dirty 判定/门条件）；connectionEmphasis（三档优先级）；
  storagePath/kvTransfer（null 传播、瓶颈判定、`toUnidirGBps` 换算 1.8 TB/s 双向 ≠ 1800 GB/s
  单向且 note 非空、KV 字节量与 roofline 交叉核对 DeepSeek-V3 MLA 576×61×2B、caveat 首条
  恒定）；metricLabel 全枚举；store.test（setLensChapter 原子性/换代收尾/tour 互斥）；
  useShotParams.test（lens 基座一次到位、lens+tour 互斥、chapter 越界回落、gen 冲突三分支、
  mode=lens 无 lens 被忽略、老参数零回归）。
- **E2E（tests/e2e/factory.spec.ts）**：进入 lens（`main[data-mode="lens"]` + 期望值 import
  自 src 纯函数）；章节切换（planes 逐项核对 + `data-generation` 变化 + `data-camera-pose`
  佐证无闪跳）；深链三条；`?lens=…&gl=off`（连接表 data-active 集合 = 章节
  highlightConnectionIds + 全程无 three-vendor 请求）；移动端不横向溢出 + Drawer 出内容；
  计算器输入输出（期望值 import lib）；`?motion=off` 下章节切换 `changedPixelRatio` 证明
  连接强调落画面；换代失效空态；新增 1 张基线 `lens-network-ch1`。
- **基线重拍**：BreadcrumbBar 加第三个按钮 → 13 张桌面基线 + `mobile-tour-stop1` 全部打翻，
  `--update-snapshots=all` 全量重拍后逐张目检（v1.5 教训：基线守的是大改动，内容正确性靠
  人工核对与内容测试）。E2E 前手动 `vite preview --host 127.0.0.1` 起服务（ipv6 坑）。

## 五、实施分批（依赖递进；数据文件修改串行——sources.ts / content.test.ts 是共享冲突点）

- **W-A 数据层**：types.ts 新类型 + ID_PREFIX → pack.test 扩展（先红出清单）→ sources.ts
  9 新源 → techniques.ts 9 条 → shared.ts 对象存储 + GB300/HGX 装配连接 + layout/specLabel
  补齐 → `src/data/lenses/{network,storage}.ts` 章节内容 → content.test 事实锁。
  实施方必须实访官方 URL 核数。
- **W-B 框架与桌面 UI**：lib/lens + lib/connectionEmphasis + lib/metricLabel（含单测）→
  store（mode/lens/actions + store.test）→ Section/ClaimRow 提取 → LensPanel /
  LensChapterPanel（暂不含计算器）→ FactoryPage/BreadcrumbBar 接线 →
  sceneHighlight/ConnectionLayer/Fallback2D 联动 → useShotParams 深链（含单测）。
- **W-C 计算器**：storagePath.ts + kvTransfer.ts（含单测）→ LensCalculator UI 三个变体接入章节。
- **W-D 移动端与收口**：MobileFactoryView 适配（含守卫）→ E2E 新用例 + 基线全量重拍目检 →
  LEARNING.md 新章（切面课：每章任务卡 + `?lens=` 深链速查进附录 B）→ 本文件回填状态。

## 六、验证门禁

1. `npm run typecheck && npm test`（全部单测含新增约 8 个 test 文件，667 → 预计 750+）。
2. `npm run test:e2e`（先重拍基线；desktop + mobile 两 project 全绿）。
3. 手工走查：`/?lens=network&chapter=1&motion=off` 一次到位；章节 1→6 逐章切换无相机闪跳、
   跨代章（ch3 VR、ch6 HGX）代际徽章与 3D 同步；`?lens=storage&chapter=1` 存储路径连线强调
   可见；`?gl=off` 降级连接表高亮等价；手动下钻后偏离提示出现且「↺ 恢复」幂等；390px 宽
   移动端章节推进 + Drawer；计算器 null 传播（选 unsupported kvSpec 模型显示「无法估算」）。
4. `/report` 不受影响（不加载 three-vendor 断言仍绿）。

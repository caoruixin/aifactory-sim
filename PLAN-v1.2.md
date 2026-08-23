# v1.2 机架级数据流可读性修复 + 交换层职责澄清（两轮 codex 评审后定稿）

> ✅ 已于 2026-08-23 实施完成（提交 cc6ee3f / a5e5df7 / 951750d / 85622a9 / 44e4d83；独立 QA 核验全绿：421 单测、E2E 25+25、锁定约束逐项 PASS）

## Context

用户两个反馈：

**A. 「光点去哪了」**：`?level=rack&focus=asm.gb300.rack` 播放推理数据流，光点「走着走着就没了」。探索审计 + 两轮 codex（gpt-5.6-sol, xhigh）复核后的根因：

1. **步 2/9 粒子真的飞出画面**：`con.gb300.bf3-converged` 的远端（汇聚交换机，中心 z=-4.4，正交路由总长 ~9.15m）在机架级不渲染任何几何体。v1.1 B4 的出界截断只在 tray/board 生效——`SceneRoot.tsx:562-565` 的 containment 只认 `anchor.kind==='tray'`。
2. **步 1/6/10（logicalOnly）共 ~9s 零 3D 反馈**（highlightAssemblyIds 全空）。步 4 kv-write **已有**静态折叠高亮（18 托盘发光）但无动态——「本地物理动作」读不出来（增强项，非填补空白）。
3. **48% 的线是噪音**：rack 深度 25 条线里 7 条两端都在机架外、5 条跨界拖到画外。
4. **方向与连续性**：步 2「请求进入」方向画反；Prefill/Decode 底层边是 `bidirectional` all-reduce，单向播放是语义错误（codex R2）；切步瞬移、无路径凭空消失（`FlowLayer.tsx:109-122`）；3 颗粒子共用同一 frac 完全重合。

**B. 交换层职责不清**：「Spine 交换层（计算网）/ Leaf 交换层（计算网）/ 汇聚交换层（业务与存储网）」三者功能与区别读不出来——三个组件的 summary/presalesNote 各说各话，没有互相对照。

**已决事项（不再讨论）**：不做相机跟随（C1 契约 + `factory.spec.ts:490-575` 位姿断言）；不做 rack 深度扇出（`routing.test.ts:136-140` + 噪音）；靠截断把动作压回画面内；交换层不改 label 文本（避免 fallback/mobile/compare 十余张基线连锁重建），只重写详情内容。

## 硬约束（v1.1 同款，违反即返工）

- `src/lib/` 零 three 导入；颜色经 palette.ts；每帧动画值放 ref/材质不进 store。
- **types.ts 只增不改；新字段必填 + `| null`，禁用 `?:`**（codex R2 P0：`reverse?:` 违规——见 F3 的 particleDirection 设计；pack JSON 往返与 hasOwn 断言锁定）。
- **锁定测试不删改**：`routing.test.ts:81-97` 两条 cluster-nvlink 回归、`:282-284` opt-in 契约、`:116-128` instancePaths 恒等/唯一。
- 证据纪律：步 1/10 发生在机架外，不得标注机架内硬件参与；步 6 标 `asm.gb300.b300-gpu` 有 description 原文背书；交换层内容只写定性职责（rail-optimized/两张网隔离是 v1.0 已引 RA 的既有事实），不发明数字。
- `flowTimeline.test.ts:208-214` 是非锁定测试，按新数据更新并注明。
- **空剧本防御**：`episodeOf` 可返回 undefined（Vera Rubin/NVL576 无 episode，`index.ts:195`），比较模式右视口仍挂 SceneRoot——所有新逻辑对「无 episode/无当前步」安全，TS strict 不得非空断言。

## 批次 1（F1）：rack 深度出界截断

**文件**：`src/components/scene/SceneRoot.tsx`、`ConnectionLayer.tsx`、`FlowLayer.tsx`、`src/lib/routing.test.ts`（只增）、`tests/e2e/factory.spec.ts` + `gb300-rack-allplanes.png` 基线。

- `SceneRoot.tsx:562-565` containment memo 加 `anchor.kind==='rack'` → `{ rootAssemblyId: anchor.rackAssemblyId }` 分支（rack 变体见 `drill.ts:122`）；tray 现状不变；cluster 仍 null。注释更新（容器=实际渲染子树根；routing 用 instance 0 世界坐标与 `onlyInstance={0}` 一致）。
- **containment 对象完整贯穿**：`ConnectionLayer.tsx:74` / `FlowLayer.tsx:75` 现把 containment 降级成字符串再重建——margin 被静默丢弃。改为直接透传完整 `ContainmentOptions`（useMemo 依赖含 margin）。
- **stub 标签防重叠（codex R2 P1）**：margin 0.3 时 `cx8-leaf` 与 `inrack-oob-uplink` 的 tip 仅差 2.2cm，`<Html center>` 必然叠死，「向内偏移」救不了。方案：ConnectionLayer 对同一 containment 下的全部 stub 按 connectionId 排序做**确定性屏幕槽位堆叠**（世界系里按槽位序号加固定间隔偏移，如沿 stub 法向/竖直方向 0.12m×slot），标签指向线端点可用短引导线或保持贴近。margin 决策门保留（0.6 起步，目视含 mobile rack 导览站；若 mobile 拥挤可 CSS 隐藏移动端标签，决策写注释）。
- 预期：25 条 → 13 条完整 + 5 条 stub（cx8-leaf / bf3-converged / inrack-oob-uplink / facility-power-shelf / manifold-cdu），7 条纯噪音消失。
- routing.test.ts 新 describe：plain vs clipped——7 条 outside 逐条 undefined；5 条 crossing 的 `stub.farAssemblyId`（inrack-oob-uplink 端点实施时核实 gb300-nvl72.ts:1300 附近再写）；**bf3-converged 存在且 from/toAssemblyId 保持折叠语义**（保护 clipped timeline 端点语义的正是这条新测试）；机架内 13 条 stub===null 且 points 与 plain 相同（抽查）；clipped 六平面各 ≥1；**显式 margin 生效**（0.3 vs 0.6 tip 不同）；stub tip 在盒**表面**：三轴 `<= limit` 外加至少一轴 `abs(abs(tip-center)-limit) <= epsilon`（现有 :260-280 模式盒内任意点假绿）；确定性 JSON 逐位。
- E2E：rack-allplanes 用例加 DOM 断言——`[data-stub-label]` count=5、含汇聚交换机、无 storage/spine、每个标签 bbox 在画布内、**逐对 bbox 无交集（或最小间距）**；重建 `gb300-rack-allplanes.png`。

## 批次 2（F3）：粒子方向、淡入淡出、串珠

**文件**：`src/data/types.ts`、`src/data/flows.ts`、`src/data/pack.test.ts`（只增断言）、`src/lib/flowTimeline.ts` + 测试、`src/components/scene/FlowLayer.tsx`。

- **types.ts**：`FlowStep` 增**必填**字段 `particleDirection: 'forward' | 'reverse' | 'bidirectional' | null`（注释：相对连接 from→to 的播放方向；bidirectional=相向串珠表现双向 collective；null=本步无线/不适用）。10 个步骤全部显式填写；pack.test.ts 增 `hasOwn` + 值域断言（codex R2 P0）。
- **flows.ts**：步 2 ingress `'reverse'`（请求进入=converged→tray）；步 9 egress `'forward'`；步 7 dispatch `'forward'`；步 8 combine `'reverse'`（description 原文「送回 Token 原本所在的 GPU」）；**步 3 prefill / 步 5 decode `'bidirectional'`**（底层边 `all-to-all, bidirectional`，相向粒子如实呈现 all-reduce，codex R2 P1）；步 1/4/6/10 `null`。flowTimeline.test.ts 的 fake steps 同步补字段。FLOWS 仅 GB300 一个 episode。
- **flowTimeline.ts**：`TimelineSegment` 增 `direction`（映射自 step）。纯函数：
  - `particleFraction(direction, headFrac, trailOffset, beadIndex)`：forward/reverse 同前（<0 → null 未入场）；bidirectional 时按 beadIndex 奇偶分配正/反向（相向流动）；
  - `fadeAlpha(progressSec, durationSec, playing, rampSec=0.3)`：**非 playing 恒 1**——刻意的「暂停转静态标记」语义（暂停瞬间 alpha 跳回 1 是设计而非 bug），注释 + 单测钉住（codex R2 P2）；
  - `segmentParticlePosition(seg, headFrac, beadIndex)`：组合方向/相位/`sampleAtFraction`，**FlowLayer 每帧直接调用**——reverse/bidirectional 漏接必红。测试用真实 `buildTimeline` 段：ingress headFrac=0 位置=路径末点、prefill 两珠相向、**headFrac≈0.5 时正反向珠子的前后顺序断言**（codex R2 P2）、拖尾未入场 null。
- **FlowLayer.tsx**：材质挂载期即 `transparent`，opacity 每帧写 `fadeAlpha`（材质 ref）；per-instance scale 乘 alpha；MAX_PARTICLES=3 串珠（trailOffset=0.07×珠序，拖尾 ×0.75/×0.55；bidirectional 时珠按奇偶双向）；切步仍 progressRef=0；文件头注释补设计意图。
- E2E 粒子像素用例（board 级 1.5s 窗）评估无假阴性，阈值不动。

## 批次 3（F2）：每一步都有 3D 反馈

- **步 6 Router**：flows.ts `highlightAssemblyIds: ['asm.gb300.b300-gpu']`；flowTimeline.test.ts:208-214 改显式三段（gateway/billing 空、moe-router 断 chipIds+折叠）。
- **步 4 kv-write 脉冲**（给已有静态高亮加动作感）：
  - `isLocalPhysicalStep(step: FlowStep | null | undefined): boolean`（flowTimeline.ts，空值 false），语义 `!logicalOnly && connectionIds.length===0`。
  - `GenericShapes.tsx` ShapeMesh 增 `emissivePulse`；`EmissivePulseDriver` **常驻 + enabled 切换**，相位本地 ref 从 enabled 置位起累加（起始相位确定）；**复位放 effect**：`[enabled, flow.playing, reducedMotion, base]` 变化时同步写回最新 base + invalidate（codex R2 P1：暂停把 frameloop 切回 demand，useFrame 的 else 可能永远不执行，材质会冻结在任意脉冲值）；useFrame 只跑 active 分支 `emissiveIntensity = base×(0.7+0.5sin(phase·2π/1.4))`。
  - `Hotspot.tsx` 传 `emissivePulse={flowActive && flowPulse && !isSelected && !isHovered}`；SceneRoot `flowPulse = isLocalPhysicalStep(currentStep)`（currentStep 经 `episodeOf(...)?.steps[...] ?? null`）；RackInstances 不接（注释说明）。颜色零新增。
- **步 1/10 徽标**：`src/pages/FactoryPage.tsx` 画布容器 DOM 绝对定位徽标（不用 drei Html、不动 canvas 尺寸），条件 **`flow.playing && !degraded && !compareMode && currentStep?.logicalOnly === true`**，文案「逻辑层步骤 · 不产生机架内流量」+ 步骤 label，复用 FlowBar 逻辑层徽章 token，`data-flow-logical-overlay`。桌面即可。
- 测试：`isLocalPhysicalStep` 单测（含 null/undefined、无 episode 代际）；reducedMotion 下「无脉冲、静态高亮保留」由 driver 条件单测覆盖。

## 批次 4（F5）：交换层职责澄清（用户反馈 B，纯内容）

**文件**：三个交换组件定义所在的数据文件（`src/data/shared.ts` 或各代文件，实施时定位）、`LEARNING.md`。

- 对照式重写三个组件的 `summary` + `presalesNote`（不改 label、不加数字 Claim、sourceIds 沿用既有 RA 引用）：
  - **Leaf 交换层**：计算网（Scale-Out）的**机架接入层**——每台机架的 CX-8 网卡按 rail 上联（rail-optimized：同编号网卡接同一台 leaf），GPU 跨机架东西向流量的第一跳。区别句：「Leaf 管接入，Spine 管互联；它们是同一张计算网的两级。」
  - **Spine 交换层**：计算网的**跨机架主干**——只连 leaf 不直连服务器，与 leaf 构成两级 fat-tree，把多台机架拼成一个训练/推理集群。区别句：「NVLink 负责机架内 72 GPU 一跳互联，leaf/spine 负责机架之间。」
  - **汇聚交换层**：**完全独立的另一张网**（业务与存储，North/South）——南北向用户请求、存储读写经 BlueField-3 DPU 接入；与计算网物理隔离，避免业务流量抢占东西向带宽。区别句：「leaf/spine 是 GPU 之间说话的网，汇聚层是集群对外界与存储说话的网。」
- `LEARNING.md` 环节 2.1 补一行自检框架：「leaf=接入 / spine=主干 / 汇聚=另一张网」；环节 3.1 追加使用指引：「机架级看第 2/9 步请求进出机架（粒子在『→ 汇聚交换机』传送门处进出，第 2 步方向朝内）；第 3–8 步板级细节到托盘/板级看。」
- 风险：detail 面板文本变化理论上可能碰 fallback-* 截图（若基线里恰好选中这三个组件之一）——实跑确认，如漂移属预期文本变化则重建并说明。

## 批次 5（F4）：E2E 收口

1. **kv-write 脉冲**：rack 视图点 step 3 → t0 截图 → 播放 → **按本地相位在峰/谷采样（约 +0.35s 与 +1.05s）**，断言 `diff(t1,t2) > 0.001` **且** `diff(t0,t1)` 或 `diff(t0,t2)` 超阈值（codex R2 P1：只比 t0 会放过「恒定压暗」的坏实现）；断言 `data-flow-step` 仍为 3；**暂停后再截图与 t0 差异 < 小阈值**（验证 effect 复位）。`?motion=off` 下播放期间无脉冲差异。
2. **逻辑步徽标**：默认无 → 播放步 0 可见 → 点 step 2 消失；比较模式与 `?gl=off` 播放时不存在；播放前后 canvas 高度不变。
3. reverse/bidirectional **不做像素方向 E2E**（天然 flaky；由 `segmentParticlePosition` 真实段单测覆盖，spec 注释写明取舍）。
4. stub 断言已并入 F1（count + 去向文本 + bbox 画布内 + 逐对无交集）。
- 基线：仅预期重建 `gb300-rack-allplanes.png`（F5 若碰 fallback-* 按实说明）；其余全量确认零漂移，计划外漂移当回归查。

## 验证

- 每批次后 `npm run typecheck && npm test && npm run build` 全绿（基线 381 单测）。
- E2E：先手动 `npm run preview -- --host 127.0.0.1 --port 4173`（本机 preview 只绑 [::1]，勿改 playwright.config），再 `PLAYWRIGHT_USE_CHROME_CHANNEL=1 npm run test:e2e`（基线 21+21）。
- 视觉证据用 headless Playwright（不用 claude-in-chrome）。
- 完成后：主循环复核（锁定测试 diff、rack 视图截图、交换层新文案证据合规）→ `npm run build:pages` → 推 gh-pages → 线上验证 rack 播放全程粒子可追踪 + 三交换层详情 → main 推送，提交末尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

## 关键文件

- src/components/scene/SceneRoot.tsx（rack containment 分支 + flowPulse 下传）
- src/components/scene/ConnectionLayer.tsx、FlowLayer.tsx（完整 containment 贯穿、stub 槽位堆叠；方向/淡入淡出/串珠）
- src/lib/flowTimeline.ts + flowTimeline.test.ts（direction 映射、particleFraction/fadeAlpha/segmentParticlePosition/isLocalPhysicalStep）
- src/data/types.ts（FlowStep.particleDirection 必填 | null）、src/data/flows.ts（10 步显式方向 + 步 6 高亮）、src/data/pack.test.ts（hasOwn+值域，只增）
- src/components/scene/GenericShapes.tsx、Hotspot.tsx（脉冲通道：driver 常驻 + effect 复位）
- src/pages/FactoryPage.tsx（逻辑步徽标，带比较/降级防御）
- src/data/shared.ts 等（三交换层对照式文案）、LEARNING.md（两处指引）
- src/lib/routing.test.ts、tests/e2e/factory.spec.ts（新断言 + gb300-rack-allplanes 基线重建）

# v1.1 真实性与可读性修复：机房级全连接 + 数据流↔硬件关联

## Context

模拟器 v1.0 已交付并部署（https://caoruixin.github.io/aifactory-sim/ ，仓库 ~/projects/aifactory）。用户实际使用后提出两个成立的问题：

**问题 A（集群视图失真）**：机房设备（机架/交换机/CDU/存储/管理节点/水管/配电）看起来互不相连。审计结论（已完成，事实如下）：
- `ConnectionLayer.tsx:69` 在 cluster 深度硬过滤：只放行 scaleout+nvlink，**业务/管理/供电/液冷四个平面即使开关打开也不画**；数据包里已有 10 条合法机房级连接被压掉（3 business / 4 mgmt / 1 power / 2 cooling，含 manifold↔CDU、CDU↔一次侧水路、facility→电源架、带外管理上联、DPU→业务交换机→存储）。
- 内容真缺口：无「机房配电」部件（列头柜/配电柜）；`con.gb300.facility-power-shelf` 的起点是从不渲染的树根 `asm.gb300.facility`（`ClusterScene` 只画 `childrenOf(rootId)`），线会从空气长出。
- 视觉缺陷：`routing.ts` 对 count>1 的端点只用 instanceIndex 0 → 8 台机架只有第 1 台有线；`layout.ts:142-143` 里 leaf/spine 两盒贴叠（Y 差 0.37m），leaf-spine 线不可见。

**问题 C（视角被没收，根因已定位）**：用户手动旋转/缩放后，点击底部数据流步骤，视角被强制打回默认机位。根因：`CameraRig.tsx:49-68` 的 `useLayoutEffect` 依赖里含 `width, height`，且触发即无条件 `setLookAt(preset)`。FlowBar 的当前步骤卡展开/收起会改变底栏高度 → 画布 resize → effect 重放 → 相机复位。任何改变画布尺寸的操作（点步骤、窗口调整）都会清掉用户视角。

**问题 B（数据流与硬件关联不清）**：播放推理数据流时只有线加粗/小亮点，与具体硬件对不上。如 KV 写入实际是 GPU↔HBM，但 HBM 只有一颗极小常亮微光（`FlowLayer` beacon，半径 0.018），参与步骤的硬件本体不发光、FlowBar 不显示「本步涉及哪些硬件」；托盘/板级下通往托盘外端点（业务交换机等）的线拖成冲出画面的长斜线（用户截图所示）。

目标：集群视图如实呈现六平面机房级连接；数据流每一步与参与硬件的视觉/交互绑定明确。

## 关键既有事实（审计已确认，实现时勿重查）

- 30 条 GB300 连接的逐条 cluster 深度判定见审计：18 条退化（机架内，正确不画）、12 条非退化（2 条 scaleout 已画，10 条被平面过滤）。**放开过滤后大部分连接自动出现，内容层只需补配电一块。**
- `routing.ts:192-196` 退化边丢弃正确，保留；`visibleChain/visibleAncestorAt` 是折叠入口。
- 锁行为的测试：`routing.test.ts:78`（GB300 cluster 无 nvlink 路由——**与本次改动不冲突，保留**）、`:88`（NVL576 保留 `con.ru.optics-interrack`——保留）、`:47-53`（rack 深度六平面各≥1）；`pack.test.ts` 连接不变量（端点存在/同系统/from≠to/plane 枚举/`systemId|plane|from|to` 唯一/无 undefined/JSON 往返）；`content.test.ts:130,559-568`（GB300 与 Vera Rubin 六平面覆盖、NVL576 仅 nvlink/power/mgmt/cooling、`:477-483` NVL576 零 scaleout/business）。
- 高亮机制：选中/悬停走 Hotspot 的 emissive（共享材质需注意——per-mesh 高亮已有现成路径）；透明翻转需 `useTransparencyProgramSync`（GenericShapes，B5 ghost 修复引入）。**不做全局压暗**（共享材质做不了 per-instance 压暗）；只做「参与硬件增亮 + 非当前平面的线降透明」。
- `PLANE_TOGGLES` 脚注已过时（还写着「集群只画 scale-out」）；cluster 导览场景 preset 收窄 planes 为 `['scaleout','power','cooling']`（`gb300-nvl72.ts:1530`）——放开过滤后正好生效。
- `FlowStep` 已有 `connectionIds` + `highlightAssemblyIds`；kv-write 步已引用 HBM。types.ts 只增不改（可选字段 `| null`）。
- 三代包同构：Vera Rubin 同样有 8 条可画机房级连接被压；NVL576 有 3 条（power/cooling）。修改需三代同享（组件层代码本就按 systemId 泛化）。

## 改动设计

### A. 机房级全连接

**A1 放开视图过滤** — `src/components/scene/ConnectionLayer.tsx`
删除 `:69` 的 cluster 硬过滤，改为：任何**非退化**路由，只要其平面开关打开就画。默认视觉秩序交给场景 preset（导览已收窄平面）与用户开关，不再由渲染层越权决定。同步更新头注释与 `PlaneToggles.tsx:57-60` 脚注（改为「机架内部连接在机架级可见；集群级呈现房间级干线」）。

**A2 机架扇出** — `src/lib/routing.ts`（纯函数，零 three）
**保持每条内容连接一条 `RoutedConnection`、`connectionId` 不变**（否则打破 `routing.test.ts:93` 对 NVL576 `con.ru.optics-interrack` 恰一条路由的锁定断言，且 `routing.ts:225` 按内容连接 id 建的索引会被 `#i` 后缀击穿——flowTimeline 查不到路径）。做法：`RoutedConnection` 增加 `instancePaths: Path[]` —— 当端点折叠到 count>1 的 rack 节点（cluster 深度 + roleKey==='rack' 限定，mgmt-node 等仍单锚点）时，主路径（instance 0，flow 粒子沿用它）之外为每个实例附加一条几何路径；渲染层把全部 `instancePaths` 画成线。测试：`instancePaths.length===8`、确定性、主路径与旧行为一致、既有两条 nvlink 回归测试**原样通过**（路由条数不变）。

**A3 配电内容补全** — `src/data/shared.ts` + 三代数据文件 + `src/lib/layout.ts`
- `shared.ts` 新增「机房配电（列头柜/配电母线）」组件：kind `power`，summary/presalesNote 写清「市电→配电→电源架→母排」链路；规格 Claim 全部 `value: null`（RA 未给配电柜参数），sourceIds 引 NVIDIA RA 供电页（存在性）；不发明数字。
- 三代各加 1 个 cluster 级装配节点（roleKey `facility-power`，parent=facility），并把 `con.*.facility-power-shelf` 的 from 端从 facility 根改指到它——线从可见盒子出发。NVL576 沿用（其电源架 claim 仍为 forecast，连接本身不带 claim，不触发证据规则）。
- `layout.ts` `PLACEMENTS` 加 `facility-power` 摆位（机架排端头、busway 沿排走向）；leaf/spine 拉开间距**属纯视觉打磨**（线本身 `depthTest=false` 画在最上层，并非「看不见」的根因），以集群截图验证即可。
- 测试更新：pack/content 测试对新节点/改边的引用完整性自动覆盖；`content.test.ts` 补的断言必须**精确锁改线本身**：三代 `con.*.facility-power-shelf` 的 `fromAssemblyId` === 新 facility-power 装配节点，且 cluster 深度产出的对应路由 `fromAssemblyId` 同样等于它（仅断「存在某条 power 路由」会漏过未改线的情况——现有 facility→power-shelf 边本就非退化）。

### B. 数据流↔硬件关联

**B1 参与硬件增亮** — `src/lib/flowTimeline.ts` + `src/components/scene/`（SceneRoot/GenericShapes/Hotspot 既有高亮路径）
**不在 store 里存派生 ID**（存了会在下钻/切代际后失效：kv-write 引用的 HBM 装配在 cluster/rack 深度未挂载，而深度变化不经过 setFlow）。改为纯函数 `flowStepFocus(episode, stepIdx, depth)`（放 flowTimeline.ts，附测试），组件内按 `[stepIdx, depth, generation]` useMemo 派生**两个集合**：
- `chipIds`：步骤引用的精确装配 ID（connectionIds 端点原值 ∪ highlightAssemblyIds）→ 供 FlowBar chips；
- `sceneHighlightIds`：上述 ID 经 `visibleAncestorAt(depth)` 折叠后的集合 → 供 3D 高亮（kv-write 在机架级折叠为「计算托盘」发光，语义正确，任何深度都有反馈）。
3D 高亮走与「选中」同级的 emissive 机制（区别色 `--color-accent-2`）。**HBM beacon 维持仅 tray/board 深度显示**（保留 `FlowLayer.tsx:107` 的守卫——粗深度若强行显示只会在第 1 台机架放一颗误导光点，粗深度的反馈由折叠高亮承担）；流动粒子半径按深度独立缩放（cluster×4 / rack×2.5 / board×1，顺带解决 P2「集群级粒子近乎不可见」）。

**B2 FlowBar 步骤卡挂硬件** — `src/components/panels/FlowBar.tsx`
当前步骤卡下方渲染「本步涉及」chips：来自 `chipIds`，显示组件中文名，点击 = `select(id)` **并激活右栏「部件详情」tab**（tab 是 `FactoryPage.tsx:47` 的本地 state——用户停在「产能粗估」tab 时只 select 看不到详情；把 tab 切换动作下传或上提）+ 相机不动。内容配套两处小改（不加连接、不加数字 claim）：`flows.ts` kv-write 步的 `highlightAssemblyIds` 补上 B300 GPU（现只有 HBM+Grace，讲不完整「GPU 写 KV 进 HBM」的故事）；`gb300-nvl72.ts` HBM 组件叙述补一句 KV Cache（现文案只讲权重与 decode 带宽，chip 点开要能自洽）。narration 已有的逻辑层/物理层徽章保留。

**B3 当前步骤线强调 + 非相关线退让** — `ConnectionLayer.tsx`
播放中：当前步 `connectionIds` 对应的线加粗（linewidth ×1.8）+ 提亮；其余已开平面的线降 `opacity` 至 ~0.35。**线材质本就常开 `transparent`（`ConnectionLayer.tsx:97`），只改 opacity/linewidth/color，不翻转 transparent，不需要程序重编译处理**（`useTransparencyProgramSync` 仅在 mesh 透明翻转场景使用）。停止播放恢复。`reducedMotion` 下这就是主要反馈（静态高亮升级为「粗+亮 vs 淡」对比）。

**B4 托盘/板级的出界线改「传送门」stub + 修 exploded 坐标失配** — `src/lib/routing.ts` + `ConnectionLayer` + `FlowLayer`
- **归属判定以「实际渲染的子树根」为准，不是 focus 本身**：board 深度下 focus 可能是 GPU，但 `SceneRoot.tsx:515` 渲染的是其所在托盘——containment root = scene anchor 的托盘装配。三分规则：两端都在托盘内 → 画完整线；恰一端在内 → 在托盘包围盒外 ~0.6m 截断为 stub，末端 drei `<Html>` 小标签「→ 业务交换机」（远端组件名，点击选中远端）；**两端都不在内 → 整条丢弃**（现状 `routing.ts:189` 会把全系统连接都路由出来，正是截图长斜线的另一半来源）。纯函数（三分归类 + 截断点）进 routing.ts 附测试。
- **修既有 exploded 失配**：board 级硬件按 explode 偏移渲染（`SceneRoot.tsx:430`），但 routing 与 FlowLayer 的 `worldPositionOf` 全部走 `exploded=false`（`routing.ts:186`、`FlowLayer.tsx:54,114`）——线/粒子/beacon 落在收拢坐标上，与拆开的硬件明显脱节。把实际 exploded 状态从 SceneRoot 传入两层并贯穿 `worldPositionOf` 调用。

### C. 视角归用户所有（相机不再被没收）

**C1 拆分 CameraRig 效果** — `src/components/scene/CameraRig.tsx`
- preset 按 `[level, focusPath, generation, aspect]` useMemo 一份，两个效果共用。
- 效果 A（导航飞行）：依赖 `[level, focusPath, generation]`（+reducedMotion 决定是否动画）→ **更新 min/maxDistance clamp + `setLookAt(preset)`**（clamp 必须在此更新——只放 resize 效果里会导致下钻后仍套着集群级的缩放限位）。这是唯一允许程序化改机位的路径（下钻/面包屑/导览/代际切换）。
- 效果 B（尺寸自适应）：依赖 `[width, height]` → 更新 clamp，**不 setLookAt**。例外：用户自上次程序化落位后未动过相机才允许 resize 重新 fit。**`userMoved` 不能只靠 `controlstart`**——camera-controls 文档明确 wheel 缩放不触发 controlstart；需 `controlstart` + canvas 元素上的 `wheel`（及 `pointerdown`）DOM 监听共同置位，程序化 `setLookAt` 完成后复位。
- **同一套拆分与 `userMoved` 逻辑抽成共享 hook，`ComparisonView.tsx` 内的 `CompareCameraRig`（:244-262，同样可手动操控且当前 resize 即无条件 `setLookAt`）一并接入**——否则比较模式下点步骤/调窗口仍会没收视角。
- `firstApply` 瞬移逻辑保留。数据流的任何交互（stepIdx/playing/速度/平面开关）不触碰 level/focusPath，依赖拆分后天然不再引发飞行。

**C2 FlowBar 高度稳定**（辅助，消除画布抖动）— `src/components/panels/FlowBar.tsx`
当前步骤卡展开导致底栏高度跳变（正是触发 resize 的源头）。改为底栏固定高度：narration/presalesNote/chips 区域固定行高 + 内部滚动或收纳，步骤切换不再改变画布尺寸——既消除相机诱因，也消除画面上下跳动。

### 测试与验收

- 单测：routing `instancePaths` 扇出/传送门三分归类与截断/`flowStepFocus` 两集合推导/exploded 贯穿各加用例；既有 349 条不回归（cluster nvlink 两条测试显式保留且路由条数不变）。
- E2E（`tests/e2e/factory.spec.ts`）：新增/更新——① cluster 深度开启 power+cooling 后像素变化 >0 且配电→机架可见（像素占比断言，沿用既有 drawImage 对比法）；② 8 机架扇出（像素对比）；③ 播放至 kv-write 步：FlowBar 出现「HBM」「B300 GPU」chips、点击后右栏详情跟随（DOM 断言）；④ 板级 ingress 步无出界长线（截图基线）；⑤ **相机保持用位姿断言而非截图差异**（流高亮本身就会改像素，「与默认基线不同」在相机已复位时也能假通过）：CameraRig 在 controls 变化时把 position/target 写入 `data-camera-pose`（或 `window.__cameraPose`，仅 dev/e2e 暴露），断言「拖拽 → 点步骤/resize → 位姿不变」；**补两条**：「仅 wheel 缩放 → resize → 位姿不变」（wheel 不触发 controlstart 的回归）与「比较模式下拖拽 → resize → 位姿不变」；另断言步骤切换前后 canvas 高度恒定（验证 C2）；chip 用例从「产能粗估」tab 出发点击，断言右栏切到部件详情。受影响的旧基线（cluster/rack 全平面/板级）用 `--update-snapshots` 重建并逐张人工核对说明。
- 门禁：`npm run typecheck && npm test && npm run build` + `PLAYWRIGHT_USE_CHROME_CHANNEL=1 npm run test:e2e` 全绿。
- 部署：`npm run build:pages` + 推送 gh-pages，线上验证 https://caoruixin.github.io/aifactory-sim/ 集群视图六平面。

### 执行方式

单个实现代理（opus，内容证据纪律 + 3D 改动混合），完成后主循环（fable）复核：cluster 六平面截图、证据规则测试、两条 nvlink 回归测试未被删改；再更新线上部署。已决事项（不再询问）：不建模「外部网关」实体（流程里 ingress 保持逻辑步，避免无来源部件）；不做全局压暗（共享材质限制）；mgmt-node 不扇出（12 实例会糊）。

### 关键文件

- src/components/scene/ConnectionLayer.tsx（放开过滤、线强调/退让、传送门标签）
- src/lib/routing.ts + routing.test.ts（机架扇出、出界截断）
- src/data/shared.ts、gb300-nvl72.ts、vera-rubin-nvl72.ts、rubin-ultra-nvl576.ts（配电组件/节点/改边）
- src/lib/layout.ts（facility-power 摆位、leaf/spine 拉开）
- src/lib/flowTimeline.ts、src/store.ts、src/components/panels/FlowBar.tsx、src/components/scene/FlowLayer.tsx（activeAssemblyIds、chips、beacon/粒子按深度缩放）
- src/components/panels/PlaneToggles.tsx（脚注更新）
- src/components/scene/CameraRig.tsx（效果拆分 + userMoved，视角归用户）
- tests/e2e/factory.spec.ts（新断言 + 基线重建）

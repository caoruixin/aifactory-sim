# v1.6.1 小批次：CPU 内存 3D 实体 + 存储 L2 命名法 + 叙事补齐

> 状态：**计划已固化，待实施**（2026-09-08）。
> 基线：main `5e65f55`，门禁基线 **822 单测 / E2E 54 passed + 54 skipped / 18 张截图基线**。
> 本批独立于 PLAN-v1.7（未评审草案，勿动）。

## 已拍板裁决（不重新讨论）

1. **CPU 内存建 3D 实体，只建 GB300 / Vera Rubin / HGX 三代**。NVL576 的 SOCAMM 仅
   SemiAnalysis 来源无官方数字 ⇒ 不建；Groq 不建。缺席代际由 comparisons removed 行
   narrative 交代（object-storage 先例）。
2. **新 roleKey `'cpu-memory'`；ComponentKind 扩 `'memory'`，绝不复用 `'hbm'`**——
   `src/components/scene/FlowLayer.tsx:157` 按 `kind==='hbm'` 画「权重常驻显存」常亮微光，
   复用会让 CPU 内存跟着发光。加进 `types.ts` NonGpuComponentKind（照 lpu 注释先例写明原因）。
   shape 复用 `'chip-stack'`。
3. **spec 双挂口径分工**（HBM 先例）：CPU 组件保留每托盘口径行不动；新内存组件挂整机口径
   `cpuMemoryTB`（specLabel 已有键），与 system.keySpecs 同源同值上 content.test 锁。
4. **存储显示名统一加 L2 前缀**：「外部存储集群」→「L2 共享存储（外部存储集群）」（对齐
   「L3 对象存储（模型货仓 / 归档）」命名法），连接 label 同步。已核实 content.test/E2E 对
   旧名零断言；场景 narration 里的「外部存储」泛指散文**不改**（保 mobile-tour-stop1 基线）。
5. **HGX 主机内存措辞纪律**：RA Table 2 只给下限（≥2 TB、≥500 GB/s），禁写 DDR5/具体容量；
   x86 独立地址空间，GB300「37 TB 快内存」话术一句不能用。
6. **GB300 17 vs 18 TB 官方不闭合必须留痕**：产品页 17 TB LPDDR5X vs RA Table 1 每托盘
   1 TB×18=18，组件 note 双留痕（HBM 288/279/20 先例）；引 RA 原文照抄「LPDDR5」（不带 X）。

## 批次规格（5 个串行提交）

### ① 存储 L2 显示名

- `shared.ts:291` 组件 name 改「L2 共享存储（外部存储集群）」。
- 四系统 assembly label 同步（`gb300-nvl72.ts:948`、`hgx-b300.ts:1614`、
  `vera-rubin-nvl72.ts:1191`、`groq3-lpx.ts:897`）。
- 四条连接 label「汇聚交换机/交换层 ↔ 外部存储」→「… ↔ L2 共享存储」（`gb300:1459`、
  `hgx:2196` 保留「交换层」措辞、`vr:1700`、`groq:1251`）。
- content.test 加命名法锁：storage-array 名以「L2 共享存储」开头、object-storage 名以
  「L3 对象存储」开头。

### ② 基建 + GB300

- types.ts NonGpuComponentKind 加 `'memory'`。
- 新组件 `cmp.gb300.lpddr5x`（插 `cmp.gb300.hbm3e`（:290-316）后照抄骨架）：specs
  `cpuMemoryTB` pageSpec 17 TB（note 按裁决 6 双留痕）+ `modulesPerCpu` notPublished
  （镜像 :310-314「颗数为视觉示意」；带宽行核产品页，核不到不建）。
- 新装配 `asm.gb300.lpddr`（插 `asm.gb300.hbm`（:1146-1157）后）：parent
  `asm.gb300.grace-cpu`、roleKey `cpu-memory`、count 8、countClaim null、lodLevel
  'board'、note「⚠️ 颗数 8 为视觉示意…官方口径每托盘合计 1 TB」。
- `layout.ts` PLACEMENTS 加 `'cpu-memory'`（'gpu-hbm' :260-275 后追加）：size
  [0.012,0.012,0.018]、slots 照 gpu-hbm 两侧分列、x ±0.048、z 步距 0.022、y 0.001、
  explode {lift:0.028,spread:1.9}（三代 host-cpu 共用 Placement，一套通用；±0.062 不与
  双 CPU x=±0.11 撞）。
- specLabel 加 `modulesPerCpu`。
- layout.test :130-170 区加 slots.length=8 与 explode 散开两断言（镜像 :157-163）。
- content.test 锁：grace `lpddr5PerTrayTB`=1、新组件 17=keySpecs 同源同值、note 含
  「视觉示意」。

### ③ VR + HGX + comparisons

- `cmp.rubin.lpddr5x`（插 cmp.rubin.hbm4 :508-539 后，status 'announced'，**必须用
  vr/vrNull 帮助函数**）：`cpuMemoryTB: vr(54,'TB',规格表 CPU Memory 行)` +
  `modulesPerCpu: vrNull`，可选双挂 memoryBandwidthTBs 1.2（与 vera-cpu :484-489
  同源同值）。
- `asm.rubin.lpddr` parent `asm.rubin.vera-cpu`、count 8 示意、note 补
  「54÷18=3 TB/托盘（每托盘 2 颗×1.5 TB）」闭合。
- `cmp.hgx.host-memory`（按裁决 5 措辞，specs 双挂 `minSystemMemoryTB`/
  `minMemoryBandwidthGBs` 与 cmp.hgx.host-cpu 同源同句 + `dimmsPerServer: hgxNull`
  新标签）。
- `asm.hgx.host-memory` parent `asm.hgx.host-cpu`、count 8 示意，**id 追加进
  content.test:1354 示意数量枚举清单**。
- comparisons.ts 5 个 cmpdef 各加一条 cpu-memory 行：gb300↔vera changed（17→54 TB）、
  gb300↔hgx changed（一致寻址 vs DIMM 独立地址空间+下限口径差）、vera↔ultra 与
  gb300↔ultra removed（「未收录≠没有」句式照 :63-87）、vera↔groq removed（LPX 12 TB
  DDR5 按机架容量登记未建颗粒）。
- content.test 加 VR 54 同源同值+3×18 闭合锁、HGX 同源同句锁（:1551-1560 体例）、
  **范围锁：roleKey 'cpu-memory' 恰好存在于 {gb300, vera-rubin, hgx}**。

### ④ 叙事补齐

- `lenses/network.ts` 第 5 章（:369-446）highlightAssemblyIds 追加
  `'asm.gb300.mgmt-node'`；chain 加行 `ctrl-plane-dual-homing`（hardwareRoleKeys
  `['control-plane-node']`、techniqueId null、metrics `['mttr']`，narrative 讲双归属：
  带内 4×ConnectX-7 200G 下调度/拉镜像、带外口保命）；**不**把带内连接加进
  highlightConnectionIds（本章 planes 只有 mgmt）。
- `lenses/storage.ts` 第 3 章 narration ② 层级句改「HBM → 锁页主机内存 → 本地 NVMe（L1）
  → 共享存储（L2）」（依据包内 tech.kvbm tiers 引句，不新增 Claim；HGX 语境禁 37 TB
  话术）；chain 'kvbm-tiering' hardwareRoleKeys 改
  `['gpu-hbm','cpu-memory','cache-storage']`（依赖 ③ 先落）。

### ⑤ 收口

- E2E 基线全量重拍 + 三连绿。预期翻 9 张：gb300-tray-explode / gb300-board-ingress /
  hgx-board / fallback-structure / fallback-tree / fallback-connections /
  compare-gb300-vera / compare-diffonly / report-page。
- **必须逐字节不变 9 张**：gb300-cluster / gb300-cluster-facility-planes /
  gb300-rack-allplanes / nvl576-cluster / hgx-rack / lpx-rack / lens-network-ch1 /
  mobile-tour-stop1 等——出 diff 即越界（先查 PLACEMENTS 碰撞或误改 narration）。

## 硬约束（违反=返工）

src/lib 零 three；颜色经 palette；锁定测试不删改；types.ts 只增；index.ts spread 只尾部
追加；PLACEMENTS 只表内追加。证据纪律：verified_spec 只引官方源；新 Claim 的 sourceId
真实登记且 URL 逐条实访核数（`developer.nvidia.com` 用 WebFetch 返回空，改 firecrawl），
核不到 value:null；数字不得只放 note 绕过测试。

## 门禁

每提交：typecheck + 单测（基线 822 起，specLabel.test 新键红灯属机制先红后补）+ build。
批次末：E2E 54+54 起连跑三遍全绿；手工走查 `?lens=storage&chapter=3`（层级句+新硬件 chip
可点选）、`?lens=network&chapter=5`（管理节点被点亮与点名）、GB300/VR/HGX 板级目检内存
颗粒摆位与 explode、比较模式 cpu-memory 行文案、`?gl=off` 降级列表含新节点与新 label。
完成后回填 PLAN-v1.6.1.md 终态。

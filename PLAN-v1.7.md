# v1.7 遗留清偿 + 切面反哺：范围草案

> 状态：**草案（未评审）**。按批次交付流程需两轮 codex 评审后才固化开工。
> 输入：PLAN-v1.5「遗留」四项 + PLAN-v1.4 W-D/E（TPU7x，未评审）+ v1.6 切面二期
> 方向 + REVIEW-v1.6 走查洁癖清单。本稿先做**范围裁决**：哪些进 v1.7、哪些明确后置。

## Context

v1.6 收口后的欠账分三类：① 内容欠账（HGX 自 v1.4 入包后一直是「二等公民」：
/report §02 规格表硬编码 GB300、无 FlowEpisode 剧本、LEARNING.md 无加课章）；
② 工程欠账（TPU7x + 3D Torus 引擎级改造，v1.4 起两度顺延）；③ v1.6 自产的
反哺机会（章节驱动 3D 的 highlightConnectionIds 能力可回流 ScenePreset）与
洁癖清单（REVIEW-v1.6 §3，12 项，全部非事实错误）。

**推荐裁决：v1.7 只做①+③+洁癖清偿，TPU7x 单独成批（v1.8），供电/液冷切面与
goodput/SLA 建模列候选不进本批。** 理由：①③全是内容/组件层改动，零引擎风险，
可并行派活；TPU7x 是 layout/routing 共享底座的引擎批次（v1.4 原案明确「实施前
单独评审、严格串行」），混进来会把整批的合并纪律拖成串行。

## W-0 走查洁癖清偿（小批，1–2 提交）

REVIEW-v1.6 §3 逐项落地：

- 数据层 8 项：WEKA URL 301 更新 + 沿革 note；41x locator 括注改写（GTC 演示
  口径与正文 Int4 图表分离）；Model Streamer locator 弃自造「Experiment #N」改
  官方节名；4.88s 补「standalone loader 口径，非 vLLM 端到端」note；
  domain-size-hgx 章 sourceIds 补 nixl-repo；130 TB/s / 14.4 TB/s 两行 note 补
  「产品页未明标方向」；（可选）三条定性引句显式标注；「逐包」措辞留意不动。
- UI 3 项：偏离恢复时清 selection（或面包屑跟层级走）；Drawer 补 Escape +
  backdrop 点击关闭（a11y）；PLAN-v1.6 门禁③「unsupported kvSpec」条目加订正备注
  （UI 不可复现，lib 单测覆盖）。
- 门禁：content.test 事实锁同步改（locator 文本变更会打红既有锁，属预期红灯）。

## W-A HGX keySpecs 进 /report §02（小批，1 提交）

`KeySpecTable` 去硬编码：数据驱动列出全部 `capacityPolicy` 允许出数的系统
（GB300 + HGX），VR/NVL576/LPX 维持按策略拒绝出数的现状。报表页不加载
three-vendor 的断言不动。

## W-B 四代 FlowEpisode 剧本（主体批次，约 3–4 提交）

HGX / VR / NVL576 / LPX 各写一条推理数据流剧本（FlowBar 现仅 GB300 有）。

- 叙事差异点即卖点：HGX 版剧本必须体现「跨机 KV 走以太 + NIXL」（与 lens 网络
  ch6 同口径）；VR 版体现 NVLink6/SHARP 代际差；NVL576 版体现 9+18+9 重排与
  产能拒数策略下的「只讲拓扑不出数」；LPX 版体现 AFD 配对语境。
- 复用 v1.6 事实锁里的既核数字，**不新增数字 Claim**；步进高亮走
  `emphasizedConnectionIds` 既有裁决（flow 赢 lens 的优先级已在 lib 锁死）。
- E2E：每代剧本至少一条播放用例（`?flow=` 深链 + data-active 集合断言）；
  FlowBar 空态提示文案（「这一代暂无剧本」）四处删除对应更新。

## W-C LEARNING.md HGX 加课章（小批，1 提交）

仿 5b/5c/5d 体例补 HGX 章：任务卡 + 深链速查（`?lens=network&chapter=6` 与
`?lens=storage&chapter=3` 已覆盖 HGX 切面视角，课程卡直接引用）。

## W-D 切面反哺导览站（中批，1–2 提交）

`ScenePreset` 增可选 `highlightConnectionIds`（v1.6 明确留给二期的波及面）：

- types 加可选字段（不回填 21 个既有场景，缺省 = 现状零强调）；
- `sceneHighlight` / `emphasizedConnectionIds` 增 tour 分支（优先级：flow 播放 >
  lens 章节 > tour 场景 > 无）；
- 首批只给 7 个 `learn-plane-*` 练习站与 v1.4 CPO 讲解站补连接强调（其余场景不动）；
- pack.test 校验：id 存在且属本场景 systemId（照抄 lens 章节校验）。

## 明确后置（不进 v1.7）

| 项 | 去向 | 理由 |
|---|---|---|
| TPU7x + 3D Torus | v1.8 单独成批 | v1.4 原案（PLAN-v1.4 §W-D/E）成立：引擎级、需单独评审、与一切 layout/routing 改动严格串行 |
| 供电/液冷切面 | 候选池 | 素材依赖官方 RA 的供电/冷却章节实访核数，工作量≈网络切面级；先等 v1.7 验证「切面框架第二次复用」的作者成本 |
| goodput/SLA 建模 | 候选池 | capacity.ts 口径改动需同步三处文案（v1.6 总纲已预警）；建模口径本身需要先出独立评审稿 |

## 实施与验证

- 并行纪律：W-0/W-A/W-C 互不相扰可并行；W-B 与 W-D 都动 flows/强调链路，W-B 先行、
  W-D 从其后拉出；共享冲突点仍是 content.test.ts 与 LEARNING.md（rebase 人工合）。
- 门禁照旧：每提交 typecheck / 单测 / build；批次末 E2E 先 `npm run build` +
  手动 `vite preview --host 127.0.0.1 --port 4173` 再跑（ipv6 坑）；基线如打翻
  `--update-snapshots=all` 全量重拍逐张目检（W-B 步进高亮大概率翻基线）。
- 收口：LEARNING.md 勾选状态与本文件回填终态；部署走 `build:pages` + gh-pages
  强推 + 线上 sha256 比对（v1.6 先例）。

# v1.1 实施提示词（自包含，可直接投给新会话）

> 用法：在 `~/projects/aifactory` 目录里开新 Claude Code 会话，把下面整段粘贴进去（或直接说「读 PROMPT-v1.1.md 并执行」）。

---

请实施本仓库的 **v1.1 修复批次**。完整实施计划在仓库根目录 `PLAN-v1.1.md`——**先完整读它**，它已经过两轮 codex（gpt-5.6-sol, xhigh）评审、14 条 P0/P1/P2 发现全部修入，按计划原样实施；如需偏离必须在报告中给出理由。

## 项目背景（30 秒版）

这是「AI Factory 3D 数字孪生模拟器」（Vite 7 + React 19 + TS strict + R3F + zustand + Tailwind v4），v1.0 已交付：三代 NVIDIA 系统（GB300 NVL72 已量产 / Vera Rubin NVL72 已发布 / Rubin Ultra NVL576 分析师预测）的 3D 下钻、六平面连线、推理数据流动画、代际比较、产能粗估、`/report` 汇报页、2D 降级、移动端。已部署 GitHub Pages。v1.1 修三个用户实测问题：**A** 集群视图机房设备看起来互不相连（放开平面过滤 + 补配电部件 + 8 机架扇出）；**B** 数据流步骤与具体硬件对不上（参与硬件发光 + 步骤 chips + 出界线改传送门 + 修 exploded 坐标脱节）；**C** 用户旋转缩放后点数据流步骤视角被强制复位（CameraRig 效果拆分 + userMoved + 底栏定高）。

## 硬约束（违反即返工）

1. `src/lib/` **零 three 导入**（纯元组数学，node 环境 Vitest 依赖此）。
2. `src/data/types.ts` **只增不改**；可选字段一律 `| null` 而非 `?:`（JSON 往返测试锁定）。
3. 颜色一律经 `src/lib/palette.ts` 读 CSS 变量，3D 侧不得硬编码 hex。
4. 每帧动画值放 ref，**绝不进 zustand store**。
5. `/report` 与 `?gl=off` 降级路径**不得加载 three-vendor** chunk（E2E 网络断言锁定）。
6. drei 导入白名单：`Instances/Instance, Line, Html, CameraControls, View, Edges, Grid`。
7. 证据纪律：不发明数字；官方未公布的 Claim `value: null`；verified_spec/vendor_claim 只能引官方源（pack.test.ts 锁定）。
8. **锁定测试不得删改**：`routing.test.ts` 的两条 cluster-nvlink 回归（GB300 零条 / NVL576 恰一条 `con.ru.optics-interrack`）——A2 扇出必须保持每条内容连接一条路由（`instancePaths` 方案，见计划）。
9. 禁止修改 `~/projects/llms-study`（只读参考）。

## 门禁与验证

- 每个逻辑提交后：`npm run typecheck && npm test && npm run build` 全绿（当前基线 349 单测）。
- E2E：`PLAYWRIGHT_USE_CHROME_CHANNEL=1 npm run test:e2e`（沙箱装不了 bundled Chromium，config 已支持系统 Chrome channel；当前基线 13 用例）。按计划新增断言（相机保持必须用**位姿遥测**断言，不能用截图差异——流高亮改像素会造成假通过）；受影响旧基线 `--update-snapshots` 重建并逐张核对。
- 浏览器实测注意：claude-in-chrome 的标签页常年 `document.hidden` → rAF 节流、canvas 空白；**视觉证据一律用 headless Playwright**，交互断言用 `javascript_tool` 派发真实 `HTMLElement.click()`。
- 完成后部署：`npm run build:pages` → dist 推送到 `https://github.com/caoruixin/aifactory-sim.git` 的 `gh-pages` 分支（`cd dist && git init -b gh-pages && git add -A && git commit -m deploy && git push -f https://github.com/caoruixin/aifactory-sim.git gh-pages`），线上验证 https://caoruixin.github.io/aifactory-sim/ 集群视图六平面与相机保持。
- git 提交按逻辑分次，最后一条提交信息末尾加：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`；同时把 main 推到 origin。

## 报告要求

如实报告：完成清单、typecheck/test/build/test:e2e 实际数字、每个新 E2E 断言的结果、与 PLAN-v1.1.md 的任何偏差及理由、线上部署验证结论。不得只报「完成」。

## 收尾

全部绿灯后，把 `PLAN-v1.1.md` 顶部加一行「✅ 已于 <日期> 实施完成（提交 <hash>）」，连同实现一起提交。

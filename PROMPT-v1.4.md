# v1.4 实施接续提示词(自包含,可直接投给新会话)

你在 `~/projects/aifactory` 继续 v1.4 批次的交付。这是一个 React 19 + Vite + react-three-fiber 的 AI 集群 3D 数字孪生学习工具(售前架构师学习用),已有 4 套内容包(GB300 NVL72 / Vera Rubin NVL72 / Rubin Ultra NVL576 / Groq 3 LPX),每套 = System + 证据分级 Claim 的 HardwareComponent[] + 树形 Assembly[](roleKey/count/lodLevel)+ 六平面 Connection[] + ScenePreset[](`?tour=` 深链)。工作区约束:只在 `~/projects/aifactory` 改动,`~/projects/llms-study` 只读。

## 当前状态(2026-08-24)

- **v1.3 已完成并部署**:main = `545bc70`(已推 origin),QA 全绿(554 单测 / E2E 36 passed + 36 skipped / 证据纪律零违规),线上 https://caoruixin.github.io/aifactory-sim/ 已实测含 NVL576/LPX 全部内容。
- **`PLAN-v1.4.md` 草案已在仓库根目录,未提交**。它是 v1.4 的唯一权威实施规格,动手前先通读。内容:W-A CPO vs NPO 讲解深化、W-B 国产超节点对照段、W-C HGX B300 第五系统、W-D/E TPU7x+3D Torus,外加一个共享预备提交。
- **流程位置**:交付流程 = 计划两轮 codex 评审 → 固化进仓库 → 分模型派代理实施 → 独立 QA 核验 → 部署。PLAN-v1.4.md 尚未过 codex 评审。若用户已给出评审意见,先修入 PLAN-v1.4.md 再固化提交(提交末尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`);若让你直接开工,视为评审豁免,先固化再实施。

## v1.4 已拍板的范围裁决(不要重新讨论)

1. **国产超节点不建第五套 3D 包,降级为对照段+学习场景**(W-B)。`sources/超节点-WAIC2026.pptx` 经逐页审读确认为付费 KOL 二手材料(知识星球"傅里叶的猫"):全部结构数字要么无 locator 转述、要么在照片标注里(纪律禁用),且 PLAN.md:165 本就门禁"等官方规格"。deck 事实只走 narration/presalesNote/summary 纯文案层;本批把"`src.waic2026-deck` 不得出现在任何 Claim.sourceId"编码为锁定测试。未来拿到华为 Atlas 950 / 阿里磐久 AL128 官方规格(可访问 URL)才升级建包。
2. **CPO 不建 3D 实体,走讲解站**(W-A)。NPO/CPO 是互斥在研版本,同树并存=建了台不存在的机器;CPO 关键量化事实缺失(带宽占位符、外置激光源数量无来源)。方案:RU 包 specs 增 2 条 `sa()` Claim + 尾部追加第 3 站 `scene.ru.optics-formfactor` + content.test 三条 ★ 锁。现有 NPO 实体(`scaleup-optics`,16 个/交换托架)与锁定测试零接触。
3. **HGX 只建 B300 一个系统**(W-C),H200/B200 降级为 cmpdef 沿革叙事。证据用 NVIDIA HGX AI Factory Enterprise RA(与 GB300 母版同文档族,official_doc)。教学主线:同一颗 B300,服务器级 NVLink 域(8 GPU 板内)vs 机架级域(NVL72);机架 nvlink 平面刻意为空即教学内容。
4. **TPU7x 是引擎级改造**(torus 实例邻接、三维格阵摆位、多级实例寻址均为新机制),在 HGX 之后**严格串行**,实施前需单独评审(W-D/E)。

## 执行编排

- 固化 PLAN-v1.4.md 后,先在主干落**共享预备提交**:`FactorySystem.architecture` 必填枚举 + pack.test.ts:513-549 分型规则改按该字段映射(四系统回填)+ `ConnectionMedium` 增 `'airflow'` + `internal_deck` 并入 pack.test.ts:316 非官方源过滤集合。
- 然后三个 worktree 从 main 拉出**并行**实施:`v1.4-cpo`(W-A,sonnet,2 提交)、`v1.4-cn-report`(W-B,sonnet,1 提交)、`v1.4-hgx`(W-C,opus,3 提交)。各批规格细节全在 PLAN-v1.4.md,派代理时把对应 W 段 + 硬约束段复制进代理提示词。
- **合并顺序 W-A → W-B → W-C,铁律**:截图基线是二进制,"合一个、重拍一轮、rebase 下一个";加系统的分支(HGX)放最后,其全量基线重拍覆盖前两者。共享冲突文件:content.test.ts(三方都追加)、LEARNING.md(W-A/W-B 都动)。
- 每批合入后独立 QA 核验(新源 URL 逐条实访、deck 零进 Claim、证据三分目视、全 UI 走查),全部完成后部署 + LEARNING.md「二期方向」段与 PLAN-v1.4.md 勾选状态同步更新。

## 硬约束(违反=返工)

- src/lib 零 three;颜色经 palette;每帧值不进 store;锁定测试(routing.test.ts:81-97/:282-284/:116-128)不删改;types.ts 只增。
- 证据纪律:照片不可引用;verified_spec/vendor_claim 只引官方 kind 源;每条新 Claim 的 sourceId 真实登记并进系统 sourceIds,URL 逐条可访问;数字不得只放 note 绕过测试。
- index.ts 五处 spread 只许尾部追加,systems[0]/[1] 顺序不许漂移。

## 环境坑(已踩过,勿复踩)

- **E2E 起服务**:`npm run build` 后手动 `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`(vite preview 默认只绑 [::1],playwright 连不上),**勿改 playwright.config**。
- **Playwright 浏览器安装**:本机访问 cdn.playwright.dev 30 秒超时且退出码可能仍为 0,必须用镜像并核实版本目录真的出现:
  `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=180000 npx playwright install chromium`
- **rtk 会压缩 playwright 输出**(72 用例显示成 36):看真实结果用 `rtk proxy npx playwright test`。全绿 = **36 passed + 36 skipped**(`onlyOn` 按 desktop/mobile 分侧,skipped 是设计)。
- **部署**:`npm run build:pages` → `cd dist && git init -b gh-pages && git add -A && git commit -m deploy && git push -f https://github.com/caoruixin/aifactory-sim.git gh-pages`,线上验证 https://caoruixin.github.io/aifactory-sim/。

## 门禁基线

每提交:typecheck + 单测(基线 554 起)+ build;批次末 E2E 36+36 起;基线重拍 `--update-snapshots` 后人工核对图。

## 关键文件速查

PLAN-v1.4.md(权威规格)· src/data/{types,sources,index,rubin-ultra-nvl576,comparisons}.ts · src/data/{content,pack}.test.ts · src/lib/{layout,routing}.ts · src/pages/ReportPage.tsx · LEARNING.md · tests/e2e/factory.spec.ts · 范本:src/data/groq3-lpx.ts(最新非 NVL 架构包,v1.3 W3)

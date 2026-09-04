# v1.5 事实核验与界面订正：40 条数据修正 + 4 个 UI 缺陷

> 状态：**已实施完成并部署 ✅**（2026-09-04）。源提交 `684580f`（43 文件，+3008/−366），
> main 与 gh-pages 均已推送，线上 <https://caoruixin.github.io/aifactory-sim/> 已验证。
> 终态门禁：**667 单测（616 → +51）/ E2E 45 passed + 45 skipped / typecheck / build 全绿**；
> 15 张截图基线全量强制重拍并逐张人工核对（`mobile-tour-stop1` 内容未变）。
> 文档同步：`LEARNING.md` 7 处（含新增「v1.5 订正记录」章）、本文件、`PLAN-v1.4.md` 加指针。

## Context

与前四个批次不同，v1.5 **不加系统、不加功能**。起因是一次以真实用户身份的完整走查：
按售前实际使用路径把五个代际、六个平面、下钻/比较/产能/汇报/导览深链/降级/移动端走一遍，
同时把内容包里的每条 `Claim` 拿去**实访官方 URL 逐字回核**。

结论分两层，都不是「资料查不到」，而是「资料看得不够仔细」：

1. **事实层 40 条**（11 条高危）。全部经官方原文实证，其中 GB300 与 HGX B300 由两路
   独立核验**各自发现了同一条错误**（18× 口径），互为佐证。
2. **界面层 4 个缺陷**。其中最严重的一个**由 v1.4 追加第五个系统直接触发**——
   汇报页 §04 的实现假设了「`systems` 声明顺序 = 时间轴」，这个假设在只有一条产品线时成立，
   加入 HGX B300（与 GB300 同代）和 Groq 3 LPX（配对而非换代）之后就不再成立。

## 事实层修正（按系统）

### 跨系统：18× → 9×（最高优先级，两处文件同步）

参考架构原文：`a bandwidth of 900GB/s (1800 GB/s bi-directional)`；技术博客：
`1.8 TB/s bidirectional (18 links x 100 GB/s)`。18× 来自**双向 NVLink ÷ 单向网卡**。
同口径下应为 **9×**，HGX 平台页规格表相邻两行给出同口径独立佐证
（`Total NVLink Bandwidth 14.4 TB/s` vs `Networking Bandwidth 1.6 TB/s`）。

- `gb300-nvl72.ts`：系统 presalesNote 改为两个官方数字并列 + 方向口径；新增
  `nvlinkPerGpuUnidirectionalGBs = 900 GB/s` Claim；`nvlinkPerGpuGBs` 补根因 note。
- `hgx-b300.ts`：5 处（keySpecs note / 连接 summary / 两个场景 narration / assembly note）。
- 两文件共用同一句措辞常量，避免再次漂移。

### GB300 NVL72

| # | 问题 | 官方依据 |
|---|---|---|
| G2 | 「参考架构未给出交换机台数」是错的 | `Each rack requires 2x SN5600 switches for CPU and storage connectivity and up to 12x SN5600 switches for the dual-plane GPU network`；另有 Table 6/7 与 Appendix Table 11 按 SU 规模的完整台数 |
| G3 | SN5600 vs SN5610 官方自相矛盾却未留痕 | Networking Hardware 写 SN5610（64 × 800 Gbps）；Network Logical Architecture Table 5 与 Appendix Table 11 写 SN5600（128 口 400 Gb/s）。取 SN5610 作主值并新增 `modelNameConflict` 写明理由与「按出现次数 SN5600 更多」 |
| G4 | ConnectX-8 每托盘推荐带宽错一倍 | 800 GB/s 出自「per GPU recommendations」表的 8-GPU 节点口径（16 × 400 Gb/s）；GB300 是 4 GPU 托盘，RA 自述 `a total aggregate bandwidth of 3200 Gb/s` = 400 GB/s。新增 `trayAggregateBandwidthGbs` 与 `minComputeBandwidthGBs` |
| G5 | 整条液冷链假溯源 | RA 六页全文检索 `CDU` / `manifold` / `cold plate` / `coolant` / `quick disconnect` **命中数均为 0**，却全部挂 `src.nvidia-nvl72-ra`。改为示意建模标注；`cold-plate.coveredDevices` 由 `verified_spec` 降为 `author_opinion` |
| G6 | 三处 presalesNote 与同组件的 `notPublished` 自相矛盾 | 机架承重「>1.3 吨」删除；「冗余度接近 2N」→「容量余量约 1.86 倍」（余量 ≠ 冗余拓扑）；「Oberon」在 RA 零出现，改为「业界惯称」并新增 `formFactorName` |
| G7 | 托盘 BMC 口被标为「未公布」 | `18 trays, each with 3x 1Gb/s connections providing 54 x 1Gb/s for management` |
| G8 | Overview 首句的核心口径缺失 | `The NVIDIA Enterprise RA using 2-4-5-800 (dual plane) node architecture…`。新增 `nodeArchitectureCode`，与 HGX 的 2-8-9-800 构成售前最好用的一句话对照 |
| G9 | 4 处 locator 引文是改写后的 | 按原文精确串还原（合并两句用「＋」分隔并注明不得合并） |
| G10 | 「Blackwell Ultra 主要加显存不加算力」与官方冲突 | `delivers 1.5x more dense FP4 Tensor Core FLOPS and 2x higher attention performance`。新增两条倍数 Claim |
| G11 | 显存三值并存的取值理由本身算错了 | 原 note 说「288 与产品页 20 TB ÷ 72 一致」，实际 20 TB ÷ 72 ≈ 278 GB，恰恰支持 279。重写为 288 / 279 / 720 三值并存 + 换算参照 |

### HGX B300

**数值层零错误**——17 条 keySpec、12 条 countClaim、7 条 bandwidthClaim、5 项 mathSpecs
全部与官方一致；稀疏/稠密、HGX 列 vs GB300 列、HGX vs DGX 三个最高风险的混淆点**都没有踩**；
RA 自身四处内部矛盾（Table 2 排版事故、CPU 核数、交换机型号、appendix 表题）v1.4 已全部留痕。

问题集中在文案层：H1（18× 见上）、**H2 三处「机架内 NVLink」与本系统「机架里没有 NVLink」
的招牌教学主张自相矛盾**（RA 的分界线是基板/服务器，改为「服务器内 NVLink」）、
H3 `switchCount32Node` 括注与 countClaim 打架（Table 9 的 12 vs Table 7 的 2，改留痕式）、
H4 双平面负载均衡官方两说（NCCL 主机侧 vs ConnectX-8 硬件侧，同页两节）未留痕，
以及 5 条低优先级措辞（SN2201 台数冲突、管理节点 200/400 GbE、`powerRedundancy` locator
跨设计点、「56 kW 是常见档位」无出处、`160 SM` 缺 SKU 保留）。

### Vera Rubin NVL72

| # | 问题 | 官方依据 |
|---|---|---|
| V1 | 「无线缆 PCB 中板承载机架全部 NVLink」说反了 | `the NVLink spine at the back of the rack, which features four modular preintegrated cable cartridges housing 5,000 copper cables over two miles in length`；PCB 中板连的是`the front modular bays that house eight ConnectX-9 SuperNICs and one BlueField-4 DPU`；cable-free 修饰的是 **compute trays**。`cableCount` null→5000，新增 `cableCartridgeCount = 4`，组件更名，连带 6 处文案 |
| V2 | 「Preliminary information」脚注只覆盖 74 条中的 2 条 | 改为在工厂函数里按源自动注入 **Claim.note**（`SourceRef.note` 不上屏，脚注此前对用户不可见），覆盖 **33 条**且新增 Claim 自动带上 |
| V3 | NVFP4 Inference 写「口径不明」，官方其实讲死了 | 数据手册脚注 1 比产品页多一句：`NVFP4 Inference specification is sparse.` 排除决定正确，措辞低估了确定性 |
| V4 | ConnectX-9 板数是对歧义英文的一种解读，却标 verified_spec/high | `each compute tray contains quad ConnectX-9 SuperNIC boards` ＋ `Each quad ConnectX-9 SuperNIC board connects to each Vera CPU` 可读作 4 板×2 或 2 板×4。降为 vendor_claim/low，新增 `nicsPerTray = 8` 作为唯一确证事实 |
| V5 | 单卡 C2C 1.8 TB/s 与整机架 65 TB/s 差一倍 | 产品页 `NVLink-C2C Bandwidth` 行 Rubin GPU 列为 `-`；1.8 TB/s 是**每超级芯片**口径（36 × 1.8 ≈ 65）。两说并存 |
| V6 | 「BF-3 同口径约 480 Gb/s」与所引来源自身冲突 | 同篇博客 Table 5：BF-3 = 400 Gb/s、BF-4 = 800 Gb/s。480 是 GB300 RA 的**节点南北向汇聚网带宽**，不是芯片规格 |
| V7 | 上市时间 evidence 分级与时效 | 前瞻性上市承诺不满足 `verified_spec` 定义 → `vendor_claim`；登记 2026-05-31 发布稿（`Production shipments of Vera Rubin are set to begin starting this fall.`） |
| V8 | 装配时间口径已被官方更新、NVL144 改名叙述不在所引来源里 | 三版并存（1.5h/18× ｜ nearly two hours/20× ｜ 数据手册 18×）；改名直引 OCP 编者按并标明「按 die 计数」是本项目推断 |

**经复核判定为误报、未改**：`vsPreviousGen` 的「2x networking / 6x compute / 3x memory bandwidth」
整句确为原文逐字，在**图 19 图注**里（核验方只搜了图 13）。

### Rubin Ultra NVL576

- **R1 官方已点名拓扑，应用却说「官方没点名任何拓扑」**：`NVIDIA Vera Rubin Ultra introduces
  a new two-layer all-to-all NVLink topology`。新增官方 Claim `topologyNameOfficial`；
  分析师的「Dragonfly」与官方词**不等价**，讲的时候先说官方词再说分析师词。
- **R2 `con.ru.optics-interrack.topology = 'fat-tree'` 无任何来源支持**（官方 = all-to-all、
  SemiAnalysis 表① = Dragonfly、表② = Direct Connect），改为 `'all-to-all'`。
- **R3 Kyber 定位与官方措辞相反**：官方是 `the next-generation MGX NVL rack design` /
  `the successor to NVIDIA Oberon`，不是「独立于 MGX NVL 的并列产品线」。
- R4 GTC 2025 那句自身矛盾（前半句把 NVL144 归入「Rubin Ultra」说 2026 下半年，后半句说
  Rubin Ultra 系统 2027 下半年）未留痕，confidence 降为 low。
- **R5 `sources.ts` 的纪律注释与实际执行相矛盾**：注释写「SemiAnalysis 禁止进 countClaim
  或 specs」，而 `BROKER_SOURCE_IDS` 刻意不含它、NVL576 包正常使用（forecast 口径）。
  属文档缺陷但风险实在——后人按注释「修 bug」会朝错误方向改。已改为与实际一致的表述。
- R6 三处措辞（良率 → 可制造性、「压到 22.5U」→「仅略增至 22.5U」、回应 → 驳斥）。

**★ 经核验全部正确、未动**：9 处官方 Claim 来源、`mathSpecs = null`、`analyst-modeled`
拒绝门位置、全仓「2028」只出现在「这是 Kyber NVL144」语境、SemiAnalysis 表①表②逐格转录。

### Groq 3 LPX

- **L1 口径落后**：2026-08-24 官方发布稿 `NVIDIA Groq 3 LPX … is now in full production.`
  （该发布稿就挂在产品页首屏），应用还写「2026 下半年上市」。登记该源 + 同日技术博客，
  改写 `availability` 并保留 GTC 口径作沿革。
- **L2 40 PB/s 与 150 TB/s × 256 = 38.4 PB/s 不闭合却未留痕**，且场景旁白把两条独立口径
  说成了推导关系。补对称的 `BANDWIDTH_MISMATCH_NOTE`（对照：128 GB 与 640 TB/s 两对确实闭合）。
- **L3 「35×」的第三个前提「万亿参数模型」在全部对外文案中缺席**：官方产品页与 GTC26
  发布稿都写 `for trillion-parameter models`，技术博客的 Pareto 样本点是 2 万亿参数 MoE +
  400K 输入上下文。此前只带了两个前提，拿去讲 70B 模型就是超范围引用。
- **L5 「官方未公布 spine 物理介质」被证伪**（本轮新发现）：`connected by a direct
  chip-to-chip spine, which consists of two copper cable cartridges … over thousands of
  paired copper cable connections`。新增 `cableCartridgeCount = 2` 与有值的 `medium`，
  但**不建铜缆根数**（官方只说 thousands of paired）。
- L4 `acceleratorCount.note` 的「唯一一个三处互证的数字」不成立（640 TB/s 同样三处）。
- L6 `ddr5TotalTB` 把两个「Up to」上限相加当实配。

**★ 未动**：机架/托盘/单芯片三级规格逐条正确；315 与 9.6 两条并存不互推的做法正确；
5 处「不是收购」的澄清；MGX ETL/ELT 拼写留痕；`paired-only` 拒绝门位置。

### `system.status` 两处判断：均**保持 `announced`**

官方对 LPX 说的是加速器 `now in full production`（量产），**不是** `shipping now`；
落地方措辞是 `plans to bring`。而 CES 2026-01 同样写过 `NVIDIA Rubin is in full production`，
本项目当时没据此把 Vera Rubin 改 shipping——**两代必须用同一把尺子**。
项目判 shipping 的既有依据是官方明说在售（HGX B300 靠 `HGX B300 and HGX B200 shipping now.`）。
真正的缺陷（工具在讲「即将上市」）已在**内容层**根治，不需要动**状态**。

## 界面层修正

### 缺陷 4（高）：汇报页 §04 断言了错误的路线图

`ReportPage.tsx` 原按 `FACTORY_PACK.systems` 声明顺序两两串联，标题 join 全部系统名。
v1.4 把 HGX B300 追加为 `systems[4]` 后产生三个问题：① 标题读作
「GB300 → Vera Rubin → NVL576 → Groq 3 LPX → **HGX B300**」，而 HGX B300 是与 GB300 同代的
Blackwell Ultra、比 Vera Rubin 早一代；② 多出两张**没有标题也没有叙述**的自动 diff 表
（NVL576→LPX、LPX→HGX），满屏「右侧未收录 直流母排 / 分液歧管」读起来像「新一代砍掉了液冷」；
③ 「唯独最后一格要换个读法」那句指错了格子。同时两条写好的人工比较定义
（`gb300-to-hgx-b300`、`gb300-to-rubin-ultra`）**根本渲染不出来**。

**新实现**（`src/lib/reportSections.ts`）：改为遍历 `FACTORY_PACK.comparisons`（人工定义），
按内容包已有的两个字段分三类，**无任何硬编码 ID 名单**——

- `pairing`：任一侧 `capacityPolicy === 'paired-only'` → §4b 单独成段
- `same-era-domain`：两侧 `architecture` 不同（机架级域 vs 服务器级域）→「同代内的域选择」
- `generation`：同域架构 → 换代主线

新增代际只要写一条 cmpdef 就自动长出来。⚠️ 已在文件里写明判据边界：将来若出现
「既换代又换域架构」的组合，应在内容包加显式继承字段（如 `successorOf`），不要在这里靠猜。

### 缺陷 1（中）：`**粗体**` 被原样渲染成星号

内容包的用户可见文案（note / presalesNote / summary / narrative / narration /
derivation / **locator**）写了 markdown 粗体，渲染层却是纯文本 JSX——发现时 **169 处**，
收工时 **264 处**（v1.5 的数据订正本身又新增了一批带强调的文案，这也说明为什么覆盖要靠
扫描断言而不是逐条清点）。新增 `src/lib/richText.ts`
+ `src/components/ui/RichText.tsx`：不引 markdown 库、不用 `dangerouslySetInnerHTML`；
只有**成对**的 `**` 成为 `<strong>`，落单的按字面留下（排版错误要可见）。
覆盖全部渲染点，并加 4 处 `not.toContainText('**')` 扫描断言（比逐字段清点更耐得住数据继续改）。

### 缺陷 2（中）：规格表把 JS 变量名显示给用户

`specs: Record<string, Claim>` 的键被直接当标签渲染，中文售前工具里显示
`powerCapacityKW` / `nvlinkAggregateBandwidthTBs` / `gpuCount`。新增 `src/lib/specLabel.ts`：
**326 条**中文标签，与内容包实际出现的 spec 键**恰好 1:1 全覆盖**（含 `systems[].keySpecs`
的独有键——汇报页 §02 的问题正出在这里，最初给出的 271 个键只来自 `components[].specs`），
原 key 保留在 `title=`，查不到标签时回落显示键名并保留等宽字体（让「未翻译」一眼可见）。
双向覆盖锁在实施期间挡下 5 个问题（含并行数据修改新增的 4 个键）。

### 缺陷 3（中）：「同一组件还出现在」跨代际串台

`shared.ts` 的 9 个共享组件被 5 个系统各引用一次、装配节点还都同名。旧实现直接铺开
`assembliesUsingComponent()`，GB300 里会出现四个同名的「机房」；点进去把 `selectedId`
指到另一棵装配树，而顶栏代际、面包屑、3D 场景、导览面板全都还停在 GB300。

新实现（`src/lib/componentReuse.ts`）：同代际内可点；跨代际只列**代际名**、**不可点**。
理由：换代是 `store.setGeneration` 那种带整体重置语义的显式动作，不该藏在「实物参考与出处」
末尾一个 11px 脚注链接后面；顶栏代际按钮才是正确入口。

## 验证

| 门禁 | v1.4 收工 | v1.5 收工 |
|---|---|---|
| `tsc --noEmit` | 0 error | 0 error |
| 单测 | 616 passed | **667 passed / 0 failed**（20 files，+51；含 46 条回归锁） |
| `npm run build` | ✓ | ✓ |
| E2E | 43 passed + 43 skipped | **45 passed + 45 skipped / 0 failed** |
| 截图基线 | 16 张 | **15 张重拍**（`mobile-tour-stop1` 内容未变） |

四个 UI 缺陷各有一条**按实测复现场景写的**回归锁，包括
`expect(section4).not.toContainText('HGX')`（防止再把 HGX B300 排进换代箭头链）。

⚠️ **一个必须记住的基线盲区**：`playwright.config.ts` 的 `maxDiffPixelRatio: 0.02` 让
**4 张内容确实改变的基线照样通过**——汇报页那张的实际改动只占 0.4% 像素。
本批次是靠 `--update-snapshots=all` 强制全量重拍 + 人工看图兜住的，不是靠测试发现的。
**结论：基线守的是「大改动」，内容正确性仍然只能靠人工核对与内容测试。**

## 方法论沉淀（下一批次照做）

1. **事实核验要分系统并行、每系统一个独立核验方**，并强制要求「URL 可达性表」与
   「判定为误报的条目」两节——本批次四路核验里有 3 条转述被下游实施方复核推翻，
   如果没有「允许说不」的机制，这 3 条会被照改成新的错误。
2. **同一错误可能跨文件**：18× 由两路独立核验各自发现，正因为它们互不知情。
3. **实施方必须自己实访官方 URL**，不许仅凭核验报告的转述改数字。
4. **数据修改与 UI 修改可以并行**（文件不重叠），但**数据修改之间必须串行**——
   `sources.ts` / `comparisons.ts` / `content.test.ts` 是共享冲突点。
5. **`developer.nvidia.com` 用 WebFetch 会返回空**，须改用
   `firecrawl scrape "<url>" --format markdown -o out.md`（注意是 `--format` 不是 `--formats`）。
6. **验证「官方零命中」类结论**（如 G5 的液冷链）只能靠把整份文档抓成本地文件做全文检索，
   不能靠单页问答。

## 遗留

- `LEARNING.md` 的 HGX 章节仍缺（附录 B 有深链，但没有像 5b/5c/5d 那样的加课章）。
- HGX 的 keySpecs 进 `/report` §02 规格表（`KeySpecTable` 现硬编码 GB300）。
- HGX / VR / NVL576 / LPX 的推理数据流剧本（`FlowEpisode` 现仅 GB300 有完整剧本）。
- v1.4 的 W-D/E（TPU7x + 3D Torus）仍未实施，需单独评审。

## 关键文件

- 新增：`src/lib/{richText,specLabel,componentReuse,reportSections}.ts` + 各自测试、
  `src/components/ui/RichText.tsx`
- 数据：`src/data/{gb300-nvl72,hgx-b300,shared,sources,vera-rubin-nvl72,rubin-ultra-nvl576,groq3-lpx,comparisons}.ts`
- UI：`src/pages/ReportPage.tsx`、`src/components/panels/{DetailPanel,ComparePanel,TourPanel,CapacityBands,FlowBar,BreadcrumbBar}.tsx`、
  `src/components/mobile/MobileFactoryView.tsx`、`src/lib/compare.ts`
- 测试：`src/data/content.test.ts`、`tests/e2e/factory.spec.ts` + 15 张基线

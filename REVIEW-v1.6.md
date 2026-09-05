# v1.6 真实用户走查报告（线上 + keyFigures 官方 URL 回核）

> 走查时间：2026-09-04。对象：<https://caoruixin.github.io/aifactory-sim/>（v1.6 部署版）。
> 方法：仿 v1.5——以真实用户身份逐章走 11 章（网络 6 + 存储 5）、3 个计算器全部互动
> 并手算核对、深链 ×2、偏离提示、换代失效、`?gl=off` 降级、移动端 390px（本地
> Playwright 视口，线上桌面浏览器无法缩到 390）；另派 5 路独立回核把 v1.6 新登记
> 9 源 + 章节 keyFigures 引用的旧源全部实访官方 URL 逐条核数。
>
> **结论：0 阻断性问题、0 事实错误。** 一项视觉副作用已当场修复
> （`2ec1b1e` 顶栏警示条移行）。其余为洁癖级打磨项，列于 §3 供下批次取舍。

## 1. 功能走查结果（全部通过）

| 项 | 结果 |
|---|---|
| 深链 `?lens=network&chapter=1` / `?lens=storage&chapter=1` | 一次到位：模式/章节/代际/层级/平面/高亮同时落地 |
| 网络 6 章逐章推进 | 章节 pin 代际自动切换（ch3→VR、ch6→HGX）、平面/层级/焦点随章原子切换 |
| 存储 5 章逐章推进 | 业务动线顺序正确；ch1 全路径连线强调（对象存储→汇聚→L2→BF-3）可见 |
| 因果链卡 | 硬件 chips → 技术 chip → 环节·指标 chips 渲染完整；技术 chip 点击展开注册表卡（状态徽章+figures） |
| crossRefs 代际对照 | ch1「域止步 8 卡的 HGX 怎么办 →」点击后跳 ch6 且自动换代 HGX |
| kv-transfer 计算器 | DeepSeek-V3 8192→65536 tokens 联动正确（0.576→4.605 GB；NVLink 640µs、CX-8 46.1ms 手算吻合）；存储网段「无法估算」（null 未当 0） |
| model-load 计算器 | FP8 671 GB 正确；官方无数两段（L3→L2、E1.S）显「假设值·author_opinion」空输入；填 5/14 GB/s 后 134.2s（标瓶颈段）/16.77s/47.93s/83.9ms、串行 198.99s 全部手算吻合 |
| kv-restore 计算器 | MLA 70,272 B/token 精确；重算侧 MFU 三档透出（134.7~224.5ms）；切 Qwen3 → GQA 6.308 GB 手算吻合 |
| 偏离提示 | 手动下钻后「已偏离本章视角 · ↺ 恢复」出现，恢复幂等（层级/平面复位、提示消失） |
| 手动换代失效 | lens 下点 Groq/NVL576 → 右栏显式空态文案，mode 留 lens，点章节可续 |
| `?gl=off` 降级 | 连接表按平面过滤（注明另 27 条隐藏），章节高亮 = 整行着色，等价成立；L3 行带宽如实「未公布」 |
| 移动端 390px | 无横向溢出（4 处实测 scrollWidth=390）；切面入口行/章节推进/存储切换/抽屉/抽屉内计算器全部可用 |
| console | 无错误；仅 THREE.Clock 弃用警告一条（three-vendor 内部，无碍） |

证据纪律在 UI 层全程成立：官方规格/厂商宣称/公开跑分徽章、双向/单向口径警示、
「up to 非承诺值」、arXiv 版本差异警示、「官方未公布不编数」占位——全部渲染到位。

## 2. keyFigures 官方 URL 回核（5 路独立，共约 70 项，0 mismatch）

| 回核范围 | 结果 |
|---|---|
| Dynamo docs + NIXL repo（12 项） | 全部 match；引句逐字、插件清单 12 项齐全、null 占位属实；README 上 7x/750x 等倍数一条未建 Claim（纪律留痕在案） |
| SHARP + GDS + Spectrum-X（12 项） | 全部 match；GDS「on some systems ≥2x」限定语保留；1.6x 正确 vendor_claim；「本源无此数字」负向声明属实 |
| Model Streamer + Mooncake（22 项） | 全部 match；订正① 37.36s=Tensorizer 在四处文件全部落实且主动警示；订正② FAST'25 正式数字（59~498%、115%/107%），525%/75% 仅存于 arXiv 警示 note 且转述准确；盘型/实例/并发条件无一张冠李戴 |
| WEKA + VAST（10 项） | 9 match + 1 not-found（仅 WEKA 发布日期，页面已不显示）；62s→3s/127,188 token/181/198 Gbps 逐字命中；vendor_claim 恒定与 specs 禁入两条锁均验证成立 |
| 章节 keyFigures 旧源（17 行 + narration 6 处） | 全部 match；0 链接腐烂；1.8 TB/s 双向页面明写、800 Gb/s 端口速率口径一致 |

## 3. 发现与建议（按优先级）

### 已修复

- ✅ **NVL576/VR/LPX 顶栏两行**（v1.6 已知副作用④）：警示条从第一行右侧移到第二行
  系统名旁，五代际 1440/1280 首行恒单行、切代不再跳高。`2ec1b1e`，仅 1 张基线重拍目检。

### 数据层洁癖项（都不是事实错误，建议下批次顺手带走）

1. `src.weka-materials` 登记 URL 已 301 到 `weka.io/article/...` 新路径（靠重定向存活），
   建议更新登记并留沿革 note。
2. WEKA 41x 的 locator 括注「Llama-405B Int4」超出原句字面——41x 是 GTC 演示口径
   未点名模型，正文 Int4 图表曲线峰值目测约 35x。建议括注改写为
   「GTC 演示口径；正文测试环境为 Llama-405B Int4 / DGX H100」以免口径混同。
3. Model Streamer locator 用了自造的「Experiment #1/#3」编号（benchmarks.md 原文无编号，
   只有 GP3/IO2/S3 三节）。指向正确，严格派可改为「Amazon S3 节 / Appendix C」。
4. 4.88s/37.36s 等是 standalone loader 的「Time to Load the Model to GPU」；vLLM 端到端
   就绪是另一组数（Appendix D：23.18s vs 65.18s）。现标签「加载耗时」不算错，
   可在 note 里点破以防读者当成 vLLM 端到端。
5. `lens.network` 第 6 章（domain-size-hgx）chain 引用了 tech.nixl 叙事但章节 sourceIds
   未列 `src.nvidia-nixl-repo`（技术条目自带源，属登记洁癖）。
6. GB300 130 TB/s 与 HGX 14.4 TB/s 的产品页规格表**未标方向**，仓库「双向」为跨源惯例
   推断（1.8 TB/s bidirectional ×72/×8 对得上）。可在这两行 note 补一句「产品页未明标方向」。
7. `claim()` 默认 evidence=verified_spec，三条定性逐字引句（GDS/SHARP/adaptive-routing
   定义）落在该档。逐字核实过、可接受；如要更严可显式降档或加「定性引句」标注。
8. techniques/narration 中 adaptive routing 的「逐包」措辞不在登记的 Spectrum-X 页上
   （页面只说 dynamically route），出自白皮书口径。summary 字段不受 Claim 纪律约束，留意即可。

### UI/交互观察（低优先级）

9. 偏离「↺ 恢复」后顶部面包屑仍显示下钻时选中的「…› 计算托盘」路径（selection 未清），
   与右上「当前层级：集群」并存观感矛盾。恢复时顺带清 selection 或让面包屑跟层级走。
10. Drawer（本章内容/部件详情）无 Escape 关闭、backdrop 无点击关闭，只有「关闭」按钮
    ——`aria-modal` 对话框的 a11y 缺口。
11. PLAN-v1.6 验证门禁「选 unsupported kvSpec 模型显示无法估算」在 UI 不可复现：
    `content.test.ts:240` 锁死包内模型不许 unsupported，该分支只有 lib 单测覆盖。
    门禁文案与现实不符，建议在 PLAN 订正记录里备注。
12. THREE.Clock 弃用警告（three-vendor 内部），下次升 three 时自然消失。

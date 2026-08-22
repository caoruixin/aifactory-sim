# AI Factory 售前架构师 · 四周学习计划与任务清单

> 配套工具：本仓库的模拟器（线上 https://caoruixin.github.io/aifactory-sim/ ，本地 `npm run dev` → http://localhost:5173 ）。
> 下文所有「打开 `?...`」都指把查询串拼在应用地址后面，例如
> `https://caoruixin.github.io/aifactory-sim/?level=rack&focus=asm.gb300.rack`。
> 每周投入约 5 小时：官方资料 1.5h · 模拟器练习 2h · 脱稿讲解 1h · 一页方案更新 0.5h。

## 唯一主线（所有术语都挂在这条线上）

```
业务负载 → 模型/SLA → 推理软件 → 并行与副本 → Scale-Up/Scale-Out
        → 服务器/托盘/机架 → 供电液冷 → 产能/TCO → POC
```

遇到任何新术语，只回答三个问题：**它在主线哪一段？做什么？影响哪个指标？**
不确定就在模拟器里点开它，看详情面板的「售前怎么解释」卡。

---

## 第 1 周 · 建立总图与 30 张术语卡

**目标**：能画出 AI Factory 总图；30 个核心术语每个能一句话说清「在哪里、做什么、影响什么」。

- [ ] 走完导览：打开应用 → 左栏「场景导览」逐站走完（GB300 的 3 站是主菜）
- [ ] 集群总览：`?level=cluster` — 认出机架列、Scale-Out 主干/叶交换、CDU、存储、管理节点
- [ ] 下钻一遍：集群 → `?level=rack&focus=asm.gb300.rack` → 双击托盘 → 板级，每层停下来读右栏
- [ ] 做术语卡（每张 = 名词 + 主线位置 + 一句话作用 + 影响的指标），本周先做这 15 张：
      GPU(B300)/Grace CPU/HBM/NVLink/NVSwitch/Compute Tray/NVSwitch Tray/ConnectX(NIC)/
      BlueField(DPU)/Spectrum-X(Scale-Out)/Power Shelf/Busbar/CDU/冷板/Rack U
      —— 每张卡的素材都在对应部件的详情面板里，点 `asm.gb300.b300-gpu`、`asm.gb300.nvswitch-tray` 等
- [ ] 自检：为什么说「AI Factory 的产品是 token」？（提示：看 `/report` 页第一节）

**产出**：一张手画总图 + 15 张术语卡。
**脱稿练习**：3 分钟讲「一台 GB300 NVL72 机架里都有什么」。

## 第 2 周 · 看懂物理系统（计算/互联/存储/管理/供电/液冷）

**目标**：5 分钟内从 GPU 讲到 NVSwitch、ConnectX、BlueField、Spectrum-X、Power Shelf、CDU 不卡壳。

- [ ] 六平面逐个开关：`?level=rack&focus=asm.gb300.rack&planes=nvlink` 起，依次换
      `scaleout` / `business` / `mgmt` / `power` / `cooling`，每个平面回答：谁连谁？带宽/容量多少？断了会怎样？
- [ ] 关键数字背下来（全部在详情面板可查证出处）：18 计算托盘 · 9 交换托盘×2 ASIC · 72 GPU/36 Grace ·
      每 GPU NVLink 1.8 TB/s · 机架至高 142 kW · 每托盘 2 Grace + 4 B300 + 4×CX-8 + 1×BF-3
- [ ] Scale-Up vs Scale-Out：对比 `planes=nvlink`（机架内一跳全连）与 `planes=scaleout`（rail-optimized 跨机架），
      能讲清两者为什么是两张网、各自解决什么问题
- [ ] 补齐剩余 15 张术语卡（管理网/带外管理、rail-optimized、fat-tree、歧管/一次侧二次侧水路、
      E1.S/NVMe、电源冗余、PUE、超节点、NVLink 域、C2C、MoE、KV Cache、TTFT/TPOT、MFU/MBU）
- [ ] 自检：客户问「为什么必须液冷」，用机架功率和风冷极限答（素材：power shelf 与 CDU 详情）

**产出**：30 张术语卡集齐；六平面各一句「售前一句话」。
**脱稿练习**：5 分钟「从 GPU 到机房」物理链路讲解，对着 `?level=rack` 的画面讲。

## 第 3 周 · 看懂推理如何落在硬件上（这是售前的分水岭）

**目标**：能解释容量、算力、带宽、通信、尾延迟、功率分别怎样限制 token 生产。

- [ ] 播放数据流：主页点底部 ▶，10 步走 3 遍；关掉动画用 `?motion=off` 逐步读文案
- [ ] 重点心智模型（每个都要能复述）：
      ① 权重常驻 HBM，不随请求加载；② Prefill 吃算力、Decode 吃显存带宽；
      ③ KV Cache 是显存里会长大的部分；④ MoE 把瓶颈从计算转向 Token 搬运（All-to-All 走 NVLink）
- [ ] 产能粗估亲手玩：右栏「产能粗估」tab —— 改精度 FP8→FP4、改负载轻/中/重、改上下文长度，
      观察 tokens/s、TTFT、TPOT、tokens/W 怎么动，每次变化用第 2 周的术语解释「为什么」
- [ ] 理解「不出数」：切到 Vera Rubin 看 tokens/W 为什么拒绝（官方未公布整机功率）；
      切到 Rubin Ultra（`?gen=sys.rubin-ultra-nvl576`）看整体拒绝——**学会向客户区分事实/官方宣称/分析师预测**
- [ ] 自检：老板问「为什么不能拿卡数×峰值 FLOPS 算产能」——用 roofline（算力墙/带宽墙）+ MFU/MBU 区间回答

**产出**：一页「六种瓶颈如何限制 token 产能」笔记。
**脱稿练习**：5 分钟对着数据流动画讲「一次推理请求的一生」。

## 第 4 周 · 代际叙事与 15 分钟汇报

**目标**：脱稿完成给老板的 15 分钟汇报，并能答「为什么不能只看卡数、FLOPS 和原始 tokens/s」。

- [ ] 比较模式：`?mode=compare&right=sys.vera-rubin-nvl72` — 过一遍 diff 列表，
      记住三个最大的代际变化（GPU/HBM 代际、NVLink 带宽、交换芯片数量）并能说清「为什么这么改」
- [ ] 再比 `?mode=compare&right=sys.rubin-ultra-nvl576` — 练习「这一半是预测」的表达方式
- [ ] 通读 `/report` 汇报页，按它的六节结构写自己的一页方案（打印出来）
- [ ] 15 分钟汇报脚本（对着模拟器演示）：
      2 min AI Factory 解决什么业务问题 → 4 min 硬件下钻（集群→板卡）→
      4 min 一次推理如何使用这些部件（数据流动画）→ 3 min GB300→Rubin 代际变化（比较模式）→
      2 min 哪些是事实哪些是预测、下一步容量规划怎么做（证据边界 + 产能粗估的 caveats）
- [ ] 终验：找个同事/对着录音脱稿讲完 15 分钟；能接住三个追问即算过关

**产出**：一页方案（打印版）+ 15 分钟汇报（脱稿）。

---

## 日常提问模板（学习期间遇到新概念时）

1. 它在主线哪一段？
2. 在模拟器里它对应哪个部件/哪条连接/哪个数字？
3. 它的证据等级是什么（官方规格 / 厂商宣称 / 分析师预测）？
4. 改动它，token 产能或 TCO 会怎么变？

## 之后（工具的二期方向，学有余力再看）

- WorkloadProfile/SLA 与 goodput 建模（「token 数量 ≠ 业务价值」）
- HGX 参考方案、TPU 内容包、国产超节点（等官方规格）
- 正式 BOM / TCO / 可承诺产能（首版刻意不做，避免伪精确）

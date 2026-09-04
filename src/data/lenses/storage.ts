import { claim } from '../claim'
import type { DomainLens } from '../types'

/**
 * 存储切面（v1.6 W-A）：5 章沿推理业务动线走——分发 → 加载 → 运行时 KV → 归档 → RAG。
 * 章节顺序即业务顺序（content.test 有锁），不按容量/带宽这类硬件维度排。
 *
 * 层级词汇表（贯穿全切面）：L1 = 托盘/服务器里的本地 NVMe；L2 = 高性能共享存储
 * （roleKey `external-storage`，官方目标每节点 40 GB/s）；L3 = 对象存储（本项目建模，
 * 见 cmp.shared.object-storage 的溯源边界）；L4 = 数据库/向量库（不在机架里，纯叙事）。
 *
 * 数字纪律：WEKA / VAST 只能 vendor_claim、Mooncake / Model Streamer 只能 benchmark，
 * 且这些源的数字永不进组件 specs（content.test 有锁）。
 */

const ASOF = '2026-09'

export const STORAGE_LENS: DomainLens = {
  id: 'lens.storage',
  domain: 'storage',
  title: '存储切面：从货仓到显存的原料动线',
  summary:
    '沿推理业务动线看存储：模型从 L3 货仓分发、冷启动塞进 HBM、运行时 KV 在层级间上下、' +
    '归档镜像守着 MTTR、最外圈还有不在机架里的 L4 数据库。5 章两个代际，' +
    '主线是一句话：**GPU 有没有饭吃、饭从多远的地方端来**。',
  presalesNote:
    '存储在演示里最不起眼，却是推理成本模型里弹性最大的一块：KV 命中一次就省一次 prefill 重算。' +
    '讲这条切面时始终把「层级带宽」和「重算代价」放在天平两端。',
  sourceIds: [
    'src.nvidia-dynamo-docs',
    'src.runai-model-streamer',
    'src.mooncake-fast25',
    'src.nvidia-gds-docs',
    'src.weka-materials',
    'src.vast-materials',
  ],
  chapters: [
    {
      id: 'lens.storage.model-distribution',
      title: '模型分发：L3 对象存储是货仓',
      narration:
        '① 你应该看到什么：机房总览的业务网上多了最外圈的一个盒子——L3 对象存储。从它出发，' +
        '经汇聚交换层、L2 共享存储、再到托盘里的 BlueField-3，整条分发路径被点亮。' +
        '⚠️ 这个盒子是**行业通行架构的建模示意**：参考架构不涉及对象存储选型，它的规格全部「官方未公布」。' +
        '② 谁连谁 + 关键数字：新版本模型先落到货仓，再沿这条路进集群。传统做法要「先落盘再转格式」；' +
        'Model Streamer 支持 **S3 直读**——权重边读边流进显存。官方基准里同一个 15 GB 的 Llama-3-8B 从 S3 加载：' +
        '**Model Streamer 4.88 秒 vs Tensorizer 37.36 秒**（Safetensors 原生 loader 不支持 S3，没进这一局）。' +
        '③ 没有这层会怎样：模型版本管理退化成「谁手上有权重文件」——分发靠拷贝、回滚靠运气，' +
        '几百个推理副本的集群里这是事故温床。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'cluster',
      focusAssemblyId: 'asm.gb300.facility',
      planes: ['business'],
      highlightAssemblyIds: [
        'asm.gb300.object-storage',
        'asm.gb300.converged-switch',
        'asm.gb300.storage',
      ],
      highlightConnectionIds: [
        'con.gb300.objstore-converged',
        'con.gb300.converged-storage',
        'con.gb300.bf3-converged',
      ],
      chain: [
        {
          id: 's3-direct-read',
          hardwareRoleKeys: ['object-storage', 'converged-switch'],
          techniqueId: 'tech.model-streamer',
          phases: [],
          metrics: ['cold-start'],
          narrative:
            'S3 直读让货仓到显存**少一次落盘**：并发流式读边下边传，' +
            '分发路径上的每一段带宽都被吃满而不是串行等待。',
        },
        {
          id: 'staging-path',
          hardwareRoleKeys: ['object-storage', 'external-storage'],
          techniqueId: null,
          phases: [],
          metrics: ['cold-start'],
          narrative:
            '另一条常见路径是**预热**：把热门模型从 L3 提前搬到 L2 共享存储，' +
            '用 40 GB/s 的近端带宽换冷启动的确定性——空间换时间的第一层。',
        },
      ],
      keyFigures: [
        {
          key: 'objectStoreThroughput',
          label: 'L3 对象存储聚合吞吐',
          claim: claim<number>({
            value: null,
            unit: 'GB/s',
            sourceId: 'src.nvidia-dynamo-docs',
            asOf: ASOF,
            confidence: 'low',
            note:
              '官方未公布：参考架构不涉及对象存储，吞吐取决于客户选型与集群规模——' +
              '本项目不编数（对比：L2 共享存储有每节点 40 GB/s 的官方目标）。',
          }),
        },
        {
          key: 's3DirectLoad',
          label: 'S3 直读加载耗时（官方基准最优值）',
          claim: claim<number>({
            value: 4.88,
            unit: '秒',
            evidence: 'benchmark',
            sourceId: 'src.runai-model-streamer',
            locator:
              'benchmarks.md Experiment #3（Amazon S3，同区）：Meta-Llama-3-8B（15 GB Safetensors）× AWS g5.12xlarge（A10G）× vLLM 0.5.5，concurrency 32',
            asOf: ASOF,
            confidence: 'medium',
            note:
              '厂商自测 benchmark。对照组是 **Tensorizer 37.36 秒（16 workers）**——' +
              'Safetensors 原生 loader 不支持 S3 直读，未参与该实验。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [{ label: '下一站：这些权重进 HBM 要几秒', chapterId: 'lens.storage.cold-start' }],
      presalesNote:
        '货仓这层的卖点不是性能是**秩序**：版本、回滚、多集群一致性。性能问题交给下一章的加载链路。' +
        '⚠️ 对象存储的容量/吞吐都别报数——参考架构不管这层，以客户存储方案为准。',
      sourceIds: ['src.nvidia-dynamo-docs', 'src.runai-model-streamer'],
    },
    {
      id: 'lens.storage.cold-start',
      title: '冷启动：把权重塞进 HBM 要几秒 + 加载计算器',
      narration:
        '① 你应该看到什么：视角下到机架，业务平面亮着——托盘里的 E1.S 缓存盘与 BlueField-3 被点亮，' +
        '蓝色的线通向机架外的共享存储。冷启动就是「权重沿这条线灌进 72 张卡的 HBM」。' +
        '② 谁连谁 + 关键数字：从 L2 共享存储进节点的带宽上限是**每节点 40 GB/s**；GDS 让数据从存储 DMA ' +
        '直达显存、**不经 CPU 反弹缓冲**；Model Streamer 在上层做并发流式读——同一块本地盘上，' +
        '它 14.34 秒装完的模型，Safetensors 原生 loader 要 47.99 秒。E1.S 本身的带宽官方没给数：' +
        'RA 只写了数量与容量（且两处数量写法不一致，已在数据里留痕）。' +
        '③ 没有这层会怎样：弹性扩容失去意义——高峰来了副本起不来，等权重加载完流量峰已经过去；' +
        '故障恢复的 RTO 也全押在这条链路上。用下面的加载计算器把「权重体积 ÷ 各段带宽」的理论下限摆出来。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'rack',
      focusAssemblyId: 'asm.gb300.rack',
      planes: ['business'],
      highlightAssemblyIds: ['asm.gb300.cache-nvme', 'asm.gb300.bf3-dpu'],
      highlightConnectionIds: ['con.gb300.bf3-converged'],
      chain: [
        {
          id: 'gds-dma',
          hardwareRoleKeys: ['external-storage', 'cache-storage'],
          techniqueId: 'tech.gds',
          phases: [],
          metrics: ['cold-start'],
          narrative:
            'GDS 打通「存储 → 显存」的 DMA 直达路径，**CPU 内存不再是中转站**——' +
            '大文件加载时 CPU 不飙高，部分平台峰值带宽还能翻倍（官方口径带限定语）。',
        },
        {
          id: 'streamer-concurrency',
          hardwareRoleKeys: ['external-storage'],
          techniqueId: 'tech.model-streamer',
          phases: [],
          metrics: ['cold-start'],
          narrative:
            '同一块盘、同一个模型，**并发流式读 vs 单线程顺序读**就是 14.34 秒对 47.99 秒的差距——' +
            '瓶颈经常不在介质，在读法。',
        },
      ],
      keyFigures: [
        {
          key: 'perNodeStorage',
          label: '存储带宽上限（每计算节点）',
          claim: claim<number>({
            value: 40,
            unit: 'GB/s',
            sourceId: 'src.nvidia-nvl72-ra',
            locator: 'Networking Physical Topologies，「per-node storage bandwidth of up to 40 GB/s」',
            asOf: ASOF,
            note: '与 con.gb300.converged-storage.bandwidth 同源同值。up to 口径。',
          }),
        },
        {
          key: 'streamerVsTensorizer',
          label: 'S3 加载：Model Streamer vs Tensorizer（官方基准）',
          claim: claim<string>({
            value: '4.88 秒（concurrency 32） vs 37.36 秒（Tensorizer，16 workers）',
            unit: null,
            evidence: 'benchmark',
            sourceId: 'src.runai-model-streamer',
            locator:
              'benchmarks.md Experiment #3（Amazon S3）：Meta-Llama-3-8B（15 GB）× g5.12xlarge × vLLM 0.5.5',
            asOf: ASOF,
            confidence: 'medium',
            note: '⚠️ 对照对象是 Tensorizer，不是 Safetensors loader（后者不支持 S3）。',
          }),
        },
        {
          key: 'e1sBandwidth',
          label: 'E1.S 缓存盘带宽（每盘）',
          claim: claim<number>({
            value: null,
            unit: 'GB/s',
            sourceId: 'src.nvidia-nvl72-ra',
            asOf: ASOF,
            confidence: 'low',
            note:
              '官方未公布：RA 只给了 E1.S 的数量与容量（且 components 正文写 4 块、' +
              'appendix Table 10 写 8×4 TB，两说已在源 note 留痕），没有任何带宽数字。',
          }),
        },
      ],
      calculatorId: 'model-load',
      crossRefs: [],
      presalesNote:
        '计算器给的是「体积 ÷ 带宽」的理论下限，未建模协议开销与并发争用——' +
        '拿它讲量级（分钟级 vs 秒级），别拿它承诺 SLA。',
      sourceIds: ['src.nvidia-nvl72-ra', 'src.nvidia-gds-docs', 'src.runai-model-streamer'],
    },
    {
      id: 'lens.storage.kv-runtime',
      title: '运行时 KV：显存不够、层级来凑 + 恢复计算器',
      narration:
        '① 你应该看到什么：代际切到 HGX B300 的机架——服务器里的本地 NVMe 数据盘与 BlueField-3 亮起，' +
        '蓝线通向机架外的共享存储。这一代是「KV 分层」被官方点名的一代。' +
        '② 谁连谁 + 关键数字：KV cache 的层级是 **HBM → 本地 NVMe（L1）→ 共享存储（L2）**，' +
        'KVBM 管块的分配与驱逐、NIXL 管搬运。官方原句就在这一代的 RA 里：**「分布式推理把 KV cache 卸载到' +
        '高速网络存储」是点名的未来负载**，本地盘按推理 ≥1 TB/插槽、训练 ≥2 TB/插槽配。' +
        '这笔账的行业参照：Mooncake（Kimi 的 serving 平台，FAST 25 最佳论文）用分层 KV 换来**有效请求容量 ' +
        '+59%~498%**（真实 trace 回放）、生产集群 **A800 +115% / H800 +107%**。命中率没有通用数字——它取决于' +
        '你的业务里有多少共享前缀。' +
        '③ 没有这层会怎样：上下文一长显存就满，装不下的前缀只能**重算 prefill**——同样的问题回答第二遍，' +
        'GPU 在替存储的缺位打工。用恢复计算器对比「从层级捞回 KV」和「重算」哪边便宜。',
      systemId: 'sys.hgx-b300',
      lodLevel: 'rack',
      focusAssemblyId: 'asm.hgx.rack',
      planes: ['business'],
      highlightAssemblyIds: ['asm.hgx.local-nvme', 'asm.hgx.bf3-dpu', 'asm.hgx.storage'],
      highlightConnectionIds: ['con.hgx.bf3-converged', 'con.hgx.converged-storage'],
      chain: [
        {
          id: 'kvbm-tiering',
          hardwareRoleKeys: ['gpu-hbm', 'cache-storage'],
          techniqueId: 'tech.kvbm',
          phases: ['kv-write', 'decode'],
          metrics: ['ttft', 'kv-hit'],
          narrative:
            'KVBM 把 KV 当分层内存里的块管：**HBM 只是第一层**，装不下的推到本地盘——' +
            '命中远端层虽慢于 HBM，但比重算 prefill 便宜得多。',
        },
        {
          id: 'nixl-restore',
          hardwareRoleKeys: ['north-south-dpu', 'external-storage'],
          techniqueId: 'tech.nixl',
          phases: ['kv-write'],
          metrics: ['ttft'],
          narrative:
            '跨节点/跨层的 KV 搬运走 NIXL：同一套接口下，**块在哪一层是调度决策而不是架构约束**——' +
            '这正是官方点名「卸载到网络存储」能落地的前提。',
        },
      ],
      keyFigures: [
        {
          key: 'kvOffloadNote',
          label: 'KV 卸载到网络存储（HGX RA 官方原句）',
          claim: claim<string>({
            value:
              '官方点名的未来负载：分布式推理把 KV cache 卸载到高速网络存储，需要更高的每 GPU 突发 I/O 能力',
            unit: null,
            sourceId: 'src.nvidia-hgx-ra',
            locator:
              'Components 节 Converged (Node North/South) Ethernet Networking 的 Note，「For HGX B300 deployments, it can be helpful to consider future workloads such as distributed inference that may use KV cache offloads to highspeed, network attached storage. In these cases, having higher burst I/O capacity per GPU can be advantageous, even if the average bandwidth needs for typical training workloads are not very high.」',
            asOf: ASOF,
            note: '与 cmp.hgx.local-nvme.specs.kvCacheOffloadNote 同源同句（content.test 有一致锁）。',
          }),
        },
        {
          key: 'mooncakeCapacityGain',
          label: 'Mooncake：有效请求容量提升（真实 trace 回放）',
          claim: claim<string>({
            value: '+59% ~ +498%',
            unit: null,
            evidence: 'benchmark',
            sourceId: 'src.mooncake-fast25',
            locator:
              'FAST 25 摘要，「Mooncake increases the effective request capacity by 59%~498% when compared to baseline methods, all while complying with SLOs」',
            asOf: ASOF,
            confidence: 'medium',
            note:
              '厂商自述系统论文（Moonshot AI + 清华，FAST 25 Best Paper），非独立评测。' +
              '⚠️ arXiv 版摘要写的是「up to 525%」——本项目登记 FAST 25 页，只引正式版数字。',
          }),
        },
        {
          key: 'mooncakeProdGain',
          label: 'Mooncake：生产集群请求量提升（Kimi 实际部署）',
          claim: claim<string>({
            value: 'A800 集群 +115% / H800 集群 +107%',
            unit: null,
            evidence: 'benchmark',
            sourceId: 'src.mooncake-fast25',
            locator:
              'FAST 25 摘要，「enables Kimi to handle 115% and 107% more requests on NVIDIA A800 and H800 clusters, respectively, compared to previous systems」',
            asOf: ASOF,
            confidence: 'medium',
            note: '⚠️ arXiv 版写的是「75% more requests」——版本不同数字不同，只引 FAST 25 版。',
          }),
        },
        {
          key: 'kvHitRate',
          label: 'KV cache 命中率（通用参考值）',
          claim: claim<number>({
            value: null,
            unit: '%',
            evidence: 'benchmark',
            sourceId: 'src.mooncake-fast25',
            asOf: ASOF,
            confidence: 'low',
            note:
              '没有可脱离负载引用的通用命中率：命中率由业务的前缀共享度决定' +
              '（系统 prompt 越长、多轮占比越高越划算），论文数字都绑定具体 trace，本项目不抽一个数出来。',
          }),
        },
      ],
      calculatorId: 'kv-restore',
      crossRefs: [],
      presalesNote:
        '这一章是存储切面的成本核心：**KV 命中一次 = 省一次 prefill 重算**。' +
        '给客户算账时先问两个数——上下文多长、前缀共享度多高，再决定层级配多深。',
      sourceIds: ['src.nvidia-hgx-ra', 'src.nvidia-dynamo-docs', 'src.mooncake-fast25', 'src.nvidia-nixl-repo'],
    },
    {
      id: 'lens.storage.archive-mirror',
      title: '归档与镜像：MTTR 的另一半',
      narration:
        '① 你应该看到什么：回到 GB300 机房总览，只有最外圈的 L3 对象存储和它到汇聚层的那条线亮着。' +
        '管理网守的是「多快发现和处置故障」，这一层守的是**「坏了之后从哪儿恢复」**——MTTR 的另一半。' +
        '② 谁连谁 + 关键数字：检查点、容器镜像、模型版本的冷副本都沉在这里；恢复动作 = 沿业务网把它们' +
        '拉回来重放。这一层几乎没有官方数字可引：RTO 取决于「归档吞吐 × 副本布局 × 重放流程」，' +
        '三个变量全在客户侧——所以本章的关键数字栏几乎全是「官方未公布」，这本身就是要传达的信息。' +
        '③ 没有这层会怎样：故障从「恢复演练」变成「数据打捞」；跨机房容灾没有镜像仓就是空话。' +
        '训练场景更直接——没有检查点归档，一次断电等于烧掉整段训练时长。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'cluster',
      focusAssemblyId: 'asm.gb300.facility',
      planes: ['business'],
      highlightAssemblyIds: ['asm.gb300.object-storage'],
      highlightConnectionIds: ['con.gb300.objstore-converged'],
      chain: [
        {
          id: 'archive-restore',
          hardwareRoleKeys: ['object-storage'],
          techniqueId: null,
          phases: [],
          metrics: ['mttr', 'cost-per-token'],
          narrative:
            '硬件直达指标：归档层不产 token，但它决定**停产之后多久能复产**（MTTR），' +
            '以及冷数据放在多便宜的介质上（cost-per-token 只作叙事标注，本项目不出数）。',
        },
      ],
      keyFigures: [
        {
          key: 'archiveThroughput',
          label: '归档/恢复吞吐（RTO 的分母）',
          claim: claim<number>({
            value: null,
            unit: 'GB/s',
            sourceId: 'src.nvidia-dynamo-docs',
            asOf: ASOF,
            confidence: 'low',
            note:
              '官方未公布：归档层的吞吐与 RTO 完全取决于客户的存储选型、副本布局与恢复流程，' +
              '参考架构不覆盖这一层——本项目不编数。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [],
      presalesNote:
        '与管理网那章配对着讲：**管理网管「多快知道坏了」，归档层管「坏了之后多快回来」**。' +
        '客户的容灾预算通常挂在后者上。',
      sourceIds: ['src.nvidia-dynamo-docs'],
    },
    {
      id: 'lens.storage.rag-l4',
      title: 'RAG 与 L4：数据库/向量库（纯叙事）',
      narration:
        '① 你应该看到什么：3D 场景**刻意不动**——数据库和向量库不在机架里，这本身就是本章的教学点。' +
        '它们跑在普通服务器集群上，经业务网与推理集群对话，参考架构完全不覆盖这一层。' +
        '② 谁连谁 + 关键数字：RAG 的链路是「请求进来 → 先查库（向量检索/关键词召回）→ 拼进 prompt → ' +
        '才开始 prefill」——检索是**串行叠加在 TTFT 前面的**，库慢一毫秒，首 token 就晚一毫秒。' +
        '存储厂商都在往这层卡位：WEKA 宣称 128K 上下文下 TTFT 改善 **41 倍**（Augmented Memory Grid，' +
        '厂商自测）；VAST 宣称重算 prefill 62 秒 vs 从其存储加载 KV 3 秒（Llama 3.1-405B、127,188 token、' +
        'H100，厂商自测）。⚠️ 这些全是营销口径的 vendor_claim，听个方向、别报给客户当规格。' +
        '③ 没有这层会怎样：模型只能靠参数记忆回答——私域知识、时效数据都进不来；' +
        '但反过来，把 L4 建歪了（检索慢、召回差），TTFT 和答案质量一起塌。',
      systemId: 'sys.gb300-nvl72',
      lodLevel: 'cluster',
      focusAssemblyId: null,
      planes: ['business'],
      highlightAssemblyIds: [],
      highlightConnectionIds: [],
      chain: [
        {
          id: 'rag-serial',
          hardwareRoleKeys: [],
          techniqueId: null,
          phases: ['ingress', 'prefill'],
          metrics: ['ttft'],
          narrative:
            '不经机架内硬件的一行：**检索发生在 prefill 之前、串行占用 TTFT**。' +
            'L4 的容量/延迟规划是应用架构问题，参考架构不管、本项目也不建 3D 实体——官方源里它就不存在。',
        },
      ],
      keyFigures: [
        {
          key: 'wekaTtftGain',
          label: 'WEKA：TTFT 改善倍数（128K 上下文，厂商自测）',
          claim: claim<number>({
            value: 41,
            unit: '倍',
            evidence: 'vendor_claim',
            sourceId: 'src.weka-materials',
            locator:
              'WEKA 博客「Unlocking Scalable Inference with WEKA Augmented Memory Grid」，「achieving a 41x improvement based on a 128,000-token context window」（Llama-405B Int4，DGX H100 环境）',
            asOf: ASOF,
            confidence: 'medium',
            note: '⚠️ 存储厂商营销口径：对比对象是「无 KV 分层、全量重算」的基线，非独立评测。',
          }),
        },
        {
          key: 'vastTtft',
          label: 'VAST：重算 vs 从存储加载 KV（厂商自测）',
          claim: claim<string>({
            value: 'TTFT 62 秒（重算 prefill）→ 3 秒（从 VAST 加载 KV cache）',
            unit: null,
            evidence: 'vendor_claim',
            sourceId: 'src.vast-materials',
            locator:
              'VAST 博客「NVIDIA Dynamo + VAST = Scalable, Optimized Inference」：HGX H100 8 卡 × Llama 3.1-405B × 127,188-token prompt，经 Dynamo NIXL + GDS/RoCE',
            asOf: ASOF,
            confidence: 'medium',
            note: '⚠️ 存储厂商营销口径，非独立评测；链路利用率宣称达 200 Gbps 链路的 ~99%。',
          }),
        },
      ],
      calculatorId: null,
      crossRefs: [{ label: '回看：机架里的 KV 层级（L1/L2）', chapterId: 'lens.storage.kv-runtime' }],
      presalesNote:
        '「这层不在机架里」是本章的钩子：参考架构的边界就是 NVIDIA 责任的边界，' +
        'L4 归客户的应用架构师管——但 TTFT 的账单上它一样有名字。',
      sourceIds: ['src.weka-materials', 'src.vast-materials', 'src.nvidia-dynamo-docs'],
    },
  ],
}

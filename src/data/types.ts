/**
 * 内容包数据模型（批次 1 末冻结：此后只增字段，不改名、不改语义）。
 *
 * 硬约束：
 * 1. 纯 JSON 可序列化——无函数、无 Date、无类实例、无 Symbol。`pack.test.ts` 有 JSON 往返断言。
 * 2. 可选字段一律写成 `| null` 显式空值，不用 `?:` 省略；否则 `undefined` 会在 JSON 往返中被吞掉。
 *    （唯一例外见 `VisualHint.wireframe`：要么整键不出现，要么为 boolean，绝不赋 undefined。）
 * 3. 证据纪律：任何易变事实（数量/规格/功率）都必须包成 `Claim`，官方未公布时 `value: null`
 *    ——「官方未公布不编数」。作者的行业背景知识只能进 `evidence: 'author_opinion'` 或纯文案字段
 *    （summary / presalesNote / note）。
 * 4. 跨代比较永不解析 ID 字符串，只用 `AssemblyNode.roleKey` 配对。
 *
 * ID 前缀规范（`pack.test.ts` 用 regex 强制）：
 *   src. | cmp. | sys. | asm. | con. | flow. | cmpdef. | scene.
 */

// ─────────────────────────── 证据体系 ───────────────────────────

/** 证据强度分级：从「官方白纸黑字」到「作者观点」。UI 用它渲染证据徽章。 */
export type EvidenceType =
  | 'verified_spec' // 官方规格表/参考架构中的确切数字
  | 'vendor_claim' // 厂商宣称（含营销口径，如「50× AI factory 产出」）
  | 'benchmark' // 公开跑分
  | 'management_guidance' // 管理层业绩会指引
  | 'analyst_estimate' // 分析师测算
  | 'forecast' // 未发布产品的预测
  | 'author_opinion' // 本项目作者的解读（不可当事实引用）

/** 产品生命周期状态。产能估算对 `forecast` 系统直接拒绝出数。 */
export type ProductStatus = 'shipping' | 'announced' | 'forecast'

/** 六个网络/物理平面。DOM 图例、降级连接表与 3D 连线共用这一组枚举。 */
export type NetworkPlane =
  | 'nvlink' // scale-up：机架内 GPU 全互联
  | 'scaleout' // scale-out：跨节点 East/West 计算网
  | 'business' // North/South：客户业务与存储网
  | 'mgmt' // 带外/带内管理网
  | 'power' // 供电
  | 'cooling' // 液冷

export type SourceKind =
  | 'official_doc' // 厂商官方文档/规格页
  | 'official_press' // 厂商官方发布稿
  | 'analyst_report' // 第三方分析师报告（非官方！）
  | 'earnings_call' // 业绩电话会
  | 'internal_deck' // 内部材料
  | 'media_report' // 媒体报道（非官方！转述的厂商回应只能作为 note 里的转述出现）

export interface SourceRef {
  id: string // src.*
  title: string
  publisher: string
  kind: SourceKind
  url: string | null
  localFile: string | null // 相对仓库根的路径，如 'sources/xxx.pdf'
  asOf: string // YYYY-MM
  note: string | null
}

export type ClaimValue = number | string | boolean

export type Confidence = 'high' | 'medium' | 'low'

/**
 * 一条可溯源的事实。`value: null` 是一等公民，含义是「该源未公布此数值」，
 * 下游（产能估算/对比表）必须把 null 传播成 null 或拒绝出数，绝不当 0 处理。
 */
export interface Claim<T extends ClaimValue = ClaimValue> {
  value: T | null
  unit: string | null
  evidence: EvidenceType
  status: ProductStatus
  sourceId: string // → SourceRef.id
  locator: string | null // 页码 / 表号 / 章节，便于回查
  asOf: string // YYYY-MM
  confidence: Confidence
  note: string | null
}

// ─────────────────────────── 视觉（3D 只认外形，不认型号） ───────────────────────────

/**
 * 通用外形词汇表。3D 侧 `GenericShapes` 只按 shape 建几何体，
 * 因此新增一个型号不需要动 3D 代码。
 */
export type VisualShape =
  | 'facility-floor' // 机房地面/房间
  | 'rack-row' // 一排机架
  | 'rack-frame' // 机架壳（Oberon/MGX）
  | 'tray-slab' // 1U 托盘
  | 'board' // 板卡/基板
  | 'chip' // 裸芯片（GPU/CPU/ASIC die）
  | 'chip-stack' // 堆叠芯片（HBM）
  | 'switch-box' // 交换机盒子
  | 'nic-card' // 网卡/夹层卡
  | 'ssd-stick' // M.2 / E1.S
  | 'psu-brick' // 电源模块
  | 'busbar' // 直流母排
  | 'backplane' // 背板（NVLink 铜背板）
  | 'pipe' // 管路
  | 'cold-plate' // 冷板
  | 'cdu-cabinet' // CDU 机柜
  | 'storage-array' // 存储阵列

export interface VisualHint {
  shape: VisualShape
  /** true = 线框（用于 forecast 代际的「未落地」质感）。不用时整键省略，勿赋 undefined。 */
  wireframe?: boolean
  /** palette.ts 中的 token 名（如 'plane-nvlink' / 'accent'）；null = 用该 shape 默认色。 */
  colorToken: string | null
}

// ─────────────────────────── 硬件组件 ───────────────────────────

export type NonGpuComponentKind =
  | 'cpu'
  | 'hbm'
  /**
   * 语言处理单元（LPU）——非 GPU 的推理加速器（v1.3 W3：NVIDIA Groq 3 LP30）。
   *
   * ⚠️ 必须放在 `NonGpuComponentKind` 而不是直接加进 `ComponentKind`：
   * `HardwareComponent` 是按 `kind` 判别的联合类型，只有 `kind: 'gpu'` 那一支才带
   * `mathSpecs`。LPU 走 non-GPU 分支 ⇒ 类型层面就**不可能**给它挂 `GpuMathSpecs`
   * （`pack.test.ts` 另有运行期断言兜底），产能估算也因此不会误把 LPU 当 GPU 用。
   */
  | 'lpu'
  | 'tray'
  | 'rack'
  | 'switch'
  | 'nic'
  | 'dpu'
  | 'storage'
  | 'power'
  | 'cooling'
  | 'facility'

export type ComponentKind = 'gpu' | NonGpuComponentKind

/**
 * roofline 数学的输入口径——**与 Claim 证据展示刻意分离**：
 * 这里只放能直接进公式的官方数字，任一关键字段为 null 时 `capacity.ts` 走拒绝/降级门。
 * 未公布的整体设为 `mathSpecs: null`，不允许拿分析师估算填。
 */
export interface GpuMathSpecs {
  memoryGB: number
  bandwidthTBs: number
  fp8Tflops: number | null // 稠密口径（dense）
  fp4Tflops: number | null // 稠密口径（dense）
  tdpW: number | null
  /** 数值怎么来的（如「官方整机值 ÷72」），UI 悬浮显示，防止被当成芯片规格表直接引用。 */
  derivation: string
}

interface ComponentBase {
  id: string // cmp.*
  name: string
  vendor: string
  status: ProductStatus
  /** 作用一句话：这东西是干嘛的。 */
  summary: string
  /** 售前怎么跟客户解释（人话、带业务价值）。 */
  presalesNote: string
  visual: VisualHint
  /** 实物图外链（只外链，不复制进包）。 */
  imageUrl: string | null
  sourceIds: string[]
  /** 规格表：键为稳定语义键（如 'hbmPerGpuGB'），值为可溯源 Claim。 */
  specs: Record<string, Claim>
}

export type HardwareComponent =
  | (ComponentBase & { kind: 'gpu'; mathSpecs: GpuMathSpecs | null })
  | (ComponentBase & { kind: NonGpuComponentKind; mathSpecs?: never })

// ─────────────────────────── 系统（一代机架方案） ───────────────────────────

/**
 * 产能估算的分支策略（`lib/capacity.ts` 按它决定拒绝门，`v1.3` 新增）：
 * - `standard`：走常规拒绝门链（GPU 数学参数缺失才拒绝，否则正常出数）；
 * - `analyst-modeled`：系统本身可能已官宣（`status` 可以是 `announced`），
 *   但结构/规格主要来自第三方分析师（forecast 证据）——一律拒绝出产能数字，
 *   不区分「缺哪个字段」，`missing` 恒为空数组（这不是「差一个数」，是「口径不够硬」）；
 * - `paired-only`：只在与配对系统联合工作时才有产能语义（如推理加速器配 GPU 做
 *   AFD 组合），本工具不提供该系统的独立产能数字（`v1.4` Groq 3 LPX 起用到）。
 */
export type CapacityPolicy = 'standard' | 'analyst-modeled' | 'paired-only'

/**
 * scale-up 域的架构分型（v1.4 预备提交起）。pack.test 的「核心 roleKey 分型规则」
 * 按它映射各族必备/禁用 roleKey——之前用 `capacityPolicy !== 'paired-only'` 当判据，
 * 但产能策略和域架构是两个正交概念（HGX 是 standard 产能却不是机架级 NVLink 域）。
 * - `nvlink-rack-domain`：NVLink 域跨整机架（GB300 / Vera Rubin / NVL576）；
 * - `nvlink-node-domain`：NVLink 域止步单服务器，NVSwitch 在基板上（HGX B300）——
 *   机架级 nvlink 平面刻意为空即教学内容；
 * - `lpu-direct-fabric`：LPU 直连 fabric，整个架构没有交换层（Groq 3 LPX）。
 */
export type SystemArchitecture = 'nvlink-rack-domain' | 'nvlink-node-domain' | 'lpu-direct-fabric'

export interface FactorySystem {
  id: string // sys.*
  name: string
  vendor: string
  status: ProductStatus
  /** 代际标识，如 'blackwell-ultra' / 'vera-rubin' / 'rubin-ultra'。 */
  generation: string
  referenceUrl: string | null
  summary: string
  presalesNote: string
  sourceIds: string[]
  /**
   * 至少包含 'gpuCount' 与 'rackPowerKW'（后者为 tokens/W 估算输入，未公布则 value: null）。
   * ⚠️ 这两个键名是 GPU 语义的历史命名；`capacityPolicy !== 'standard'` 的系统仍需按
   * 该约定填写（哪怕值为 null），`lib/capacity.ts` 的拒绝门不靠字段是否存在来判断，
   * 而是先看 `capacityPolicy`——真正的「非 GPU 加速器」代际（如 paired-only 的 LPU 机架）
   * 会在 keySpecs 里并行提供语义更准确的键（如 `acceleratorCount`），详见该代际的数据文件。
   */
  keySpecs: Record<string, Claim>
  /**
   * 机架总高（U），仅供 3D 摆位与 rack-U 不重叠校验使用。
   * ⚠️ 非官方规格 claim——官方未公布逐 U 布局，`AssemblyNode.rackU` 全为示意占位。
   */
  rackUnitsForLayout: number | null
  /** 产能估算的分支策略，见 `CapacityPolicy`。 */
  capacityPolicy: CapacityPolicy
  /** scale-up 域架构分型，见 `SystemArchitecture`。与 `capacityPolicy` 正交。 */
  architecture: SystemArchitecture
}

// ─────────────────────────── 装配树 ───────────────────────────

/** 语义 LOD 层级 = React 挂载/卸载的粒度（非 THREE.LOD）。 */
export type LodLevel = 'cluster' | 'rack' | 'tray' | 'board'

/** 机架内占位区间（1U 起）。`start` 为最低 U，`height` 覆盖该节点全部 `count` 个实例的连续跨度。 */
export interface RackUSpan {
  start: number
  height: number
}

export interface AssemblyNode {
  id: string // asm.*
  systemId: string // → FactorySystem.id
  parentId: string | null // null = 该系统的树根（每系统恰好一个）
  componentId: string // → HardwareComponent.id
  /** ★ 跨代比较的稳定语义键（如 'accelerator' / 'nvswitch-asic'）。比较逻辑只认它，永不解析 ID。 */
  roleKey: string
  label: string
  /** 每个父实例下的数量。 */
  count: number
  /** 关键数量必须带证据（18 托盘 / 9 NVSwitch 托盘 / 4 GPU / 2 CPU …）；非关键数量可为 null。 */
  countClaim: Claim<number> | null
  lodLevel: LodLevel
  rackU: RackUSpan | null
  note: string | null
}

// ─────────────────────────── 连接（按类型，不按实例） ───────────────────────────

/**
 * 拓扑形态。一条 gpu→nvswitch 边 + `topology: 'all-to-all'` 表达 72×18 的全互联，
 * 而不是在数据里铺 1296 条实例边。
 */
export type ConnectionTopology =
  | 'all-to-all'
  | 'rail-optimized'
  | 'fat-tree'
  | 'star'
  | 'bus'
  | 'loop'
  | 'point-to-point'

export type ConnectionMedium =
  | 'copper-backplane'
  | 'pcb-trace'
  | 'dac-cable'
  | 'optical-fiber'
  | 'busbar'
  | 'ac-feed'
  | 'liquid-loop'
  | 'thermal-contact'
  | 'airflow' // 风冷 cooling 平面（v1.4 HGX 起用；此前八种介质全是液冷/接触语义）

export interface Connection {
  id: string // con.*
  systemId: string
  fromAssemblyId: string // → AssemblyNode.id（须同 systemId）
  toAssemblyId: string
  plane: NetworkPlane
  topology: ConnectionTopology
  medium: ConnectionMedium
  /** 协议/标准名，如 'NVLink 5' / 'Ethernet RoCEv2' / 'DC 800V busbar'。 */
  protocol: string
  bandwidth: Claim<number> | null
  direction: 'bidirectional' | 'unidirectional'
  label: string
  summary: string
  sourceIds: string[]
}

// ─────────────────────────── 推理数据流 ───────────────────────────

/** 七阶段。`pack.test.ts` 校验一个 episode 内 phase 序号单调不减。 */
export type FlowPhase =
  | 'ingress'
  | 'prefill'
  | 'kv-write'
  | 'decode'
  | 'moe-dispatch'
  | 'moe-combine'
  | 'egress'

export const FLOW_PHASE_ORDER: readonly FlowPhase[] = [
  'ingress',
  'prefill',
  'kv-write',
  'decode',
  'moe-dispatch',
  'moe-combine',
  'egress',
]

/**
 * 粒子相对连接 `from → to` 的播放方向（v1.2 F3）。
 *
 * - `forward`：顺着 from→to 跑；
 * - `reverse`：逆着跑（例如「请求进入机架」——连接是 DPU→汇聚交换机，
 *   但请求本身是从汇聚交换机进来的）；
 * - `bidirectional`：相向串珠，如实表现 all-reduce / All-to-All 这类**双向** collective
 *   （底层边 topology 就是 `all-to-all, bidirectional`，单向播放是语义错误）；
 * - `null`：本步没有线（逻辑层步骤 / 纯本地动作），方向不适用。
 *
 * ⚠️ 在 `FlowStep` 里**必填**且用 `| null` 而不是 `?:`：内容包要过「JSON 往返深等」
 *    与「包内不含 undefined」两条断言（`pack.test.ts`），`undefined` 会被
 *    `JSON.stringify` 静默吞掉。
 */
export type ParticleDirection = 'forward' | 'reverse' | 'bidirectional' | null

export interface FlowStep {
  id: string
  phase: FlowPhase
  label: string
  description: string
  /** 该步骤点亮的连接；`logicalOnly: true` 的步骤可为空数组。 */
  connectionIds: string[]
  /**
   * 该步骤高亮的装配节点（批次 3 新增，向后兼容追加字段）——用于点亮没有对应
   * `Connection` 的部件本身（例如「权重常驻 HBM」要常亮 HBM 装配节点，而不是某条连接）。
   * `logicalOnly: true` 的步骤同样可为空数组。
   */
  highlightAssemblyIds: string[]
  /**
   * 粒子沿 `connectionIds` 的播放方向（v1.2 F3 新增，**必填**）。
   * 取值语义见 `ParticleDirection`；没有连接的步骤填 `null`。
   */
  particleDirection: ParticleDirection
  /** true = 纯逻辑层步骤（如「路由器选专家」），没有对应物理链路，UI 打「逻辑」徽章。 */
  logicalOnly: boolean
  /**
   * ⚠️ 仅用于动画节奏配比的相对权重，**不是真实时延**，禁止在 UI 上换算成 ms 展示。
   */
  durationHint: number
  presalesNote: string | null
}

export interface FlowEpisode {
  id: string // flow.*
  systemId: string
  title: string
  summary: string
  modelId: string | null // → ModelSpec.id
  steps: FlowStep[]
  sourceIds: string[]
}

// ─────────────────────────── 代际比较 ───────────────────────────

export interface ComparisonRow {
  roleKey: string
  label: string
  /** 覆盖自动生成的 diff 叙述；null = 用自动文案。 */
  narrative: string | null
}

export interface ComparisonDefinition {
  id: string // cmpdef.*
  leftSystemId: string
  rightSystemId: string
  title: string
  /** 给老板汇报用的要点（3~5 条）。 */
  summary: string[]
  rows: ComparisonRow[]
  sourceIds: string[]
}

// ─────────────────────────── 导览场景 ───────────────────────────

/** 导览语义。相机的具体数字归 3D 侧 `cameraPresets.ts`，这里只给「看什么」。 */
export interface ScenePreset {
  id: string // scene.*
  systemId: string
  title: string
  narration: string
  lodLevel: LodLevel
  focusAssemblyId: string | null
  planes: NetworkPlane[]
  highlightAssemblyIds: string[]
  presalesNote: string | null
}

// ─────────────────────────── 模型（roofline 输入） ───────────────────────────

export type AttentionType = 'MHA' | 'MQA' | 'GQA' | 'MLA' | 'DSA'

/**
 * KV cache 判别式 schema。无可靠公开公式参数的新型稀疏/线性注意力用 `unsupported`
 * ——下游必须传播 null，不做伪精确估算。
 */
export type KVSpec =
  | { kind: 'mha-gqa'; numLayers: number; kvHeads: number; headDim: number }
  | { kind: 'mla'; numLayers: number; kvLatentDim: number }
  | { kind: 'unsupported'; note: string }

export interface ModelSpec {
  id: string
  name: string
  vendor: string
  year: number
  totalParamsB: number // 十亿（B）
  activeParamsB: number // MoE 激活参数；dense 与 total 相同
  /** MoE 专家配置；官方未公布时整键省略（勿用 0 占位）。 */
  moe: { experts: number; activePerToken: number; shared: number } | null
  attentionType: AttentionType
  kvSpec: KVSpec
  contextK: number
  license: string
  sourceUrl: string
  asOf: string // YYYY-MM
  note: string | null
}

// ─────────────────────────── 内容包 ───────────────────────────

export interface FactoryContentPack {
  version: string
  generatedAsOf: string // YYYY-MM
  sources: SourceRef[]
  systems: FactorySystem[]
  components: HardwareComponent[]
  assemblies: AssemblyNode[]
  connections: Connection[]
  flows: FlowEpisode[]
  comparisons: ComparisonDefinition[]
  scenes: ScenePreset[]
  models: ModelSpec[]
}

/** ID 前缀 → 集合名，`pack.test.ts` 据此强制命名规范。 */
export const ID_PREFIX = {
  sources: 'src.',
  systems: 'sys.',
  components: 'cmp.',
  assemblies: 'asm.',
  connections: 'con.',
  flows: 'flow.',
  comparisons: 'cmpdef.',
  scenes: 'scene.',
} as const

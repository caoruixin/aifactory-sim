import { claim, notPublished, raSpec, RA_SOURCE } from './claim'
import type { HardwareComponent } from './types'

/**
 * 跨代共享组件：机架壳、供电、液冷与机房侧设施。
 * 这些东西在 GB300 / Vera Rubin / Rubin Ultra 三代之间形态基本不变，
 * 因此单独抽出来，代际比较时会因为 roleKey 相同而自动配成「未变化」行。
 *
 * ⚠️★ 液冷三件套（CDU / manifold / cold-plate）的溯源边界，务必读完再改这里：
 * 对 GB300 NVL72 参考架构做过全文检索，`CDU` / `manifold` / `cold plate` / `coolant` /
 * `quick disconnect` 五个词的**命中数均为 0**。RA 关于液冷只有两句话：
 *   - “the GB300 NVL72 rack is liquid cooled, based on the MGX architecture”
 *   - “Integrated tray-level and rack-level liquid leakage detection”
 * 所以：「机架是液冷的」有官方出处（见 cmp.shared.oberon-rack.specs.liquidCooled），
 * 但「冷板 → 歧管 → CDU → 一次侧水」这条二次侧回路的**部件与结构**是本项目按通用液冷
 * 工程做的建模，RA 没有描述。这三个组件仍挂 RA 源（它是「机架为液冷」这一前提的出处），
 * 但每一处都必须带 COOLING_MODEL_NOTE，不得让读者以为部件细节也是官方写过的。
 * 具体规格一律 value: null——官方未公布不编数。
 */
const COOLING_MODEL_NOTE =
  '⚠️ 通用液冷工程建模，非参考架构原文：GB300 NVL72 参考架构全篇只写了「the GB300 NVL72 rack is ' +
  'liquid cooled, based on the MGX architecture」与「Integrated tray-level and rack-level liquid ' +
  'leakage detection」，CDU / manifold / cold plate / coolant / quick disconnect 五个词一次都没出现。'

export const SHARED_COMPONENTS: HardwareComponent[] = [
  {
    id: 'cmp.shared.facility-room',
    kind: 'facility',
    name: '机房（AI Factory 场地）',
    vendor: '数据中心侧',
    status: 'shipping',
    summary: '承载机架、供配电与冷却水的物理场地，是「一座 AI 工厂」的边界。',
    presalesNote:
      '跟客户谈 AI Factory 一定要先谈这一层：机柜位、供电容量、冷却水温与承重决定了能不能上液冷高密机架。很多项目卡在机房改造而不是卡在买不到卡。',
    visual: { shape: 'facility-floor', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      powerCapacityKW: notPublished(
        'kW',
        RA_SOURCE,
        '机房总供电容量取决于客户场地，参考架构未给定值，需按实际机柜数 × 单机架功率核算。',
      ),
    },
  },
  {
    id: 'cmp.shared.rack-row',
    kind: 'facility',
    name: '机架列（Row）',
    vendor: '数据中心侧',
    status: 'shipping',
    summary: '若干机架成排布置，共享同一组母线槽、冷却支管与热通道/冷通道。',
    presalesNote:
      '一列多少个机架不是随便排的：受限于冷却支管流量与列头柜供电。扩容时先问「还能不能在同一列加」，跨列就要重新算网络布线长度。',
    visual: { shape: 'rack-row', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {},
  },
  {
    id: 'cmp.shared.oberon-rack',
    kind: 'rack',
    name: 'MGX 液冷机架（业界惯称 Oberon 形态）',
    vendor: 'NVIDIA / OEM',
    status: 'shipping',
    summary:
      '基于 MGX 架构的液冷机架壳体，为计算托盘、NVLink 交换托盘与供电层提供机械与流体接口。' +
      '⚠️「Oberon」是业界/分析师材料的惯用形态代号，GB300 NVL72 参考架构里零出现，见 formFactorName。',
    presalesNote:
      '这是「机架即计算机」的物理外壳：72 张 GPU 靠它的背板和母排被组织成一台机器。' +
      '客户最关心的两件事是**承重**与**进出水接口**，这两项要跟机房方提前对齐。' +
      '⚠️ 承重不要报数字：参考架构没有公布整机重量（见 weightKg），拿网上流传的吨位去承诺会被打脸；' +
      '正确做法是让 OEM 出具体整机的铭牌重量，再和机房核对楼板承载与运输路径。',
    visual: { shape: 'rack-frame', colorToken: null },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      liquidCooled: raSpec<boolean>(
        true,
        null,
        'System Hardware & Components，「the GB300 NVL72 rack is liquid cooled, based on the MGX architecture」',
      ),
      leakDetection: raSpec<string>(
        'tray-level 与 rack-level 双层液体泄漏检测',
        null,
        'System Hardware & Components 要点列表，「Integrated tray-level and rack-level liquid leakage detection」',
      ),
      heightU: notPublished(
        'U',
        RA_SOURCE,
        '参考架构未公布机架 U 高与逐 U 布局；本项目 3D 摆位使用示意占位高度（见 FactorySystem.rackUnitsForLayout）。',
      ),
      weightKg: notPublished(
        'kg',
        RA_SOURCE,
        '参考架构未公布整机重量。⚠️ 售前材料里流传的「>1.3 吨」之类数字没有 NVIDIA 官方出处，' +
          '本项目不收录、也不建议引用；要报重量请让 OEM 出具体整机的铭牌值。',
      ),
      formFactorName: claim<string>({
        value: 'MGX 液冷机架（本项目沿用业界惯称「Oberon」）',
        unit: null,
        sourceId: RA_SOURCE,
        locator:
          'System Hardware & Components，「the GB300 NVL72 rack is liquid cooled, based on the MGX architecture」',
        evidence: 'author_opinion',
        confidence: 'low',
        note:
          '⚠️ 官方只说「基于 MGX 架构」。**「Oberon」这个形态代号在 GB300 NVL72 参考架构里一次都没出现**' +
          '（全文检索命中数 0），它来自业界/分析师材料（本项目 NVL576 代际引用的 SemiAnalysis 文章即用此称）。' +
          '本组件名沿用这个惯称只是为了跨代可读，**不是 NVIDIA 官方口径**，对外讲的时候说「MGX 液冷机架」最稳。',
      }),
    },
  },
  {
    id: 'cmp.shared.busbar',
    kind: 'power',
    name: '直流母排（DC Busbar）',
    vendor: 'NVIDIA / OEM',
    status: 'shipping',
    summary: '机架背部纵向铜排，把电源架输出的直流电分配给每一个计算托盘与交换托盘。',
    presalesNote:
      '母排是高密机架能做到百千瓦级的关键：不再一台台服务器插电源线，而是整机架一条直流干路。连机架内的管理交换机都直接吃母排的直流电——这也是官方文档里明确写的。',
    visual: { shape: 'busbar', colorToken: 'plane-power' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      feedsInRackSwitches: raSpec<boolean>(
        true,
        null,
        'System Hardware & Components，「The GB300 NVL72 in-rack switches use DC power since they are connected to the DC busbar」',
      ),
      voltageV: notPublished('V', RA_SOURCE, '参考架构未公布母排电压等级。'),
      currentA: notPublished('A', RA_SOURCE, '参考架构未公布母排额定电流。'),
    },
  },
  {
    id: 'cmp.shared.facility-power',
    kind: 'power',
    name: '机房配电（列头柜 / 配电母线）',
    vendor: '数据中心侧',
    status: 'shipping',
    summary:
      '机架列端头的配电柜与沿列走向的配电母线：把机房交流市电分配到每一台机架的电源架，再由电源架整流上机架内的直流母排。',
    presalesNote:
      '「市电 → 列头柜/母线槽 → 机架电源架 → 机架直流母排 → 托盘」这条链路要在方案里一路讲通，客户才知道 142 kW 的机架不是插两根电源线就能上。列头柜的开关容量、母线槽的额定电流和上游变压器/UPS 的余量，是机房侧最先卡住扩容的三个点——NVIDIA 参考架构不管这一段，它归客户的机电顾问。',
    visual: { shape: 'busbar', colorToken: 'plane-power' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      // ⚠️ 参考架构只写到「机架侧」的供电（电源架/母排），机房配电设备的任何参数
      //    都不在文档范围内 —— 因此这里全部 value: null，不拿行业经验值充数。
      distributionVoltageV: notPublished(
        'V',
        RA_SOURCE,
        '参考架构只描述机架侧供电（8 个 33 kW 电源架 + 直流母排），未涉及机房配电电压等级；取决于当地电网与客户机电设计。',
      ),
      buswayRatedCurrentA: notPublished(
        'A',
        RA_SOURCE,
        '参考架构未公布母线槽/列头柜额定电流，需按每列机架数 × 单机架功率由机电顾问核算。',
      ),
      redundancy: notPublished(
        null,
        RA_SOURCE,
        '参考架构未规定机房配电的冗余等级（N / N+1 / 2N），属客户可用性设计范畴。',
      ),
    },
  },
  {
    id: 'cmp.shared.cdu',
    kind: 'cooling',
    name: 'CDU 冷量分配单元',
    vendor: '数据中心侧 / OEM',
    status: 'shipping',
    summary: '在机房冷却水（一次侧）与机架液冷回路（二次侧）之间做热交换与流量/压力控制。',
    presalesNote:
      'CDU 是液冷方案的「变压器」：把机房那套脏的、温度不稳的水，换成机架能直接用的干净、恒温、恒压的水。' +
      '客户问「我们机房只有风冷怎么办」，答案就落在 CDU 选型（风液 CDU 还是液液 CDU）上。' +
      COOLING_MODEL_NOTE,
    visual: { shape: 'cdu-cabinet', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      coolingCapacityKW: notPublished(
        'kW',
        RA_SOURCE,
        `参考架构从未提及 CDU 这个部件，自然也没有型号与冷量；实际选型需按机架数 × 单机架功率与客户一次侧水温另行核算。${COOLING_MODEL_NOTE}`,
      ),
      supplyWaterTempC: notPublished(
        '°C',
        RA_SOURCE,
        `参考架构未公布二次侧供水温度要求（全篇没有任何进液/出液温度指标）。${COOLING_MODEL_NOTE}`,
      ),
    },
  },
  {
    id: 'cmp.shared.manifold',
    kind: 'cooling',
    name: '机架分液歧管（Manifold）',
    vendor: 'NVIDIA / OEM',
    status: 'shipping',
    summary: '机架内的竖向进出水干管，通过快接头把冷却液分到每个托盘的冷板回路再汇总回流。',
    presalesNote:
      '歧管上的快接头（UQD）是运维体验的关键：支持带压热插拔才能做到「不停整机架换一个托盘」。' +
      '这是客户运维团队最在意的可维护性问题。' +
      COOLING_MODEL_NOTE +
      '这一段属于液冷通用工程实践，谈方案时请以 OEM 整机的实际歧管/快接头规格为准。',
    visual: { shape: 'pipe', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      flowRateLpm: notPublished(
        'L/min',
        RA_SOURCE,
        `参考架构从未提及歧管这个部件，自然也没有流量规格。${COOLING_MODEL_NOTE}`,
      ),
    },
  },
  {
    id: 'cmp.shared.cold-plate',
    kind: 'cooling',
    name: '冷板（Cold Plate）',
    vendor: 'NVIDIA / OEM',
    status: 'shipping',
    summary: '直接压在 GPU/CPU/交换芯片顶盖上的液冷换热板，把芯片热量带进液冷回路。',
    presalesNote:
      '一句话讲清液冷为什么必须：单颗 GPU 上千瓦的热量，风冷的散热密度已经追不上了。' +
      '冷板是「贴着芯片带走热」，效率比吹风高一个量级，这才让 142 kW 的机架成为可能。' +
      COOLING_MODEL_NOTE +
      '（142 kW 与「机架为液冷」是官方数字，「冷板贴着哪些芯片、有几块」不是。）',
    visual: { shape: 'cold-plate', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      // ⚠️ 这条曾被标成 verified_spec + 一个非原文的 locator，等于替官方说了它没说过的话。
      //    RA 全篇没有 cold plate 一词，更没有覆盖清单——降级为 author_opinion 并写明依据。
      coveredDevices: claim<string>({
        value: 'GPU、CPU 等主要发热器件（本项目建模，非官方清单）',
        unit: null,
        sourceId: RA_SOURCE,
        locator:
          'System Hardware & Components，「the GB300 NVL72 rack is liquid cooled, based on the MGX architecture」＋「Integrated tray-level and rack-level liquid leakage detection」',
        evidence: 'author_opinion',
        confidence: 'low',
        note:
          `参考架构只写了这两句，**没有**列出任何冷板覆盖清单，也没有出现过 cold plate 这个词。${COOLING_MODEL_NOTE}` +
          '本条是按液冷机架通用做法给出的建模描述，只用于 3D 表达「热量怎么离开芯片」，不可当官方规格引用。',
      }),
    },
  },
  {
    id: 'cmp.shared.facility-water-loop',
    kind: 'cooling',
    name: '机房一次侧冷却水回路',
    vendor: '数据中心侧',
    status: 'shipping',
    summary: '机房侧的冷冻水/冷却水系统，是 CDU 二次侧回路最终的排热去处。',
    presalesNote:
      '这是整条散热链的末端，也是最容易被忽略的瓶颈。谈单机架 142 kW 时，一定要顺带确认机房一次侧能不能接得住这份热负荷。',
    visual: { shape: 'pipe', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      returnWaterTempC: notPublished('°C', RA_SOURCE, '取决于客户机房设计，参考架构未给定值。'),
    },
  },
  {
    id: 'cmp.shared.sn2201',
    kind: 'switch',
    name: 'NVIDIA SN2201 管理交换机',
    vendor: 'NVIDIA',
    status: 'shipping',
    summary: '48 口带外（OOB）管理交换机，把机架内所有部件的 BMC 管理口汇聚起来。',
    presalesNote:
      '带外管理网是「机器挂了还能救回来」的那条命：业务网瘫痪时，运维仍能通过它上电、刷固件、看日志。客户做高可用设计时这条网必须独立。',
    visual: { shape: 'switch-box', colorToken: 'plane-mgmt' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      ports: raSpec<number>(48, '端口', 'Networking Hardware，「NVIDIA SN2201 Switch … 48 ports」'),
      role: raSpec<string>(
        '带外（OOB）管理，提供统一的管理连接',
        null,
        'Networking Hardware，「out-of-band (OOB) management … consolidated management connectivity」',
      ),
    },
  },
  {
    id: 'cmp.shared.storage-array',
    kind: 'storage',
    name: '外部存储集群',
    vendor: '第三方存储厂商',
    status: 'shipping',
    summary: '通过 North/South 汇聚网提供训练数据集、模型权重与检查点的高吞吐共享存储。',
    presalesNote:
      '存储在演示里最不起眼，但它决定了「GPU 有没有饭吃」。官方参考架构只给了每节点最高 40 GB/s 的存储带宽目标，具体选型（并行文件系统/对象存储）留给客户和存储厂商定。',
    visual: { shape: 'storage-array', colorToken: 'plane-business' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      perNodeStorageBandwidthGBs: raSpec<number>(
        40,
        'GB/s',
        'Networking Physical Topologies，「per-node storage bandwidth of up to 40 GB/s」',
        '这是每计算节点的存储带宽上限目标，不是存储阵列本身的规格。',
      ),
      capacityTB: notPublished('TB', RA_SOURCE, '参考架构不指定存储厂商与容量，由客户方案决定。'),
    },
  },
  {
    // v1.6 W-A：存储切面的 L3 层（模型分发货仓 / 归档镜像）。溯源边界照冷板先例：
    // GB300 / HGX 两份参考架构都**不涉及对象存储选型**（全文零出现 object storage / S3），
    // 「L3 对象存储」是按行业通行推理架构做的建模描述——官方出处只到「远端对象/云存储
    // 属于 KV 分层与模型分发架构的一层」这一前提（Dynamo KVBM 文档），部件规格一律 value: null。
    id: 'cmp.shared.object-storage',
    kind: 'storage',
    name: 'L3 对象存储（模型货仓 / 归档）',
    vendor: '第三方存储厂商 / 云服务商',
    status: 'shipping',
    summary:
      '集群外层的对象存储（S3 兼容口径）：模型权重的分发货仓、检查点与 KV 归档的最终去处。' +
      '⚠️ 行业通行架构的建模描述——GB300/HGX 参考架构均不涉及对象存储选型，' +
      '官方出处只到「remote file/object/cloud storage 属于 KV 分层的一层」（Dynamo KVBM 文档）。',
    presalesNote:
      '讲存储分层时把它放在最外圈：L1 是托盘里的 NVMe、L2 是高性能共享存储、L3 就是这里——' +
      '容量最便宜、带宽最不承诺。它的两个业务角色：① 模型分发的「货仓」（新副本从这里拉权重，' +
      '配 Model Streamer 可以 S3 直读进显存）；② 归档与镜像（MTTR 的另一半是「坏了之后从哪儿恢复」）。' +
      '⚠️ 选型、容量、吞吐都在参考架构范围之外，报数请以客户存储方案为准。',
    visual: { shape: 'storage-array', colorToken: 'plane-business' },
    imageUrl: null,
    sourceIds: ['src.nvidia-dynamo-docs'],
    specs: {
      capacityPB: claim({
        value: null,
        unit: 'PB',
        sourceId: 'src.nvidia-dynamo-docs',
        asOf: '2026-09',
        confidence: 'low',
        note:
          '行业通行架构的建模描述，非官方规格：GB300/HGX 参考架构均不涉及对象存储，' +
          'NVIDIA 官方材料也未给任何容量口径——由客户方案决定，本项目不编数。',
      }),
      aggregateThroughputGBs: claim({
        value: null,
        unit: 'GB/s',
        sourceId: 'src.nvidia-dynamo-docs',
        asOf: '2026-09',
        confidence: 'low',
        note:
          '行业通行架构的建模描述，非官方规格：对象存储吞吐取决于集群规模与厂商实现，' +
          '官方未公布任何目标值（对比：L2 共享存储有「每节点最高 40 GB/s」的官方目标）。',
      }),
    },
  },
]

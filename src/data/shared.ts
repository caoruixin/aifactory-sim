import { notPublished, raSpec, RA_SOURCE } from './claim'
import type { HardwareComponent } from './types'

/**
 * 跨代共享组件：机架壳、供电、液冷与机房侧设施。
 * 这些东西在 GB300 / Vera Rubin / Rubin Ultra 三代之间形态基本不变，
 * 因此单独抽出来，代际比较时会因为 roleKey 相同而自动配成「未变化」行。
 *
 * 注意：CDU/manifold/冷板的具体规格 NVIDIA 参考架构未公布，一律 value: null。
 */
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
    name: 'MGX 液冷机架（Oberon 形态）',
    vendor: 'NVIDIA / OEM',
    status: 'shipping',
    summary: '基于 MGX 架构的液冷机架壳体，为计算托盘、NVLink 交换托盘与供电层提供机械与流体接口。',
    presalesNote:
      '这是「机架即计算机」的物理外壳：72 张 GPU 靠它的背板和母排被组织成一台机器。客户最关心的两件事是承重（>1.3 吨量级）与进出水接口，这两项要跟机房方提前对齐。',
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
      weightKg: notPublished('kg', RA_SOURCE, '参考架构未公布整机重量。'),
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
    id: 'cmp.shared.cdu',
    kind: 'cooling',
    name: 'CDU 冷量分配单元',
    vendor: '数据中心侧 / OEM',
    status: 'shipping',
    summary: '在机房冷却水（一次侧）与机架液冷回路（二次侧）之间做热交换与流量/压力控制。',
    presalesNote:
      'CDU 是液冷方案的「变压器」：把机房那套脏的、温度不稳的水，换成机架能直接用的干净、恒温、恒压的水。客户问「我们机房只有风冷怎么办」，答案就落在 CDU 选型（风液 CDU 还是液液 CDU）上。',
    visual: { shape: 'cdu-cabinet', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      coolingCapacityKW: notPublished(
        'kW',
        RA_SOURCE,
        '参考架构未指定 CDU 型号与冷量，需按机架数 × 单机架功率与客户一次侧水温另行选型。',
      ),
      supplyWaterTempC: notPublished('°C', RA_SOURCE, '参考架构未公布二次侧供水温度要求。'),
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
      '歧管上的快接头（UQD）是运维体验的关键：支持带压热插拔才能做到「不停整机架换一个托盘」。这是客户运维团队最在意的可维护性问题。',
    visual: { shape: 'pipe', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      flowRateLpm: notPublished('L/min', RA_SOURCE, '参考架构未公布歧管流量规格。'),
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
      '一句话讲清液冷为什么必须：单颗 GPU 上千瓦的热量，风冷的散热密度已经追不上了。冷板是「贴着芯片带走热」，效率比吹风高一个量级，这才让 142 kW 的机架成为可能。',
    visual: { shape: 'cold-plate', colorToken: 'plane-cooling' },
    imageUrl: null,
    sourceIds: [RA_SOURCE],
    specs: {
      coveredDevices: raSpec<string>(
        'GPU、CPU 等主要发热器件',
        null,
        'System Hardware & Components（机架为液冷设计，托盘级含泄漏检测）',
        '参考架构未逐器件列出冷板覆盖清单，此处为整体描述。',
      ),
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
]

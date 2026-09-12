import type { FactoryContentPack, HardwareComponent } from './types'
import { reviewed } from './specifications'
const POD = 'src.nvidia-rubin-pod-blog'
const modules: HardwareComponent[] = [
  {
    id:'cmp.pod.vera-cpu-rack',kind:'rack',name:'Vera CPU Rack · Agent 执行',vendor:'NVIDIA',status:'announced',
    summary:'为 Agent 提供 CPU 执行环境、工具调用与任务处理；通过 POD 网络连接 GPU 计算系统。',
    presalesNote:'POD 的独立 CPU 资源池。图中一个机架仅表示模块类别，不代表每个 NVL72 必配一架。',
    visual:{shape:'rack-frame',colorToken:null},imageUrl:null,sourceIds:[POD,'src.nvidia-vera-cpu-rack'],
    specs:{cpuCount:reviewed(256,'CPU','src.nvidia-vera-cpu-rack','Specifications / CPU count'),cpuCoreCount:reviewed(22528,'核','src.nvidia-vera-cpu-rack','Specifications / Cores'),cpuMemoryTB:reviewed(400,'TB','src.nvidia-vera-cpu-rack','Specifications / System memory','最高容量；推荐配置 200 TB，单独于 NVL72 CPU 内存。')},
  },
  {
    id:'cmp.pod.bf4-stx-cmx',kind:'storage',name:'BlueField-4 STX / CMX · KV 存储',vendor:'NVIDIA',status:'announced',
    summary:'STX 存储参考架构以 Vera CPU 与 ConnectX-9 存储处理器连接闪存。CMX 提供 HBM 与共享存储之间的上下文层。',
    presalesNote:'存储层用于 KV 卸载与复用，恢复仍有 I/O 成本。下面数字是双 STX 处理器模块规格，不是整个存储机架的固定容量；与 Grace CPU 的 BlueField-4 DPU 分开。',
    visual:{shape:'storage-array',colorToken:null},imageUrl:null,sourceIds:[POD,'src.nvidia-stx-datasheet'],
    specs:{moduleConfiguration:reviewed('Dual STX storage processors',null,'src.nvidia-stx-datasheet','Specifications table'),networkBandwidthTbs:reviewed(3.2,'Tb/s','src.nvidia-stx-datasheet','Dual STX / Networking','双处理器模块网络能力；非整架吞吐，方向与部署有效吞吐需按 SKU 核实。'),pcieInterface:reviewed('PCIe Gen6 ×96',null,'src.nvidia-stx-datasheet','Dual STX / PCIe'),memoryCapacityGB:reviewed(384,'GB','src.nvidia-stx-datasheet','Dual STX / Memory'),cpuCoreCount:reviewed(null,'核','src.nvidia-stx-datasheet','CPU table','来源范围不清：STX 手册写每 CPU up to 84 Neoverse V2，与 Vera CPU 通用 88 Olympus 不一致；不套用通用值。')},
  },
  {
    id:'cmp.pod.spectrum6-spx',kind:'switch',name:'Spectrum-6 SPX · POD 网络',vendor:'NVIDIA',status:'announced',
    summary:'独立网络机架连接 GPU、CPU、LPX 与上下文存储资源池；交换 ASIC、交换机与网络机架是三种规格范围。',
    presalesNote:'不按每个计算机架固定附送一架 SPX。端口、光模块和机架数量由 POD 网络设计决定。',
    visual:{shape:'switch-box',colorToken:null},imageUrl:null,sourceIds:[POD,'src.nvidia-rubin-chips-blog'],
    specs:{asicBandwidthTbs:reviewed(102.4,'Tb/s','src.nvidia-rubin-chips-blog','Spectrum-6 / 512 lanes of 200G','单 Spectrum-6 ASIC 交换能力，非机架吞吐。'),serdesLanes:reviewed(512,'lane','src.nvidia-rubin-chips-blog','Spectrum-6'),serdesSpeedGbs:reviewed(200,'Gb/s','src.nvidia-rubin-chips-blog','Spectrum-6'),switchesPerRack:reviewed(null,'交换机',POD,'Spectrum-6 SPX rack','按集群规模与 OEM 网络配置决定。')},
  },
]
export function addPodModules(pack: FactoryContentPack) {
  const systemId='sys.vera-rubin-nvl72'
  const root=pack.assemblies.find(a=>a.systemId===systemId && a.parentId===null)!
  const rack=pack.assemblies.find(a=>a.systemId===systemId && a.roleKey==='rack')!
  pack.components.push(...structuredClone(modules))
  modules.forEach((component,i)=>{
    const id=`asm.pod.${['vera-cpu-rack','stx-cmx','spectrum6-spx'][i]}`
    pack.assemblies.push({id,systemId,parentId:root.id,componentId:component.id,roleKey:['agent-cpu-rack','kv-storage-rack','pod-network-rack'][i],label:component.name,count:1,countClaim:null,lodLevel:'cluster',rackU:null,note:'POD 配套模块示意；数量 1 是展示实例，不是 NVL72 固定 BOM。'})
    pack.connections.push({id:`con.pod.module-${i}`,systemId,fromAssemblyId:id,toAssemblyId:rack.id,plane:i===2?'scaleout':'business',topology:'point-to-point',medium:'optical-fiber',protocol:'POD 网络（逻辑连接示意）',bandwidth:null,direction:'bidirectional',label:'POD 资源连接 · 端口与路由待部署确认',summary:'逻辑关系示意；不规定直连、端口配比或固定带宽。',sourceIds:[POD]})
  })
}

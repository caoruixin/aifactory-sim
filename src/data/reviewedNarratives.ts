import type { FactoryContentPack } from './types'
/** Narrative prose must not silently retain obsolete default numbers after a claim correction. */
export function refreshNarratives(pack:FactoryContentPack) {
  const current='带宽比较请读取当前规格配置：网页 DSX MaxLPS 与数据手册上限配置独立。容量、带宽、计算和通信共同决定产出，不能把带宽倍数当作 token 吞吐倍数。'
  for(const system of pack.systems) if(system.id==='sys.vera-rubin-nvl72') system.presalesNote=current
  for(const scene of pack.scenes) {
    if(scene.systemId==='sys.vera-rubin-nvl72') {
      scene.narration=scene.narration.replace(/22 TB\/s/g,'19.2 TB/s（MaxLPS）').replace(/3\.6 TB\/s（3600 GB\/s）/g,'3 TB/s（MaxLPS）').replace(/3\.6 TB\/s/g,'3 TB/s（MaxLPS）').replace(/260 TB\/s/g,'216 TB/s（MaxLPS）').replace(/是 GB300 每卡 1\.8 TB\/s 的两倍/g,'与 GB300 每卡 1.8 TB/s 采用同一端点范围比较')
      scene.presalesNote=current
    }
    if(scene.systemId==='sys.gb300-nvl72') scene.narration=scene.narration.replace(/每张 288 GB/g,'每张 279 GB（SKU）')
  }
  for(const c of pack.comparisons) {
    c.summary=[...new Set(c.summary.map(text=>{
      if(/显存容量.*没有.*变化|单卡都是 288|真正翻倍的是三条带宽/.test(text)) return current+' GB300 SKU 279 GB，Rubin 288 GB。'
      if(text.startsWith('密度变化集中在')) return '交换托盘内的交换芯片从 2 → 4 颗（整架 18 → 36 颗）。DGX Rubin 表列 144 个 800G 端口；不能把端口数量等同于独立网卡板数量，NVL72 的具体板卡配置仍待确认。'
      if(text.includes('整机架功率至今未公布')) return 'Rubin 配置随产品版本变化；所选 NVL72 配置的整架功率尚未确认，tokens/W 暂不出数。'
      if(/Rubin GPU 单卡.*22 TB\/s/.test(text)) return 'Rubin 使用 HBM，LP30 使用片上 SRAM；容量、带宽、执行任务和配对条件均不同，不能比较独立产能。'+current
      return text.replace(/260 TB\/s/g,'216 TB/s（MaxLPS）')
    }))]
    for(const row of c.rows) {
      if(!row.narrative) continue
      if(/22 TB\/s|带宽 22 →|260 TB\/s|单卡 TDP 官方都没公布|288 GB vs 270 GB/.test(row.narrative)) row.narrative='具体数值与来源见本行规格对照。'+current+' GB300 最高可配置 TDP 1,400 W，Rubin NVL72 单卡 TDP 未确认。'
      if(row.roleKey==='north-south-dpu' && row.narrative.includes('BlueField-4')) row.narrative='BlueField-4 DPU 使用 64 核 Grace；STX 存储处理器使用 Vera，两者单独登记。端口速率、整卡带宽与系统配置分列；GB300 B3240 的约 480 Gb/s 是该板卡在 RA 的双口汇聚口径。'
      if(row.roleKey==='scaleout-nic' && c.rightSystemId==='sys.vera-rubin-nvl72') row.narrative='ConnectX-8 → ConnectX-9。DGX Rubin 参考配置列出 144 个 800G 端口；物理网卡板数量与每 GPU 聚合带宽不是同一口径，不能由端口数推定 144 张网卡。计算使用当前选定的整组规格，配置范围差异见核验记录。'
      if(row.roleKey==='gpu-hbm' && c.id.includes('hgx')) row.narrative='GB300 SKU 为 279 GB，HGX B300 SKU 为 270 GB；架构 / RA 288 GB 作为另一口径保留。'
    }
    if(c.leftSystemId==='sys.vera-rubin-nvl72' && c.rightSystemId==='sys.groq3-lpx') {
      const accelerator=c.rows.find(r=>r.roleKey==='accelerator')
      if(accelerator) accelerator.narrative='GPU 与 LPU 单颗数量没有可比性。GPU 的 HBM 与 LPU 的 SRAM 分担不同任务；AFD 在每层每个输出 token 交换激活。'+current
      const backbone=c.rows.find(r=>r.roleKey==='nvlink-backplane')
      if(backbone) backbone.narrative='Rubin 使用交换式 NVLink；LPX 为 LPU 直连 C2C，无交换芯片。两者机架骨干仍使用铜连接；托盘 cable-free 不代表机架没有铜缆。'
      for(const roleKey of ['agent-cpu-rack','kv-storage-rack','pod-network-rack']) if(!c.rows.some(r=>r.roleKey===roleKey)) c.rows.push({roleKey,label:'POD 配套模块',narrative:'POD 层的独立资源模块；此图在 Rubin 集群中展示，不表示 LPX 无法共享，也不表示每个计算机架固定配套。'})
    }
  }
}

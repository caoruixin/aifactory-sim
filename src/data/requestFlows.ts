import type { FactoryContentPack, FlowEpisode, FlowStep } from './types'

/** Loop membership is explicit: MoE happens inside layers of BOTH prefill and decode. */
export function requestFlows(pack: FactoryContentPack): FlowEpisode[] {
  return pack.systems.map(system=>{
    const nodes=pack.assemblies.filter(a=>a.systemId===system.id)
    const connections=pack.connections.filter(c=>c.systemId===system.id)
    const accelerator=nodes.find(a=>a.roleKey==='accelerator')
    const memory=nodes.find(a=>['gpu-hbm','accelerator-memory'].includes(a.roleKey))
    const local=connections.find(c=>c.plane==='nvlink' && (c.fromAssemblyId===accelerator?.id || c.toAssemblyId===accelerator?.id))
    const business=connections.find(c=>c.plane==='business' && /converged/.test(c.id))
    const suffix=system.id==='sys.gb300-nvl72'?'gb300':system.id.slice(4)
    const prefix=`flow.${suffix}.moe-inference`
    const isLPX=system.capacityPolicy==='paired-only'
    const isUnknown=system.capacityPolicy==='analyst-modeled'
    const scope=system.architecture==='nvlink-node-domain'?'每台服务器内八卡 NVLink 域；不同服务器通过 scale-out 连接。':isLPX?'GPU 负责 attention，LPX LPU 承担 FFN/MoE；每层、每个输出 token 都交换激活。配对链路没有可靠带宽参数。':isUnknown?'已公布 NVL576 为八个 72 GPU 机架、双层互联；内部装配与链路参数存在第三方推测，本流程仅定性。':'一个 NVLink 机架域内分配 TP 副本；参与请求的 GPU 由负载配置决定。'
    const step=(id:string,phase:FlowStep['phase'],label:string,description:string,ids:string[]=[],loop:FlowStep['loopContext']=null,payload:FlowStep['payload']='activation'):FlowStep=>({
      id:`${prefix}.${id}`,phase,label,description,connectionIds:ids,highlightAssemblyIds:(id==='gateway'?[]:[accelerator?.id,memory?.id]).filter((id):id is string=>!!id),
      particleDirection:ids.length?'bidirectional':null,logicalOnly:id==='gateway' || id.endsWith('router'),durationHint:3,presalesNote:scope,loopContext:loop,payload,
    })
    const stages:FlowStep[]=[step('gateway','ingress','请求与模型选择','请求到达已部署模型。权重常驻显存 / SRAM；此处不演示排队调度。',[],null,'request')]
    const ingress=step('business-ingress','ingress','请求进入计算资源','请求经业务网络进入节点；与权重加载、KV 交接是不同数据。',business?[business.id]:[],null,'request');ingress.particleDirection=business?'reverse':null;stages.push(ingress)
    for(const phase of ['prefill','decode'] as const) {
      const loop=phase==='prefill'?'prefill-layer' as const:'decode-layer-token' as const
      stages.push(step(phase,phase,phase==='prefill'?'Prefill · 逐层处理输入':'Decode · 每个输出 token 重复各层',`${phase==='prefill'?'输入 tokens 并行进入各层':'每个输出 token 都经历完整层循环'}：attention 读取 KV，随后执行 dense FFN 或 MoE。权重常驻，不随请求重新加载。${scope}`,local?[local.id]:[],loop))
      stages.push(step(`${phase}-router`,'moe-dispatch','层内 · Router 选择专家','MoE 层按每个 token 的路由选择专家；dense 模型直接执行 FFN。均匀路由只是负载估算假设。',[],loop))
      stages.push(step(`${phase}-dispatch`,'moe-dispatch','层内 · 分发激活张量','专家并行时将激活分发给选中的专家；TP-only 配置不等于自动使用专家并行。通信成本未计入估算。',local?[local.id]:[],loop))
      stages.push(step(`${phase}-experts`,phase,'层内 · 专家 / FFN 计算',isLPX?'LPU 计算 FFN/MoE，GPU 处理 attention；两侧按层协同，不能独立相加产能。':'只计算选中的专家；batch 中不同 token 可覆盖不同专家，读取权重集合随 batch 增长。',[],loop,'resident-weight'))
      stages.push(step(`${phase}-combine`,'moe-combine','层内 · 合并激活','合并专家结果后进入下一层；全部层完成才生成下一个 token。',local?[local.id]:[],loop))
      stages.push(step(`${phase}-kv-write`,'kv-write','层内 · KV 读写与增长','各 attention 层在计算时更新自己的 KV；此卡是侧向说明，不是 FFN 后另跑一次全模型 KV 阶段。已有 KV 保留，新 tokens 追加。',[],loop,'kv'))
    }
    const egress=step('egress','egress','返回生成 tokens','每完成一次 decode 步，向请求端返回输出 token。批内每请求的 KV 独立增长。',business?[business.id]:[],null,'token');egress.particleDirection=business?'forward':null;stages.push(egress)
    return {id:prefix,systemId:system.id,title:`${system.name} · 请求与层内循环`,summary:scope,modelId:'deepseek-v3',steps:stages,sourceIds:system.sourceIds}
  })
}

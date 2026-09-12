import { useEffect, useMemo, useState } from 'react'
import { FACTORY_PACK, modelById } from '../../data'
import { RUBIN_PROFILES } from '../../data/specifications'
import { capacityUnitWordingFor, estimateSystemCapacity } from '../../lib/capacity'
import { SCENARIO_PRESETS, encodeScenario, scenarioErrors } from '../../lib/scenario'
import type { ScenarioInput } from '../../lib/scenario'
import { QUANTS } from '../../lib/roofline'
import { useScenarioStore } from '../../scenarioStore'
import { useFactoryStore } from '../../store'
import CapacityBands from './CapacityBands'
import CapacityFeedback from './CapacityFeedback'

export interface CapacityPanelProps { systemIds: string[]; rackCount?: number; compact?: boolean }
export default function CapacityPanel({ systemIds, compact = false }: CapacityPanelProps) {
  const input = useScenarioStore(s => s.input)
  const setInput = useScenarioStore(s => s.setInput)
  const reset = useScenarioStore(s => s.reset)
  const [share, setShare] = useState('')
  useEffect(()=>setShare(''),[input])
  const model = modelById(input.modelId)
  const errors = scenarioErrors(input, model)
  const counterLabel = [...new Set(systemIds.map(id => capacityUnitWordingFor(id).counterLabel))].join(' / ')
  const estimates = useMemo(() => systemIds.map(systemId => estimateSystemCapacity({
    systemId, modelId:input.modelId, quantId:input.weightPrecision, scenario:input,
  })), [systemIds,input])
  const fieldClass = 'min-w-0 w-full scroll-mt-24 rounded border border-line bg-panel px-2 py-1.5 text-xs'
  const activePreset = SCENARIO_PRESETS.find(p => Object.entries(p.values).every(([key,value]) => input[key as keyof ScenarioInput] === value))
  const numeric: { key: 'cachedTokens'|'inputTokens'|'outputTokens'|'batch'|'unitCount'; label: string; min: number; max: number }[] = [
    {key:'cachedTokens',label:'已有上下文',min:0,max:model?.contextK ? model.contextK*1024 : 131072},
    {key:'inputTokens',label:'输入 tokens',min:1,max:131072}, {key:'outputTokens',label:'输出 tokens',min:1,max:131072},
    {key:'batch',label:'每副本 batch',min:1,max:4096}, {key:'unitCount',label:counterLabel,min:1,max:64},
  ]
  const shareScenario = async () => {
    const state = useFactoryStore.getState()
    const url = new URL(import.meta.env.BASE_URL, window.location.origin)
    url.searchParams.set('scenario',encodeScenario(input))
    url.searchParams.set('gen',state.generation)
    url.searchParams.set('mode',state.mode==='compare'?'compare':'explore')
    url.searchParams.set('level',state.level)
    if(state.focusPath.at(-1)) url.searchParams.set('focus',state.focusPath.at(-1)!)
    url.searchParams.set('planes',Object.entries(state.planes).filter(([,on])=>on).map(([plane])=>plane).join(','))
    if(state.reducedMotion) url.searchParams.set('motion','off')
    if(state.glStatus==='none'||state.glStatus==='failed') url.searchParams.set('gl','off')
    url.searchParams.set('simulation',useScenarioStore.getState().view)
    if (state.mode === 'compare') url.searchParams.set('right',state.compare.right)
    // A scene is portable independently of a tour/lens pin.
    url.searchParams.delete('tour'); url.searchParams.delete('lens'); url.searchParams.delete('chapter')
    setShare(url.href)
    try { await navigator.clipboard.writeText(url.href) } catch { /* selectable URL remains available */ }
  }
  const editor = <div className="space-y-2 rounded-lg border border-line bg-panel-2 p-2.5 text-xs" data-scenario-input>
      <label className="block">模型
        <select aria-label="模型" className={fieldClass} value={input.modelId} onChange={e=>setInput({modelId:e.target.value})}>
          {FACTORY_PACK.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>权重精度<select aria-label="权重精度" className={fieldClass} value={input.weightPrecision} onChange={e=>setInput({weightPrecision:e.target.value as ScenarioInput['weightPrecision']})}>{QUANTS.map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select></label>
        <label>计算精度<select aria-label="计算精度" className={fieldClass} value={input.computePrecision} onChange={e=>setInput({computePrecision:e.target.value as ScenarioInput['computePrecision']})}>{QUANTS.map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select></label>
        <label>KV 精度<select aria-label="KV 精度" className={fieldClass} value={input.kvPrecision} onChange={e=>setInput({kvPrecision:e.target.value as ScenarioInput['kvPrecision']})}><option value="fp16">FP16</option><option value="fp8">FP8（假设支持）</option></select></label>
        <label>单域 TP<select aria-label="单域 TP" className={fieldClass} value={input.tensorParallel} onChange={e=>setInput({tensorParallel:e.target.value==='auto'?'auto':Number(e.target.value) as 1|2|4|8})}><option value="auto">自动 · 最小合法值</option>{[1,2,4,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <div className="flex items-center gap-2"><span>参考负载</span>{SCENARIO_PRESETS.map(p=><button type="button" key={p.id} aria-pressed={activePreset?.id===p.id} title={`${p.values.inputTokens} 输入 / ${p.values.outputTokens} 输出 / batch ${p.values.batch}`} onClick={()=>setInput(p.values)} className={`rounded border px-3 py-1 transition-colors ${activePreset?.id===p.id?'border-accent bg-accent/10 text-accent':'border-line hover:border-accent/50'}`}>{p.label}</button>)}{!activePreset && <span className="text-[10px] text-dim">自定义</span>}</div>
      <div className="grid grid-cols-2 gap-2">{numeric.map(({key,label,min,max})=><label key={key}>{label}<input className={fieldClass} type="number" min={min} max={max} step={1} value={input[key]} onChange={e=>setInput({[key]: e.target.value==='' ? 0 : Number(e.target.value)})}/></label>)}</div>
      <label className="block">Rubin 规格配置<select aria-label="Rubin 规格配置" className={fieldClass} value={input.hardwareProfile} onChange={e=>setInput({hardwareProfile:e.target.value as ScenarioInput['hardwareProfile']})}>{Object.entries(RUBIN_PROFILES).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select></label>
      <p className="text-dim">上下文合计 {input.cachedTokens+input.inputTokens+input.outputTokens} / {model ? model.contextK*1024 : '—'} tokens；已有 KV 假设已驻留。权重 / 计算 / KV 精度独立，需模型与内核支持。</p>
      {errors.length>0 && <p role="alert" className="text-bad">{errors.join(' ')}</p>}
      <div className="flex gap-3"><button type="button" className="text-accent underline" onClick={reset}>重置场景</button><button type="button" className="text-accent underline" onClick={shareScenario}>分享场景</button></div>
      {share && <label className="block">场景链接（可复制）<input aria-label="场景链接" className={fieldClass} readOnly value={share} onFocus={e=>e.target.select()}/></label>}
    </div>
  return <div className="flex min-w-0 flex-col gap-2" data-capacity-panel="1">
    {!compact && estimates[0] && <CapacityFeedback estimate={estimates[0]}/>}
    {compact ? <details className="rounded border border-line bg-panel-2 p-2 text-xs"><summary className="cursor-pointer text-accent">当前场景：{model?.name} · {input.weightPrecision.toUpperCase()} 权重 / {input.computePrecision.toUpperCase()} 计算 · batch {input.batch} · {input.unitCount} 个独立域 · 修改</summary><div className="mt-2">{editor}</div></details> : editor}
    <div className={estimates.length>1?'grid gap-2 xl:grid-cols-2':''}>{estimates.map(est=><CapacityBands key={est.systemId} estimate={est} compact={compact}/>)}</div>
  </div>
}

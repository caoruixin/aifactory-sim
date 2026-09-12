import { useEffect, useMemo, useRef } from 'react'
import { FACTORY_PACK, episodeOf, modelById, totalInstances } from '../../data'
import { estimateSystemCapacity } from '../../lib/capacity'
import { decodeDuration, simulationAt } from '../../lib/simulation'
import { useScenarioStore } from '../../scenarioStore'
import { useFactoryStore } from '../../store'

export function useCurrentEstimate() {
  const generation=useFactoryStore(s=>s.generation)
  const scenario=useScenarioStore(s=>s.input)
  return useMemo(()=>estimateSystemCapacity({systemId:generation,modelId:scenario.modelId,quantId:scenario.weightPrecision,scenario}),[generation,scenario])
}
/** One DOM clock for 3D, 2D and compact layouts. RAF only paints particles. */
export function SimulationClock() {
  const generation=useFactoryStore(s=>s.generation)
  const estimate=useCurrentEstimate()
  const elapsed=useScenarioStore(s=>s.elapsedMs)
  const view=useScenarioStore(s=>s.view)
  const latest=useRef(estimate); latest.current=estimate
  const elapsedStep=useRef(0)
  const previousStep=useRef(-1)
  useEffect(()=>{useScenarioStore.getState().setPlayback({playing:false,elapsedMs:0});elapsedStep.current=0},[generation])
  // Seeking and single-token stepping use the same highlight as playback; none moves the camera.
  useEffect(()=>{
    if(view!=='load') return
    const result=simulationAt(estimate,elapsed)
    if(result.phase==='unavailable') return
    const factory=useFactoryStore.getState(),episode=episodeOf(generation,0)
    if(!episode) return
    const phase=result.phase==='prefill'?'prefill-layer':'decode-layer-token'
    const op=result.layerOperation
    const suffix=op.includes('Router')?'router':op.includes('分发')?'dispatch':op.includes('专家')?'experts':op.includes('合并')?'combine':null
    const idx=result.phase==='complete'?episode.steps.length-1:episode.steps.findIndex(s=>s.loopContext===phase && (suffix?s.id.endsWith(suffix):s.phase===result.phase))
    if(idx>=0 && factory.flow.stepIdx!==idx) factory.setFlow({stepIdx:idx,playing:false})
  },[generation,estimate,elapsed,view])
  useEffect(()=>{
    let last=performance.now()
    const onVisibility=()=>{
      last=performance.now()
      if(document.hidden) {
        useScenarioStore.getState().setPlayback({playing:false})
        useFactoryStore.getState().setFlow({playing:false})
      }
    }
    document.addEventListener('visibilitychange',onVisibility)
    const timer=setInterval(()=>{
      const now=performance.now(),delta=now-last;last=now
      const state=useScenarioStore.getState(),factory=useFactoryStore.getState()
      if(state.view==='load') {
        if(!state.playing) return
        const e=latest.current
        const total=simulationAt(e,0).totalComputeMs ?? 0
        const readablePace=total>0 ? Math.min(1,total/8000) : 1
        const next=simulationAt(e,state.elapsedMs+delta*state.speed*readablePace)
        state.setPlayback({elapsedMs:next.elapsedMs,playing:next.phase!=='complete' && next.phase!=='unavailable'})
      } else {
        if(previousStep.current!==factory.flow.stepIdx) {previousStep.current=factory.flow.stepIdx;elapsedStep.current=0}
        if(!factory.flow.playing) return
        const episode=episodeOf(factory.generation,factory.flow.episodeIdx)
        const step=episode?.steps[factory.flow.stepIdx]
        if(!episode || !step) return
        elapsedStep.current+=delta/1000*factory.flow.speed
        if(elapsedStep.current>=step.durationHint) {
          elapsedStep.current=0
          factory.setFlow({stepIdx:(factory.flow.stepIdx+1)%episode.steps.length})
        }
      }
    },100)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility)}
  },[])
  return null
}
export function ProcessTabs({ onViewChange }: { onViewChange?: (view: 'explanation' | 'load') => void } = {}) {
  const view=useScenarioStore(s=>s.view)
  const set=useScenarioStore(s=>s.setPlayback)
  return <div className="flex gap-2 border-t border-line bg-panel px-3 py-1 text-xs" aria-label="演示模式">
    {(['explanation','load'] as const).map(id=><button key={id} type="button" aria-pressed={view===id} className={`rounded border px-3 py-1 ${view===id?'border-accent text-accent':'border-line text-dim'}`} onClick={()=>{set({view:id,playing:false});useFactoryStore.getState().setFlow({playing:false});onViewChange?.(id)}}>{id==='explanation'?'流程讲解':'负载演示'}</button>)}
  </div>
}
export function LoadSimulationPanel() {
  const e = useCurrentEstimate()
  const elapsed = useScenarioStore(s => s.elapsedMs)
  const playing = useScenarioStore(s => s.playing)
  const speed = useScenarioStore(s => s.speed)
  const set = useScenarioStore(s => s.setPlayback)
  const result = simulationAt(e, elapsed)
  const total = result.totalComputeMs ?? 0
  const prefill = e.ttftMs?.mid ?? 0
  const kvPeak = e.allocation?.kvPerGpuGB ?? 0
  const generated = result.generatedTokens
  const togglePlay = () => e.feasible && set({ playing: !playing, elapsedMs: result.phase === 'complete' ? 0 : elapsed })
  const seekToken = (count: number) => set({ playing: false, elapsedMs: count <= 0 ? 0 : prefill + decodeDuration(e, Math.min(e.scenario.outputTokens, count) - 1) })
  const buttonClass = 'rounded-md border border-line bg-panel px-2.5 py-1.5 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-35'
  const phaseLabel = result.phase === 'unavailable' ? '定性讲解' : result.phase === 'prefill' ? 'Prefill' : result.phase === 'complete' ? '已完成' : 'Decode'

  return (
    <footer data-simulation-phase={result.phase} data-load-playing={playing ? '1' : '0'} tabIndex={0} aria-label="负载演示控制"
      className="min-w-0 space-y-2 border-t border-line bg-panel px-3 py-2.5 text-xs"
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !e.feasible || event.repeat) return
        if (![' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        if (event.key === ' ') togglePlay()
        if (event.key === 'ArrowLeft') seekToken(Math.max(0, generated - 1))
        if (event.key === 'ArrowRight') seekToken(Math.min(e.scenario.outputTokens, generated + 1))
        if (event.key === 'Home') set({ playing: false, elapsedMs: 0 })
        if (event.key === 'End') set({ playing: false, elapsedMs: total })
      }}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto">{modelById(e.modelId)?.name ?? e.modelId} <span className="font-normal text-dim">· batch {e.scenario.batch}</span></strong>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${result.phase === 'complete' ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent'}`}>{phaseLabel}</span>
        <span className="hidden text-[10px] text-dim xl:inline">聚焦此面板：空格播放 · ← → 逐 token</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={!e.feasible} className="rounded-md border border-accent bg-accent px-3 py-1.5 font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40" onClick={togglePlay}>{playing ? '暂停演示' : '播放演示'}</button>
        <button type="button" disabled={!e.feasible || elapsed <= 0} onClick={() => seekToken(Math.max(0, generated - 1))} className={buttonClass}>上一个 token</button>
        <button type="button" disabled={!e.feasible || generated >= e.scenario.outputTokens} onClick={() => seekToken(generated + 1)} className={buttonClass}>下一个 token</button>
        <label className="ml-auto text-dim">节奏 <select aria-label="演示播放速度" value={speed} className="rounded border border-line bg-panel px-1 py-1.5 text-fg" onChange={event => set({ speed: Number(event.target.value) })}>{[.25,1,4].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
        <button type="button" onClick={() => set({ playing: false, elapsedMs: 0 })} className={buttonClass}>从头演示</button>
      </div>
      {result.phase === 'unavailable' ? <p className="rounded border border-warn/20 bg-warn/5 p-2 text-warn">{e.reason ?? '当前单域配置放不下模型。请调整场景负载。'} 可切换流程讲解；未知参数不会转成吞吐数字。</p> : <>
        <div className="flex items-center justify-between gap-2 text-[10px] text-dim">
          <div className="flex gap-2"><button type="button" onClick={() => seekToken(0)} className="text-accent underline">Prefill · 首 token</button><span>→</span><button type="button" disabled={e.scenario.outputTokens <= 1} onClick={() => seekToken(1)} className="text-accent-2 underline disabled:opacity-30">Decode · 后续 tokens</button></div>
          <span className="whitespace-nowrap font-mono tabular-nums">{(result.elapsedMs / 1000).toFixed(2)} / {(total / 1000).toFixed(2)} s</span>
        </div>
        <input aria-label="计算进度" aria-valuetext={`${phaseLabel}，已输出 ${generated} / ${e.scenario.outputTokens} tokens，计算时间 ${(result.elapsedMs / 1000).toFixed(2)} 秒`} className="block h-3 w-full cursor-pointer" type="range" min="0" max={total || 1} step="any" value={result.elapsedMs} onChange={event => set({ elapsedMs: Number(event.target.value), playing: false })}/>
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-md border border-line bg-panel-2 px-2 py-1.5">
            <p className="text-[10px] text-dim">每请求输出</p><p data-generated-tokens className="font-mono text-base font-semibold tabular-nums">{generated} <span className="text-[10px] font-normal text-dim">/ {e.scenario.outputTokens}</span></p>
            <p className="text-[10px] text-dim">batch 输出 {result.generatedBatchTokens}</p>
          </div>
          <div className="min-w-0 rounded-md border border-line bg-panel-2 px-2 py-1.5">
            <p className="text-[10px] text-dim">每 GPU KV</p><p data-simulation-kv className="font-mono text-base font-semibold tabular-nums">{result.kvPerGpuGB?.toFixed(3)} <span className="text-[10px] font-normal text-dim">GB</span></p>
            <div className="mt-1 h-1 overflow-hidden rounded bg-line" aria-hidden="true"><div className="h-full bg-accent" style={{width:`${kvPeak > 0 ? Math.min(100, (result.kvPerGpuGB ?? 0) / kvPeak * 100) : 0}%`}}/></div>
          </div>
          <div className="min-w-0 rounded-md border border-line bg-panel-2 px-2 py-1.5">
            <p className="text-[10px] text-dim">当前瓶颈</p><p className="mt-0.5 font-semibold text-accent">{result.phase === 'prefill' ? '计算' : result.bottleneck}</p><p className="text-[10px] text-dim">第 {result.layer} 层</p>
          </div>
        </div>
        <p className="min-h-4 text-[11px] text-dim">{result.layerOperation} <span className="ml-2">请求 → 常驻权重 / KV → 激活 → 返回 token</span></p>
      </>}
      <p className="text-[10px] leading-relaxed text-dim">1× 采用至少 8 秒的讲解节奏；上方为模型计算时间，速度不改结果。prefill 产生首 token，最后输出尚无 KV；层内节奏为示意，不含通信、排队与调度。</p>
    </footer>
  )
}
export function ResourceOverlay() {
  const view=useScenarioStore(s=>s.view)
  const elapsed=useScenarioStore(s=>s.elapsedMs)
  const e=useCurrentEstimate()
  if(view!=='load') return null
  const result=simulationAt(e,elapsed)
  const nodes=FACTORY_PACK.assemblies.filter(a=>a.systemId===e.systemId)
  const accelerator=nodes.find(a=>a.roleKey==='accelerator')
  const target=nodes.find(a=>result.bottleneck==='显存带宽'?a.roleKey==='gpu-hbm':a.roleKey==='accelerator')??accelerator
  return <div data-simulation-resources className="pointer-events-auto absolute top-2 left-2 right-2 z-10 rounded-lg border border-line bg-panel/95 p-2 text-[11px] shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-1"><strong>模拟 {e.scenario.unitCount} 个独立域 · TP {e.gpusPerReplica??'—'} · {e.replicas??0} 个副本</strong><button type="button" disabled={!target} className="text-accent underline" onClick={()=>target&&useFactoryStore.getState().drillTo(target.id)}>定位瓶颈</button></div>
    <p>参考装配展示 {accelerator?totalInstances(accelerator.id):'—'} 个加速器实例；模拟参与 {e.feasible?(e.replicas??0)*(e.gpusPerReplica??0):0} GPU。瓶颈：{result.bottleneck}</p>
  </div>
}

/**
 * 左栏：场景导览 + 六平面开关。
 *
 * 导览条目直接来自内容包的 `ScenePreset`（「看什么」的语义），
 * 相机数字留在 `lib/cameraPresets.ts`——内容作者不需要懂 3D 就能加一屏讲解。
 */

import { scenesOfSystem } from '../../data'
import { LEVEL_LABEL } from '../../lib/drill'
import { useFactoryStore } from '../../store'
import PlaneToggles from './PlaneToggles'

export default function TourPanel() {
  const generation = useFactoryStore((s) => s.generation)
  const tourStopIdx = useFactoryStore((s) => s.tourStopIdx)
  const applyScene = useFactoryStore((s) => s.applyScene)
  const reset = useFactoryStore((s) => s.reset)
  const scenes = scenesOfSystem(generation)
  const activeScene = scenes[tourStopIdx]

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="border-b border-line px-3 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">场景导览</h2>
          <button type="button" onClick={reset} className="text-[11px] text-dim hover:text-accent">
            回到总览
          </button>
        </div>
        <ol className="mt-2 space-y-1.5">
          {scenes.map((scene, i) => {
            const active = i === tourStopIdx
            return (
              <li key={scene.id}>
                <button
                  type="button"
                  onClick={() => applyScene(scene.id)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-panel-2 hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-dim">{i + 1}</span>
                    <span className="text-sm leading-snug font-medium">{scene.title}</span>
                  </div>
                  <span className="mt-0.5 block text-[11px] text-dim">
                    {LEVEL_LABEL[scene.lodLevel]}级 · {scene.planes.length} 个平面
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {activeScene ? (
          <div className="mt-2.5 rounded-lg border border-line bg-panel p-2.5">
            <p className="text-xs leading-relaxed">{activeScene.narration}</p>
            {activeScene.presalesNote ? (
              <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-warn">
                <span className="font-semibold">售前提示：</span>
                {activeScene.presalesNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <PlaneToggles />
    </div>
  )
}

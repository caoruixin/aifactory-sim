import { create } from 'zustand'
import { DEFAULT_SCENARIO } from './lib/scenario'
import type { ScenarioInput } from './lib/scenario'

interface ScenarioState {
  input: ScenarioInput
  view: 'explanation' | 'load'
  playing: boolean
  elapsedMs: number
  speed: number
  setInput: (patch: Partial<ScenarioInput>) => void
  reset: () => void
  setPlayback: (patch: Partial<Pick<ScenarioState, 'view' | 'playing' | 'elapsedMs' | 'speed'>>) => void
}
/** Session state survives tabs, comparison and report routes. Only an explicit reset clears inputs. */
export const useScenarioStore = create<ScenarioState>((set) => ({
  input: { ...DEFAULT_SCENARIO }, view: 'explanation', playing: false, elapsedMs: 0, speed: 1,
  setInput: patch => set(s => ({ input: { ...s.input, ...patch }, playing: false, elapsedMs: 0 })),
  reset: () => set({input: {...DEFAULT_SCENARIO}, playing:false, elapsedMs:0}),
  setPlayback: patch => set(patch),
}))

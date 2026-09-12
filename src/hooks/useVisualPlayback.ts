import { useFactoryStore } from '../store'
import { useScenarioStore } from '../scenarioStore'

/** Visual playback follows the active mode; it never advances the calculation clock. */
export function useVisualPlayback() {
  const explanationPlaying = useFactoryStore(s => s.flow.playing)
  const loadPlaying = useScenarioStore(s => s.view === 'load' && s.playing)
  const loadView = useScenarioStore(s => s.view === 'load')
  return loadView ? loadPlaying : explanationPlaying
}

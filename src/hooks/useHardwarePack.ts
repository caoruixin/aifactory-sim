import { useMemo } from 'react'
import { FACTORY_PACK } from '../data'
import { packForHardwareProfile } from '../data/specifications'
import { useScenarioStore } from '../scenarioStore'
export function useHardwarePack() {
  const id=useScenarioStore(s=>s.input.hardwareProfile)
  return useMemo(()=>packForHardwareProfile(FACTORY_PACK,id),[id])
}

import type { Claim, GpuMathSpecs } from './types'

/** The compatibility math view is derived exclusively from sourced claims. */
export function gpuMathFromClaims(specs: Record<string, Claim>): GpuMathSpecs | null {
  const number = (...keys: string[]) => {
    const c = keys.map(k => specs[k]).find(c => c && typeof c.value === 'number' && Number.isFinite(c.value) && c.value > 0 && c.evidence === 'verified_spec' && c.review?.disposition !== 'scope-conflict')
    return c ? c.value as number : null
  }
  const memoryGB = number('hbmPerGpuGB')
  const bandwidthTBs = number('memoryBandwidthTBs', 'hbmBandwidthTBs')
  if (memoryGB === null || bandwidthTBs === null) return null
  return { memoryGB, bandwidthTBs, fp16Tflops: number('fp16DenseTflops'),
    fp8Tflops: number('fp8DenseTflops'), fp4Tflops: number('fp4DenseTflops', 'fp4DenseTflopsPerGpu'),
    tdpW: number('tdpW'), derivation: '从当前规格配置的官方 Claim 派生；稠密算力、单 GPU 容量及带宽。' }
}

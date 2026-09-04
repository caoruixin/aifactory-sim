/**
 * 指标显示名的全枚举锁（v1.6 W-B，仿 `planeLabel.test.ts`）。
 *
 * `Record<InferenceMetric, string>` 只保证「不缺键」，保证不了：
 *   ① `METRIC_ORDER` 与键集同步（讲解顺序漏一个指标，UI 就会静默少一个 chip）；
 *   ② 内容包里真的用到的指标都被覆盖（章节 chain 与 technique 的 affectsMetrics）。
 * 这两条只能靠测试钉。
 */

import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import type { InferenceMetric } from '../data/types'
import { METRIC_HINT, METRIC_LABEL, METRIC_ORDER, metricLabel } from './metricLabel'

describe('METRIC_LABEL 全枚举', () => {
  it('八个指标一个不少，且与 METRIC_ORDER 同步', () => {
    expect([...METRIC_ORDER].sort()).toEqual(Object.keys(METRIC_LABEL).sort())
    expect([...METRIC_ORDER].sort()).toEqual(Object.keys(METRIC_HINT).sort())
    expect(METRIC_ORDER).toHaveLength(8)
    expect(new Set(METRIC_ORDER).size).toBe(METRIC_ORDER.length)
  })

  it('每个标签非空且互不相同（chip 上不能出现两个一样的名字）', () => {
    const labels = METRIC_ORDER.map((m) => METRIC_LABEL[m])
    for (const [i, label] of labels.entries()) {
      expect(label.trim(), METRIC_ORDER[i]).not.toBe('')
    }
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('每个指标都有一句悬浮说明', () => {
    for (const m of METRIC_ORDER) expect(METRIC_HINT[m].trim(), m).not.toBe('')
  })

  it('metricLabel 就是查表', () => {
    expect(metricLabel('ttft')).toBe(METRIC_LABEL.ttft)
    expect(metricLabel('mttr')).toBe(METRIC_LABEL.mttr)
  })

  it('★ cost-per-token 的标签自带「仅定性」限定（本项目不为它出数）', () => {
    expect(METRIC_LABEL['cost-per-token']).toContain('仅定性')
  })
})

describe('内容包里用到的指标全部有名字', () => {
  it('切面章节的因果链', () => {
    const used = new Set<InferenceMetric>()
    for (const lens of FACTORY_PACK.lenses) {
      for (const chapter of lens.chapters) {
        for (const link of chapter.chain) for (const m of link.metrics) used.add(m)
      }
    }
    expect(used.size).toBeGreaterThan(0)
    for (const m of used) expect(METRIC_LABEL[m], m).toBeTruthy()
  })

  it('技术注册表的 affectsMetrics', () => {
    for (const tech of FACTORY_PACK.techniques) {
      for (const m of tech.affectsMetrics) expect(METRIC_LABEL[m], `${tech.id} → ${m}`).toBeTruthy()
    }
  })
})

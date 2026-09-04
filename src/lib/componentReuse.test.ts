import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import { componentReuseGroups } from './componentReuse'

const GB300 = 'sys.gb300-nvl72'

/** 缺陷 3 的实测现场：GB300 的根节点「机房」，用的是 shared.ts 的共享组件。 */
const GB300_FACILITY = 'asm.gb300.facility'
const SHARED_FACILITY = 'cmp.shared.facility-room'

describe('componentReuseGroups：跨代复用必须按代际分开', () => {
  it('★ 共享组件不会把其他代际的同名节点混进「本代际」——缺陷 3 的直接回归锁', () => {
    const { sameGeneration, otherSystemIds } = componentReuseGroups(SHARED_FACILITY, GB300_FACILITY)
    // 每个系统各有一个「机房」，因此本代际内没有第二处；四个其他代际全部落在下面那一组。
    expect(sameGeneration).toEqual([])
    expect(otherSystemIds.length).toBeGreaterThanOrEqual(1)
    for (const id of otherSystemIds) expect(id).not.toBe(GB300)
    // 顺序 = 内容包 assemblies 声明顺序，去重后每个系统只出现一次
    expect(new Set(otherSystemIds).size).toBe(otherSystemIds.length)
  })

  it('★ 每个跨代 systemId 都能在 systems 里查到名字（UI 那一行不会渲染出裸 ID）', () => {
    const known = new Set(FACTORY_PACK.systems.map((s) => s.id))
    for (const a of FACTORY_PACK.assemblies) {
      const { otherSystemIds } = componentReuseGroups(a.componentId, a.id)
      for (const id of otherSystemIds) expect(known.has(id), id).toBe(true)
    }
  })

  it('★ 全包扫描：sameGeneration 里的每一项都与自己同系统，且都不是自己', () => {
    for (const a of FACTORY_PACK.assemblies) {
      const { sameGeneration } = componentReuseGroups(a.componentId, a.id)
      for (const other of sameGeneration) {
        expect(other.systemId, `${a.id} → ${other.id}`).toBe(a.systemId)
        expect(other.id).not.toBe(a.id)
      }
    }
  })

  it('两组加起来 = 原来那一份「用到该组件的其他装配节点」，一条都没漏掉', () => {
    for (const a of FACTORY_PACK.assemblies) {
      const uses = FACTORY_PACK.assemblies.filter(
        (x) => x.componentId === a.componentId && x.id !== a.id,
      )
      const { sameGeneration, otherSystemIds } = componentReuseGroups(a.componentId, a.id)
      const covered = new Set([
        ...sameGeneration.map((x) => x.id),
        ...uses.filter((x) => otherSystemIds.includes(x.systemId)).map((x) => x.id),
      ])
      expect(covered.size, a.id).toBe(uses.length)
    }
  })

  it('组件只被自己用到时两组都为空（UI 据此整块不渲染）', () => {
    const solo = FACTORY_PACK.assemblies.find(
      (a) => FACTORY_PACK.assemblies.filter((x) => x.componentId === a.componentId).length === 1,
    )
    expect(solo, '内容包里应当存在只被一个装配节点引用的组件').toBeDefined()
    const groups = componentReuseGroups(solo!.componentId, solo!.id)
    expect(groups.sameGeneration).toEqual([])
    expect(groups.otherSystemIds).toEqual([])
  })

  it('未知 selfAssemblyId 不抛错：没有「本代际」，全部归入其他代际', () => {
    const groups = componentReuseGroups(SHARED_FACILITY, 'asm.nope')
    expect(groups.sameGeneration).toEqual([])
    expect(groups.otherSystemIds.length).toBeGreaterThan(0)
  })

  it('未知 componentId 返回两个空组', () => {
    expect(componentReuseGroups('cmp.nope', GB300_FACILITY)).toEqual({
      sameGeneration: [],
      otherSystemIds: [],
    })
  })
})

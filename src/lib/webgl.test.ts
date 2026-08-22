import { describe, expect, it } from 'vitest'
import { detectWebGL, isGlForcedOff } from './webgl'
import { PALETTE_FALLBACK, PLANE_ORDER, PLANE_TOKEN, color, palette, planeColor } from './palette'

describe('webgl 探测', () => {
  it('?gl=off 强制降级', () => {
    expect(isGlForcedOff('?gl=off')).toBe(true)
    expect(isGlForcedOff('?level=rack&gl=off')).toBe(true)
    expect(isGlForcedOff('?gl=off&motion=off')).toBe(true)
    expect(detectWebGL('?gl=off')).toBe('none')
  })

  it('不误伤其它参数', () => {
    expect(isGlForcedOff('?gl=on')).toBe(false)
    expect(isGlForcedOff('?glow=off')).toBe(false)
    expect(isGlForcedOff('')).toBe(false)
  })

  it('无 document 的环境（node）返回 none 而不是抛异常', () => {
    expect(detectWebGL('')).toBe('none')
  })
})

describe('palette', () => {
  it('node 环境退回常量表', () => {
    expect(palette()).toEqual(PALETTE_FALLBACK)
  })

  it('六平面颜色与 CSS 变量 fallback 一一对应', () => {
    expect(PLANE_ORDER).toHaveLength(6)
    for (const plane of PLANE_ORDER) {
      expect(planeColor(plane)).toBe(PALETTE_FALLBACK[PLANE_TOKEN[plane]])
      expect(planeColor(plane)).toMatch(/^#[0-9a-f]{6}$/i)
    }
    // NVLink 绿是全场最重要的讲解锚点，锁死这个值
    expect(planeColor('nvlink')).toBe('#76b900')
  })

  it('未知 token 走 fallback 而不是返回 undefined', () => {
    expect(color('no-such-token')).toBe(PALETTE_FALLBACK.dim)
    expect(color(null, 'accent')).toBe(PALETTE_FALLBACK.accent)
    expect(color('plane-power')).toBe(PALETTE_FALLBACK['plane-power'])
  })
})

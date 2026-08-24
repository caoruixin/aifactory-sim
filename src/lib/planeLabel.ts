/**
 * 平面显示名的**单一出口**（纯函数，零 three 导入）。
 *
 * 为什么需要它：`NetworkPlane` 的六个枚举值是**持久化键**——它们进 localStorage
 * （`store.planes`）、进深链参数（`?planes=nvlink,power`）、进 3D 的连线分组。
 * 这些键一旦改名，用户的旧偏好与手册里所有 `?planes=` 链接会一起失效。
 *
 * 但从 v1.3 W3 起，`nvlink` 这个键在不同代际下指的**不是同一种东西**：
 *   - GB300 / Vera Rubin / NVL576：真的是 NVLink（经交换芯片的 scale-up 域）；
 *   - Groq 3 LPX：LPU 之间的**直连 C2C**，机架里连一颗交换芯片都没有，
 *     在这一代的界面上写「NVLink」是明确的事实错误。
 *
 * 解法是「键不变、名按系统变」：持久化与深链继续用 `nvlink`，显示层一律经这个
 * helper 取名。**任何组件都不得再直接读 `PLANE_LABEL`**——那样只会又长出一处
 * 忘了改的地方（v1.3 之前 PlaneToggles / 连接列表 / DetailPanel 就是各读各的）。
 */

import type { NetworkPlane } from '../data/types'
import { PLANE_LABEL } from './palette'

/**
 * 按系统覆写的平面显示名。
 *
 * 刻意放在 `src/lib` 而不是内容包里：这是**纯展示层**的措辞，不是可溯源事实
 * （给它建 Claim 反而会让证据统计里多出一堆没有出处的「规格」）。
 * 覆写表里没有的系统/平面一律回落到 `PLANE_LABEL`。
 */
const SYSTEM_PLANE_LABEL: Record<string, Partial<Record<NetworkPlane, string>>> = {
  // Groq 3 LPX：scale-up 是 LPU 直连 chip-to-chip，没有 NVLink、也没有交换层。
  'sys.groq3-lpx': {
    nvlink: 'C2C scale-up（LPU 直连）',
    scaleout: 'AFD 配对（与 Vera Rubin NVL72 交换激活）',
  },
  // HGX B300（v1.4 W-C QA 返工点）：它的 scale-up **是** NVLink，所以保留「NVLink」
  // 字样（改名判据是「不是 NVLink」，不是「域多大」，见 factory.spec.ts 的五代扫查注释）；
  // 但默认名里的「机架内」限定词对这一代是明确的事实错误——NVLink 域止步单服务器，
  // 机架级 nvlink 平面刻意为空正是本代际的教学内容。cooling 同理：这一代是风冷
  // （medium 'airflow' 就是为它加的），写「液冷」与右栏「风冷机架」详情自相矛盾。
  'sys.hgx-b300': {
    nvlink: 'NVLink（服务器内 scale-up）',
    cooling: '风冷（机房空调）',
  },
}

/**
 * 某系统下某平面的显示名。
 *
 * @param systemId 当前代际（`FactorySystem.id`）。未知 / 省略时回落到通用名，
 *   因此调用方不必先判空——「不知道是哪一代」时给通用名总是安全的。
 */
export function planeLabel(systemId: string | null | undefined, plane: NetworkPlane): string {
  const override = systemId ? SYSTEM_PLANE_LABEL[systemId]?.[plane] : undefined
  return override ?? PLANE_LABEL[plane]
}

/** 该系统是否对某个平面用了专属措辞（UI 想加「为什么改名」的 tooltip 时用）。 */
export function hasPlaneLabelOverride(systemId: string | null | undefined, plane: NetworkPlane): boolean {
  return systemId ? SYSTEM_PLANE_LABEL[systemId]?.[plane] !== undefined : false
}

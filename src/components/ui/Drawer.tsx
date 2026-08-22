/**
 * 通用抽屉（参考 llms-study `ui/Drawer.tsx` 的结构与 class 命名习惯，改用本项目的
 * palette token，并加了 `side='bottom'` 给移动端详情用——窄屏上从右侧拉一条 22rem
 * 的抽屉会盖住几乎整个视口，从底部拉起更符合触屏习惯）。
 *
 * 不用 portal：调用处可能挂在有 transform 祖先的容器下，`fixed` 以该容器为包含块
 * 是既有验收行为（同上游注释），维持这一点让两种挂载位置都正确。
 */
import type { ReactNode } from 'react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 'bottom'（默认，移动端详情）| 'right'（预留，桌面侧栏场景）。 */
  side?: 'bottom' | 'right'
}

export default function Drawer({ open, onClose, title, children, side = 'bottom' }: DrawerProps) {
  if (!open) return null
  const sheetClass =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[75vh] rounded-t-2xl border-t'
      : 'inset-y-0 right-0 h-full w-[min(22rem,88vw)] border-l'

  return (
    <div className="fixed inset-0 z-50" data-drawer={side} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-[1px]" role="presentation" onClick={onClose} />
      <div
        className={`absolute flex flex-col overflow-hidden border-line bg-panel shadow-lg ${sheetClass}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-sm font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="-my-1.5 -mr-2 rounded px-3 py-1.5 text-sm text-dim hover:text-fg"
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

/**
 * 通用分段选项卡（参考 llms-study `ui/SegmentedTabs.tsx` 的结构，配色改用本项目
 * 各处「激活态」共同的写法：`border-accent bg-accent/10 text-accent`，
 * 与 `FactoryPage` 右栏 tab / `CapacityPanel` 量化按钮保持同一套视觉语言）。
 *
 * 每个按钮固定输出 `data-tab={id}`，供 Fallback2D 的 Playwright 用例定位——
 * 与本项目其它「可切换态」控件（`data-right-tab` / `data-generation` / `data-mode`）
 * 同一套命名习惯。
 */
export interface SegmentedTabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}

export default function SegmentedTabs<T extends string>({ tabs, value, onChange }: SegmentedTabsProps<T>) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-panel-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === t.id
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-transparent text-dim hover:border-accent/40 hover:text-fg'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

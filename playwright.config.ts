/**
 * Playwright E2E 配置。
 *
 * 首次使用：`npm run test:e2e:install`（= `npx playwright install chromium`）。
 * 之后 `npm run test:e2e` 会自动 `build` + `preview` 起服务、跑 `tests/e2e/factory.spec.ts`，
 * 首次运行生成截图基线（`tests/e2e/factory.spec.ts-snapshots/`，随代码一起提交），
 * 之后每次运行都是与基线的像素对比。
 *
 * ⚠️ **必须 headless 跑**（默认即 headless，不要加 `--headed`）：后台/未聚焦标签页的
 * `requestAnimationFrame` 会被浏览器节流甚至完全暂停（`FactoryCanvas`/`ComparisonView`
 * 的 `demand`/`always` 帧循环、`CameraRig` 的补帧动画、`FlowLayer` 的自动播放全部靠 rAF
 * 推进），而 headless 页面在 Chromium 里恒被当作「可见」，rAF 不受节流——这是 B4 交接
 * 时特别强调、B5 必须遵守的一条：截图基线只能用 headless 采。
 *
 * `PLAYWRIGHT_USE_CHROME_CHANNEL=1`：跳过下载 Chromium for Testing，改用系统已装的
 * Google Chrome（`channel: 'chrome'`，网络受限、下载不了 CfT 时的等价替代——两者同为
 * Chromium 内核，WebGL2/截图行为一致）。留空则用标准的 `npx playwright install chromium`
 * 产物，这是常规联网环境下推荐的默认路径。
 */
import { defineConfig, devices } from '@playwright/test'

const useSystemChromeChannel = process.env.PLAYWRIGHT_USE_CHROME_CHANNEL === '1'

const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 3D 场景 + WebGL 截图偏重，桌面/移动两个 project 各自并发跑不至于抢崩机器，但也别开太猛。
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    ...(useSystemChromeChannel ? { channel: 'chrome' as const } : {}),
  },
  webServer: {
    // 构建先行：截图基线必须对应生产构建产物（含 manualChunks 拆的 three vendor chunk），
    // 不能拿 `vite dev` 的按需编译结果去比对——两者的资源加载时序不同，会引入基线噪音。
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
  ],
})

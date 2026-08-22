/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // three（+ @react-three/fiber、@react-three/drei）单独拆一个 vendor chunk。
        // 动机（B5 性能收口，问题⑤）：three 本身体量大且几乎不随内容包变化，
        // 与场景代码（SceneRoot 等）混在一个 chunk 里时，那个 chunk 会随便一次场景
        // 逻辑改动就整体失效缓存；拆开后 three-vendor 可以长期被浏览器缓存命中。
        // 这不改变「降级路径不拉 three」这条约定——FactoryCanvas/ComparisonView/
        // SceneRoot 本来就是懒加载，manualChunks 只决定「拉的时候切成几块」，
        // 不改变「拉不拉」，`/report` 与 `?gl=off` 依然不会请求这个 chunk。
        manualChunks(id) {
          // Vite 自己注入的动态 import() 运行时助手（`__vitePreload`，虚拟模块，
          // 不在 node_modules 下）：它被全站所有懒加载调用点共用，包括
          // FactoryCanvas/ComparisonView/ReportPage 这几个 `lazy(() => import(...))`
          // 调用点本身。不显式钉住的话 Rollup 会把它的实现体丢进用得最多的那个
          // chunk——实测就是 three-vendor，于是 index/ReportPage 又得反向
          // import three-vendor 来拿这个助手函数，同样违反「降级路径不拉 three」。
          if (id === '\0vite/preload-helper.js') return 'react-vendor'
          if (!id.includes('node_modules')) return undefined
          // react/react-dom 显式钉进自己的 chunk：不这样做的话 Rollup 会把「被
          // three-vendor 和其它异步 chunk 共同依赖」的 react 核心顺手塞进
          // three-vendor（因为 @react-three/fiber 本身 import react）——那样
          // ReportPage/index 又得反过来从 three-vendor 取 react，等于白拆。
          // zustand 同理：`store.ts`（index chunk，全站都用）与 `@react-three/fiber`
          // 内部（它自己也用 zustand 管 R3F 场景状态）共享同一份 zustand，
          // 不显式钉住的话 Rollup 会把这份「共享依赖」并进 three-vendor，
          // 于是 index chunk 又得反向 import three-vendor——实测踩到过这个坑，
          // 留着这段注释和下面的正则一起，别在下次调整时把 zustand 漏掉。
          if (
            /node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store|@babel\/runtime)\//.test(
              id,
            )
          )
            return 'react-vendor'
          if (/node_modules\/(three|@react-three)\//.test(id)) return 'three-vendor'
          return undefined
        },
      },
    },
  },
  test: {
    // lib/ 与 data/ 是纯函数与纯数据（硬规则：零 three 导入），因此测试跑 node 环境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

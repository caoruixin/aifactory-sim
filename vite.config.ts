/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // lib/ 与 data/ 是纯函数与纯数据（硬规则：零 three 导入），因此测试跑 node 环境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

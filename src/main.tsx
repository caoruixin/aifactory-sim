import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root 容器缺失')

// 部署在子路径（如 GitHub Pages 的 /aifactory-sim/）时，路由需要与 vite base 对齐；
// BASE_URL 本地为 '/'，去掉尾部斜杠以符合 react-router 的 basename 约定。
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

createRoot(el).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

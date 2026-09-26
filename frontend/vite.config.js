import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// pdf.js 看病历时要用的附带资源：字符映射（中文 PDF）、标准字体、图片解码器（扫描件）和色彩配置。
// 开发时直接从 node_modules 提供；打包时拷进 dist/pdfjs，线上由后端连同页面一起提供，不依赖外网。
const PDFJS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules/pdfjs-dist')
const PDFJS_ASSETS = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

export function pdfjsAssets() {
  let outDir
  return {
    name: 'pdfjs-assets',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0])
        const file = join(PDFJS_DIR, path)
        const folder = path.split('/').filter(Boolean)[0]
        if (!PDFJS_ASSETS.includes(folder) || !file.startsWith(PDFJS_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        if (extname(file) === '.wasm') res.setHeader('Content-Type', 'application/wasm')
        createReadStream(file).pipe(res)
      })
    },
    writeBundle() {
      for (const folder of PDFJS_ASSETS) cpSync(join(PDFJS_DIR, folder), join(outDir, 'pdfjs', folder), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

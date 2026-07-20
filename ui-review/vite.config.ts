import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteCommonjs()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
  },
  resolve: {
    alias: {
      // simple-ime 1.2.4 的入口指向缺失文件；保留其类型声明并加载随包发布的 ESM 文件。
      'simple-ime': fileURLToPath(new URL('./node_modules/simple-ime/dist/simple-ime.es.js', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
      '/dicom/': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/dicom-out': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/dicom-head-stroke-plain': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/dicom-lihvr': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4175,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
})

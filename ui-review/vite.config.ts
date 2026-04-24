import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteCommonjs()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
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
      '/dicom-out': {
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

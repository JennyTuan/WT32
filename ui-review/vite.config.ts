import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

const devApiPort = process.env.VITE_DEV_API_PORT ?? '8000';
const devApiTarget = `http://127.0.0.1:${devApiPort}`;
const devWsTarget = `ws://127.0.0.1:${devApiPort}`;

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
        target: devApiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: devWsTarget,
        ws: true,
      },
      '/health': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/startReceive': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/socket.io/': {
        target: devWsTarget,
        ws: true,
        changeOrigin: true,
      },
      '/dicom/': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/dicom-out': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/dicom-head-stroke-plain': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/dicom-lihvr': {
        target: devApiTarget,
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

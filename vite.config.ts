import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // three.js alone is ~700 kB minified; it ships as its own long-cached chunk
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/](\.pnpm[\\/]three@[^\\/]+[\\/]node_modules[\\/])?three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/].*(@react-three|camera-controls|three-stdlib|suspend-react|its-fine)/ },
            { name: 'gsap', test: /node_modules[\\/].*gsap/ },
          ],
        },
      },
    },
  },
})

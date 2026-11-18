import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Relative asset paths, so the built site works from any folder (e.g. /portfolio/ on the webshare).
  base: './',
  server: { port: 5180, strictPort: true },
})

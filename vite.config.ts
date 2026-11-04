import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base нужен для GitHub Pages: сайт живёт в подпапке /mini-crm/.
export default defineConfig({
  plugins: [react()],
  base: '/mini-crm/',
})

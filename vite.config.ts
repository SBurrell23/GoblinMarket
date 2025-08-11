import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  // When deploying to GitHub Pages the site is served from /<repo>/.
  // Set base accordingly so built asset URLs include /GoblinMarket/ prefix.
  // Locally (dev server) we keep base '/'.
  base: process.env.GITHUB_ACTIONS ? '/GoblinMarket/' : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});

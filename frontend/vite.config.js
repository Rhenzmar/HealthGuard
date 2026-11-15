import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep the licensed anatomical assets on HealthGuard's own static site.
// A failed copy fails the build rather than deploying a broken viewer.
function copyAnatomyModels() {
  return {
    name: 'healthguard-local-anatomy',
    closeBundle() {
      const sourceDir = resolve(process.cwd(), 'node_modules/open-anatomy-3d/models');
      const targetDir = resolve(process.cwd(), 'dist/models');
      mkdirSync(targetDir, { recursive: true });
      for (const sex of ['male', 'female']) {
        const name = 'anatomy-' + sex + '.glb';
        const from = resolve(sourceDir, name);
        if (!existsSync(from)) throw new Error('Missing licensed anatomy asset: ' + from);
        copyFileSync(from, resolve(targetDir, name));
      }
    },
  };
}
export default defineConfig({
  plugins: [react(), copyAnatomyModels()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
});

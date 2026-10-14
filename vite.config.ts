import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets work both at a domain root and a later GitHub Pages repo path.
  base: './',
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

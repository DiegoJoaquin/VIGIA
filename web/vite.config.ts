import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dos salidas:
//  - normal: la app instalable (PWA) que habla con el Worker en /api
//  - demo:   un solo archivo HTML con datos de ejemplo, React desde CDN
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: demo ? [viteSingleFile()] : [react()],
    define: { __DEMO__: JSON.stringify(demo) },
    esbuild: demo ? { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', jsxInject: "import React from 'react'" } : undefined,
    build: demo
      ? {
          outDir: 'dist-demo',
          rollupOptions: {
            input: 'demo.html',
            external: ['react', 'react-dom', 'react-dom/client'],
            output: { format: 'iife', globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' } },
          },
        }
      : { outDir: 'dist' },
    server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  };
});

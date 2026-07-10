import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Fixa o fuso dos testes num offset negativo (UTC-3) para que os testes de
// `format.ts` (ex.: dateBR) provem a correção de fuso em vez de passar "por
// sorte" numa máquina que já rode em UTC. `test.env` do Vitest não é
// suficiente para isso: os workers herdam `process.env` no momento em que
// são criados, então o valor precisa ser setado aqui, na config, antes do
// Vitest subir o pool.
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

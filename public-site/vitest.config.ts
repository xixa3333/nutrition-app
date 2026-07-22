import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { coverage: { provider: 'v8', include: ['server/**/*.ts'], thresholds: { statements: 90, functions: 90, lines: 90, branches: 80 } } } });

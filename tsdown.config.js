import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['cjs'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    // Provided by the host app at runtime.
    neverBundle: ['react', 'react/jsx-runtime', 'react-dom', 'inkdrop', 'event-kit', 'inkdrop-model', 'electron', '@codemirror/state', '@codemirror/view']
  }
})

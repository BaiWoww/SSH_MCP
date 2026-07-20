import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Source files use NodeNext-style `.js` extension imports; map them to
    // their `.ts` source so vitest/vite can resolve them.
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})

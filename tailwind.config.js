/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'agent-primary': '#6366f1',
        'agent-dark': '#1e1e2e',
        'agent-darker': '#181825',
        'agent-surface': '#313244',
        'agent-border': '#45475a',
      },
    },
  },
  plugins: [],
}

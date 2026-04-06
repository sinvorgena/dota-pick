/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        radiant: '#3a8a3a',
        dire: '#a83232',
        bg: '#0e0f12',
        panel: '#16181d',
        border: '#262932',
      },
    },
  },
  plugins: [],
}

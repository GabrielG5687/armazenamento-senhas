/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sv: {
          dark: '#0f172a',
          panel: '#1e293b',
          border: '#334155',
          text: '#f8fafc',
          muted: '#94a3b8',
          primary: '#38bdf8',
          primaryHover: '#0ea5e9',
          danger: '#f87171',
          success: '#4ade80',
          warning: '#fbbf24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        xl: '0.75rem',
      },
      boxShadow: {
        sv: '0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
}

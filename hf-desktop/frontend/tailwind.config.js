/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hf: {
          50:  '#fff7f3',
          100: '#ffe8dc',
          200: '#ffcab0',
          400: '#ff9a6c',
          500: '#FF6B35',
          600: '#e8501a',
          700: '#c23a0e',
          800: '#992d0b',
          900: '#6e1f07',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    }
  },
  plugins: []
}

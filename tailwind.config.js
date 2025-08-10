/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,ts,js,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        goblin: {
          50: '#f4ffe5',
          100: '#e4fec2',
          200: '#c7fa8a',
          300: '#a9f24f',
          400: '#8cdc23',
          500: '#6fb512',
          600: '#52860b',
          700: '#3a5d0b',
          800: '#2d470d',
          900: '#1f2d08'
        }
      },
      boxShadow: {
        goblin: '0 4px 14px 0 rgba(60,120,20,0.35)'
      },
      fontFamily: {
        display: ['Trebuchet MS','Verdana','sans-serif']
      }
    }
  },
  plugins: []
};

import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0E1B2E',
        'navy-light': '#16233D',
        'navy-border': '#26344C',
        cream: '#F7F4EC',
        ink: '#14181F',
        orange: '#FF6A39',
        lime: '#CFFF3D',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config

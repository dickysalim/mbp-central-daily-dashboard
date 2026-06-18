/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          50:  'hsl(220 20% 98%)',
          100: 'hsl(220 16% 94%)',
          200: 'hsl(220 14% 88%)',
          700: 'hsl(220 18% 16%)',
          800: 'hsl(220 20% 12%)',
          900: 'hsl(220 22% 8%)',
          950: 'hsl(220 24% 5%)',
        },
        brand: {
          400: 'hsl(255 80% 70%)',
          500: 'hsl(255 75% 60%)',
          600: 'hsl(255 70% 50%)',
        },
        accent: {
          400: 'hsl(175 70% 55%)',
          500: 'hsl(175 65% 45%)',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, hsl(255 75% 60%), hsl(175 65% 45%))',
      },
    },
  },
  plugins: [],
}

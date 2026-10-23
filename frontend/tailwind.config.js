/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#276749',
          dark: '#162B1E',
          sidebar: '#1A3325',
          active: '#234A34',
          light: '#EAF3EC',
        },
        offwhite: '#F7F7F2',
        charcoal: {
          DEFAULT: '#202820',
          muted: '#69736B',
        },
        sage: {
          DEFAULT: '#E4EDE5',
          light: '#F0F5F1',
        },
        furni: {
          border: '#E3E7E1',
          card: '#FFFFFF',
        },
        badge: {
          paid: '#EAF3EC',
          paidText: '#276749',
          partial: '#FEF3C7',
          partialText: '#92400E',
          credit: '#EFF6FF',
          creditText: '#1D4ED8',
          progress: '#E0F2FE',
          progressText: '#0369A1',
          planned: '#F3F4F6',
          plannedText: '#4B5563',
          danger: '#FEE2E2',
          dangerText: '#DC2626',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'card': '14px',
        'badge': '20px',
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        finos: {
          dark: '#030712',
          card: '#0B0F19',
          border: '#1F2937',
          neon: '#C7F000',
          blue: '#4F7CFF',
          red: '#EF4444'
        }
      }
    },
  },
  plugins: [],
}
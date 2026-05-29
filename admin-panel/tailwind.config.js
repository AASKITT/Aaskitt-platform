/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'aaskitt-black': '#000000',
        'aaskitt-dark': '#0f172a',
        'aaskitt-gray': '#f3f4f6'
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./app.js", "./db.js", "./id3.js"],
  theme: {
    extend: {
      colors: {
        cyanx: "#00f2ea",
        pinkx: "#ff0055",
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

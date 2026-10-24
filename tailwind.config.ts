/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: "class",
  theme: {
    extend: {
      // Design tokens are defined as CSS custom properties in app/globals.css
      // (@theme) and map directly to Tailwind utilities (bg-surface, text-accent-600, ...).
      // This file exists only to opt into the "class" dark-mode strategy so the
      // `dark:` variant responds to the `dark` class on <html>.
    },
  },
  plugins: [],
};

export default config;

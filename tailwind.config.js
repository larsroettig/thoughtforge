/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        vault: {
          bg: "var(--vault-bg)",
          surface: "var(--vault-surface)",
          card: "var(--vault-card)",
          border: "var(--vault-border)",
          text: "var(--vault-text)",
          "text-muted": "var(--vault-text-muted)",
          "text-bright": "var(--vault-text-bright)",
          accent: "var(--vault-accent)",
          "accent-hover": "var(--vault-accent-hover)",
          critical: "var(--vault-critical)",
          warning: "var(--vault-warning)",
          success: "var(--vault-success)",
          purple: "var(--vault-purple)",
          orange: "var(--vault-orange)",
        },
      },
      fontFamily: {
        mono: [
          "SF Mono",
          "Monaco",
          "Inconsolata",
          "Fira Mono",
          "Droid Sans Mono",
          "Source Code Pro",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

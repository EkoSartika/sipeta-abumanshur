/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sistem Warna Baru: SIPETA Modern Minimalist Islamic Institution
        brand: {
          deep: "#123C35",     // Deep Green - Identitas Utama
          emerald: "#1D6B59",  // Emerald - Aksen & Interaksi
          mint: "#E8F2EC",     // Soft Mint - Latar Aksen Lembut
          canvas: "#F7F8F6",   // Off White - Latar Halaman Bersih
          surface: "#FFFFFF",  // White - Kartu dan Panel
          dark: "#1F2937",     // Dark Text - Teks Utama
          muted: "#6B7280",    // Secondary Text - Teks Sekunder
          border: "#E5E7EB",   // Border - Garis Pembatas Halus
        },
        pesantren: {
          50: "#f0fdf6",
          100: "#dcfce9",
          200: "#bbf7d4",
          300: "#86efb3",
          400: "#4ade89",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        gold: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        card: "0 2px 6px -1px rgba(18, 60, 53, 0.06), 0 1px 4px -2px rgba(18, 60, 53, 0.04)",
        dropdown: "0 10px 15px -3px rgba(18, 60, 53, 0.08), 0 4px 6px -4px rgba(18, 60, 53, 0.04)",
      },
    },
  },
  plugins: [],
};

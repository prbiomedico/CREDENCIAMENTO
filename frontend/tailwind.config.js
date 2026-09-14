/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Barlow Condensed', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // ===== Identidade oficial SIGCR =====
        // Grafite conduz navegação e ações; dourado identifica seleção e
        // contexto. Verde, amarelo e vermelho ficam reservados a estados
        // operacionais, sem competir com a marca.
        emerald: {
          50: '#f0fff5', 100: '#b9f6ca', 200: '#69f0ae', 300: '#3ee88f',
          400: '#1eec82', 500: '#00e676', 600: '#00c853', 700: '#00b34a',
          800: '#009940', 900: '#007a33', 950: '#00591f',
        },
        green: {
          50: '#f0fff5', 100: '#b9f6ca', 200: '#69f0ae', 300: '#3ee88f',
          400: '#1eec82', 500: '#00e676', 600: '#00c853', 700: '#00b34a',
          800: '#009940', 900: '#007a33', 950: '#00591f',
        },
        red: {
          50: '#ffebee', 100: '#ffcdd2', 200: '#ef9a9a', 300: '#e57373',
          400: '#ef5350', 500: '#f44336', 600: '#e53935', 700: '#d32f2f',
          800: '#c62828', 900: '#b71c1c', 950: '#7f0000',
        },
        amber: {
          50: '#fff8e1', 100: '#ffecb3', 200: '#ffe082', 300: '#ffd54f',
          400: '#ffca28', 500: '#ffc107', 600: '#ffb300', 700: '#ffa000',
          800: '#ff8f00', 900: '#ff6f00', 950: '#e65100',
        },
        yellow: {
          50: '#fff8e1', 100: '#ffecb3', 200: '#ffe082', 300: '#ffd54f',
          400: '#ffca28', 500: '#ffc107', 600: '#ffb300', 700: '#ffa000',
          800: '#ff8f00', 900: '#ff6f00', 950: '#e65100',
        },
        zinc: {
          50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8',
          400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46',
          800: '#27272a', 900: '#18181b', 950: '#09090b',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#d8b64f',
          400: '#c59b27', 500: '#1f2937', 600: '#111827', 700: '#111827',
          800: '#1f2937', 900: '#111827', 950: '#080c14',
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#e4c45f',
          400: '#d3aa34', 500: '#c59b27', 600: '#aa7f18', 700: '#896313',
          800: '#704f16', 900: '#5d4217', 950: '#352208',
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--card-radius)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

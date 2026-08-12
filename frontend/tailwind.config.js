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
        // ===== Identidade visual "Berry" (referência MUI, licença MIT) =====
        // Repaginação de cores só — sem migrar pra MUI. A maioria das telas
        // usa classes literais do Tailwind (bg-orange-500, text-emerald-400,
        // etc.) direto, não as variáveis semânticas abaixo — por isso a
        // reskin real acontece aqui, sobrescrevendo as escalas nomeadas do
        // Tailwind, não só as variáveis --primary/--secondary/etc. Isso
        // aplica a mudança em toda tela existente sem tocar em nenhum
        // arquivo de página.
        //
        // orange   -> primária Berry (azul, MUI blue) — cor de marca/CTA
        // purple   -> secundária Berry (roxo, MUI deepPurple accent)
        // emerald/green -> sucesso Berry
        // red      -> erro Berry
        // amber/yellow  -> aviso Berry
        // zinc     -> escala de cinza Berry + superfícies paper/background/
        //             níveis + tons de texto (título/primário/secundário)
        orange: {
          50: '#e3f2fd', 100: '#bbdefb', 200: '#90caf9', 300: '#64b5f6',
          400: '#42a5f5', 500: '#2196f3', 600: '#1e88e5', 700: '#1976d2',
          800: '#1565c0', 900: '#0d47a1', 950: '#082a5e',
        },
        purple: {
          50: '#ede7f6', 100: '#d1c4e9', 200: '#b39ddb', 300: '#9575cd',
          400: '#7e57c2', 500: '#7c4dff', 600: '#651fff', 700: '#6200ea',
          800: '#5600e8', 900: '#4a00c2', 950: '#33008a',
        },
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
          // 50-100: cinza claro (Berry grey scale) · 200-300: texto título/
          // primário · 400-500: texto secundário/cinza médio · 600: cinza
          // escuro Berry · 700-800: níveis de superfície · 900: background
          // · 950: paper (canvas mais escuro)
          50: '#f8fafc', 100: '#eef2f6', 200: '#d7dcec', 300: '#bdc8f0',
          400: '#9aa4b2', 500: '#8492c4', 600: '#4b5565', 700: '#29314f',
          800: '#212946', 900: '#1a223f', 950: '#111936',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
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
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
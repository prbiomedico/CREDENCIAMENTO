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
        // Repaginação de cores só — sem migrar pra MUI.
        //
        // primary/secondary -> escala completa (50-950) da marca Berry
        //   (azul/roxo), MESMOS valores hex que viviam em orange/purple
        //   antes do redesign de 2026-08-25 (SIGCR-Design-System-Fase1.md,
        //   PENDING_ACTIONS.md item 30) — só renomeados, zero mudança
        //   visual. orange/purple mapeavam pra essas cores de um jeito que
        //   parecia armadilha (orange-500 renderizava azul, não laranja) —
        //   causou bug 2x (título Compliance, card Atenção) antes de ser
        //   corrigido. primary/secondary têm nome que já diz o que são.
        // emerald/green -> sucesso Berry (mantido — nome já é consistente
        //   com a cor real, sem armadilha)
        // red      -> erro Berry (idem, sem armadilha)
        // amber/yellow  -> aviso Berry (idem, sem armadilha)
        // zinc     -> escala de cinza Berry + superfícies paper/background/
        //             níveis + tons de texto (título/primário/secundário)
        //
        // orange/purple (chaves originais "cru"): removidas em 2026-08-25
        // depois de confirmar zero uso restante fora deste arquivo e do
        // marcador de mapa (ver item 30) — a armadilha (orange-500
        // renderizando azul) deixa de existir porque o nome nem existe mais
        // como escala de cor; quem usar "orange-500" agora cai no laranja
        // de verdade do Tailwind (comportamento óbvio, não silencioso).
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
          50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
          400: '#94a3b8', 500: '#475569', 600: '#334155', 700: '#273449',
          800: '#1f2937', 900: '#172033', 950: '#0f172a',
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          // Escala 50-950 idêntica ao antigo "purple".
          50: '#ede7f6', 100: '#d1c4e9', 200: '#b39ddb', 300: '#9575cd',
          400: '#7e57c2', 500: '#7c4dff', 600: '#651fff', 700: '#6200ea',
          800: '#5600e8', 900: '#4a00c2', 950: '#33008a',
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

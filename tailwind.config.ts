import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

/**
 * Tailwind é ligado aos design tokens do Synse declarados em `globals.css`.
 * Toda cor referencia uma CSS variable — o dark mode troca apenas as variáveis,
 * nunca as classes usadas nos componentes.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        synse: {
          bg: 'var(--synse-bg)',
          surface: 'var(--synse-surface)',
          'surface-2': 'var(--synse-surface-2)',
          dark: 'var(--synse-dark)',
          'dark-2': 'var(--synse-dark-2)',
          primary: 'var(--synse-primary)',
          'primary-light': 'var(--synse-primary-light)',
          cyan: 'var(--synse-cyan)',
          mint: 'var(--synse-mint)',
          text: 'var(--synse-text)',
          muted: 'var(--synse-muted)',
          border: 'var(--synse-border)',
          success: 'var(--synse-success)',
          warning: 'var(--synse-warning)',
          danger: 'var(--synse-danger)',
        },
        border: 'var(--synse-border)',
        input: 'var(--synse-border)',
        ring: 'var(--synse-primary)',
        background: 'var(--synse-bg)',
        foreground: 'var(--synse-text)',
        primary: {
          DEFAULT: 'var(--synse-primary)',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: 'var(--synse-surface-2)',
          foreground: 'var(--synse-text)',
        },
        muted: {
          DEFAULT: 'var(--synse-surface-2)',
          foreground: 'var(--synse-muted)',
        },
        accent: {
          DEFAULT: 'var(--synse-mint)',
          foreground: 'var(--synse-dark)',
        },
        destructive: {
          DEFAULT: 'var(--synse-danger)',
          foreground: '#FFFFFF',
        },
        card: {
          DEFAULT: 'var(--synse-surface)',
          foreground: 'var(--synse-text)',
        },
        popover: {
          DEFAULT: 'var(--synse-surface)',
          foreground: 'var(--synse-text)',
        },
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Hierarquia tipográfica Synse
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'page-title': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        subtitle: ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
      },
      boxShadow: {
        'synse-sm': '0 1px 2px rgba(6, 46, 42, 0.05)',
        synse: '0 2px 10px -2px rgba(6, 46, 42, 0.08), 0 1px 3px rgba(6, 46, 42, 0.04)',
        'synse-lg': '0 18px 45px -18px rgba(6, 46, 42, 0.28)',
        glow: '0 10px 40px -12px rgba(0, 169, 143, 0.45)',
      },
      backgroundImage: {
        'synse-gradient': 'linear-gradient(135deg, #00A98F 0%, #22C7D8 100%)',
        'synse-gradient-deep': 'linear-gradient(150deg, #062E2A 0%, #083D38 55%, #0C4A42 100%)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 260ms ease-out both',
        'fade-in': 'fade-in 200ms ease-out both',
        'accordion-down': 'accordion-down 200ms ease-out',
        'accordion-up': 'accordion-up 200ms ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config

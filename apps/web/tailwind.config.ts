import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1200px',
      },
    },
    extend: {
      colors: {
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
      keyframes: {
        'card-pop': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '60%': { transform: 'translateY(-6px)', opacity: '1' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'trick-glow': {
          '0%': { boxShadow: '0 0 0 rgba(255, 211, 105, 0)' },
          '50%': { boxShadow: '0 0 25px rgba(255, 211, 105, 0.45)' },
          '100%': { boxShadow: '0 0 0 rgba(255, 211, 105, 0)' },
        },
      },
      animation: {
        'card-pop': 'card-pop 0.75s ease-out',
        'trick-glow': 'trick-glow 1.4s ease-in-out',
      },
    },
  },
  plugins: [animate],
};

export default config;

# Eve Style Guide

## Overview
This style guide is based on the Eve landing page design system and serves as a reference for maintaining visual consistency across the main application. The design follows a dark theme with sophisticated gradients, clear typography hierarchy, and modern UI patterns.

## Design Principles
- **Dark-first design**: Black background with strategic use of dark blues and grays
- **Sophisticated gradients**: Subtle transitions from brand colors to dark tones
- **Modern spacing**: Generous padding and consistent margin patterns
- **Accessibility**: High contrast ratios and focus states
- **Responsive design**: Mobile-first approach with breakpoint considerations

## Color Palette

### Primary Brand Colors
```css
/* Core Brand Colors */
--brand-blue: #0E1593;        /* Primary brand color */
--brand-dark: #04062D;        /* Secondary dark brand */
--brand-black: #0E0E0E;       /* Deep black accents */
--brand-white: #FFFFFF;       /* Pure white text */
--background-black: #000000;  /* Main background */
```

### Extended Color Palette
```css
/* Agent/Feature Colors */
--royal-purple: #6E3ADE;
--electric-orange: #FF4D1C;
--vibrant-green: #00B37E;
--deep-red: #E11D48;
--bright-yellow: #FBBF24;
--ocean-blue: #0EA5E9;
--magenta: #DB2777;
--golden-yellow: #FFD600;
--amber-orange: #F69902;
--danger-red: #E42800;
```

### Opacity Variants
```css
/* Common opacity levels for white text */
--white-100: rgba(255, 255, 255, 1);      /* Full opacity - primary text */
--white-90: rgba(255, 255, 255, 0.9);     /* High emphasis secondary text */
--white-70: rgba(255, 255, 255, 0.7);     /* Medium emphasis text */
--white-20: rgba(255, 255, 255, 0.2);     /* Subtle borders */
--white-10: rgba(255, 255, 255, 0.1);     /* Background overlays */
```

### Border Colors
```css
/* Consistent border styling */
--border-primary: rgba(216, 217, 236, 0.2);    /* Standard borders */
--border-emphasis: rgba(216, 217, 236, 0.3);   /* Hover/focus borders */
```

## Typography

### Font Families
```css
/* Primary fonts from Google Fonts */
--font-display: 'Comfortaa', system-ui, sans-serif;  /* Headings, brand */
--font-body: 'Inter', system-ui, sans-serif;         /* Body text, UI */
```

### Font Import (HTML Head)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300..700&family=Inter:wght@100..900&display=swap" rel="stylesheet">
```

### Typography Scale
```css
/* Heading styles */
.text-6xl { font-size: 3.75rem; line-height: 1; }      /* Hero headings */
.text-5xl { font-size: 3rem; line-height: 1; }         /* Page headings */
.text-4xl { font-size: 2.25rem; line-height: 2.5rem; } /* Section headings */
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; } /* Sub-headings */
.text-2xl { font-size: 1.5rem; line-height: 2rem; }    /* Component headings */
.text-xl { font-size: 1.25rem; line-height: 1.75rem; } /* Large text */
.text-lg { font-size: 1.125rem; line-height: 1.75rem; } /* Body large */
.text-base { font-size: 1rem; line-height: 1.5rem; }   /* Body default */
.text-sm { font-size: 0.875rem; line-height: 1.25rem; } /* Small text */

/* Typography patterns */
.heading-primary {
  font-family: 'Comfortaa', system-ui, sans-serif;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1.2;
}

.heading-secondary {
  font-family: 'Comfortaa', system-ui, sans-serif;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.3;
}

.body-text {
  font-family: 'Inter', system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
}

.ui-text {
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  color: #FFFFFF;
}
```

### Custom Typography Classes
```css
/* Special spacing for headings */
.custom-heading-spacing {
  line-height: 1.2 !important;
}
```

## Layout & Spacing

### Container Patterns
```css
/* Consistent container widths */
.container-narrow { max-width: 4rem; }      /* 64rem / 1024px */
.container-standard { max-width: 7xl; }     /* 80rem / 1280px */

/* Standard padding patterns */
.section-padding { padding: 5rem 0; }       /* 80px top/bottom */
.section-padding-large { padding: 8rem 0; } /* 128px top/bottom */

/* Responsive horizontal padding */
.responsive-padding {
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (min-width: 640px) {
  .responsive-padding {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}

@media (min-width: 768px) {
  .responsive-padding {
    padding-left: 4rem;
    padding-right: 4rem;
  }
}

@media (min-width: 1024px) {
  .responsive-padding {
    padding-left: 6rem;
    padding-right: 6rem;
  }
}

@media (min-width: 1280px) {
  .responsive-padding {
    padding-left: 8rem;
    padding-right: 8rem;
  }
}
```

### Grid Background Pattern
```css
.lightblue-grid-bg {
  background-color: #000;
  background-image:
    linear-gradient(to right, #04062D 0.5px, transparent 1px),
    linear-gradient(to bottom, #04062D 0.5px, transparent 1px);
  background-size: 60px 60px;
}
```

## Component Patterns

### Navigation Bar
```css
.navbar {
  position: fixed;
  top: 0;
  width: 100%;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #0E0E0E;
  z-index: 50;
  height: 5rem; /* 80px */
}

.navbar-link {
  color: rgba(255, 255, 255, 0.7);
  font-family: 'Inter', system-ui, sans-serif;
  transition: color 0.3s ease;
}

.navbar-link:hover,
.navbar-link.active {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Buttons

#### Primary Button
```css
.btn-primary {
  background: linear-gradient(to right, #0E1593, #04062D);
  border: 1px solid rgba(216, 217, 236, 0.2);
  color: #FFFFFF;
  padding: 0.625rem 1.5rem; /* 10px 24px */
  border-radius: 0.5rem; /* 8px */
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  transition: all 0.3s ease;
}

.btn-primary:hover {
  box-shadow: 0 10px 25px rgba(14, 21, 147, 0.2);
  transform: translateY(-1px);
}
```

#### Secondary Button
```css
.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(216, 217, 236, 0.2);
  color: #FFFFFF;
  padding: 0.625rem 1.5rem;
  border-radius: 0.5rem;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  transition: all 0.3s ease;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(216, 217, 236, 0.3);
}
```

### Cards

#### Standard Card
```css
.card {
  background: #04062D;
  border: 2px solid rgba(216, 217, 236, 0.2);
  border-radius: 1rem; /* 16px */
  padding: 2rem; /* 32px */
  transition: all 0.3s ease;
}

.card:hover {
  border-color: rgba(216, 217, 236, 0.3);
  transform: translateY(-2px);
}
```

#### Gradient Card
```css
.card-gradient {
  background: linear-gradient(135deg, var(--accent-color), #04062D);
  border: 2px solid rgba(216, 217, 236, 0.2);
  border-radius: 1.5rem; /* 24px */
  padding: 2rem;
  position: relative;
}

/* For pricing cards with popularity indicator */
.card-popular {
  transform: scale(1.05);
  border-color: rgba(216, 217, 236, 0.3);
  z-index: 10;
}
```

### Badges
```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem; /* 8px 16px */
  border-radius: 9999px;
  background: #0E1593;
  border: 2px solid rgba(216, 217, 236, 0.2);
  color: #FFFFFF;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 0.875rem; /* 14px */
  font-weight: 500;
}
```

### Form Elements
```css
.input {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(216, 217, 236, 0.2);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: #FFFFFF;
  font-family: 'Inter', system-ui, sans-serif;
  transition: all 0.3s ease;
}

.input:focus {
  outline: none;
  border-color: #0E1593;
  box-shadow: 0 0 0 2px rgba(14, 21, 147, 0.2);
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}
```

## Animations

### Custom Animations
```css
/* Gradient animation for backgrounds */
@keyframes gradient-x {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.animate-gradient-x {
  background-size: 200% 200%;
  animation: gradient-x 15s ease infinite;
}

/* Floating animation for elements */
@keyframes float {
  0%, 100% { 
    transform: translateY(0); 
  }
  50% { 
    transform: translateY(-8px); 
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}
```

### Hover Effects
```css
.hover-lift {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.hover-glow {
  transition: box-shadow 0.3s ease;
}

.hover-glow:hover {
  box-shadow: 0 0 20px rgba(14, 21, 147, 0.3);
}
```

## Responsive Design

### Breakpoints
```css
/* Tailwind CSS breakpoints used in the project */
/* sm: 640px */
/* md: 768px */
/* lg: 1024px */
/* xl: 1280px */
/* 2xl: 1536px */
```

### Responsive Patterns
```css
/* Text scaling */
.responsive-text-hero {
  font-size: 3rem; /* Mobile */
}

@media (min-width: 768px) {
  .responsive-text-hero {
    font-size: 3.75rem; /* Desktop */
  }
}

/* Grid layouts */
.responsive-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

@media (min-width: 768px) {
  .responsive-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .responsive-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

## Logo & Branding

### Logo Usage
```jsx
// Logo component pattern
const Logo = () => (
  <div className="flex items-center space-x-3">
    <img src="/autoeve-logo.png" alt="Eve Logo" className="w-8 h-8" />
    <span className="text-xl font-normal font-comfortaa text-white">Eve</span>
  </div>
);
```

### Brand Voice in UI
- Use "Eve" as the product name
- Tagline: "The automation platform for everyone"
- Maintain friendly but professional tone
- Use action-oriented language: "Get Started", "Request Access", "Contact Sales"

## Accessibility Guidelines

### Focus States
```css
.focus-visible {
  outline: none;
}

.focus-visible:focus-visible {
  outline: 2px solid #0E1593;
  outline-offset: 2px;
}
```

### Color Contrast
- White text on black background: 21:1 ratio (AAA)
- White text on brand blue (#0E1593): 8.6:1 ratio (AAA)
- White 70% opacity text on black: 14.7:1 ratio (AAA)

### ARIA Labels
```jsx
// Example patterns used
<button aria-label="Most popular plan">
<nav aria-label="Main navigation">
<section aria-labelledby="pricing-heading">
```

## Global CSS Setup

### Required CSS Reset/Base
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  max-width: 100vw;
  overflow-x: hidden;
  background-color: #000 !important;
}

/* Remove default focus rings in favor of custom focus-visible */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 2px solid #0E1593;
  outline-offset: 2px;
}
```

## Component Library Dependencies

### Required Packages
```json
{
  "dependencies": {
    "framer-motion": "^12.18.1",        // Animations
    "lucide-react": "^0.344.0",         // Icons
    "react-router-dom": "^7.6.2"        // Routing
  },
  "devDependencies": {
    "tailwindcss": "^3.4.1",           // CSS Framework
    "autoprefixer": "^10.4.18",        // CSS processing
    "postcss": "^8.4.35"               // CSS processing
  }
}
```

### Tailwind Configuration
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        comfortaa: ['Comfortaa', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': {
            'background-position': '0% 50%',
          },
          '50%': {
            'background-position': '100% 50%',
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
```

## Usage Examples

### Page Layout Pattern
```jsx
const PageLayout = ({ children, currentPage }) => (
  <div className="min-h-screen lightblue-grid-bg">
    <Navbar currentPage={currentPage} />
    <main className="pt-20">
      {children}
    </main>
    <Footer />
  </div>
);
```

### Section Pattern
```jsx
const Section = ({ title, children, badge }) => (
  <section className="py-20">
    <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 lg:px-24 xl:px-32">
      {badge && (
        <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium mb-8 bg-[#0E1593] font-inter">
          <span className="text-[#FFFFFF]">{badge}</span>
        </div>
      )}
      {title && (
        <h2 className="text-4xl md:text-5xl font-comfortaa font-bold text-[#FFFFFF] mb-4 custom-heading-spacing text-center">
          {title}
        </h2>
      )}
      {children}
    </div>
  </section>
);
```

### Card Grid Pattern
```jsx
const CardGrid = ({ items }) => (
  <div className="grid md:grid-cols-3 gap-8">
    {items.map((item, index) => (
      <div
        key={index}
        className="bg-[#04062D] border-2 border-[rgba(216,217,236,0.2)] rounded-2xl p-8 hover:border-[rgba(216,217,236,0.3)] transition-all duration-300"
      >
        {/* Card content */}
      </div>
    ))}
  </div>
);
```

## Best Practices

1. **Consistency**: Always use the defined color variables and spacing patterns
2. **Accessibility**: Include proper ARIA labels and maintain color contrast
3. **Performance**: Use the grid background sparingly on large sections
4. **Mobile-first**: Design for mobile and enhance for larger screens
5. **Animation**: Use subtle animations that enhance UX without being distracting
6. **Typography**: Stick to the two-font system (Comfortaa for headings, Inter for body)
7. **Gradients**: Use brand color to dark gradients for premium feel
8. **Borders**: Consistent use of rgba(216,217,236,0.2) for borders
9. **Hover states**: Always include smooth transitions for interactive elements
10. **Dark theme**: Remember this is a dark-first design system

This style guide provides a comprehensive foundation for maintaining design consistency across your main application while preserving the sophisticated, modern aesthetic of your landing page. 
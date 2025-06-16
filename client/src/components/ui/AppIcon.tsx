import React from 'react';
import { cn } from '~/utils';

interface AppIconProps {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'button' | 'dark-bg' | 'light-bg';
  fallbackText?: string;
  className?: string;
}

const sizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4', 
  md: 'h-6 w-6',
  lg: 'h-8 w-8'
};

const variantStyles = {
  default: {},
  button: {
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)) contrast(1.1) brightness(1.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  'dark-bg': {
    filter: 'drop-shadow(0 1px 2px rgba(255, 255, 255, 0.3)) contrast(1.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  'light-bg': {
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))',
  }
};

const fallbackClasses = {
  default: 'bg-gray-100 text-gray-600 border border-gray-200',
  button: 'bg-white/90 text-gray-700 border border-white/20',
  'dark-bg': 'bg-black/10 text-white border border-white/20',
  'light-bg': 'bg-gray-100 text-gray-700 border border-gray-200'
};

export default function AppIcon({ 
  src, 
  alt, 
  size = 'sm', 
  variant = 'default',
  fallbackText,
  className 
}: AppIconProps) {
  const sizeClass = sizeClasses[size];
  const styles = variantStyles[variant];
  const fallbackClass = fallbackClasses[variant];
  
  // Extract first letter for fallback
  const firstLetter = (fallbackText || alt).charAt(0).toUpperCase();

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      {src ? (
        <img 
          src={src} 
          alt={alt} 
          className={cn(
            sizeClass,
            "rounded-sm object-contain filter drop-shadow-sm",
            variant === 'button' && "min-w-4 min-h-4"
          )}
          style={{
            ...styles,
            minWidth: variant === 'button' ? '1rem' : undefined,
            minHeight: variant === 'button' ? '1rem' : undefined
          }}
          onError={(e) => {
            // Replace with fallback on error
            const target = e.currentTarget;
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div class="${sizeClass} rounded-sm ${fallbackClass} flex items-center justify-center text-xs font-semibold shadow-sm" ${variant === 'button' ? 'style="min-width: 1rem; min-height: 1rem;"' : ''}>
                  ${firstLetter}
                </div>
              `;
            }
          }}
        />
      ) : (
        <div className={cn(
          sizeClass,
          "rounded-sm flex items-center justify-center text-xs font-semibold shadow-sm",
          fallbackClass
        )}>
          {firstLetter}
        </div>
      )}
    </div>
  );
} 
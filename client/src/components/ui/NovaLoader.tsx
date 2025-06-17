import React, { useState, useEffect } from 'react';

interface NovaLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
  showText?: boolean;
}

const NovaLoader: React.FC<NovaLoaderProps> = ({ 
  size = 'md', 
  className = '', 
  text = 'Loading...',
  showText = true 
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  const images = [
    '/assets/Nova.png',
    '/assets/nova2.png', 
    '/assets/nova3.png'
  ];

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
    xl: 'w-48 h-48'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 800); // Change image every 800ms for smooth animation

    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className={`flex flex-col items-center justify-center space-y-4 ${className}`}>
      <div className={`relative ${sizeClasses[size]} flex items-center justify-center`}>
        {images.map((src, index) => (
          <img
            key={src}
            src={src}
            alt={`Nova ${index + 1}`}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
              index === currentImageIndex ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
      </div>
      {showText && (
        <div className={`${textSizeClasses[size]} font-medium text-text-primary text-center`}>
          {text}
        </div>
      )}
    </div>
  );
};

export default NovaLoader;
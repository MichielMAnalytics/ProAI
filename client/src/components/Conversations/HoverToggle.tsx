import React from 'react';
import { ToggleContext } from './ToggleContext';
import { cn } from '~/utils';

const HoverToggle = ({
  children,
  isActiveConvo,
  isPopoverActive,
  setIsPopoverActive,
  className = 'absolute bottom-0 right-0 top-0',
  onClick,
}: {
  children: React.ReactNode;
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  setIsPopoverActive: (isActive: boolean) => void;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) => {
  const setPopoverActive = (value: boolean) => setIsPopoverActive(value);
  return (
    <ToggleContext.Provider value={{ isPopoverActive, setPopoverActive }}>
      <div
        onClick={onClick}
        className={cn(
          'peer items-center gap-1.5 rounded-r-lg from-surface-primary pl-2 pr-2 dark:text-white',
          isPopoverActive || isActiveConvo ? 'flex' : 'hidden group-hover:flex',
          isActiveConvo
            ? 'from-surface-primary-alt from-85% to-transparent group-hover:bg-gradient-to-l group-hover:from-surface-active dark:from-surface-primary-alt dark:group-hover:from-surface-primary-alt'
            : 'z-50 from-surface-primary-alt from-0% to-transparent hover:bg-gradient-to-l hover:from-surface-active dark:from-surface-primary-alt dark:hover:from-surface-primary-alt',
          isPopoverActive && !isActiveConvo ? 'from-surface-primary-alt dark:from-surface-primary-alt' : '',
          className,
        )}
      >
        {children}
      </div>
    </ToggleContext.Provider>
  );
};

export default HoverToggle;

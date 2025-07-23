import React from 'react';
import { X } from 'lucide-react';
import { cn } from '~/utils';

interface AgentBadgeProps {
  agentName: string;
  agentIcon?: React.ReactNode | string | null;
  onRemove: () => void;
  isVisible: boolean;
  className?: string;
}

const AgentBadge: React.FC<AgentBadgeProps> = ({
  agentName,
  agentIcon,
  onRemove,
  isVisible,
  className,
}) => {
  if (!isVisible || !agentName) {
    return null;
  }

  // Smart truncation for mobile only: remove ' Agent' suffix if the name would be too long
  const getDisplayName = (name: string, isMobile: boolean) => {
    if (!isMobile) {
      return name; // No truncation on desktop
    }

    const maxLength = 15; // Shorter limit for mobile

    if (name.length <= maxLength) {
      return name;
    }

    // Check if name ends with ' Agent' (case insensitive)
    const agentSuffixRegex = /\s+agent$/i;
    if (agentSuffixRegex.test(name)) {
      const nameWithoutAgent = name.replace(agentSuffixRegex, '');
      // Only remove it if the result is still meaningful (more than 3 characters)
      if (nameWithoutAgent.length > 3) {
        return nameWithoutAgent;
      }
    }

    return name;
  };

  const renderIcon = () => {
    // If there's a specific icon, use it
    if (agentIcon) {
      // If it's a string (URL), render as img
      if (typeof agentIcon === 'string') {
        return (
          <img
            src={agentIcon}
            alt={`${agentName} icon`}
            className="h-4 w-4 flex-shrink-0 rounded-sm object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        );
      }

      // If it's a React element, render it directly with size constraints
      if (React.isValidElement(agentIcon)) {
        return (
          <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
            {React.cloneElement(agentIcon as React.ReactElement, {
              className: 'w-4 h-4',
              size: 16,
            })}
          </div>
        );
      }
    }

    // Default fallback: use the application logo
    return (
      <img
        src="/assets/logo.svg"
        alt="Default icon"
        className="h-4 w-4 flex-shrink-0 rounded-sm object-cover"
      />
    );
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-sm font-medium text-blue-800 dark:border-blue-700/50 dark:bg-blue-900/30 dark:text-blue-200',
        className,
      )}
    >
      {renderIcon()}
      <span className="hidden sm:block" title={agentName}>
        {getDisplayName(agentName, false)}
      </span>
      <button
        onClick={onRemove}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-blue-200 dark:hover:bg-blue-800/50"
        aria-label={`Remove ${agentName}`}
        type="button"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default AgentBadge;

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
  className 
}) => {
  if (!isVisible || !agentName) {
    return null;
  }

  // Smart truncation: remove ' Agent' suffix if the name would be too long
  const getDisplayName = (name: string) => {
    const maxLength = 20; // Approximate character limit for max-w-40
    
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
            className="w-4 h-4 rounded-sm object-cover flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        );
      }
      
      // If it's a React element, render it directly with size constraints
      if (React.isValidElement(agentIcon)) {
        return (
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {React.cloneElement(agentIcon as React.ReactElement, { 
              className: 'w-4 h-4',
              size: 16 
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
        className="w-4 h-4 rounded-sm object-cover flex-shrink-0"
      />
    );
  };

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md text-sm font-medium border border-blue-200 dark:border-blue-700/50",
      className
    )}>
      {renderIcon()}
      <span className="hidden sm:block truncate max-w-40" title={agentName}>{getDisplayName(agentName)}</span>
      <button
        onClick={onRemove}
        className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors flex-shrink-0"
        aria-label={`Remove ${agentName}`}
        type="button"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default AgentBadge;
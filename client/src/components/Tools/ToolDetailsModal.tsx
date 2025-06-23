import React from 'react';
import { X } from 'lucide-react';

interface ToolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: {
    id: string;
    name: string;
    icon?: string;
    description?: string;
  };
}

export default function ToolDetailsModal({
  isOpen,
  onClose,
  tool,
}: ToolDetailsModalProps) {
  if (!isOpen) return null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-xl bg-surface-primary shadow-2xl dark:bg-surface-primary">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 z-10 flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close modal"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div className="max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="flex-shrink-0 mx-auto mb-4">
                {tool.icon ? (
                  <img
                    src={tool.icon}
                    alt={tool.name}
                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl object-cover mx-auto"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `<div class="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-2xl mx-auto">${tool.name?.charAt(0)?.toUpperCase() || '?'}</div>`;
                      }
                    }}
                  />
                ) : (
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-2xl mx-auto">
                    {tool.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              
              <h2 className="text-xl sm:text-2xl heading-primary mb-2">{tool.name}</h2>
              
              <div className="inline-flex items-center rounded-md bg-green-50 px-3 py-1 text-sm font-medium text-green-700 border border-green-200/50 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50">
                ✓ Enabled
              </div>
            </div>

            {/* Description */}
            {tool.description && (
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-semibold font-comfortaa text-text-primary">Description</h3>
                <div className="rounded-xl border border-gray-200 bg-surface-secondary p-4 sm:p-6 shadow-sm dark:border-gray-700 dark:bg-surface-secondary">
                  <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
            )}

            {/* Info note */}
            <div className="mt-6 rounded-lg bg-blue-50 p-4 border border-blue-200/50 dark:bg-blue-900/20 dark:border-blue-700/50">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                This tool is currently enabled for this agent and ready to use in your conversations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
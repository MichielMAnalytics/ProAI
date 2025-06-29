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

export default function ToolDetailsModal({ isOpen, onClose, tool }: ToolDetailsModalProps) {
  if (!isOpen) return null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
      onClick={handleBackdropClick}
    >
      <div className="relative max-h-[95vh] w-full max-w-md overflow-hidden rounded-xl bg-surface-primary shadow-2xl dark:bg-surface-primary sm:max-h-[90vh]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 sm:right-4 sm:top-4 sm:h-8 sm:w-8"
          aria-label="Close modal"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div className="max-h-[95vh] overflow-y-auto sm:max-h-[90vh]">
          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex-shrink-0">
                {tool.icon ? (
                  <img
                    src={tool.icon}
                    alt={tool.name}
                    className="mx-auto h-16 w-16 rounded-xl object-cover sm:h-20 sm:w-20"
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
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-2xl font-semibold text-white sm:h-20 sm:w-20">
                    {tool.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>

              <h2 className="heading-primary mb-2 text-xl sm:text-2xl">{tool.name}</h2>

              <div className="inline-flex items-center rounded-md border border-green-200/50 bg-green-50 px-3 py-1 text-sm font-medium text-green-700 dark:border-green-700/50 dark:bg-green-900/30 dark:text-green-300">
                ✓ Enabled
              </div>
            </div>

            {/* Description */}
            {tool.description && (
              <div className="space-y-4">
                <h3 className="font-comfortaa text-base font-semibold text-text-primary sm:text-lg">
                  Description
                </h3>
                <div className="rounded-xl border border-gray-200 bg-surface-secondary p-4 shadow-sm dark:border-gray-700 dark:bg-surface-secondary sm:p-6">
                  <p className="text-sm leading-relaxed text-text-secondary sm:text-base">
                    {tool.description}
                  </p>
                </div>
              </div>
            )}

            {/* Info note */}
            <div className="mt-6 rounded-lg border border-blue-200/50 bg-blue-50 p-4 dark:border-blue-700/50 dark:bg-blue-900/20">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                This tool is currently enabled for this agent and ready to use in your
                conversations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

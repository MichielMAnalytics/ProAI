import { useState } from 'react';
import type { Action } from 'librechat-data-provider';
import { TooltipAnchor } from '~/components/ui';
import GearIcon from '~/components/svg/GearIcon';
import { cn } from '~/utils';

export default function Action({ action, onClick }: { action: Action; onClick: () => void }) {
  const [isHovering, setIsHovering] = useState(false);

  const domain = action.metadata.domain;
  const isDomainTooLong = domain && domain.length > 30;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
      className="group flex w-full rounded-lg border border-border-light bg-surface-secondary text-sm transition-colors hover:bg-surface-tertiary hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring-primary"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      aria-label={`Action for ${domain}`}
    >
      <div className="min-w-0 flex-1 px-3 py-2">
        {isDomainTooLong ? (
          <TooltipAnchor
            description={domain}
            render={
              <div className="truncate text-text-primary">
                {domain}
              </div>
            }
          />
        ) : (
          <div className="truncate text-text-primary">
            {domain}
          </div>
        )}
      </div>
      <div
        className={cn(
          'mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-border-medium focus:outline-none focus:ring-2 focus:ring-ring-primary group-focus:flex',
          isHovering ? 'flex' : 'hidden',
        )}
        aria-label="Settings"
      >
        <GearIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      </div>
    </div>
  );
}

import React from 'react';
import { Button } from '~/components/ui';
import type { TAppComponent } from 'librechat-data-provider';

interface ComponentCardProps {
  component: TAppComponent;
  type: 'action' | 'trigger';
  isConnected: boolean;
  appSlug: string;
}

export default function ComponentCard({ component, type, isConnected }: ComponentCardProps) {
  return (
    <div className="rounded-lg border border-border-light bg-surface-primary p-4">
      <div className="mb-3">
        <h4 className="font-medium text-text-primary">{component.name}</h4>
        <p className="text-sm text-text-secondary">{component.description}</p>
      </div>
      
      <div className="mb-3">
        <span className="inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {type}
        </span>
        <span className="ml-2 text-xs text-text-secondary">v{component.version}</span>
      </div>

      {component.configurable_props && component.configurable_props.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-text-secondary">
            {component.configurable_props.length} configurable properties
          </p>
        </div>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={!isConnected}
        className="w-full"
      >
        {isConnected ? `Configure ${type}` : 'Connect app first'}
      </Button>
    </div>
  );
} 
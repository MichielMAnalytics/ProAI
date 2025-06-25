import React from 'react';
import { ExternalLink, Github, BookOpen } from 'lucide-react';
import type { TAppComponent } from 'librechat-data-provider';
import { cleanDescription } from '~/utils/textProcessing';

interface ComponentCardProps {
  component: TAppComponent;
  type: 'action' | 'trigger';
  isConnected: boolean;
  appSlug: string;
}

export default function ComponentCard({ component, type, isConnected, appSlug }: ComponentCardProps) {
  // Generate GitHub link based on component key and app slug
  const getGitHubLink = () => {
    // Construct GitHub link from Pipedream's component structure
    const baseUrl = 'https://github.com/PipedreamHQ/pipedream/tree/master/components';
    
    // Component keys often include the app slug as a prefix (e.g., "microsoft_outlook_calendar-get-schedule")
    // We need to remove this prefix to get the correct path
    let actionKey = component.key;
    
    // If the component key starts with the app slug followed by a dash, remove that prefix
    const appSlugPrefix = `${appSlug}-`;
    if (actionKey.startsWith(appSlugPrefix)) {
      actionKey = actionKey.substring(appSlugPrefix.length);
    }
    
    return `${baseUrl}/${appSlug}/actions/${actionKey}`;
  };

  // Extract documentation URL from description
  const getDocUrl = () => {
    if (!component.description) return null;
    const urlMatch = component.description.match(/https:\/\/[^\s)]+/);
    return urlMatch ? urlMatch[0] : null;
  };


  const githubLink = getGitHubLink();
  const docUrl = getDocUrl();
  const cleanedDescription = cleanDescription(component.description || '');

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-surface-primary p-6 shadow-sm hover:shadow-md transition-shadow dark:border-gray-700 dark:bg-surface-secondary">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-base heading-secondary pr-4">
            {component.name}
          </h4>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Documentation link icon */}
            {docUrl && (
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-brand-blue hover:text-blue-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-surface-hover transition-all duration-200"
                onClick={(e) => e.stopPropagation()}
                title="View documentation"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            
            <a
              href={githubLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-surface-hover transition-all duration-200"
              title="View Source"
            >
              <Github className="h-4 w-4" />
            </a>
            
            <a
              href={`https://pipedream.com/apps/${appSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-surface-hover transition-all duration-200"
              title="Pipedream App Docs"
            >
              <BookOpen className="h-4 w-4" />
            </a>
          </div>
        </div>
        <p 
          className="text-sm body-text"
          title={cleanedDescription}
        >
          {cleanedDescription}
        </p>
      </div>
    </div>
  );
} 
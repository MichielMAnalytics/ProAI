import React from 'react';
import { ExternalLink, Github, BookOpen } from 'lucide-react';
import type { TAppComponent } from 'librechat-data-provider';

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

  // Parse and clean description (remove doc links and references)
  const getCleanDescription = (text: string): string => {
    if (!text) return 'No description available';
    
    return text
      .replace(/\[See the docs?\]/gi, '')
      .replace(/\[See the docs here\]/gi, '')
      .replace(/\[See the documentation\]/gi, '')
      .replace(/See the docs?/gi, '')
      .replace(/See the documentation/gi, '')
      .replace(/IMPORTANT:[\s\S]*?format:\s*string/gi, '')
      .replace(/\s*for more information/gi, '')
      .replace(/\s*-\s*cc:[\s\S]*?format:\s*string/gi, '')
      .replace(/\s*-\s*bcc:[\s\S]*?format:\s*string/gi, '')
      .replace(/\s*-\s*attachment[\s\S]*?format:\s*string/gi, '')
      .replace(/https:\/\/[^\s)]+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to plain text
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const githubLink = getGitHubLink();
  const docUrl = getDocUrl();
  const cleanDescription = getCleanDescription(component.description || '');

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-surface-primary p-6 shadow-sm hover:shadow-md transition-shadow dark:border-gray-700 dark:bg-surface-secondary">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight pr-4">
            {component.name}
          </h4>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Documentation link icon */}
            {docUrl && (
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-surface-hover transition-all duration-200"
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
          className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
          title={cleanDescription}
        >
          {cleanDescription}
        </p>
      </div>
    </div>
  );
} 
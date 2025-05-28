import React from 'react';
import { ExternalLink, Github } from 'lucide-react';
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

  // Parse markdown-style links in description
  const parseDescription = (text: string): React.ReactNode => {
    if (!text) return 'No description available';
    
    // Regex to match markdown links: [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = markdownLinkRegex.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      
      // Add the link
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
        >
          {match[1]}
        </a>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    
    return parts.length > 1 ? parts : text;
  };

  const githubLink = getGitHubLink();
  const parsedDescription = parseDescription(component.description || '');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight">
            {component.name}
          </h4>
          <div className="flex items-center gap-2 ml-4">
            <a
              href={githubLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title="View Source"
            >
              <Github className="h-4 w-4" />
            </a>
            
            <a
              href={`https://pipedream.com/apps/${appSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              title="Pipedream Docs"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {parsedDescription}
        </p>
      </div>
    </div>
  );
} 
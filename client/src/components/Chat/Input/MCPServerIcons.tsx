import React from 'react';
import { useAvailableIntegrationsQuery, useAvailableToolsQuery } from '~/data-provider';
import { EModelEndpoint } from 'librechat-data-provider';

interface MCPServerIconsProps {
  mcpServers: string[];
}

export default function MCPServerIcons({ mcpServers }: MCPServerIconsProps) {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();
  const { data: tools } = useAvailableToolsQuery(EModelEndpoint.agents);

  if (!mcpServers || mcpServers.length === 0) {
    return null;
  }

  const getMCPServerIcon = (serverName: string): string | undefined => {
    // Method 1: Direct lookup by appSlug in available integrations
    const integration = availableIntegrations?.find(int => int.appSlug === serverName);
    if (integration?.appIcon) {
      return integration.appIcon;
    }
    
    // Method 2: Extract from tools (for servers with pipedream- prefix)
    const serverTool = tools?.find(tool => 
      tool.pluginKey?.includes('_mcp_') && 
      (tool.pluginKey.split('_mcp_')[1] === serverName || 
       tool.pluginKey.split('_mcp_')[1] === `pipedream-${serverName}`)
    );
    
    return serverTool?.icon;
  };

  const serverIcons = mcpServers.map(serverName => {
    const icon = getMCPServerIcon(serverName);
    return { serverName, icon };
  }).filter(server => server.icon);

  if (serverIcons.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex justify-center">
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-secondary">Connected Apps:</span>
        <div className="flex items-center gap-2">
          {serverIcons.map(({ serverName, icon }) => (
            <div
              key={serverName}
              className="group relative"
              title={serverName.charAt(0).toUpperCase() + serverName.slice(1)}
            >
              <img
                src={icon}
                alt={`${serverName} integration`}
                className="h-6 w-6 rounded-sm object-cover transition-transform duration-200 group-hover:scale-110"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
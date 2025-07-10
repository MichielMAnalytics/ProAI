import { useState } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TAvailableIntegration } from 'librechat-data-provider';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import { cn } from '~/utils';
import {
  useAvailableIntegrationsQuery,
  useAvailableToolsQuery,
  useUserIntegrationsQuery,
} from '~/data-provider';
import { useMCPConnection } from '~/hooks/useMCPConnection';
import AppDetailsModal from '../../Integrations/AppDetailsModal';
import ToolDetailsModal from '../../Tools/ToolDetailsModal';

interface MCPServerIconsProps {
  agentTools: Array<string | { tool: string; server: string; type: 'global' | 'user' }>;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showBackground?: boolean;
  square?: boolean;
}

const MCPServerIcons = ({
  agentTools,
  className = '',
  size = 'md',
  showBackground = true,
  square = false,
}: MCPServerIconsProps) => {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();
  const { data: tools } = useAvailableToolsQuery(EModelEndpoint.agents);
  const { data: userIntegrations } = useUserIntegrationsQuery();
  const { isIntegrationConnected } = useMCPConnection();
  const [selectedIntegration, setSelectedIntegration] = useState<TAvailableIntegration | null>(
    null,
  );
  const [selectedTool, setSelectedTool] = useState<{
    id: string;
    name: string;
    icon?: string;
    description?: string;
  } | null>(null);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);

  // Derive MCP servers and tool keys from agentTools
  const mcpServers = Array.from(
    new Set(
      agentTools
        .filter(
          (tool): tool is { tool: string; server: string; type: 'global' | 'user' } =>
            typeof tool === 'object' && 'server' in tool,
        )
        .map((tool) =>
          tool.server.startsWith('pipedream-')
            ? tool.server.replace('pipedream-', '')
            : tool.server,
        ),
    ),
  );

  const toolKeys = agentTools.filter((tool): tool is string => typeof tool === 'string');

  if ((!mcpServers || mcpServers.length === 0) && (!toolKeys || toolKeys.length === 0)) {
    return null;
  }

  const getMCPServerData = (
    serverName: string,
  ): {
    icon?: string;
    integration?: TAvailableIntegration;
    isConnected: boolean;
    isGlobal?: boolean;
  } => {
    // First, try direct match with the server name
    let integration = availableIntegrations?.find((int) => int.appSlug === serverName);
    if (integration?.appIcon) {
      const isConnected = isIntegrationConnected(integration.appSlug);
      return { icon: integration.appIcon, integration, isConnected };
    }

    // If no direct match, try stripping "pipedream-" prefix if it exists
    const strippedServerName = serverName.startsWith('pipedream-')
      ? serverName.replace('pipedream-', '')
      : serverName;

    if (strippedServerName !== serverName) {
      integration = availableIntegrations?.find((int) => int.appSlug === strippedServerName);
      if (integration?.appIcon) {
        const isConnected = isIntegrationConnected(integration.appSlug);
        return { icon: integration.appIcon, integration, isConnected };
      }
    }

    // If still no match in integrations, look in tools
    const serverTool = tools?.find(
      (tool) =>
        tool.serverName === serverName ||
        tool.appSlug === serverName ||
        tool.serverName === strippedServerName ||
        tool.appSlug === strippedServerName ||
        tool.serverName === `pipedream-${serverName}` ||
        tool.appSlug === `pipedream-${serverName}` ||
        tool.serverName === `pipedream-${strippedServerName}` ||
        tool.appSlug === `pipedream-${strippedServerName}`,
    );

    // If we found a server tool, try to find the corresponding integration again
    if (serverTool) {
      // Try to find integration by the tool's appSlug or serverName
      integration = availableIntegrations?.find(
        (int) =>
          int.appSlug === serverTool.appSlug ||
          int.appSlug === serverTool.serverName ||
          int.appSlug === strippedServerName ||
          int.appSlug === serverName,
      );

      // Check if this is a global tool (isGlobal property indicates global MCP tools)
      const isGlobalTool = serverTool.isGlobal === true;

      // For global tools, always consider them "connected" since they're globally available
      // For user tools, check actual user integration status
      const isConnected =
        isGlobalTool || (integration ? isIntegrationConnected(integration.appSlug) : false);

      return {
        icon: serverTool.icon,
        integration,
        isConnected,
        isGlobal: isGlobalTool,
      };
    }

    return { icon: undefined, integration: undefined, isConnected: false };
  };

  const getToolData = (toolKey: string): { icon?: string; name: string; description?: string } => {
    // Find the tool in the available tools data
    const tool = tools?.find((t) => t.pluginKey === toolKey);
    if (tool) {
      return {
        icon: tool.icon,
        name: tool.name,
        description: tool.description,
      };
    }

    return {
      name: toolKey.charAt(0).toUpperCase() + toolKey.slice(1).replace(/_/g, ' '),
    };
  };

  // Combine MCP servers and standalone tools data
  const allItems: Array<{
    id: string;
    type: 'mcp' | 'tool';
    name: string;
    icon?: string;
    integration?: TAvailableIntegration;
    description?: string;
    isConnected: boolean;
    isGlobal?: boolean;
  }> = [];

  // Add MCP servers (one icon per server)
  if (mcpServers && mcpServers.length > 0) {
    mcpServers.forEach((serverName) => {
      const { icon, integration, isConnected, isGlobal } = getMCPServerData(serverName);
      if (icon) {
        allItems.push({
          id: serverName,
          type: 'mcp',
          name: serverName,
          icon,
          integration,
          isConnected,
          isGlobal,
        });
      }
    });
  }

  // Add standalone tools (tools that are NOT part of MCP servers)
  if (toolKeys && toolKeys.length > 0) {
    toolKeys.forEach((toolKey) => {
      const { icon, name, description } = getToolData(toolKey);
      if (icon) {
        // Check if this tool belongs to an MCP server
        const tool = tools?.find((t) => t.pluginKey === toolKey);
        const isStandaloneTool = !tool?.serverName && !tool?.appSlug;

        // Only add if it's a standalone tool (not part of an MCP server)
        if (isStandaloneTool) {
          allItems.push({
            id: toolKey,
            type: 'tool',
            name,
            icon,
            description,
            isConnected: true, // Standalone tools are always "connected"
          });
        }
      }
    });
  }

  if (allItems.length === 0) {
    return null;
  }

  const handleIconClick = (item: (typeof allItems)[0]) => {
    // Don't open modal for global MCP servers
    if (item.isGlobal) {
      return;
    }

    if (item.type === 'mcp' && item.integration) {
      setSelectedIntegration(item.integration);
      setIsAppModalOpen(true);
    } else if (item.type === 'mcp') {
      // If no integration found, create a fallback from server tool data
      const { icon } = getMCPServerData(item.id);
      const strippedServerName = item.id.startsWith('pipedream-')
        ? item.id.replace('pipedream-', '')
        : item.id;

      const serverTool = tools?.find(
        (tool) =>
          tool.serverName === item.id ||
          tool.appSlug === item.id ||
          tool.serverName === strippedServerName ||
          tool.appSlug === strippedServerName ||
          tool.serverName === `pipedream-${item.id}` ||
          tool.appSlug === `pipedream-${item.id}` ||
          tool.serverName === `pipedream-${strippedServerName}` ||
          tool.appSlug === `pipedream-${strippedServerName}`,
      );

      if (serverTool) {
        // Create a fallback integration object
        const fallbackIntegration: TAvailableIntegration = {
          appSlug: serverTool.appSlug || strippedServerName,
          appName:
            serverTool.name ||
            strippedServerName.charAt(0).toUpperCase() + strippedServerName.slice(1),
          appDescription: serverTool.description || `${strippedServerName} integration`,
          appIcon: serverTool.icon || icon,
          authType: 'oauth',
          appCategories: [],
          appUrl: '',
          isActive: true,
        };

        setSelectedIntegration(fallbackIntegration);
        setIsAppModalOpen(true);
      }
    } else if (item.type === 'tool') {
      // For standalone tools, use the simple tool modal
      setSelectedTool({
        id: item.id,
        name: item.name,
        icon: item.icon,
        description: item.description,
      });
      setIsToolModalOpen(true);
    }
  };

  const handleCloseAppModal = () => {
    setIsAppModalOpen(false);
    setSelectedIntegration(null);
  };

  const handleCloseToolModal = () => {
    setIsToolModalOpen(false);
    setSelectedTool(null);
  };

  const handleConnect = () => {
    // This will be handled by the modal's internal logic
  };

  const handleDisconnect = () => {
    // This will be handled by the modal's internal logic
  };

  // Size configurations
  const sizeConfig = {
    sm: {
      iconSize: 'h-3 w-3',
      padding: 'p-0.5',
      gap: 'gap-1',
      indicator: 'h-2 w-2',
    },
    md: {
      iconSize: 'h-4 w-4',
      padding: 'p-1',
      gap: 'gap-1.5',
      indicator: 'h-2.5 w-2.5',
    },
    lg: {
      iconSize: 'h-5 w-5',
      padding: 'p-1',
      gap: 'gap-2',
      indicator: 'h-3 w-3',
    },
  };

  const config = sizeConfig[size];

  return (
    <>
      <div
        className={cn(
          'flex items-center',
          config.gap,
          showBackground && 'rounded-lg bg-black/10 px-2 py-1 backdrop-blur-sm',
          className,
        )}
      >
        {allItems.map((item) => (
          <TooltipAnchor
            key={item.id}
            description={
              item.isConnected
                ? `${item.name} - ${item.isGlobal ? 'Connected (Global)' : 'Connected'}`
                : item.isGlobal
                  ? `${item.name} - Global tool (always available)`
                  : 'App not connected. Click on it to connect.'
            }
            side="top"
            role="button"
            className={cn(
              'group relative rounded-md transition-all duration-200',
              config.padding,
              item.isGlobal
                ? 'cursor-default' // Global servers are not clickable
                : item.isConnected
                  ? 'cursor-pointer hover:bg-surface-hover'
                  : 'cursor-pointer hover:bg-orange-100/20 dark:hover:bg-orange-900/20',
            )}
            onClick={() => handleIconClick(item)}
          >
            {/* Connection status indicator */}
            {!item.isConnected && !item.isGlobal && (
              <div
                className={cn(
                  'absolute -right-0.5 -top-0.5 animate-pulse border border-white bg-orange-500 dark:border-gray-800',
                  square ? 'rounded-sm' : 'rounded-full',
                  config.indicator,
                )}
              />
            )}
            {/* Global tool indicator */}
            {item.isGlobal && (
              <div
                className={cn(
                  'absolute -right-0.5 -top-0.5 border border-white bg-blue-500 dark:border-gray-800',
                  square ? 'rounded-sm' : 'rounded-full',
                  config.indicator,
                )}
              />
            )}
            <img
              src={item.icon}
              alt={`${item.name} ${item.type === 'tool' ? 'tool' : 'integration'}`}
              className={cn(
                'object-cover p-0.5 transition-all duration-200 group-hover:scale-110',
                square ? 'rounded-[4px]' : 'rounded-sm',
                config.iconSize,
                {
                  // Connected global tool (blue with ring)
                  'bg-blue-100/90 ring-1 ring-blue-400/50 dark:bg-blue-900/90':
                    item.isConnected && item.isGlobal,
                  // Connected non-global tool (white/gray)
                  'bg-white/90 dark:bg-gray-100/90': item.isConnected && !item.isGlobal,
                  // Not connected tool (orange with ring)
                  'bg-orange-100/90 ring-1 ring-orange-400/50 dark:bg-orange-900/90':
                    !item.isConnected,
                },
              )}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </TooltipAnchor>
        ))}
      </div>
      {selectedIntegration && (
        <AppDetailsModal
          isOpen={isAppModalOpen}
          onClose={handleCloseAppModal}
          integration={selectedIntegration}
          isConnected={!!userIntegrations?.find((ui) => ui.appSlug === selectedIntegration.appSlug)}
          userIntegration={userIntegrations?.find(
            (ui) => ui.appSlug === selectedIntegration.appSlug,
          )}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      )}
      {selectedTool && (
        <ToolDetailsModal
          isOpen={isToolModalOpen}
          onClose={handleCloseToolModal}
          tool={selectedTool}
        />
      )}
    </>
  );
};

export default MCPServerIcons;
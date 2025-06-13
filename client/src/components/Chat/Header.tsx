import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getConfigDefaults, PermissionTypes, Permissions, EModelEndpoint } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { PresetsMenu, HeaderNewChat, OpenSidebar, IntegrationsButton } from './Menus';
import { useGetStartupConfig, useGetEndpointsQuery } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import { useMediaQuery, useHasAccess, useEndpoints } from '~/hooks';
import { useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import BookmarkMenu from './Menus/BookmarkMenu';
import { TemporaryChat } from './TemporaryChat';
import AddMultiConvo from './AddMultiConvo';
import HeaderAgentSelect from './HeaderAgentSelect';
import { mapEndpoints } from '~/utils';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const agentsMap = useAgentsMapContext();
  const assistantsMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });
  
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const { mappedEndpoints } = useEndpoints({
    agentsMap,
    assistantsMap,
    startupConfig,
    endpointsConfig,
  });

  // Check if only agents are available
  const onlyAgentsAvailable = useMemo(() => {
    if (!interfaceConfig.modelSelect || !hasAgentAccess) {
      return false;
    }
    
    const availableEndpoints = mappedEndpoints.filter(endpoint => endpoint.hasModels);
    return availableEndpoints.length === 1 && availableEndpoints[0]?.value === EModelEndpoint.agents;
  }, [interfaceConfig.modelSelect, hasAgentAccess, mappedEndpoints]);

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-surface-primary p-2 font-semibold text-text-primary dark:bg-surface-primary">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center gap-2">
          {!navVisible && <OpenSidebar setNavVisible={setNavVisible} />}
          {!navVisible && <HeaderNewChat />}
          <IntegrationsButton />
          {onlyAgentsAvailable ? (
            <HeaderAgentSelect />
          ) : (
            <ModelSelector startupConfig={startupConfig} />
          )}
          {interfaceConfig.presets === true && interfaceConfig.modelSelect && <PresetsMenu />}
          {hasAccessToBookmarks === true && <BookmarkMenu />}
          {hasAccessToMultiConvo === true && <AddMultiConvo />}
          {isSmallScreen && (
            <>
              <ExportAndShareMenu
                isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
              />
              <TemporaryChat />
            </>
          )}
        </div>
        {!isSmallScreen && (
          <div className="flex items-center gap-2">
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
            <TemporaryChat />
          </div>
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}

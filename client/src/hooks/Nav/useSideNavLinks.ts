import { useMemo } from 'react';
import { MessageSquareQuote, ArrowRightToLine, Settings2, Bookmark, Calendar, Workflow } from 'lucide-react';
import {
  isAssistantsEndpoint,
  isAgentsEndpoint,
  PermissionTypes,
  isParamEndpoint,
  EModelEndpoint,
  Permissions,
} from 'librechat-data-provider';
import type { TInterfaceConfig, TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import SchedulesPanel from '~/components/SidePanel/Schedules/SchedulesPanel';
import WorkflowsPanel from '~/components/SidePanel/Workflows/WorkflowsPanel';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
import PromptsAccordion from '~/components/Prompts/PromptsAccordion';
import Parameters from '~/components/SidePanel/Parameters/Panel';
import FilesPanel from '~/components/SidePanel/Files/Panel';
import { Blocks, AttachmentIcon } from '~/components/svg';
import { useHasAccess } from '~/hooks';

export default function useSideNavLinks({
  hidePanel,
  keyProvided,
  endpoint,
  endpointType,
  interfaceConfig,
  endpointsConfig,
}: {
  hidePanel: () => void;
  keyProvided: boolean;
  endpoint?: EModelEndpoint | null;
  endpointType?: EModelEndpoint | null;
  interfaceConfig: Partial<TInterfaceConfig>;
  endpointsConfig: TEndpointsConfig;
}) {
  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToSchedules = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.USE,
  });
  const hasAccessToWorkflows = useHasAccess({
    permissionType: PermissionTypes.WORKFLOWS,
    permission: Permissions.USE,
  });
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccessToCreateAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.CREATE,
  });

  const Links = useMemo(() => {
    const links: NavLink[] = [];
    if (
      interfaceConfig.assistants !== false &&
      isAssistantsEndpoint(endpoint) &&
      ((endpoint === EModelEndpoint.assistants &&
        endpointsConfig?.[EModelEndpoint.assistants] &&
        endpointsConfig[EModelEndpoint.assistants].disableBuilder !== true) ||
        (endpoint === EModelEndpoint.azureAssistants &&
          endpointsConfig?.[EModelEndpoint.azureAssistants] &&
          endpointsConfig[EModelEndpoint.azureAssistants].disableBuilder !== true)) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_assistant_builder',
        label: '',
        icon: Blocks,
        id: 'assistants',
        Component: PanelSwitch,
      });
    }

    if (
      endpointsConfig?.[EModelEndpoint.agents] &&
      hasAccessToAgents &&
      hasAccessToCreateAgents &&
      endpointsConfig[EModelEndpoint.agents].disableBuilder !== true
    ) {
      links.push({
        title: 'com_sidepanel_agent_builder',
        label: '',
        icon: Blocks,
        id: 'agents',
        Component: AgentPanelSwitch,
      });
    }

    if (hasAccessToPrompts) {
      links.push({
        title: 'com_ui_prompts',
        label: '',
        icon: MessageSquareQuote,
        id: 'prompts',
        Component: PromptsAccordion,
      });
    }

    if (
      interfaceConfig.parameters === true &&
      isParamEndpoint(endpoint ?? '', endpointType ?? '') === true &&
      !isAgentsEndpoint(endpoint) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_parameters',
        label: '',
        icon: Settings2,
        id: 'parameters',
        Component: Parameters,
      });
    }

    if (interfaceConfig.files !== false) {
      links.push({
        title: 'com_sidepanel_attach_files',
        label: '',
        icon: AttachmentIcon,
        id: 'files',
        Component: FilesPanel,
      });
    }

    if (hasAccessToBookmarks) {
      links.push({
        title: 'com_sidepanel_conversation_tags',
        label: '',
        icon: Bookmark,
        id: 'bookmarks',
        Component: BookmarkPanel,
      });
    }

    if (interfaceConfig.schedules === true && hasAccessToSchedules) {
      links.push({
        title: 'com_ui_schedules',
        label: '',
        icon: Calendar,
        id: 'schedules',
        Component: SchedulesPanel,
      });
    }

    if (interfaceConfig.workflows === true && hasAccessToWorkflows) {
      links.push({
        title: 'com_ui_workflows',
        label: '',
        icon: Workflow,
        id: 'workflows',
        Component: WorkflowsPanel,
      });
    }

    // Show hide panel button by default (when hidePanel is undefined/true)
    // Hide it only when explicitly set to false
    if (interfaceConfig.hidePanel !== false) {
      links.push({
        title: 'com_sidepanel_hide_panel',
        label: '',
        icon: ArrowRightToLine,
        onClick: hidePanel,
        id: 'hide-panel',
      });
    }

    return links;
  }, [
    endpointsConfig,
    interfaceConfig.parameters,
    interfaceConfig.schedules,
    interfaceConfig.workflows,
    interfaceConfig.hidePanel,
    interfaceConfig.files,
    keyProvided,
    endpointType,
    endpoint,
    hasAccessToAgents,
    hasAccessToPrompts,
    hasAccessToBookmarks,
    hasAccessToSchedules,
    hasAccessToWorkflows,
    hasAccessToCreateAgents,
    hidePanel,
  ]);

  return Links;
}

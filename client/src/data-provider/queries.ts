import {
  QueryKeys,
  dataService,
  EModelEndpoint,
  defaultOrderQuery,
  defaultAssistantsVersion,
} from 'librechat-data-provider';
import { useQuery, useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  InfiniteData,
  UseInfiniteQueryOptions,
  QueryObserverResult,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import type {
  Action,
  TPreset,
  ConversationListResponse,
  ConversationListParams,
  MessagesListParams,
  MessagesListResponse,
  Assistant,
  AssistantListParams,
  AssistantListResponse,
  AssistantDocument,
  TEndpointsConfig,
  TCheckUserKeyResponse,
  SharedLinksListParams,
  SharedLinksResponse,
  TSchedulerTask,
} from 'librechat-data-provider';
import type { ConversationCursorData } from '~/utils/convos';
import { findConversationInInfinite } from '~/utils';

export const useGetPresetsQuery = (
  config?: UseQueryOptions<TPreset[]>,
): QueryObserverResult<TPreset[], unknown> => {
  return useQuery<TPreset[]>([QueryKeys.presets], () => dataService.getPresets(), {
    staleTime: 1000 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetEndpointsConfigOverride = <TData = unknown | boolean>(
  config?: UseQueryOptions<unknown | boolean, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<unknown | boolean, unknown, TData>(
    [QueryKeys.endpointsConfigOverride],
    () => dataService.getEndpointsConfigOverride(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetConvoIdQuery = (
  id: string,
  config?: UseQueryOptions<t.TConversation>,
): QueryObserverResult<t.TConversation> => {
  const queryClient = useQueryClient();

  return useQuery<t.TConversation>(
    [QueryKeys.conversation, id],
    () => {
      // Try to find in all fetched infinite pages
      const convosQuery = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(
        [QueryKeys.allConversations],
        { exact: false },
      );
      const found = findConversationInInfinite(convosQuery, id);

      if (found && found.messages != null) {
        return found;
      }
      // Otherwise, fetch from API
      return dataService.getConversationById(id);
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useConversationsInfiniteQuery = (
  params: ConversationListParams,
  config?: UseInfiniteQueryOptions<ConversationListResponse, unknown>,
) => {
  const { isArchived, sortBy, sortDirection, tags, search } = params;

  return useInfiniteQuery<ConversationListResponse>({
    queryKey: [
      isArchived ? QueryKeys.archivedConversations : QueryKeys.allConversations,
      { isArchived, sortBy, sortDirection, tags, search },
    ],
    queryFn: ({ pageParam }) =>
      dataService.listConversations({
        isArchived,
        sortBy,
        sortDirection,
        tags,
        search,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useMessagesInfiniteQuery = (
  params: MessagesListParams,
  config?: UseInfiniteQueryOptions<MessagesListResponse, unknown>,
) => {
  const { sortBy, sortDirection, pageSize, conversationId, messageId, search } = params;

  return useInfiniteQuery<MessagesListResponse>({
    queryKey: [
      QueryKeys.messages,
      { sortBy, sortDirection, pageSize, conversationId, messageId, search },
    ],
    queryFn: ({ pageParam }) =>
      dataService.listMessages({
        sortBy,
        sortDirection,
        pageSize,
        conversationId,
        messageId,
        search,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useSharedLinksQuery = (
  params: SharedLinksListParams,
  config?: UseInfiniteQueryOptions<SharedLinksResponse, unknown>,
) => {
  const { pageSize, isPublic, search, sortBy, sortDirection } = params;

  return useInfiniteQuery<SharedLinksResponse>({
    queryKey: [QueryKeys.sharedLinks, { pageSize, isPublic, search, sortBy, sortDirection }],
    queryFn: ({ pageParam }) =>
      dataService.listSharedLinks({
        cursor: pageParam?.toString(),
        pageSize,
        isPublic,
        search,
        sortBy,
        sortDirection,
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useConversationTagsQuery = (
  config?: UseQueryOptions<t.TConversationTagsResponse>,
): QueryObserverResult<t.TConversationTagsResponse> => {
  return useQuery<t.TConversationTag[]>(
    [QueryKeys.conversationTags],
    () => dataService.getConversationTags(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/**
 * ASSISTANTS
 */

/**
 * Hook for getting all available tools for Assistants
 */
export const useAvailableToolsQuery = <TData = t.TPlugin[]>(
  endpoint: t.AssistantsEndpoint | EModelEndpoint.agents,
  config?: UseQueryOptions<t.TPlugin[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!endpointsConfig?.[endpoint]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version: string | number | undefined =
    endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery<t.TPlugin[], unknown, TData>(
    [QueryKeys.tools],
    () => dataService.getAvailableTools(endpoint, version),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled,
      ...config,
    },
  );
};

/**
 * Hook for listing all assistants, with optional parameters provided for pagination and sorting
 */
export const useListAssistantsQuery = <TData = AssistantListResponse>(
  endpoint: t.AssistantsEndpoint,
  params: Omit<AssistantListParams, 'endpoint'> = defaultOrderQuery,
  config?: UseQueryOptions<AssistantListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!(endpointsConfig?.[endpoint]?.userProvide ?? false);
  const keyProvided = userProvidesKey ? !!(keyExpiry?.expiresAt ?? '') : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery<AssistantListResponse, unknown, TData>(
    [QueryKeys.assistants, endpoint, params],
    () => dataService.listAssistants({ ...params, endpoint }, version),
    {
      // Example selector to sort them by created_at
      // select: (res) => {
      //   return res.data.sort((a, b) => a.created_at - b.created_at);
      // },
      staleTime: 1000 * 5,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/*
export const useListAssistantsInfiniteQuery = (
  params?: AssistantListParams,
  config?: UseInfiniteQueryOptions<AssistantListResponse, Error>,
) => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useInfiniteQuery<AssistantListResponse, Error>(
    ['assistantsList', params],
    ({ pageParam = '' }) => dataService.listAssistants({ ...params, after: pageParam }),
    {
      getNextPageParam: (lastPage) => {
        // lastPage is of type AssistantListResponse, you can use the has_more and last_id from it directly
        if (lastPage.has_more) {
          return lastPage.last_id;
        }
        return undefined;
      },
      ...config,
      enabled: config?.enabled !== undefined ? config?.enabled && enabled : enabled,
    },
  );
};
*/

/**
 * Hook for retrieving details about a single assistant
 */
export const useGetAssistantByIdQuery = (
  endpoint: t.AssistantsEndpoint,
  assistant_id: string,
  config?: UseQueryOptions<Assistant>,
): QueryObserverResult<Assistant> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = endpointsConfig?.[endpoint]?.userProvide ?? false;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery<Assistant>(
    [QueryKeys.assistant, assistant_id],
    () =>
      dataService.getAssistantById({
        endpoint,
        assistant_id,
        version,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      // Query will not execute until the assistant_id exists
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/**
 * Hook for retrieving user's saved Assistant Actions
 */
export const useGetActionsQuery = <TData = Action[]>(
  endpoint: t.AssistantsEndpoint | EModelEndpoint.agents,
  config?: UseQueryOptions<Action[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!endpointsConfig?.[endpoint]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled =
    (!!endpointsConfig?.[endpoint] && keyProvided) || endpoint === EModelEndpoint.agents;

  return useQuery<Action[], unknown, TData>([QueryKeys.actions], () => dataService.getActions(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
  });
};

/**
 * Hook for retrieving user's saved Assistant Documents (metadata saved to Database)
 */
export const useGetAssistantDocsQuery = <TData = AssistantDocument[]>(
  endpoint: t.AssistantsEndpoint | string,
  config?: UseQueryOptions<AssistantDocument[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!(endpointsConfig?.[endpoint]?.userProvide ?? false);
  const keyProvided = userProvidesKey ? !!(keyExpiry?.expiresAt ?? '') : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];

  return useQuery<AssistantDocument[], unknown, TData>(
    [QueryKeys.assistantDocs, endpoint],
    () =>
      dataService.getAssistantDocs({
        endpoint,
        version,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/** STT/TTS */

/* Text to speech voices */
export const useVoicesQuery = (
  config?: UseQueryOptions<t.VoiceResponse>,
): QueryObserverResult<t.VoiceResponse> => {
  return useQuery<t.VoiceResponse>([QueryKeys.voices], () => dataService.getVoices(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

/* Custom config speech */
export const useCustomConfigSpeechQuery = (
  config?: UseQueryOptions<t.TCustomConfigSpeechResponse>,
): QueryObserverResult<t.TCustomConfigSpeechResponse> => {
  return useQuery<t.TCustomConfigSpeechResponse>(
    [QueryKeys.customConfigSpeech],
    () => dataService.getCustomConfigSpeech(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/** Prompt */

export const usePromptGroupsInfiniteQuery = (
  params?: t.TPromptGroupsWithFilterRequest,
  config?: UseInfiniteQueryOptions<t.PromptGroupListResponse, unknown>,
) => {
  const { name, pageSize, category, ...rest } = params || {};
  return useInfiniteQuery<t.PromptGroupListResponse, unknown>(
    [QueryKeys.promptGroups, name, category, pageSize],
    ({ pageParam = '1' }) =>
      dataService.getPromptGroups({
        ...rest,
        name,
        category: category || '',
        pageNumber: pageParam?.toString(),
        pageSize: (pageSize || 10).toString(),
      }),
    {
      getNextPageParam: (lastPage) => {
        const currentPageNumber = Number(lastPage.pageNumber);
        const totalPages = Number(lastPage.pages);
        return currentPageNumber < totalPages ? currentPageNumber + 1 : undefined;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetPromptGroup = (
  id: string,
  config?: UseQueryOptions<t.TPromptGroup>,
): QueryObserverResult<t.TPromptGroup> => {
  return useQuery<t.TPromptGroup>(
    [QueryKeys.promptGroup, id],
    () => dataService.getPromptGroup(id),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useGetPrompts = (
  filter: t.TPromptsWithFilterRequest,
  config?: UseQueryOptions<t.TPrompt[]>,
): QueryObserverResult<t.TPrompt[]> => {
  return useQuery<t.TPrompt[]>(
    [QueryKeys.prompts, filter.groupId ?? ''],
    () => dataService.getPrompts(filter),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useGetAllPromptGroups = <TData = t.AllPromptGroupsResponse>(
  filter?: t.AllPromptGroupsFilterRequest,
  config?: UseQueryOptions<t.AllPromptGroupsResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.AllPromptGroupsResponse, unknown, TData>(
    [QueryKeys.allPromptGroups],
    () => dataService.getAllPromptGroups(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

export const useGetCategories = <TData = t.TGetCategoriesResponse>(
  config?: UseQueryOptions<t.TGetCategoriesResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.TGetCategoriesResponse, unknown, TData>(
    [QueryKeys.categories],
    () => dataService.getCategories(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useGetRandomPrompts = (
  filter: t.TGetRandomPromptsRequest,
  config?: UseQueryOptions<t.TGetRandomPromptsResponse>,
): QueryObserverResult<t.TGetRandomPromptsResponse> => {
  return useQuery<t.TGetRandomPromptsResponse>(
    [QueryKeys.randomPrompts],
    () => dataService.getRandomPrompts(filter),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useUserTermsQuery = (
  config?: UseQueryOptions<t.TUserTermsResponse>,
): QueryObserverResult<t.TUserTermsResponse> => {
  return useQuery<t.TUserTermsResponse>(
    [QueryKeys.userTerms],
    () => dataService.getUserTerms(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/* Integrations */

export const useIntegrationsStatusQuery = (
  config?: UseQueryOptions<t.TIntegrationsStatusResponse>,
): QueryObserverResult<t.TIntegrationsStatusResponse> => {
  return useQuery<t.TIntegrationsStatusResponse>(
    [QueryKeys.integrationsStatus],
    () => dataService.getIntegrationsStatus(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useAvailableIntegrationsQuery = (
  config?: UseQueryOptions<t.TAvailableIntegration[]>,
): QueryObserverResult<t.TAvailableIntegration[]> => {
  return useQuery<t.TAvailableIntegration[]>(
    [QueryKeys.availableIntegrations],
    () => dataService.getAvailableIntegrations(),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useUserIntegrationsQuery = (
  config?: UseQueryOptions<t.TUserIntegration[]>,
): QueryObserverResult<t.TUserIntegration[]> => {
  return useQuery<t.TUserIntegration[]>(
    [QueryKeys.userIntegrations],
    () => dataService.getUserIntegrations(),
    {
      staleTime: 2 * 60 * 1000, // 2 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useMCPConfigQuery = (
  config?: UseQueryOptions<t.TMCPConfigResponse>,
): QueryObserverResult<t.TMCPConfigResponse> => {
  return useQuery<t.TMCPConfigResponse>(
    [QueryKeys.mcpConfig],
    () => dataService.getMCPConfig(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useAppDetailsQuery = (
  appSlug: string,
  config?: UseQueryOptions<t.TAppDetails>,
): QueryObserverResult<t.TAppDetails> => {
  return useQuery<t.TAppDetails>(
    [QueryKeys.appDetails, appSlug],
    () => dataService.getAppDetails(appSlug),
    {
      enabled: !!appSlug,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      select: (data: any) => data.data,
      ...config,
    },
  );
};

export const useAppComponentsQuery = (
  appSlug: string,
  type?: string,
  config?: UseQueryOptions<t.TAppComponents>,
): QueryObserverResult<t.TAppComponents> => {
  return useQuery<t.TAppComponents>(
    [QueryKeys.appComponents, appSlug, type],
    () => dataService.getAppComponents(appSlug, type),
    {
      enabled: !!appSlug,
      staleTime: 10 * 60 * 1000, // 10 minutes - longer than user integrations since components change less frequently
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      select: (data: any) => data.data,
      ...config,
    },
  );
};

// Scheduler Tasks
export const useSchedulerTasksQuery = (
  type?: 'task' | 'workflow',
  options?: UseQueryOptions<t.TSchedulerTask[]>
) =>
  useQuery<t.TSchedulerTask[]>({
    queryKey: [QueryKeys.schedulerTasks, type],
    queryFn: () => dataService.getSchedulerTasks(type),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

export const useSchedulerTaskQuery = (
  taskId: string,
  options?: UseQueryOptions<t.TSchedulerTask>
) =>
  useQuery<t.TSchedulerTask>({
    queryKey: [QueryKeys.schedulerTask, taskId],
    queryFn: () => dataService.getSchedulerTask(taskId),
    enabled: !!taskId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

export const useUpdateSchedulerTaskMutation = (
  options?: UseMutationOptions<t.TSchedulerTask, unknown, { taskId: string; data: Partial<t.TSchedulerTask> }>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<t.TSchedulerTask> }) =>
      dataService.updateSchedulerTask(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.schedulerTasks] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.schedulerTask] });
    },
    ...options,
  });
};

export const useDeleteSchedulerTaskMutation = (
  options?: UseMutationOptions<void, unknown, string>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => dataService.deleteSchedulerTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.schedulerTasks] });
    },
    ...options,
  });
};

export const useToggleSchedulerTaskMutation = (
  options?: UseMutationOptions<t.TSchedulerTask, unknown, { taskId: string; enabled: boolean }>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, enabled }: { taskId: string; enabled: boolean }) =>
      dataService.toggleSchedulerTask(taskId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.schedulerTasks] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.schedulerTask] });
    },
    ...options,
  });
};

// Scheduler Executions
export const useSchedulerExecutionsQuery = (
  taskId?: string,
  options?: UseQueryOptions<t.TSchedulerExecution[]>
) =>
  useQuery<t.TSchedulerExecution[]>({
    queryKey: [QueryKeys.schedulerExecutions, taskId],
    queryFn: () => dataService.getSchedulerExecutions(taskId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

export const useSchedulerExecutionQuery = (
  executionId: string,
  options?: UseQueryOptions<t.TSchedulerExecution>
) =>
  useQuery<t.TSchedulerExecution>({
    queryKey: [QueryKeys.schedulerExecution, executionId],
    queryFn: () => dataService.getSchedulerExecution(executionId),
    enabled: !!executionId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

// Workflows
export const useWorkflowsQuery = (options?: UseQueryOptions<t.TUserWorkflow[]>) =>
  useQuery<t.TUserWorkflow[]>({
    queryKey: [QueryKeys.workflows],
    queryFn: () => dataService.getWorkflows(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

export const useWorkflowQuery = (
  workflowId: string,
  options?: UseQueryOptions<t.TUserWorkflow>
) =>
  useQuery<t.TUserWorkflow>({
    queryKey: [QueryKeys.workflow, workflowId],
    queryFn: () => dataService.getWorkflow(workflowId),
    enabled: !!workflowId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

export const useCreateWorkflowMutation = (
  options?: UseMutationOptions<t.TUserWorkflow, unknown, Partial<t.TUserWorkflow>>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<t.TUserWorkflow>) => dataService.createWorkflow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflows] });
    },
    ...options,
  });
};

export const useUpdateWorkflowMutation = (
  options?: UseMutationOptions<t.TUserWorkflow, unknown, { workflowId: string; data: Partial<t.TUserWorkflow> }>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, data }: { workflowId: string; data: Partial<t.TUserWorkflow> }) =>
      dataService.updateWorkflow(workflowId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflows] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflow] });
    },
    ...options,
  });
};

export const useDeleteWorkflowMutation = (
  options?: UseMutationOptions<void, unknown, string>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => dataService.deleteWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflows] });
    },
    ...options,
  });
};

export const useToggleWorkflowMutation = (
  options?: UseMutationOptions<t.TUserWorkflow, unknown, { workflowId: string; isActive: boolean }>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, isActive }: { workflowId: string; isActive: boolean }) =>
      dataService.toggleWorkflow(workflowId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflows] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflow] });
    },
    ...options,
  });
};

export const useTestWorkflowMutation = (
  options?: UseMutationOptions<t.TWorkflowExecution, unknown, string>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => dataService.testWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflowExecutions] });
    },
    ...options,
  });
};

export const useStopWorkflowMutation = (
  options?: UseMutationOptions<void, unknown, string>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => dataService.stopWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.workflowExecutions] });
    },
    ...options,
  });
};

export const useWorkflowExecutionsQuery = (
  workflowId: string,
  options?: UseQueryOptions<t.TWorkflowExecution[]>
) =>
  useQuery<t.TWorkflowExecution[]>({
    queryKey: [QueryKeys.workflowExecutions, workflowId],
    queryFn: () => dataService.getWorkflowExecutions(workflowId),
    enabled: !!workflowId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

export const useWorkflowExecutionQuery = (
  workflowId: string,
  executionId: string,
  options?: UseQueryOptions<t.TWorkflowExecution>
) =>
  useQuery<t.TWorkflowExecution>({
    queryKey: [QueryKeys.workflowExecution, workflowId, executionId],
    queryFn: () => dataService.getWorkflowExecution(workflowId, executionId),
    enabled: !!workflowId && !!executionId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...options,
  });

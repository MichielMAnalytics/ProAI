import { useQuery } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useVerifyAgentToolAuth = (
  params: t.VerifyToolAuthParams,
  config?: UseQueryOptions<t.VerifyToolAuthResponse>,
): QueryObserverResult<t.VerifyToolAuthResponse> => {
  return useQuery<t.VerifyToolAuthResponse>(
    [QueryKeys.toolAuth, params.toolId],
    () => dataService.getVerifyAgentToolAuth(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetToolCalls = <TData = t.ToolCallResults>(
  params: t.GetToolCallParams,
  config?: UseQueryOptions<t.ToolCallResults, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const { conversationId = '' } = params;
  return useQuery<t.ToolCallResults, unknown, TData>(
    [QueryKeys.toolCalls, conversationId],
    () => dataService.getToolCalls(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled:
        conversationId.length > 0 &&
        conversationId !== Constants.NEW_CONVO &&
        conversationId !== Constants.PENDING_CONVO &&
        conversationId !== Constants.SEARCH,
      ...config,
    },
  );
};

export const useUserMCPStatusQuery = (
  config?: UseQueryOptions<{ enabled: boolean; hasUserMCPServers: boolean; userId: string }>,
): QueryObserverResult<{ enabled: boolean; hasUserMCPServers: boolean; userId: string }> => {
  return useQuery<{ enabled: boolean; hasUserMCPServers: boolean; userId: string }>(
    [QueryKeys.userMCPStatus],
    () => dataService.getUserMCPStatus(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      ...config,
    },
  );
};

export const useUserMCPToolsQuery = <TData = t.TPlugin[]>(
  config?: UseQueryOptions<t.TPlugin[], unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.TPlugin[], unknown, TData>(
    [QueryKeys.userMCPTools],
    () => dataService.getUserMCPTools(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 2 * 60 * 1000, // 2 minutes
      ...config,
    },
  );
};

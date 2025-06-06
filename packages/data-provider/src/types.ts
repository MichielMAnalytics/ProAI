import type OpenAI from 'openai';
import type { InfiniteData } from '@tanstack/react-query';
import type {
  TMessage,
  TResPlugin,
  ImageDetail,
  TSharedLink,
  TConversation,
  EModelEndpoint,
  TConversationTag,
  TBanner,
} from './schemas';
import { SettingDefinition } from './generate';
export type TOpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam;

export * from './schemas';

export type TMessages = TMessage[];

/* TODO: Cleanup EndpointOption types */
export type TEndpointOption = {
  spec?: string | null;
  iconURL?: string | null;
  endpoint: EModelEndpoint;
  endpointType?: EModelEndpoint;
  modelDisplayLabel?: string;
  resendFiles?: boolean;
  promptCache?: boolean;
  maxContextTokens?: number;
  imageDetail?: ImageDetail;
  model?: string | null;
  promptPrefix?: string;
  temperature?: number;
  chatGptLabel?: string | null;
  modelLabel?: string | null;
  jailbreak?: boolean;
  key?: string | null;
  /* assistant */
  thread_id?: string;
  /* multi-response stream */
  overrideConvoId?: string;
  overrideUserMessageId?: string;
};

export type TEphemeralAgent = {
  mcp?: string[];
  web_search?: boolean;
  execute_code?: boolean;
  scheduler?: boolean;
  workflow?: boolean;
};

export type TPayload = Partial<TMessage> &
  Partial<TEndpointOption> & {
    isContinued: boolean;
    conversationId: string | null;
    messages?: TMessages;
    isTemporary: boolean;
    ephemeralAgent?: TEphemeralAgent | null;
  };

export type TSubmission = {
  artifacts?: string;
  plugin?: TResPlugin;
  plugins?: TResPlugin[];
  userMessage: TMessage;
  isEdited?: boolean;
  isContinued?: boolean;
  isTemporary: boolean;
  messages: TMessage[];
  isRegenerate?: boolean;
  isResubmission?: boolean;
  initialResponse?: TMessage;
  conversation: Partial<TConversation>;
  endpointOption: TEndpointOption;
  clientTimestamp?: string;
  ephemeralAgent?: TEphemeralAgent | null;
};

export type EventSubmission = Omit<TSubmission, 'initialResponse'> & { initialResponse: TMessage };

export type TPluginAction = {
  pluginKey: string;
  action: 'install' | 'uninstall';
  auth?: Partial<Record<string, string>>;
  isEntityTool?: boolean;
};

export type GroupedConversations = [key: string, TConversation[]][];

export type TUpdateUserPlugins = {
  isEntityTool?: boolean;
  pluginKey: string;
  action: string;
  auth?: Partial<Record<string, string | null>>;
};

// TODO `label` needs to be changed to the proper `TranslationKeys`
export type TCategory = {
  id?: string;
  value: string;
  label: string;
};

export type TError = {
  message: string;
  code?: number | string;
  response?: {
    data?: {
      message?: string;
    };
    status?: number;
  };
};

export type TBackupCode = {
  codeHash: string;
  used: boolean;
  usedAt: Date | null;
};

export type TUser = {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string;
  role: string;
  provider: string;
  timezone?: string; // User's preferred timezone
  plugins?: string[];
  twoFactorEnabled?: boolean;
  backupCodes?: TBackupCode[];
  createdAt: string;
  updatedAt: string;
};

export type TGetConversationsResponse = {
  conversations: TConversation[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
};

export type TUpdateMessageRequest = {
  conversationId: string;
  messageId: string;
  model: string;
  text: string;
};

export type TUpdateMessageContent = {
  conversationId: string;
  messageId: string;
  index: number;
  text: string;
};

export type TUpdateUserKeyRequest = {
  name: string;
  value: string;
  expiresAt: string;
};

export type TUpdateConversationRequest = {
  conversationId: string;
  title: string;
};

export type TUpdateConversationResponse = TConversation;

export type TDeleteConversationRequest = {
  conversationId?: string;
  thread_id?: string;
  endpoint?: string;
  source?: string;
};

export type TDeleteConversationResponse = {
  acknowledged: boolean;
  deletedCount: number;
  messages: {
    acknowledged: boolean;
    deletedCount: number;
  };
};

export type TArchiveConversationRequest = {
  conversationId: string;
  isArchived: boolean;
};

export type TArchiveConversationResponse = TConversation;

export type TSharedMessagesResponse = Omit<TSharedLink, 'messages'> & {
  messages: TMessage[];
};

export type TCreateShareLinkRequest = Pick<TConversation, 'conversationId'>;

export type TUpdateShareLinkRequest = Pick<TSharedLink, 'shareId'>;

export type TSharedLinkResponse = Pick<TSharedLink, 'shareId'> &
  Pick<TConversation, 'conversationId'>;

export type TSharedLinkGetResponse = TSharedLinkResponse & {
  success: boolean;
};

// type for getting conversation tags
export type TConversationTagsResponse = TConversationTag[];
// type for creating conversation tag
export type TConversationTagRequest = Partial<
  Omit<TConversationTag, 'createdAt' | 'updatedAt' | 'count' | 'user'>
> & {
  conversationId?: string;
  addToConversation?: boolean;
};

export type TConversationTagResponse = TConversationTag;

export type TTagConversationRequest = {
  tags: string[];
  tag: string;
};

export type TTagConversationResponse = string[];

export type TDuplicateConvoRequest = {
  conversationId?: string;
};

export type TDuplicateConvoResponse = {
  conversation: TConversation;
  messages: TMessage[];
};

export type TForkConvoRequest = {
  messageId: string;
  conversationId: string;
  option?: string;
  splitAtTarget?: boolean;
  latestMessageId?: string;
};

export type TForkConvoResponse = {
  conversation: TConversation;
  messages: TMessage[];
};

export type TSearchResults = {
  conversations: TConversation[];
  messages: TMessage[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
  filter: object;
};

export type TConfig = {
  order: number;
  type?: EModelEndpoint;
  azure?: boolean;
  availableTools?: [];
  availableRegions?: string[];
  plugins?: Record<string, string>;
  name?: string;
  iconURL?: string;
  version?: string;
  modelDisplayLabel?: string;
  userProvide?: boolean | null;
  userProvideURL?: boolean | null;
  disableBuilder?: boolean;
  retrievalModels?: string[];
  capabilities?: string[];
  customParams?: {
    defaultParamsEndpoint?: string;
    paramDefinitions?: SettingDefinition[];
  };
};

export type TEndpointsConfig =
  | Record<EModelEndpoint | string, TConfig | null | undefined>
  | undefined;

export type TModelsConfig = Record<string, string[]>;

export type TUpdateTokenCountResponse = {
  count: number;
};

export type TMessageTreeNode = object;

export type TSearchMessage = object;

export type TSearchMessageTreeNode = object;

export type TRegisterUserResponse = {
  message: string;
};

export type TRegisterUser = {
  name: string;
  email: string;
  username: string;
  password: string;
  confirm_password?: string;
  token?: string;
};

export type TLoginUser = {
  email: string;
  password: string;
  token?: string;
  backupCode?: string;
};

export type TLoginResponse = {
  token?: string;
  user?: TUser;
  twoFAPending?: boolean;
  tempToken?: string;
};

export type TEnable2FAResponse = {
  otpauthUrl: string;
  backupCodes: string[];
  message?: string;
};

export type TVerify2FARequest = {
  token?: string;
  backupCode?: string;
};

export type TVerify2FAResponse = {
  message: string;
};

/**
 * For verifying 2FA during login with a temporary token.
 */
export type TVerify2FATempRequest = {
  tempToken: string;
  token?: string;
  backupCode?: string;
};

export type TVerify2FATempResponse = {
  token?: string;
  user?: TUser;
  message?: string;
};

/**
 * Response from disabling 2FA.
 */
export type TDisable2FAResponse = {
  message: string;
};

/**
 * Response from regenerating backup codes.
 */
export type TRegenerateBackupCodesResponse = {
  message: string;
  backupCodes: string[];
  backupCodesHash: string[];
};

export type TRequestPasswordReset = {
  email: string;
};

export type TResetPassword = {
  userId: string;
  token: string;
  password: string;
  confirm_password?: string;
};

export type VerifyEmailResponse = { message: string };

export type TVerifyEmail = {
  email: string;
  token: string;
};

export type TResendVerificationEmail = Omit<TVerifyEmail, 'token'>;

export type TRefreshTokenResponse = {
  token: string;
  user: TUser;
};

export type TCheckUserKeyResponse = {
  expiresAt: string;
};

export type TRequestPasswordResetResponse = {
  link?: string;
  message?: string;
};

/**
 * Represents the response from the import endpoint.
 */
export type TImportResponse = {
  /**
   * The message associated with the response.
   */
  message: string;
};

/** Prompts */

export type TPrompt = {
  groupId: string;
  author: string;
  prompt: string;
  type: 'text' | 'chat';
  createdAt: string;
  updatedAt: string;
  _id?: string;
};

export type TPromptGroup = {
  name: string;
  numberOfGenerations?: number;
  command?: string;
  oneliner?: string;
  category?: string;
  projectIds?: string[];
  productionId?: string | null;
  productionPrompt?: Pick<TPrompt, 'prompt'> | null;
  author: string;
  authorName: string;
  createdAt?: Date;
  updatedAt?: Date;
  _id?: string;
};

export type TCreatePrompt = {
  prompt: Pick<TPrompt, 'prompt' | 'type'> & { groupId?: string };
  group?: { name: string; category?: string; oneliner?: string; command?: string };
};

export type TCreatePromptRecord = TCreatePrompt & Pick<TPromptGroup, 'author' | 'authorName'>;

export type TPromptsWithFilterRequest = {
  groupId: string;
  tags?: string[];
  projectId?: string;
  version?: number;
};

export type TPromptGroupsWithFilterRequest = {
  category: string;
  pageNumber: string;
  pageSize: string | number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  name?: string;
  author?: string;
};

export type PromptGroupListResponse = {
  promptGroups: TPromptGroup[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
};

export type PromptGroupListData = InfiniteData<PromptGroupListResponse>;

export type TCreatePromptResponse = {
  prompt: TPrompt;
  group?: TPromptGroup;
};

export type TUpdatePromptGroupPayload = Partial<TPromptGroup> & {
  removeProjectIds?: string[];
};

export type TUpdatePromptGroupVariables = {
  id: string;
  payload: TUpdatePromptGroupPayload;
};

export type TUpdatePromptGroupResponse = TPromptGroup;

export type TDeletePromptResponse = {
  prompt: string;
  promptGroup?: { message: string; id: string };
};

export type TDeletePromptVariables = {
  _id: string;
  groupId: string;
};

export type TMakePromptProductionResponse = {
  message: string;
};

export type TMakePromptProductionRequest = {
  id: string;
  groupId: string;
  productionPrompt: Pick<TPrompt, 'prompt'>;
};

export type TUpdatePromptLabelsRequest = {
  id: string;
  payload: {
    labels: string[];
  };
};

export type TUpdatePromptLabelsResponse = {
  message: string;
};

export type TDeletePromptGroupResponse = TUpdatePromptLabelsResponse;

export type TDeletePromptGroupRequest = {
  id: string;
};

export type TGetCategoriesResponse = TCategory[];

export type TGetRandomPromptsResponse = {
  prompts: TPromptGroup[];
};

export type TGetRandomPromptsRequest = {
  limit: number;
  skip: number;
};

export type TCustomConfigSpeechResponse = { [key: string]: string };

export type TUserTermsResponse = {
  termsAccepted: boolean;
};

export type TAcceptTermsResponse = {
  success: boolean;
};

export type TBannerResponse = TBanner | null;

/* Integrations */

export type TIntegrationsStatusResponse = {
  enabled: boolean;
  service: string;
  version: string;
};

export type TAvailableIntegration = {
  _id?: string;
  appSlug: string;
  appName: string;
  appDescription?: string;
  appIcon?: string;
  appCategories?: string[];
  appUrl?: string;
  pipedreamAppId?: string;
  authType?: 'oauth' | 'api_key' | 'basic' | 'none';
  isActive: boolean;
  mcpServerTemplate?: {
    serverName: string;
    type: 'sse' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    timeout?: number;
    iconPath?: string;
  };
  popularity?: number;
  lastUpdated?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TUserIntegration = {
  _id?: string;
  userId: string;
  pipedreamAccountId: string;
  pipedreamProjectId: string;
  appSlug: string;
  appName: string;
  appDescription?: string;
  appIcon?: string;
  appCategories?: string[];
  isActive: boolean;
  credentials?: {
    authProvisionId: string;
  };
  mcpServerConfig?: {
    serverName: string;
    type: 'sse' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    timeout?: number;
    iconPath?: string;
  };
  lastConnectedAt?: Date;
  lastUsedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TCreateConnectTokenRequest = {
  app?: string;
  redirect_url?: string;
};

export type TCreateConnectTokenResponse = {
  success: boolean;
  data: {
  token: string;
  expires_at: string;
  connect_link_url: string;
  };
};

export type TIntegrationCallbackRequest = {
  account_id: string;
  external_user_id: string;
  app?: string;
};

export type TIntegrationCallbackResponse = {
  success: boolean;
  message: string;
  data: TUserIntegration;
};

export type TDeleteIntegrationResponse = {
  success: boolean;
  message: string;
  data: TUserIntegration;
};

export type TMCPConfigResponse = {
  [serverName: string]: {
    type: 'sse' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    timeout?: number;
  };
};

// App Details and Components Types
export type TAppDetails = {
  id: string;
  name_slug: string;
  name: string;
  auth_type: 'oauth' | 'api_key' | 'basic' | 'none';
  description?: string;
  img_src?: string;
  categories?: string[];
  isConnectable: boolean;
  hasActions: boolean;
  hasTriggers: boolean;
};

export type TComponentProp = {
  name: string;
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ label: string; value: unknown }>;
};

export type TAppComponent = {
  name: string;
  version: string;
  key: string;
  description?: string;
  configurable_props?: TComponentProp[];
  type?: 'action' | 'trigger';
};

export type TAppComponents = {
  actions: TAppComponent[];
  triggers: TAppComponent[];
};

export type TConfigureComponentRequest = {
  componentId: string;
  propName: string;
  configuredProps?: Record<string, unknown>;
  dynamicPropsId?: string;
};

export type TConfigureComponentResponse = {
  props: TComponentProp[];
  dynamicPropsId?: string;
};

export type TRunActionRequest = {
  componentId: string;
  configuredProps?: Record<string, unknown>;
  dynamicPropsId?: string;
};

export type TRunActionResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type TDeployTriggerRequest = {
  componentId: string;
  configuredProps?: Record<string, unknown>;
  webhookUrl?: string;
  workflowId?: string;
  dynamicPropsId?: string;
};

export type TDeployTriggerResponse = {
  id: string;
  name: string;
  owner_id: string;
  webhook_url?: string;
  workflow_id?: string;
};

// Scheduler Task types
export type TSchedulerTask = {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  do_only_once: boolean;
  last_run?: Date | { $date: string };
  next_run?: Date | { $date: string };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'disabled';
  user: string;
  conversation_id?: string;
  parent_message_id?: string;
  endpoint?: string;
  ai_model?: string;
  agent_id?: string;
  createdAt?: Date | { $date: string };
  updatedAt?: Date | { $date: string };
};

export type TWorkflowStep = {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'delay' | 'mcp_tool';
  config: {
    toolName?: string;
    parameters?: Record<string, unknown>;
    condition?: string;
    delayMs?: number;
    pipedreamAction?: {
      componentId: string;
      appSlug: string;
      config: Record<string, unknown>;
    };
  };
  onSuccess?: string; // Next step ID
  onFailure?: string; // Next step ID
  position: { x: number; y: number };
};

export type TWorkflowTrigger = {
  type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event';
  config: {
    schedule?: string; // Cron expression
    webhookUrl?: string;
    emailAddress?: string;
    eventType?: string;
    parameters?: Record<string, unknown>;
  };
};

export type TUserWorkflow = {
  id: string;
  name: string;
  description?: string;
  trigger: TWorkflowTrigger;
  steps: TWorkflowStep[];
  isActive: boolean;
  isDraft: boolean;
  user: string;
  conversation_id?: string;
  parent_message_id?: string;
  endpoint?: string;
  ai_model?: string;
  agent_id?: string;
  // Execution tracking - can be Date objects or MongoDB date format
  last_run?: Date | { $date: string };
  next_run?: Date | { $date: string };
  run_count?: number;
  success_count?: number;
  failure_count?: number;
  // Version control
  version: number;
  created_from_agent?: boolean;
  // UI state
  artifact_identifier?: string;
  createdAt?: Date | { $date: string };
  updatedAt?: Date | { $date: string };
};

export type TWorkflowStepExecution = {
  stepId: string;
  stepName: string;
  stepType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: Date;
  endTime?: Date;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  retryCount: number;
};

export type TWorkflowExecution = {
  id: string;
  workflowId: string;
  workflowName: string;
  trigger: {
    type: string;
    source: string;
    data?: Record<string, unknown>;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  stepExecutions: TWorkflowStepExecution[];
  currentStepId?: string;
  context: Record<string, unknown>; // Data passed between steps
  error?: string;
  user: string;
  createdAt?: Date;
  updatedAt?: Date;
};

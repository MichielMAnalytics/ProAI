import { HttpsProxyAgent } from 'https-proxy-agent';
import { KnownEndpoints } from 'librechat-data-provider';
import type * as t from '~/types';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { isEnabled } from '~/utils/common';

export const knownOpenAIParams = new Set([
  // Constructor/Instance Parameters
  'model',
  'modelName',
  'temperature',
  'topP',
  'frequencyPenalty',
  'presencePenalty',
  'n',
  'logitBias',
  'stop',
  'stopSequences',
  'user',
  'timeout',
  'stream',
  'maxTokens',
  'maxCompletionTokens',
  'logprobs',
  'topLogprobs',
  'apiKey',
  'organization',
  'audio',
  'modalities',
  'reasoning',
  'zdrEnabled',
  'service_tier',
  'supportsStrictToolCalling',
  'useResponsesApi',
  'configuration',
  // Call-time Options
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'response_format',
  'seed',
  'stream_options',
  'parallel_tool_calls',
  'strict',
  'prediction',
  'promptIndex',
  // Responses API specific
  'text',
  'truncation',
  'include',
  'previous_response_id',
  // LangChain specific
  '__includeRawResponse',
  'maxConcurrency',
  'maxRetries',
  'verbose',
  'streaming',
  'streamUsage',
  'disableStreaming',
]);

function hasReasoningParams({
  reasoning_effort,
  reasoning_summary,
}: {
  reasoning_effort?: string | null;
  reasoning_summary?: string | null;
}): boolean {
  return (
    (reasoning_effort != null && reasoning_effort !== '') ||
    (reasoning_summary != null && reasoning_summary !== '')
  );
}
/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param apiKey - The API key for authentication.
 * @param options - Additional options for configuring the LLM.
 * @param endpoint - The endpoint name
 * @returns Configuration options for creating an LLM instance.
 */
export function getOpenAIConfig(
  apiKey: string,
  options: t.LLMConfigOptions = {},
  endpoint?: string | null,
): t.LLMConfigResult {
  const {
    modelOptions = {},
    reverseProxyUrl,
    defaultQuery,
    headers,
    proxy,
    azure,
    streaming = true,
    addParams,
    dropParams,
  } = options;
  const { reasoning_effort, reasoning_summary, verbosity, ...modelOptions } = _modelOptions;
  const llmConfig: Partial<t.ClientOptions> &
    Partial<t.OpenAIParameters> &
    Partial<AzureOpenAIInput> = Object.assign(
    {
      streaming,
      model: modelOptions.model ?? '',
    },
    modelOptions,
  );

  const modelKwargs: Record<string, unknown> = {};
  let hasModelKwargs = false;

  if (verbosity != null && verbosity !== '') {
    modelKwargs.verbosity = verbosity;
    hasModelKwargs = true;
  }

  if (addParams && typeof addParams === 'object') {
    for (const [key, value] of Object.entries(addParams)) {
      if (knownOpenAIParams.has(key)) {
        (llmConfig as Record<string, unknown>)[key] = value;
      } else {
        hasModelKwargs = true;
        modelKwargs[key] = value;
      }
    }
  }

  // Note: OpenAI Web Search models do not support any known parameters besides `max_tokens`
  if (modelOptions.model && /gpt-4o.*search/.test(modelOptions.model)) {
    const searchExcludeParams = [
      'frequency_penalty',
      'presence_penalty',
      'temperature',
      'top_p',
      'top_k',
      'stop',
      'logit_bias',
      'seed',
      'response_format',
      'n',
      'logprobs',
      'user',
    ];

    const updatedDropParams = dropParams || [];
    const combinedDropParams = [...new Set([...updatedDropParams, ...searchExcludeParams])];

    combinedDropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof t.ClientOptions];
      }
    });
  } else if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof t.ClientOptions];
      }
    });
  }

  // Handle verbosity for Responses API
  if (modelKwargs.verbosity && llmConfig.useResponsesApi === true) {
    modelKwargs.text = { verbosity: modelKwargs.verbosity };
    delete modelKwargs.verbosity;
  }

  // Handle GPT-5+ models max tokens
  if (llmConfig.model && /\bgpt-[5-9]\b/i.test(llmConfig.model) && llmConfig.maxTokens != null) {
    modelKwargs.max_completion_tokens = llmConfig.maxTokens;
    delete llmConfig.maxTokens;
    hasModelKwargs = true;
  }

  // Handle reasoning parameters for Responses API
  if (hasReasoningParams({ reasoning_effort, reasoning_summary })) {
    if (reasoning_effort && reasoning_effort !== '') {
      modelKwargs.reasoning_effort = reasoning_effort;
      hasModelKwargs = true;
    }
    if (reasoning_summary && reasoning_summary !== '') {
      modelKwargs.reasoning_summary = reasoning_summary;
      hasModelKwargs = true;
    }
  }

  // Add verbosity parameter
  if (verbosity && verbosity !== '') {
    modelKwargs.verbosity = verbosity;
    hasModelKwargs = true;
  }

  let useOpenRouter = false;
  const configOptions: t.OpenAIConfiguration = {};

  if (
    (reverseProxyUrl && reverseProxyUrl.includes(KnownEndpoints.openrouter)) ||
    (endpoint && endpoint.toLowerCase().includes(KnownEndpoints.openrouter))
  ) {
    useOpenRouter = true;
    llmConfig.include_reasoning = true;
    configOptions.baseURL = reverseProxyUrl;
    configOptions.defaultHeaders = Object.assign(
      {
        'HTTP-Referer': 'https://witheve.ai',
        'X-Title': 'Eve AI',
      },
      headers,
    );
  } else if (reverseProxyUrl) {
    configOptions.baseURL = reverseProxyUrl;
    if (headers) {
      configOptions.defaultHeaders = headers;
    }
  }

  if (defaultQuery) {
    configOptions.defaultQuery = defaultQuery;
  }

  if (proxy) {
    const proxyAgent = new HttpsProxyAgent(proxy);
    configOptions.httpAgent = proxyAgent;
  }

  if (azure) {
    const useModelName = isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME);
    const updatedAzure = { ...azure };
    updatedAzure.azureOpenAIApiDeploymentName = useModelName
      ? sanitizeModelName(llmConfig.model || '')
      : azure.azureOpenAIApiDeploymentName;

    if (process.env.AZURE_OPENAI_DEFAULT_MODEL) {
      llmConfig.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    }

    if (configOptions.baseURL) {
      const azureURL = constructAzureURL({
        baseURL: configOptions.baseURL,
        azureOptions: updatedAzure,
      });
      updatedAzure.azureOpenAIBasePath = azureURL.split(
        `/${updatedAzure.azureOpenAIApiDeploymentName}`,
      )[0];
    }

    Object.assign(llmConfig, updatedAzure);
    llmConfig.model = updatedAzure.azureOpenAIApiDeploymentName;
  } else {
    llmConfig.apiKey = apiKey;
  }

  if (process.env.OPENAI_ORGANIZATION && azure) {
    configOptions.organization = process.env.OPENAI_ORGANIZATION;
  }

  if (useOpenRouter && llmConfig.reasoning_effort != null) {
    llmConfig.reasoning = {
      effort: llmConfig.reasoning_effort,
    };
    delete llmConfig.reasoning_effort;
  }

  if (llmConfig.max_tokens != null) {
    llmConfig.maxTokens = llmConfig.max_tokens;
    delete llmConfig.max_tokens;
  }

  if (hasModelKwargs) {
    llmConfig.modelKwargs = modelKwargs;
  }

  const result: t.LLMConfigResult = {
    llmConfig,
    configOptions,
  };
}

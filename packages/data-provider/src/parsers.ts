import dayjs from 'dayjs';
import type { ZodIssue } from 'zod';
import type * as a from './types/assistants';
import type * as s from './schemas';
import type * as t from './types';
import { ContentTypes } from './types/runs';
import {
  openAISchema,
  googleSchema,
  EModelEndpoint,
  anthropicSchema,
  assistantSchema,
  gptPluginsSchema,
  // agentsSchema,
  compactAgentsSchema,
  compactGoogleSchema,
  compactPluginsSchema,
  compactAssistantSchema,
} from './schemas';
import { bedrockInputSchema } from './bedrock';
import { extractEnvVariable } from './utils';
import { alternateName } from './config';

type EndpointSchema =
  | typeof openAISchema
  | typeof googleSchema
  | typeof anthropicSchema
  | typeof gptPluginsSchema
  | typeof assistantSchema
  | typeof compactAgentsSchema
  | typeof bedrockInputSchema;

export type EndpointSchemaKey = Exclude<EModelEndpoint, EModelEndpoint.chatGPTBrowser>;

const endpointSchemas: Record<EndpointSchemaKey, EndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.google]: googleSchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.gptPlugins]: gptPluginsSchema,
  [EModelEndpoint.assistants]: assistantSchema,
  [EModelEndpoint.azureAssistants]: assistantSchema,
  [EModelEndpoint.agents]: compactAgentsSchema,
  [EModelEndpoint.bedrock]: bedrockInputSchema,
};

// const schemaCreators: Record<EModelEndpoint, (customSchema: DefaultSchemaValues) => EndpointSchema> = {
//   [EModelEndpoint.google]: createGoogleSchema,
// };

/** Get the enabled endpoints from the `ENDPOINTS` environment variable */
export function getEnabledEndpoints() {
  const defaultEndpoints: string[] = [
    EModelEndpoint.agents,
    EModelEndpoint.openAI,
    EModelEndpoint.assistants,
    EModelEndpoint.azureAssistants,
    EModelEndpoint.azureOpenAI,
    EModelEndpoint.google,
    EModelEndpoint.chatGPTBrowser,
    EModelEndpoint.gptPlugins,
    EModelEndpoint.anthropic,
    EModelEndpoint.bedrock,
  ];

  const endpointsEnv = process.env.ENDPOINTS ?? '';
  let enabledEndpoints = defaultEndpoints;
  if (endpointsEnv) {
    enabledEndpoints = endpointsEnv
      .split(',')
      .filter((endpoint) => endpoint.trim())
      .map((endpoint) => endpoint.trim());
  }
  return enabledEndpoints;
}

/** Orders an existing EndpointsConfig object based on enabled endpoint/custom ordering */
export function orderEndpointsConfig(endpointsConfig: t.TEndpointsConfig) {
  if (!endpointsConfig) {
    return {};
  }
  const enabledEndpoints = getEnabledEndpoints();
  const endpointKeys = Object.keys(endpointsConfig);
  const defaultCustomIndex = enabledEndpoints.indexOf(EModelEndpoint.custom);
  return endpointKeys.reduce(
    (accumulatedConfig: Record<string, t.TConfig | null | undefined>, currentEndpointKey) => {
      const isCustom = !(currentEndpointKey in EModelEndpoint);
      const isEnabled = enabledEndpoints.includes(currentEndpointKey);
      if (!isEnabled && !isCustom) {
        return accumulatedConfig;
      }

      const index = enabledEndpoints.indexOf(currentEndpointKey);

      if (isCustom) {
        accumulatedConfig[currentEndpointKey] = {
          order: defaultCustomIndex >= 0 ? defaultCustomIndex : 9999,
          ...(endpointsConfig[currentEndpointKey] as Omit<t.TConfig, 'order'> & { order?: number }),
        };
      } else if (endpointsConfig[currentEndpointKey]) {
        accumulatedConfig[currentEndpointKey] = {
          ...endpointsConfig[currentEndpointKey],
          order: index,
        };
      }
      return accumulatedConfig;
    },
    {},
  );
}

/** Converts an array of Zod issues into a string. */
export function errorsToString(errors: ZodIssue[]) {
  return errors
    .map((error) => {
      const field = error.path.join('.');
      const message = error.message;

      return `${field}: ${message}`;
    })
    .join(' ');
}

/** Resolves header values to env variables if detected */
export function resolveHeaders(headers: Record<string, string> | undefined) {
  const resolvedHeaders = { ...(headers ?? {}) };

  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    Object.keys(headers).forEach((key) => {
      resolvedHeaders[key] = extractEnvVariable(headers[key]);
    });
  }

  return resolvedHeaders;
}

export function getFirstDefinedValue(possibleValues: string[]) {
  let returnValue;
  for (const value of possibleValues) {
    if (value) {
      returnValue = value;
      break;
    }
  }
  return returnValue;
}

export function getNonEmptyValue(possibleValues: string[]) {
  for (const value of possibleValues) {
    if (value && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

export type TPossibleValues = {
  models: string[];
  secondaryModels?: string[];
};

export const parseConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint: EndpointSchemaKey;
  endpointType?: EndpointSchemaKey | null;
  conversation: Partial<s.TConversation | s.TPreset> | null;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  let schema = endpointSchemas[endpoint] as EndpointSchema | undefined;

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = endpointSchemas[endpointType];
  }

  // if (defaultSchema && schemaCreators[endpoint]) {
  //   schema = schemaCreators[endpoint](defaultSchema);
  // }

  const convo = schema?.parse(conversation) as s.TConversation | undefined;
  const { models, secondaryModels } = possibleValues ?? {};

  if (models && convo) {
    convo.model = getFirstDefinedValue(models) ?? convo.model;
  }

  if (secondaryModels && convo?.agentOptions) {
    convo.agentOptions.model = getFirstDefinedValue(secondaryModels) ?? convo.agentOptions.model;
  }

  return convo;
};

/** Match GPT followed by digit, optional decimal, and optional suffix
 *
 * Examples: gpt-4, gpt-4o, gpt-4.5, gpt-5a, etc. */
const extractGPTVersion = (modelStr: string): string => {
  const gptMatch = modelStr.match(/gpt-(\d+(?:\.\d+)?)([a-z])?/i);
  if (gptMatch) {
    const version = gptMatch[1];
    const suffix = gptMatch[2] || '';
    return `GPT-${version}${suffix}`;
  }
  return '';
};

/** Match omni models (o1, o3, etc.), "o" followed by a digit, possibly with decimal */
const extractOmniVersion = (modelStr: string): string => {
  const omniMatch = modelStr.match(/\bo(\d+(?:\.\d+)?)\b/i);
  if (omniMatch) {
    const version = omniMatch[1];
    return `o${version}`;
  }
  return '';
};

export const getResponseSender = (endpointOption: t.TEndpointOption): string => {
  const {
    model: _m,
    endpoint: _e,
    endpointType,
    modelDisplayLabel: _mdl,
    chatGptLabel: _cgl,
    modelLabel: _ml,
  } = endpointOption;

  const endpoint = _e as EModelEndpoint;

  const model = _m ?? '';
  const modelDisplayLabel = _mdl ?? '';
  const chatGptLabel = _cgl ?? '';
  const modelLabel = _ml ?? '';
  if (
    [
      EModelEndpoint.openAI,
      EModelEndpoint.bedrock,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.chatGPTBrowser,
    ].includes(endpoint)
  ) {
    if (chatGptLabel) {
      return chatGptLabel;
    } else if (modelLabel) {
      return modelLabel;
    } else if (model && extractOmniVersion(model)) {
      return extractOmniVersion(model);
    } else if (model && (model.includes('mistral') || model.includes('codestral'))) {
      return 'Mistral';
    } else if (model && model.includes('deepseek')) {
      return 'Deepseek';
    } else if (model && model.includes('gpt-')) {
      const gptVersion = extractGPTVersion(model);
      return gptVersion || 'GPT';
    }
    return (alternateName[endpoint] as string | undefined) ?? 'ChatGPT';
  }

  if (endpoint === EModelEndpoint.anthropic) {
    return modelLabel || 'Claude';
  }

  if (endpoint === EModelEndpoint.bedrock) {
    return modelLabel || alternateName[endpoint];
  }

  if (endpoint === EModelEndpoint.google) {
    if (modelLabel) {
      return modelLabel;
    } else if (model && (model.includes('gemini') || model.includes('learnlm'))) {
      return 'Gemini';
    } else if (model?.toLowerCase().includes('gemma') === true) {
      return 'Gemma';
    } else if (model && model.includes('code')) {
      return 'Codey';
    }

    return 'PaLM2';
  }

  if (endpoint === EModelEndpoint.custom || endpointType === EModelEndpoint.custom) {
    if (modelLabel) {
      return modelLabel;
    } else if (chatGptLabel) {
      return chatGptLabel;
    } else if (model && extractOmniVersion(model)) {
      return extractOmniVersion(model);
    } else if (model && (model.includes('mistral') || model.includes('codestral'))) {
      return 'Mistral';
    } else if (model && model.includes('deepseek')) {
      return 'Deepseek';
    } else if (model && model.includes('gpt-')) {
      const gptVersion = extractGPTVersion(model);
      return gptVersion || 'GPT';
    } else if (modelDisplayLabel) {
      return modelDisplayLabel;
    }

    return 'AI';
  }

  return '';
};

type CompactEndpointSchema =
  | typeof openAISchema
  | typeof compactAssistantSchema
  | typeof compactAgentsSchema
  | typeof compactGoogleSchema
  | typeof anthropicSchema
  | typeof bedrockInputSchema
  | typeof compactPluginsSchema;

const compactEndpointSchemas: Record<EndpointSchemaKey, CompactEndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.assistants]: compactAssistantSchema,
  [EModelEndpoint.azureAssistants]: compactAssistantSchema,
  [EModelEndpoint.agents]: compactAgentsSchema,
  [EModelEndpoint.google]: compactGoogleSchema,
  [EModelEndpoint.bedrock]: bedrockInputSchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.gptPlugins]: compactPluginsSchema,
};

export const parseCompactConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint?: EndpointSchemaKey;
  endpointType?: EndpointSchemaKey | null;
  conversation: Partial<s.TConversation | s.TPreset>;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  if (!endpoint) {
    throw new Error(`undefined endpoint: ${endpoint}`);
  }

  let schema = compactEndpointSchemas[endpoint] as CompactEndpointSchema | undefined;

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = compactEndpointSchemas[endpointType];
  }

  if (!schema) {
    throw new Error(`Unknown endpointType: ${endpointType}`);
  }

  const convo = schema.parse(conversation) as s.TConversation | null;
  // const { models, secondaryModels } = possibleValues ?? {};
  const { models } = possibleValues ?? {};

  if (models && convo) {
    convo.model = getFirstDefinedValue(models) ?? convo.model;
  }

  // if (secondaryModels && convo.agentOptions) {
  //   convo.agentOptionmodel = getFirstDefinedValue(secondaryModels) ?? convo.agentOptionmodel;
  // }

  return convo;
};

export function parseTextParts(
  contentParts: a.TMessageContentParts[],
  skipReasoning: boolean = false,
): string {
  let result = '';

  for (const part of contentParts) {
    if (!part.type) {
      continue;
    }
    if (part.type === ContentTypes.TEXT) {
      const textValue = typeof part.text === 'string' ? part.text : part.text.value;

      if (
        result.length > 0 &&
        textValue.length > 0 &&
        result[result.length - 1] !== ' ' &&
        textValue[0] !== ' '
      ) {
        result += ' ';
      }
      result += textValue;
    } else if (part.type === ContentTypes.THINK && !skipReasoning) {
      const textValue = typeof part.think === 'string' ? part.think : '';
      if (
        result.length > 0 &&
        textValue.length > 0 &&
        result[result.length - 1] !== ' ' &&
        textValue[0] !== ' '
      ) {
        result += ' ';
      }
      result += textValue;
    }
  }

  return result;
}

export const SEPARATORS = ['.', '?', '!', '۔', '。', '‥', ';', '¡', '¿', '\n', '```'];

export function findLastSeparatorIndex(text: string, separators = SEPARATORS): number {
  let lastIndex = -1;
  for (const separator of separators) {
    const index = text.lastIndexOf(separator);
    if (index > lastIndex) {
      lastIndex = index;
    }
  }
  return lastIndex;
}

export function replaceSpecialVars({
  text,
  user,

  tools,
  timezone,
  otherAgents,
}: {
  text: string;
  user?: t.TUser | null;

  tools?: string[];
  timezone?: string;
  otherAgents?: string[];
}) {
  let result = text;
  if (!result) {
    return result;
  }

  // Use user's timezone if provided, otherwise default to server timezone
  const userTimezone = timezone || user?.timezone;
  const now = new Date();

  // Log timezone usage for debugging
  if (
    userTimezone &&
    (text.includes('{{current_date}}') || text.includes('{{current_datetime}}'))
  ) {
    console.log(
      `[replaceSpecialVars] Using timezone: ${userTimezone} for user: ${user?.name || 'unknown'}`,
    );
  }

  // e.g., "2024-04-29 (1)" (1=Monday)
  let currentDate: string;
  let dayNumber: number;

  if (userTimezone) {
    // Format date in user's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      // YYYY-MM-DD format
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    currentDate = formatter.format(now);

    // Get day of week in user's timezone
    // Create a date in user's timezone and calculate day of week (0=Sunday, 1=Monday, etc.)
    const userDateString = now.toLocaleDateString('en-CA', { timeZone: userTimezone });
    const userDate = new Date(userDateString + 'T00:00:00');
    dayNumber = userDate.getDay();
  } else {
    // Fallback to server timezone using dayjs
    currentDate = dayjs().format('YYYY-MM-DD');
    dayNumber = dayjs().day();
  }

  const combinedDate = `${currentDate} (${dayNumber})`;
  result = result.replace(/{{current_date}}/gi, combinedDate);

  // Format datetime in user's timezone
  let currentDatetime: string;
  if (userTimezone) {
    try {
      const datetimeFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = datetimeFormatter.formatToParts(now);
      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;
      const hour = parts.find((p) => p.type === 'hour')?.value;
      const minute = parts.find((p) => p.type === 'minute')?.value;
      const second = parts.find((p) => p.type === 'second')?.value;

      currentDatetime = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (error) {
      // Fallback to server timezone if timezone formatting fails
      currentDatetime = dayjs().format('YYYY-MM-DD HH:mm:ss');
    }
  } else {
    currentDatetime = dayjs().format('YYYY-MM-DD HH:mm:ss');
  }

  result = result.replace(/{{current_datetime}}/gi, `${currentDatetime} (${dayNumber})`);

  const isoDatetime = dayjs().toISOString();
  result = result.replace(/{{utc_iso_datetime}}/gi, isoDatetime);

  if (user && user.name) {
    result = result.replace(/{{current_user}}/gi, user.name);
  }

  if (tools && tools.length > 0) {
    const toolsText = tools.join(', ');
    result = result.replace(/{{tools}}/gi, toolsText);
  }

  if (otherAgents && otherAgents.length > 0) {
    const agentsText = otherAgents.join(', ');
    result = result.replace(/{{other_agents}}/gi, agentsText);
  }

  return result;
}

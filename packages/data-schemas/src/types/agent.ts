import { Document, Types } from 'mongoose';

export interface MCPToolConfig {
  tool: string;
  server: string;
  type: 'global' | 'user';
}

export interface IAgent extends Omit<Document, 'model'> {
  id: string;
  name?: string;
  description?: string;
  instructions?: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  provider: string;
  model: string;
  model_parameters?: Record<string, unknown>;
  artifacts?: string;
  access_level?: number;
  recursion_limit?: number;
  tools?: Array<string | MCPToolConfig>; // Support both regular tools (strings) and MCP tools (objects)
  tool_kwargs?: Array<unknown>;
  actions?: string[];
  author: Types.ObjectId;
  authorName?: string;
  hide_sequential_outputs?: boolean;
  end_after_tools?: boolean;
  agent_ids?: string[];
  isCollaborative?: boolean;
  conversation_starters?: string[];
  default_prompts?: string[];
  tool_resources?: unknown;
  projectIds?: Types.ObjectId[];
  versions?: Omit<IAgent, 'versions'>[];
}

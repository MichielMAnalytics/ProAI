import type React from 'react';

export interface WorkflowStep {
  id: string;
  name: string;
  agentId: string;
  task: string;
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event' | 'app';
  config: {
    schedule?: string;
    webhookUrl?: string;
    emailAddress?: string;
    eventType?: string;
    appSlug?: string;
    triggerKey?: string;
    triggerConfig?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
}

export interface AppTrigger {
  key: string;
  name: string;
  description?: string;
  version: string;
  type?: 'action' | 'trigger';
  configurable_props?: Array<any>;
  category?: string;
}

export interface WorkflowBuilderProps {
  onClose: () => void;
  workflowId?: string;
}

export interface TriggerOption {
  value: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export type ScheduleType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ScheduleConfig {
  type: ScheduleType;
  time: string;
  days: number[];
  date: number;
}

export type StepStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowExecutionStep {
  id: string;
  name: string;
  status: StepStatus;
  output?: any;
  error?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: string;
  currentStepId?: string;
  steps?: WorkflowExecutionStep[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export const MAX_STEPS = 10;

// Trigger option values - icons will be created in the component
export const BASIC_TRIGGER_VALUES = [
  { value: 'manual', label: 'Manual', disabled: false },
  { value: 'schedule', label: 'Schedule', disabled: false },
  { value: 'app', label: 'App', disabled: false },
] as const;

export const TRIGGER_CATEGORY_ICONS: Record<string, string> = {
  webhook: 'Webhook',
  schedule: 'Calendar',
  email: 'Mail',
  new_item: 'PlusCircle',
  item_updated: 'RefreshCw',
  item_deleted: 'Trash2',
  file: 'FileText',
  other: 'Activity',
};
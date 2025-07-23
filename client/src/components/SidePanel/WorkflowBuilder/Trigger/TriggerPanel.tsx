import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TriggerSelect from './TriggerSelect';
import ScheduleTrigger from './ScheduleTrigger';
import AppTrigger from './AppTrigger';
import type { TriggerOption, ScheduleType, AppTrigger as AppTriggerType } from '../types';

interface TriggerPanelProps {
  triggerType: 'manual' | 'schedule' | 'webhook' | 'email' | 'event' | 'app';
  isTriggerExpanded: boolean;
  setIsTriggerExpanded: (expanded: boolean) => void;
  isTesting: boolean;
  handleTriggerTypeChange: (value: string) => void;
  getTriggerDisplayValue: () => string;
  getTriggerIcon: () => React.ReactNode;
  triggerOptions: TriggerOption[];
  
  // Schedule props
  scheduleType: ScheduleType;
  setScheduleType: (type: ScheduleType) => void;
  scheduleTime: string;
  setScheduleTime: (time: string) => void;
  scheduleDays: number[];
  setScheduleDays: (days: number[]) => void;
  scheduleDate: number;
  setScheduleDate: (date: number) => void;
  scheduleConfig: string;
  setScheduleConfig: (config: string) => void;
  
  // App trigger props
  selectedAppSlug: string;
  setSelectedAppSlug: (slug: string) => void;
  selectedTrigger: AppTriggerType | null;
  setSelectedTrigger: (trigger: AppTriggerType | null) => void;
  triggerParameters: Record<string, unknown>;
  setTriggerParameters: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  setShowRequestTriggerModal: (show: boolean) => void;
  availableIntegrations: any[];
  appTriggersData: any;
  isLoadingTriggers: boolean;
  filteredAppTriggers: AppTriggerType[];
  isIntegrationConnected: (appSlug: string) => boolean;
}

const TriggerPanel: React.FC<TriggerPanelProps> = ({
  triggerType,
  isTriggerExpanded,
  setIsTriggerExpanded,
  isTesting,
  handleTriggerTypeChange,
  getTriggerDisplayValue,
  getTriggerIcon,
  triggerOptions,
  scheduleType,
  setScheduleType,
  scheduleTime,
  setScheduleTime,
  scheduleDays,
  setScheduleDays,
  scheduleDate,
  setScheduleDate,
  scheduleConfig,
  setScheduleConfig,
  selectedAppSlug,
  setSelectedAppSlug,
  selectedTrigger,
  setSelectedTrigger,
  triggerParameters,
  setTriggerParameters,
  setShowRequestTriggerModal,
  availableIntegrations,
  appTriggersData,
  isLoadingTriggers,
  filteredAppTriggers,
  isIntegrationConnected,
}) => {
  return (
    <div className="space-y-3">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsTriggerExpanded(!isTriggerExpanded)}
      >
        <h3 className="text-base font-semibold text-text-primary sm:text-lg">Trigger</h3>
        {isTriggerExpanded ? (
          <ChevronUp size={20} className="text-text-secondary" />
        ) : (
          <ChevronDown size={20} className="text-text-secondary" />
        )}
      </div>

      {isTriggerExpanded && (
        <div className="space-y-2">
          <TriggerSelect
            triggerType={triggerType}
            handleTriggerTypeChange={handleTriggerTypeChange}
            getTriggerDisplayValue={getTriggerDisplayValue}
            getTriggerIcon={getTriggerIcon}
            triggerOptions={triggerOptions}
            isTesting={isTesting}
          />
          
          {triggerType === 'schedule' && (
            <ScheduleTrigger
              scheduleType={scheduleType}
              setScheduleType={setScheduleType}
              scheduleTime={scheduleTime}
              setScheduleTime={setScheduleTime}
              scheduleDays={scheduleDays}
              setScheduleDays={setScheduleDays}
              scheduleDate={scheduleDate}
              setScheduleDate={setScheduleDate}
              scheduleConfig={scheduleConfig}
              setScheduleConfig={setScheduleConfig}
              isTesting={isTesting}
            />
          )}

          {triggerType === 'app' && (
            <AppTrigger
              selectedAppSlug={selectedAppSlug}
              setSelectedAppSlug={setSelectedAppSlug}
              selectedTrigger={selectedTrigger}
              setSelectedTrigger={setSelectedTrigger}
              triggerParameters={triggerParameters}
              setTriggerParameters={setTriggerParameters}
              setShowRequestTriggerModal={setShowRequestTriggerModal}
              availableIntegrations={availableIntegrations}
              appTriggersData={appTriggersData}
              isLoadingTriggers={isLoadingTriggers}
              filteredAppTriggers={filteredAppTriggers}
              isTesting={isTesting}
              isIntegrationConnected={isIntegrationConnected}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TriggerPanel;
import React from 'react';
import { Activity, PlusCircle, Search, Info } from 'lucide-react';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '~/components/ui';
import AppTriggerIndicator from '../AppTriggerIndicator';
import { TRIGGER_CATEGORY_ICONS } from '../types';
import type { AppTrigger as AppTriggerType } from '../types';

interface AppTriggerProps {
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
  isTesting: boolean;
  isIntegrationConnected: (appSlug: string) => boolean;
}

const AppTrigger: React.FC<AppTriggerProps> = ({
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
  isTesting,
  isIntegrationConnected,
}) => {
  const getTriggerCategoryIcon = (category?: string) => {
    const iconName = TRIGGER_CATEGORY_ICONS[category || 'other'];
    // For simplicity, returning the icon name as string - in real implementation,
    // you'd map these to actual icon components
    switch (iconName) {
      case 'PlusCircle': return <PlusCircle size={16} />;
      case 'Activity': return <Activity size={16} />;
      default: return <Activity size={16} />;
    }
  };

  return (
    <div className="space-y-3">
      {!selectedAppSlug ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            Select App
          </label>
          <ControlCombobox
            isCollapsed={false}
            ariaLabel="Select app"
            selectedValue={selectedAppSlug}
            setValue={(appSlug) => {
              if (appSlug === 'request-other-app') {
                setShowRequestTriggerModal(true);
              } else {
                setSelectedAppSlug(appSlug);
                setSelectedTrigger(null); // Clear selected trigger when app changes
                setTriggerParameters({ passTriggerToFirstStep: true }); // Clear trigger parameters when app changes
              }
            }}
            selectPlaceholder="Select app"
            searchPlaceholder="Search apps"
            items={[
              // Available integrations
              ...availableIntegrations
                .filter(
                  (integration) =>
                    integration.isActive && integration.appSlug === 'gmail',
                )
                .map((integration) => ({
                  label: integration.appName,
                  value: integration.appSlug,
                  icon: integration.appIcon ? (
                    <img
                      src={integration.appIcon}
                      alt={integration.appName}
                      className="h-4 w-4"
                    />
                  ) : (
                    <Activity size={16} />
                  ),
                })),
              // Request other app trigger option
              {
                label: 'Request Other App Trigger',
                value: 'request-other-app',
                icon: <PlusCircle size={16} />,
              },
            ]}
            displayValue=""
            SelectIcon={<Search size={16} className="text-text-secondary" />}
            className="h-8 w-full border-border-heavy text-sm sm:h-10"
            disabled={isTesting}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Trigger Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              Select Trigger
            </label>
            <div className="relative">
              <ControlCombobox
                isCollapsed={false}
                ariaLabel="Select trigger"
                selectedValue={selectedTrigger?.key || ''}
                setValue={(triggerKey) => {
                  const trigger = appTriggersData?.triggers?.find(
                    (t: AppTriggerType) => t.key === triggerKey,
                  );
                  if (trigger) {
                    setSelectedTrigger(trigger);
                    setTriggerParameters({ passTriggerToFirstStep: true }); // Clear parameters when trigger changes
                  }
                }}
                selectPlaceholder="Select trigger"
                searchPlaceholder="Search triggers"
                items={filteredAppTriggers.map((trigger) => ({
                  label: trigger.name,
                  value: trigger.key,
                  icon: getTriggerCategoryIcon(trigger.category),
                }))}
                displayValue={selectedTrigger?.name || ''}
                SelectIcon={
                  selectedTrigger && (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div
                          className="cursor-pointer text-text-secondary hover:text-text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Info size={14} />
                        </div>
                      </HoverCardTrigger>
                      <HoverCardPortal>
                        <HoverCardContent className="w-80 p-4">
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-text-primary">
                              {selectedTrigger.name}
                            </h4>
                            <p className="text-sm text-text-secondary">
                              {selectedTrigger.description ||
                                'No description available'}
                            </p>

                            {/* Show trigger category */}
                            {selectedTrigger.category && (
                              <div className="text-xs text-text-secondary">
                                <span className="font-medium">Category:</span>{' '}
                                {selectedTrigger.category}
                              </div>
                            )}

                            {/* Generic configurable properties */}
                            {selectedTrigger.configurable_props &&
                              selectedTrigger.configurable_props.length > 0 && (
                                <div className="text-xs text-text-secondary">
                                  <p className="font-medium">
                                    Configurable properties:
                                  </p>
                                  <ul className="mt-1 list-inside list-disc">
                                    {selectedTrigger.configurable_props.map(
                                      (prop: any, index: number) => (
                                        <li key={index}>
                                          {prop.name} ({prop.type})
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                          </div>
                        </HoverCardContent>
                      </HoverCardPortal>
                    </HoverCard>
                  )
                }
                className="h-8 w-full border-border-heavy text-sm sm:h-10"
                disabled={isTesting}
              />
              {selectedAppSlug && selectedTrigger && (
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                  style={{
                    left: `calc(40px + ${(selectedTrigger?.name ?? '').length * 0.65}ch + 16px)`,
                  }}
                >
                  <div
                    className="pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AppTriggerIndicator
                      appSlug={selectedAppSlug}
                      size="sm"
                      disabled={isTesting}
                      className="flex-shrink-0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Gmail-specific configuration */}
          {selectedAppSlug === 'gmail' &&
            selectedTrigger?.key === 'gmail-new-email-received' && (
              <div className="space-y-3 rounded-lg border border-border-light bg-surface-secondary p-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Filter by sender email (optional)
                  </label>
                  <input
                    type="email"
                    value={(triggerParameters.fromEmail as string) || ''}
                    onChange={(e) =>
                      setTriggerParameters((prev) => ({
                        ...prev,
                        fromEmail: e.target.value,
                      }))
                    }
                    disabled={isTesting}
                    className={`w-full rounded-md border border-border-heavy bg-surface-primary p-2 text-sm text-text-primary focus:border-blue-500 focus:outline-none ${
                      isTesting ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                    placeholder="example@domain.com"
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    Only trigger when emails are received from this address. Leave
                    empty to trigger on all emails.
                  </p>
                </div>
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={(triggerParameters.passTriggerToFirstStep as boolean) ?? true}
                      onChange={(e) =>
                        setTriggerParameters((prev) => ({
                          ...prev,
                          passTriggerToFirstStep: e.target.checked,
                        }))
                      }
                      disabled={isTesting}
                      className={`h-4 w-4 rounded border-border-heavy text-blue-600 focus:ring-blue-500 ${
                        isTesting ? 'cursor-not-allowed opacity-50' : ''
                      }`}
                    />
                    <span className="text-sm font-medium text-text-primary">
                      Pass trigger output to first step
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-text-secondary">
                    When enabled, the email content and metadata will be passed to the first workflow step.
                  </p>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default AppTrigger;
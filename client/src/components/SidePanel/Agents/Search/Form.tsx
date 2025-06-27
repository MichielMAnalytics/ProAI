import React, { useMemo } from 'react';
import { Tools, AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useVerifyAgentToolAuth } from '~/data-provider';
import {
  Switch,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '~/components/ui';
import { useLocalize, useSearchApiKeyForm } from '~/hooks';
import { CircleHelpIcon } from '~/components/svg';
import { ESide } from '~/common';
import ApiKeyDialog from './ApiKeyDialog';

export default function SearchForm() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue } = methods;
  
  const { data } = useVerifyAgentToolAuth(
    { toolId: Tools.web_search },
    {
      retry: 1,
    },
  );

  const {
    onSubmit,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    methods: keyFormMethods,
  } = useSearchApiKeyForm({
    onSubmit: () => {
      setValue(AgentCapabilities.web_search, true, { shouldDirty: true });
    },
    onRevoke: () => {
      setValue(AgentCapabilities.web_search, false, { shouldDirty: true });
    },
  });

  const webSearchEnabled = useWatch({
    control,
    name: AgentCapabilities.web_search,
  });

  const handleWebSearchChange = (value: boolean) => {
    if (data?.authenticated) {
      setValue(AgentCapabilities.web_search, value, { shouldDirty: true });
    } else if (webSearchEnabled) {
      setValue(AgentCapabilities.web_search, false, { shouldDirty: true });
    } else {
      setIsDialogOpen(true);
    }
  };

  const webSearchValue = useMemo(() => {
    return Boolean(webSearchEnabled);
  }, [webSearchEnabled]);

  const isUserProvided = data?.authTypes?.some(([, authType]) => authType === 'user_provided') ?? false;

  return (
    <>
      <div className="w-full">
        <SwitchItem
          id="web_search"
          label={localize('com_ui_web_search')}
          checked={webSearchValue}
          onCheckedChange={handleWebSearchChange}
          hoverCardText={localize('com_agents_search_info')}
          disabled={!data?.authenticated && !webSearchEnabled}
          isUserProvided={isUserProvided}
          isToolAuthenticated={data?.authenticated}
          webSearchEnabled={webSearchEnabled}
          setIsDialogOpen={setIsDialogOpen}
        />
      </div>
      <ApiKeyDialog
        onSubmit={onSubmit}
        authTypes={data?.authTypes ?? []}
        isOpen={isDialogOpen}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        register={keyFormMethods.register}
        isToolAuthenticated={data?.authenticated ?? false}
        handleSubmit={keyFormMethods.handleSubmit}
      />
    </>
  );
}

function SwitchItem({
  id,
  label,
  checked,
  onCheckedChange,
  hoverCardText,
  disabled = false,
  isUserProvided = false,
  isToolAuthenticated = false,
  webSearchEnabled = false,
  setIsDialogOpen,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  hoverCardText: string;
  disabled?: boolean;
  isUserProvided?: boolean;
  isToolAuthenticated?: boolean;
  webSearchEnabled?: boolean;
  setIsDialogOpen?: (open: boolean) => void;
}) {
  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={disabled ? 'text-text-tertiary' : ''}>{label}</div>
          <div className="flex gap-2">
            {isUserProvided && (isToolAuthenticated || webSearchEnabled) && setIsDialogOpen && (
              <button 
                type="button" 
                onClick={() => setIsDialogOpen(true)}
                className="flex items-center"
              >
                <svg 
                  className="h-4 w-4 text-text-primary" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" 
                  />
                </svg>
              </button>
            )}
            <HoverCardTrigger>
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </HoverCardTrigger>
          </div>
        </div>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">{hoverCardText}</p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="ml-4"
          data-testid={id}
          disabled={disabled}
        />
      </div>
    </HoverCard>
  );
}

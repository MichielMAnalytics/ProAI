import React, { useMemo, useEffect, useState } from 'react';
import { ChevronLeft, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import {
  alternateName,
  getSettingsKeys,
  SettingDefinition,
  agentParamSettings,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { AgentForm, AgentModelPanelProps, StringOption } from '~/common';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useGetEndpointsQuery } from '~/data-provider';
import { getEndpointField, cn } from '~/utils';
import { formatModelDisplayName } from '~/utils/modelNames';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';
import keyBy from 'lodash/keyBy';

export default function ModelPanel({
  setActivePanel,
  providers,
  models: modelsData,
}: AgentModelPanelProps) {
  const localize = useLocalize();
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  const { control, setValue } = useFormContext<AgentForm>();

  const model = useWatch({ control, name: 'model' });
  const providerOption = useWatch({ control, name: 'provider' });
  const modelParameters = useWatch({ control, name: 'model_parameters' });

  const provider = useMemo(() => {
    const value =
      typeof providerOption === 'string'
        ? providerOption
        : (providerOption as StringOption | undefined)?.value;
    return value ?? '';
  }, [providerOption]);
  const models = useMemo(
    () => (provider ? (modelsData[provider] ?? []) : []),
    [modelsData, provider],
  );

  useEffect(() => {
    const _model = model ?? '';
    if (provider && _model) {
      const modelExists = models.includes(_model);
      if (!modelExists) {
        const newModels = modelsData[provider] ?? [];
        setValue('model', newModels[0] ?? '');
      }
    }

    if (provider && !_model) {
      setValue('model', models[0] ?? '');
    }
  }, [provider, models, modelsData, setValue, model]);

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[provider]?.availableRegions ?? [];
  }, [endpointsConfig, provider]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, provider, 'type'),
    [provider, endpointsConfig],
  );

  const parameters = useMemo((): SettingDefinition[] => {
    const customParams = endpointsConfig[provider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model ?? '');
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams =
      agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey] ?? [];
    const overriddenParams = endpointsConfig[provider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    return defaultParams.map(
      (param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param,
    );
  }, [endpointType, endpointsConfig, model, provider]);

  const setOption = (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
    setValue(`model_parameters.${optionKey}`, value);
  };

  const handleResetParameters = () => {
    setValue('model_parameters', {} as t.AgentModelParameters);
  };

  return (
    <div className="mx-1 mb-1 flex h-full w-full flex-col justify-between gap-2 text-sm">
      <div className="model-panel relative flex flex-col items-center px-16 py-4 text-center">
        <div className="absolute left-4 top-4">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
          >
            <div className="model-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft />
            </div>
          </button>
        </div>

        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_model_parameters')}</div>
      </div>
      <div className="p-2">
        {/* Endpoint aka Provider for Agents */}
        <div className="mb-4">
          <label
            id="provider-label"
            className="text-token-text-primary model-panel-label mb-2 block font-medium"
            htmlFor="provider"
          >
            {localize('com_ui_provider')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="provider"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => {
              const value =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.value ?? '');
              const display =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.label ?? '');

              return (
                <>
                  <ControlCombobox
                    selectedValue={value}
                    displayValue={alternateName[display] ?? display}
                    selectPlaceholder={localize('com_ui_select_provider')}
                    searchPlaceholder={localize('com_ui_select_search_provider')}
                    setValue={field.onChange}
                    items={providers.map((provider) => ({
                      label: typeof provider === 'string' ? provider : provider.label,
                      value: typeof provider === 'string' ? provider : provider.value,
                    }))}
                    className={cn(error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_provider')}
                    isCollapsed={false}
                    showCarat={true}
                  />
                  {error && (
                    <span className="model-panel-error text-sm text-red-500 transition duration-300 ease-in-out">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>
        {/* Model */}
        <div className="model-panel-section mb-4">
          <label
            id="model-label"
            className={cn(
              'text-token-text-primary model-panel-label mb-2 block font-medium',
              !provider && 'text-gray-500 dark:text-gray-400',
            )}
            htmlFor="model"
          >
            {localize('com_ui_model')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="model"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => {
              return (
                <>
                  <ControlCombobox
                    selectedValue={field.value || ''}
                    displayValue={field.value ? formatModelDisplayName(field.value) : ''}
                    selectPlaceholder={
                      provider
                        ? localize('com_ui_select_model')
                        : localize('com_ui_select_provider_first')
                    }
                    searchPlaceholder={localize('com_ui_select_model')}
                    setValue={field.onChange}
                    items={models.map((model) => ({
                      label: formatModelDisplayName(model),
                      value: model,
                    }))}
                    disabled={!provider}
                    className={cn('disabled:opacity-50', error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_model')}
                    isCollapsed={false}
                    showCarat={true}
                    hideSearchWhenFewItems={true}
                  />
                  {provider && error && (
                    <span className="text-sm text-red-500 transition duration-300 ease-in-out">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>
      </div>
      
      {/* Advanced Parameters Toggle */}
      {parameters && parameters.length > 0 && (
        <div className="px-2 mb-4">
          <button
            type="button"
            onClick={() => setShowAdvancedParams(!showAdvancedParams)}
            className="btn btn-neutral flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
          >
            {showAdvancedParams ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {localize('com_ui_advanced_params')}
          </button>
        </div>
      )}
      
      {/* Model Parameters */}
      {parameters && showAdvancedParams && (
        <div className="h-auto max-w-full overflow-x-hidden p-2 mt-2">
          <div className="grid grid-cols-2 gap-4">
            {/* This is the parent element containing all settings */}
            {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
            {parameters.map((setting) => {
              const Component = componentMapping[setting.component];
              if (!Component) {
                return null;
              }
              const { key, default: defaultValue, ...rest } = setting;

              if (key === 'region' && bedrockRegions.length) {
                rest.options = bedrockRegions;
              }

              return (
                <Component
                  key={key}
                  settingKey={key}
                  defaultValue={defaultValue}
                  {...rest}
                  setOption={setOption as t.TSetOption}
                  conversation={modelParameters as Partial<t.TConversation>}
                />
              );
            })}
          </div>
        </div>
      )}
      {/* Reset Parameters Button */}
      {showAdvancedParams && (
        <div className="px-2 mt-2">
          <button
            type="button"
            onClick={handleResetParameters}
            className="btn btn-neutral flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { dataService, specialVariables } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { Spinner } from '~/components/svg';

interface PromptAssistProps {
  className?: string;
  fieldName?: string;
}

export default function PromptAssist({ className, fieldName = 'instructions' }: PromptAssistProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { getValues, setValue } = useFormContext();
  const [isLoading, setIsLoading] = useState(false);

  const getVariableDescription = (key: string): string => {
    const descriptions: Record<string, string> = {
      current_date: 'Current date in YYYY-MM-DD format',
      current_user: 'Current user information',
      current_datetime: 'Current date and time in local timezone',
      utc_iso_datetime: 'Current date and time in UTC ISO format',
      tools: 'Available tools and their descriptions',
    };
    return descriptions[key] || `Dynamic variable: ${key}`;
  };

  const handleEnhancePrompt = async () => {
    try {
      setIsLoading(true);

      const formValues = getValues();

      // Get available variables and their descriptions
      const availableVariables = Object.keys(specialVariables).map((key) => ({
        name: key,
        syntax: `{{${key}}}`,
        description: getVariableDescription(key),
      }));

      const data = {
        title: formValues.name || '',
        description: formValues.description || '',
        instructions: formValues[fieldName] || '',
        availableVariables,
      };

      const response = await dataService.enhancePrompt(data);

      if (response.enhancedPrompt) {
        setValue(fieldName, response.enhancedPrompt);
        showToast({
          message: localize('com_ui_prompt_enhanced'),
          status: 'success',
        });
      }
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      showToast({
        message: localize('com_ui_prompt_enhance_error'),
        status: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleEnhancePrompt}
      disabled={isLoading}
      className={cn(
        'flex items-center gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-1 text-xs text-text-primary transition-colors duration-200 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      title={localize('com_ui_prompt_assist_tooltip')}
    >
      {isLoading ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {localize('com_ui_prompt_assist')}
    </button>
  );
}

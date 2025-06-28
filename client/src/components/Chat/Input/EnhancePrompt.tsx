import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import { dataService } from 'librechat-data-provider';

interface EnhancePromptProps {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  methods: UseFormReturn<{ text: string }>;
  disabled?: boolean;
  className?: string;
  hasText?: boolean;
}

export default function EnhancePrompt({ textAreaRef, methods, disabled = false, className, hasText = false }: EnhancePromptProps) {
  const localize = useLocalize();
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSparklingIntro, setIsSparklingIntro] = useState(false);
  const [hasShownIntro, setHasShownIntro] = useState(false);
  const sparkleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger sparkling animation when text first becomes available
  useEffect(() => {
    if (hasText && !disabled && !hasShownIntro) {
      setIsSparklingIntro(true);
      setHasShownIntro(true);
      
      // Clear any existing timeout
      if (sparkleTimeoutRef.current) {
        clearTimeout(sparkleTimeoutRef.current);
      }
      
      // Set new timeout
      sparkleTimeoutRef.current = setTimeout(() => {
        setIsSparklingIntro(false);
        sparkleTimeoutRef.current = null;
      }, 2000); // 2 seconds
    }
    
    // Reset when text is cleared
    if (!hasText) {
      setHasShownIntro(false);
      if (sparkleTimeoutRef.current) {
        clearTimeout(sparkleTimeoutRef.current);
        sparkleTimeoutRef.current = null;
      }
      setIsSparklingIntro(false);
    }
  }, [hasText, disabled, hasShownIntro]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (sparkleTimeoutRef.current) {
        clearTimeout(sparkleTimeoutRef.current);
      }
    };
  }, []);

  const handleEnhance = async () => {
    if (!textAreaRef.current || disabled || isEnhancing) {
      return;
    }

    const currentText = textAreaRef.current.value.trim();
    if (!currentText) {
      return;
    }

    setIsEnhancing(true);
    try {
      const response = await dataService.enhanceMessage(currentText);
      if (response.enhancedMessage) {
        // Update form state using React Hook Form's setValue
        methods.setValue('text', response.enhancedMessage, { 
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true 
        });
        
        // Force textarea resize
        if (textAreaRef.current) {
          textAreaRef.current.style.height = 'auto';
          textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
        }
      }
    } catch (error) {
      console.error('Failed to enhance message:', error);
    } finally {
      setIsEnhancing(false);
    }
  };

  const tooltipDescription = isEnhancing 
    ? localize('com_ui_enhancing')
    : localize('com_ui_enhance_prompt');

  return (
    <TooltipAnchor
      description={tooltipDescription}
      side="top"
      role="button"
      className={cn(
        'flex h-[40px] w-[40px] items-center justify-center transition-all duration-200 hover:opacity-80 rounded-md',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onClick={handleEnhance}
      aria-label={tooltipDescription}
    >
      <Sparkles
        className={cn(
          'h-6 w-6 transition-all duration-200',
          isEnhancing 
            ? 'text-yellow-500 animate-pulse [&>*]:fill-current'
            : isSparklingIntro
            ? 'text-yellow-500 animate-bounce [&>*]:fill-current'
            : disabled
            ? 'text-text-secondary'
            : 'text-text-secondary hover:text-yellow-500'
        )}
      />
    </TooltipAnchor>
  );
}
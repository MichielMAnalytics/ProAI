import { useMemo } from 'react';

interface UseWorkflowValidationProps {
  triggerType: string;
  selectedAppSlug: string;
  triggerParameters: Record<string, unknown>;
  isIntegrationConnected: (appSlug: string) => boolean;
}

export const useWorkflowValidation = ({
  triggerType,
  selectedAppSlug,
  triggerParameters,
  isIntegrationConnected,
}: UseWorkflowValidationProps) => {
  // Validation: Check if app trigger is connected when trigger type is 'app'
  const isAppTriggerConnected = useMemo(() => {
    if (triggerType !== 'app' || !selectedAppSlug) {
      return true; // Not an app trigger, so no connection required
    }
    return isIntegrationConnected(selectedAppSlug);
  }, [triggerType, selectedAppSlug, isIntegrationConnected]);

  // Check if workflow can be tested - additional restriction for app triggers with output passing
  const canTest = useMemo(() => {
    if (!isAppTriggerConnected) {
      return false;
    }
    
    // Cannot test app triggers when "pass trigger output to first step" is enabled
    if (triggerType === 'app' && selectedAppSlug && triggerParameters.passTriggerToFirstStep) {
      return false;
    }
    
    return true;
  }, [isAppTriggerConnected, triggerType, selectedAppSlug, triggerParameters.passTriggerToFirstStep]);

  // Check if workflow can be activated - only requires connection
  const canActivate = useMemo(() => {
    return isAppTriggerConnected;
  }, [isAppTriggerConnected]);

  // Get test button tooltip
  const getTestTooltip = (currentWorkflowId?: string) => {
    if (!currentWorkflowId) {
      return 'Save workflow first to test';
    }
    if (!isAppTriggerConnected) {
      return 'Connect the app trigger to test the workflow';
    }
    if (!canTest) {
      return 'Cannot test app triggers with output passing enabled';
    }
    return 'Test workflow';
  };

  // Get activate button tooltip
  const getActivateTooltip = (currentWorkflowId?: string, isWorkflowActive?: boolean) => {
    if (!currentWorkflowId) {
      return 'Save workflow first to activate';
    }
    if (!canActivate) {
      return 'Connect the app trigger to activate the workflow';
    }
    if (isWorkflowActive) {
      return 'Deactivate workflow';
    }
    return 'Activate workflow';
  };

  return {
    isAppTriggerConnected,
    canTest,
    canActivate,
    getTestTooltip,
    getActivateTooltip,
  };
};
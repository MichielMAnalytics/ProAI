const { getFullStepResult } = require('./utils');
const { replaceSpecialVars } = require('librechat-data-provider');

/**
 * Format previous step results for context
 * @param {Object} context - Execution context
 * @returns {string} Formatted previous step results
 */
function formatPreviousStepResults(context) {
  if (!context.steps || Object.keys(context.steps).length === 0) {
    return '**No previous step data available yet.**\n\n';
  }

  const stepKeys = Object.keys(context.steps);
  let formattedData = '**Data from Previous Steps:**\n\n';

  for (const stepKey of stepKeys) {
    const stepResult = context.steps[stepKey];
    if (stepResult && stepResult.result) {
      const stepName = stepResult.result.stepName || stepKey;
      const fullResult = getFullStepResult(stepResult.result);
      
      formattedData += `**${stepName}:**\n`;
      formattedData += `${fullResult}\n\n`;
    }
  }

  return formattedData;
}

/**
 * Create a task prompt for a workflow step
 * @param {Object} step - The workflow step
 * @param {Object} context - Execution context
 * @returns {string} Generated prompt for the step
 */
function createTaskPromptForStep(step, context) {
  const { replaceSpecialVars } = require('librechat-data-provider');
  const hasPreviousSteps = context.steps && Object.keys(context.steps).length > 0;

  // Build the step objective from the instruction or fall back to step name
  const stepObjective = step.instruction || `Execute task: ${step.name}`;

  let prompt = `
-- MISSION BRIEFING --

You are an intelligent agent executing one step within a larger automated workflow. Your job is to think, reason, and use the provided tools and data to accomplish your assigned task, contributing to the overall goal of the workflow.

-- 1. OVERALL WORKFLOW GOAL --
Your step is part of a workflow created to achieve the following user request:
"${context.workflow?.description || context.workflow?.name || 'No overall goal provided.'}"

-- 2. YOUR CURRENT STEP & OBJECTIVE --
- Step Name: "${step.name}"
- Step Objective: ${stepObjective}

-- 3. AVAILABLE DATA & TOOLS --
${formatPreviousStepResults(context)}

-- 4. YOUR TASK & EXECUTION RULES --

1. **OBJECTIVE FIRST**: Your primary task is to achieve your step objective. Focus on the GOAL, not on using specific tools.
2. **INTELLIGENT TOOL SELECTION**: Select from your available tools the one that best matches your required capability.
3. **CONTEXT UTILIZATION**: Use data from previous steps and the current context to inform your tool selection and parameters.
4. **IMMEDIATE ACTION**: Once you've identified the right approach, execute it. Don't ask for confirmation.
5. **ONE FOCUSED ACTION**: Perform one well-reasoned action that achieves your objective, then stop.
`;

  return replaceSpecialVars({ text: prompt });
}

module.exports = {
  createTaskPromptForStep,
};
const { getFullStepResult, resolveParameters } = require('./utils');
const { replaceSpecialVars } = require('librechat-data-provider');

/**
 * Generate specific guidance for email steps
 * @param {Object} step - Workflow step
 * @param {Object} context - Execution context
 * @returns {string} Email-specific guidance
 */
function generateEmailStepGuidance(step, context) {
  let guidance = `\n\nEMAIL STEP GUIDANCE:`;

  // Helper function to find parameter - prioritize parameters object
  const findParameter = (paramNames) => {
    const names = Array.isArray(paramNames) ? paramNames : [paramNames];

    for (const paramName of names) {
      // Primary location: parameters object
      if (step.config.parameters?.[paramName]) {
        return step.config.parameters[paramName];
      }

      // Fallback: toolParameters for backward compatibility
      if (step.config.toolParameters?.[paramName]) {
        return step.config.toolParameters[paramName];
      }
    }
    return null;
  };

  // Check if recipient is configured
  const recipient = findParameter(['recipient', 'to', 'email']);
  if (recipient) {
    guidance += `\n- Send to: ${recipient}`;
  } else {
    guidance += `\n- WARNING: No recipient configured. Use a default or derive from context.`;
  }

  // Check if subject is configured
  const subject = findParameter(['subject', 'title']);
  if (subject) {
    guidance += `\n- Subject: ${subject}`;
  } else {
    guidance += `\n- Generate appropriate subject line based on step purpose`;
  }

  // Check if content template is provided
  const content = findParameter(['contentTemplate', 'content', 'message', 'body']);
  if (content) {
    guidance += `\n- Content template: ${content}`;
    guidance += `\n- IMPORTANT: Replace the template with actual data from previous steps`;
    guidance += `\n- Include specific details like activity name, distance, duration, and metrics`;
  } else {
    guidance += `\n- Generate email content based on step name and previous step data`;
  }

  // Add specific instructions for using previous step data
  if (context.steps && Object.keys(context.steps).length > 0) {
    guidance += `\n- USE DATA FROM PREVIOUS STEPS: Don't send generic templates!`;
    guidance += `\n- Extract activity details from step results and include them in the email`;
    guidance += `\n- Include specific metrics like distance, time, pace, heart rate if available`;
  }

  // Add data availability guidance
  const availableData = identifyAvailableDataForEmail(context);
  if (availableData.length > 0) {
    guidance += `\n- Available data: ${availableData.join(', ')}`;
  }

  return guidance;
}

/**
 * Identify what data is available from previous steps for email content
 * @param {Object} context - Execution context
 * @returns {Array} Array of available data types
 */
function identifyAvailableDataForEmail(context) {
  const availableData = [];

  if (context.steps) {
    for (const [stepId, stepResult] of Object.entries(context.steps)) {
      if (stepResult.success && stepResult.result) {
        const result = stepResult.result;

        // Check for agent response text
        if (result.agentResponse && typeof result.agentResponse === 'string') {
          availableData.push('text data from previous steps');
        }

        // Check if result contains structured data
        if (typeof result === 'object' && result !== null) {
          const keys = Object.keys(result);
          if (keys.length > 0) {
            availableData.push('structured data');
          }
        }

        // Check for arrays (lists of items)
        if (Array.isArray(result)) {
          availableData.push('list data');
        }
      }
    }
  }

  return [...new Set(availableData)]; // Remove duplicates
}

/**
 * Generate specific action instructions based on step name patterns
 * @param {string} stepName - Name of the step
 * @param {Object} config - Step configuration
 * @returns {string} Specific instruction
 */
function generateActionInstructions(stepName, config) {
  const name = stepName.toLowerCase();

  // Pattern matching for common workflow step types
  if (name.includes('fetch') || name.includes('get') || name.includes('retrieve')) {
    if (name.includes('strava')) {
      return 'Use a Strava MCP tool to fetch the requested data';
    } else if (name.includes('linkedin')) {
      return 'Use a LinkedIn MCP tool to retrieve the requested information';
    } else {
      return 'Use the appropriate MCP tool to fetch the requested data';
    }
  }

  if (name.includes('create') || name.includes('post') || name.includes('publish')) {
    if (name.includes('linkedin')) {
      return 'Use the LinkedIn CREATE-TEXT-POST-USER tool to create a post';
    } else {
      return 'Use the appropriate MCP tool to create the requested content';
    }
  }

  if (name.includes('extract') || name.includes('parse') || name.includes('analyze')) {
    return 'Process the data from previous steps and extract the required information';
  }

  if (name.includes('compose') || name.includes('format') || name.includes('generate')) {
    return 'Generate the requested text/content based on the available data';
  }

  // Default instruction
  return `Complete the task: "${stepName}"`;
}

/**
 * Create a task prompt for a workflow step
 * @param {Object} step - Workflow step
 * @param {Object} context - Execution context
 * @returns {string} Task prompt for the agent
 */
function createTaskPromptForStep(step, context) {
  // Start with a more specific, actionable prompt
  let prompt = `WORKFLOW STEP EXECUTION:

Step Name: "${step.name}"
Step Type: ${step.type}

CRITICAL: This is a NEW step execution. Ignore any previous tool calls or responses.

INSTRUCTIONS:`;

  // Handle different step types
  if (step.type === 'mcp_agent_action') {
    // MCP Agent Action - Use tools
    if (step.config.toolName) {
      // If a specific tool is configured, instruct the agent to use it directly
      prompt += `\n1. Call the MCP tool "${step.config.toolName}" directly`;
      prompt += `\n   - Do NOT call any other tools, especially "${
        step.config.toolName === 'STRAVA-GET-ACTIVITY-BY-ID'
          ? 'STRAVA-GET-ACTIVITY-LIST'
          : 'any other tools'
      }"`;
      prompt += `\n   - This step requires EXACTLY "${step.config.toolName}" and no other tool`;

      // Handle parameters from the standard parameters object
      let parametersToUse = {};

      // Primary source: parameters object
      if (step.config.parameters) {
        parametersToUse = resolveParameters(step.config.parameters, context);
      }

      // Secondary source: toolParameters (for backward compatibility)
      if (step.config.toolParameters) {
        parametersToUse = { ...parametersToUse, ...step.config.toolParameters };
      }

      if (Object.keys(parametersToUse).length > 0) {
        prompt += `\n2. Use these parameters:`;
        for (const [key, value] of Object.entries(parametersToUse)) {
          prompt += `\n   - ${key}: ${JSON.stringify(value)}`;
        }
      } else {
        prompt += `\n2. Check the step configuration for parameter requirements`;
      }

      // Add special handling for email steps
      if (step.config.toolName.includes('EMAIL')) {
        prompt += generateEmailStepGuidance(step, context);
      }

      if (step.config.instruction) {
        prompt += `\n3. Additional instruction: ${step.config.instruction}`;
      }

      prompt += `\n4. Return the raw tool result without additional commentary`;
      prompt += `\n\nIMPORTANT: Call the specified tool exactly once and return its result immediately. Do not make multiple tool calls or attempt to interpret the data.`;
    } else {
      // If no specific tool is configured, give guidance based on step name
      prompt += `\n1. ${generateActionInstructions(step.name, step.config)}`;
      prompt += `\n2. Use the most appropriate MCP tool from the available tools`;
      prompt += `\n3. Make only ONE tool call to complete this task`;
      prompt += `\n4. Return the result in a structured format`;
    }
  } else if (step.type === 'agent_action_no_tool') {
    // Agent Action without tools - Pure reasoning
    prompt += `\n1. Use your reasoning capabilities to complete this task`;
    prompt += `\n2. DO NOT call any tools - this is a reasoning-only task`;
    prompt += `\n3. Process the information from previous steps if available`;
    
    if (step.config.instruction) {
      prompt += `\n4. Task instruction: ${step.config.instruction}`;
    } else {
      prompt += `\n4. ${generateActionInstructions(step.name, step.config)}`;
    }
    
    prompt += `\n5. Provide a clear, structured response based on your analysis`;
    prompt += `\n\nIMPORTANT: This is a reasoning task only. Do not attempt to call any tools. Use the data from previous steps and your understanding to complete the task.`;
  } else if (step.type === 'action') {
    // Legacy action type - keep for backward compatibility
    if (step.config.toolName) {
      // If a specific tool is configured, instruct the agent to use it directly
      prompt += `\n1. Call the MCP tool "${step.config.toolName}" directly`;
      prompt += `\n   - Do NOT call any other tools, especially "${
        step.config.toolName === 'STRAVA-GET-ACTIVITY-BY-ID'
          ? 'STRAVA-GET-ACTIVITY-LIST'
          : 'any other tools'
      }"`;
      prompt += `\n   - This step requires EXACTLY "${step.config.toolName}" and no other tool`;

      // Handle parameters from the standard parameters object
      let parametersToUse = {};

      // Primary source: parameters object
      if (step.config.parameters) {
        parametersToUse = resolveParameters(step.config.parameters, context);
      }

      // Secondary source: toolParameters (for backward compatibility)
      if (step.config.toolParameters) {
        parametersToUse = { ...parametersToUse, ...step.config.toolParameters };
      }

      if (Object.keys(parametersToUse).length > 0) {
        prompt += `\n2. Use these parameters:`;
        for (const [key, value] of Object.entries(parametersToUse)) {
          prompt += `\n   - ${key}: ${JSON.stringify(value)}`;
        }
      } else {
        prompt += `\n2. Check the step configuration for parameter requirements`;
      }

      // Add special handling for email steps
      if (step.config.toolName.includes('EMAIL')) {
        prompt += generateEmailStepGuidance(step, context);
      }

      if (step.config.instruction) {
        prompt += `\n3. Additional instruction: ${step.config.instruction}`;
      }

      prompt += `\n4. Return the raw tool result without additional commentary`;
      prompt += `\n\nIMPORTANT: Call the specified tool exactly once and return its result immediately. Do not make multiple tool calls or attempt to interpret the data.`;
    } else {
      // If no specific tool is configured, give guidance based on step name
      prompt += `\n1. ${generateActionInstructions(step.name, step.config)}`;
      prompt += `\n2. Use the most appropriate MCP tool from the available tools`;
      prompt += `\n3. Make only ONE tool call to complete this task`;
      prompt += `\n4. Return the result in a structured format`;
    }
  }

  // Add context from previous steps if available and relevant
  if (context.steps && Object.keys(context.steps).length > 0) {
    prompt += `\n\nPREVIOUS STEP RESULTS (for reference only):`;

    // Only include the last 2 steps to avoid overwhelming the agent
    const stepEntries = Object.entries(context.steps);
    const recentSteps = stepEntries.slice(-2);

    for (const [stepId, stepResult] of recentSteps) {
      if (stepResult.success && stepResult.result) {
        // Use full results for data flow, not summaries
        const fullResult = getFullStepResult(stepResult.result);
        prompt += `\n- ${stepId}: ${fullResult}`;
      }
    }

    // Add workflow execution context
    prompt += `\n\nWORKFLOW CONTEXT:`;
    prompt += `\n- Workflow: ${context.workflow?.name || 'Unknown'}`;
    prompt += `\n- Current Step: ${step.id}`;
    prompt += `\n- Step ${stepEntries.length + 1} of ${
      context.workflow?.totalSteps || 'unknown'
    }`;
  } else {
    // Add workflow execution context even if no previous steps
    prompt += `\n\nWORKFLOW CONTEXT:`;
    prompt += `\n- Workflow: ${context.workflow?.name || 'Unknown'}`;
    prompt += `\n- Current Step: ${step.id}`;
    prompt += `\n- Step 1 of ${context.workflow?.totalSteps || 'unknown'}`;
  }

  // Final instructions to prevent recursion and enforce tool selection
  prompt += `\n\nEXECUTION RULES:`;
  prompt += `\n1. Execute this step exactly once`;
  
  if (step.type === 'agent_action_no_tool') {
    prompt += `\n2. DO NOT call any tools - this is a reasoning-only task`;
    prompt += `\n3. Use only your analytical and reasoning capabilities`;
  } else if (step.config.toolName) {
    prompt += `\n2. ONLY call the tool "${step.config.toolName}" - do not call any other tools`;
    prompt += `\n3. If the specified tool is not available, report an error immediately`;
  } else {
    prompt += `\n2. Do not call multiple tools unless explicitly required`;
  }
  
  prompt += `\n4. Do not attempt to validate or modify the results`;
  prompt += `\n5. Return results immediately after ${step.type === 'agent_action_no_tool' ? 'reasoning' : 'tool execution'}`;
  prompt += `\n6. Do not ask for clarification or additional input`;
  prompt += `\n7. Do not call tools from previous workflow steps`;
  prompt += `\n8. This is a fresh execution - ignore any previous conversation history`;

  // Replace special variables like {{current_user}}
  if (context.user) {
    prompt = replaceSpecialVars({ text: prompt, user: context.user });
  }

  return prompt;
}

module.exports = {
  createTaskPromptForStep,
}; 
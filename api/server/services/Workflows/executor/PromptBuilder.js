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

      // Fallback: toolParameters object  
      if (step.config.toolParameters?.[paramName]) {
        return step.config.toolParameters[paramName];
      }

      // Last resort: direct in config
      if (step.config[paramName]) {
        return step.config[paramName];
      }
    }
    return null;
  };

  // Check if specific email parameters are configured
  const recipient = findParameter(['recipient', 'to', 'email']);
  const subject = findParameter(['subject', 'title']);
  const content = findParameter(['contentTemplate', 'content', 'message', 'body']);
  const instruction = findParameter(['instruction']);

  if (recipient) {
    guidance += `\n- ✅ Recipient is configured: Use EXACTLY "${recipient}"`;
  }

  if (subject) {
    guidance += `\n- ✅ Subject is configured: Use EXACTLY "${subject}"`;
  }

  if (content) {
    guidance += `\n- ✅ Content template is configured: Use EXACTLY "${content}"`;
  }

  if (instruction) {
    guidance += `\n- ✅ Instruction is configured: "${instruction}"`;
  }

  // If parameters are configured, emphasize using them exactly
  if (recipient || subject || content || instruction) {
    guidance += `\n\n⚠️  EMAIL CONFIGURATION IS ALREADY SET:`;
    guidance += `\n- Use the EXACT parameters configured above`;
    guidance += `\n- Do not modify recipient, subject, or content based on previous step data`;
    guidance += `\n- Do not substitute your own interpretation of what the email should contain`;
    guidance += `\n- The workflow creator has already specified the exact email parameters to use`;
  } else {
    // Only if no specific parameters are configured, then suggest using previous step data
    guidance += `\n\n📧 NO EMAIL PARAMETERS CONFIGURED - Extract from previous steps:`;
    
    // Look for data that could be used in email
    const availableData = identifyAvailableData(context);
    
    if (availableData.length > 0) {
      guidance += `\n\nAvailable data for email content:`;
      availableData.forEach((dataItem) => {
        guidance += `\n- ${dataItem.description}`;
        if (dataItem.usage) {
          guidance += ` (${dataItem.usage})`;
        }
      });
      
      guidance += `\n\n📝 EMAIL CONTENT SUGGESTIONS:`;
      guidance += `\n- Create subject line that summarizes the key information`;
      guidance += `\n- Include specific details and data points from previous steps`;
      guidance += `\n- Format the content to be clear and actionable`;
      guidance += `\n- If recipient isn't specified, you may need to determine it from context`;
    } else {
      guidance += `\n- No previous step data available to use in email`;
      guidance += `\n- You may need to use generic content or report missing data`;
    }
  }

  return guidance;
}

/**
 * Identify what data is available from previous steps for any tool usage
 * @param {Object} context - Execution context
 * @returns {Array} Array of available data types with specific details
 */
function identifyAvailableData(context) {
  const availableData = [];

  if (context.steps) {
    for (const [stepId, stepResult] of Object.entries(context.steps)) {
      if (stepResult.success && stepResult.result) {
        const result = stepResult.result;

        // Analyze the structure and content of the result
        if (typeof result === 'object' && result !== null) {
          // Check for agent response with tool results
          if (result.agentResponse) {
            if (typeof result.agentResponse === 'string') {
              availableData.push({ description: `text response from ${stepId}`, usage: 'Use for email content' });
            } else if (typeof result.agentResponse === 'object') {
              // Look for specific data patterns in agent responses
              const responseStr = JSON.stringify(result.agentResponse);
              
              if (responseStr.includes('activity') || responseStr.includes('workout')) {
                availableData.push({ description: `activity/workout data from ${stepId}`, usage: 'Use for email content' });
              }
              if (responseStr.includes('meeting') || responseStr.includes('calendar')) {
                availableData.push({ description: `meeting/calendar data from ${stepId}`, usage: 'Use for email content' });
              }
              if (responseStr.includes('distance') || responseStr.includes('duration') || responseStr.includes('time')) {
                availableData.push({ description: `metrics and measurements from ${stepId}`, usage: 'Use for email content' });
              }
              if (responseStr.includes('name') || responseStr.includes('title')) {
                availableData.push({ description: `names and titles from ${stepId}`, usage: 'Use for email content' });
              }
              if (responseStr.includes('date') || responseStr.includes('timestamp')) {
                availableData.push({ description: `date/time information from ${stepId}`, usage: 'Use for email content' });
              }
              
              // General structured data
              availableData.push({ description: `structured data from ${stepId}`, usage: 'Use for email content' });
            }
          }

          // Check for tool results/calls
          if (result.toolResults || result.toolCalls) {
            availableData.push({ description: `tool execution results from ${stepId}`, usage: 'Use for email content' });
          }
          
          // Check for arrays (lists of items)
          if (Array.isArray(result)) {
            availableData.push({ description: `list/array data from ${stepId} (${result.length} items)`, usage: 'Use for email content' });
          } else {
            // Check object keys for common patterns
            const keys = Object.keys(result);
            const keyStr = keys.join(' ').toLowerCase();
            
            if (keyStr.includes('id')) {
              availableData.push({ description: `ID values from ${stepId}`, usage: 'Use for email content' });
            }
            if (keyStr.includes('name') || keyStr.includes('title')) {
              availableData.push({ description: `names/titles from ${stepId}`, usage: 'Use for email content' });
            }
            if (keyStr.includes('count') || keyStr.includes('total') || keyStr.includes('number')) {
              availableData.push({ description: `count/numerical data from ${stepId}`, usage: 'Use for email content' });
            }
          }
        } else if (typeof result === 'string') {
          // Simple string result
          if (result.length > 10) {
            availableData.push({ description: `text content from ${stepId}`, usage: 'Use for email content' });
          }
        } else if (typeof result === 'number') {
          availableData.push({ description: `numerical value from ${stepId}`, usage: 'Use for email content' });
        }
      }
    }
  }

  return availableData;
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
 * Generate user timezone-aware date and time information
 * @param {Object} user - User object with timezone information
 * @returns {string} Formatted date and time context
 */
function generateTimezoneAwareDateTimeContext(user) {
  if (!user) {
    return '';
  }

  const userTimezone = user.timezone || 'UTC';
  const now = new Date();

  try {
    // Format current date and time in user's timezone
    const userDate = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long'
    }).format(now);

    const userTime = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(now);

    const userDateTime = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(now);

    return `
CURRENT DATE & TIME CONTEXT:
- User Timezone: ${userTimezone}
- Current Date: ${userDate}
- Current Time: ${userTime}
- Full DateTime: ${userDateTime}
- ISO UTC: ${now.toISOString()}

IMPORTANT: Use this timezone-aware date/time information when fetching data that depends on the current date (e.g., "today's meetings", "recent activities", etc.).`;
  } catch (error) {
    console.warn(`Failed to generate timezone-aware datetime for timezone ${userTimezone}:`, error);
    // Fallback to basic ISO datetime
    return `
CURRENT DATE & TIME CONTEXT:
- Current DateTime (UTC): ${now.toISOString()}
- Note: User timezone (${userTimezone}) could not be processed, using UTC`;
  }
}

/**
 * Generate context instructions based on step type and previous results
 * @param {Object} step - Current workflow step
 * @param {Object} context - Execution context
 * @returns {string} Context-specific instructions
 */
function generateContextUsageInstructions(step, context) {
  const stepName = step.name.toLowerCase();
  const hasPreviousSteps = context.steps && Object.keys(context.steps).length > 0;
  const hasConfiguredParameters = step.config?.parameters && Object.keys(step.config.parameters).length > 0;
  
  if (!hasPreviousSteps && !hasConfiguredParameters) {
    return ''; // No context to use and no configured parameters
  }
  
  let instructions = `\n\nDATA FLOW INSTRUCTIONS:`;
  
  // If step has configured parameters, emphasize using them first
  if (hasConfiguredParameters) {
    instructions += `\n- ✅ STEP HAS CONFIGURED PARAMETERS - Use the exact parameters listed above`;
    instructions += `\n- ⚠️  Do not override configured parameters with data from previous steps`;
    instructions += `\n- ⚠️  Only use previous step data if parameters contain template variables or placeholders`;
    
    if (hasPreviousSteps) {
      instructions += `\n- 📊 Previous step data is available for reference but parameters take precedence`;
    }
  } else if (hasPreviousSteps) {
    // Only if no configured parameters, then guide on using previous step data
    instructions += `\n- 📊 NO CONFIGURED PARAMETERS - Extract data from previous steps:`;
    
    // Identify the type of current step to give specific guidance
    if (stepName.includes('send') || stepName.includes('email') || stepName.includes('message') || stepName.includes('notify')) {
      instructions += `\n- This step appears to SEND/COMMUNICATE data - use specific details from previous steps`;
      instructions += `\n- Extract concrete values (names, numbers, dates, metrics) from previous step results`;
      instructions += `\n- Do NOT use generic placeholders - include actual data from the workflow`;
      instructions += `\n- Transform raw data into human-readable content appropriate for communication`;
    } else if (stepName.includes('format') || stepName.includes('compose') || stepName.includes('generate') || stepName.includes('create')) {
      instructions += `\n- This is a CONTENT CREATION step - use data from previous steps as input`;
      instructions += `\n- Transform the raw data into the required format or structure`;
      instructions += `\n- Include specific details and measurements from previous step results`;
    } else if (stepName.includes('analyze') || stepName.includes('process') || stepName.includes('extract')) {
      instructions += `\n- This is a DATA PROCESSING step - analyze the data from previous steps`;
      instructions += `\n- Look for patterns, key metrics, or specific information to extract`;
      instructions += `\n- Apply calculations, filters, or transformations to the input data`;
    } else if (stepName.includes('filter') || stepName.includes('search') || stepName.includes('find')) {
      instructions += `\n- This step appears to FILTER/SEARCH data - use criteria from previous steps`;
      instructions += `\n- Apply filters, search terms, or conditions based on previous step results`;
      instructions += `\n- Use specific IDs, names, or values from earlier steps as search parameters`;
    } else if (stepName.includes('update') || stepName.includes('modify') || stepName.includes('edit')) {
      instructions += `\n- This is an UPDATE step - use IDs and values from previous steps`;
      instructions += `\n- Extract specific IDs or references that need to be updated`;
      instructions += `\n- Apply changes based on the data gathered in earlier steps`;
    } else {
      instructions += `\n- Use data from previous steps to inform your current action`;
      instructions += `\n- Extract relevant values, IDs, or information from earlier step results`;
      instructions += `\n- Build upon the context and data flow from previous steps`;
    }
    
    instructions += `\n- Previous step data is provided below - reference it in your tool execution`;
    instructions += `\n- If previous steps contain IDs, names, or specific values you need, use them directly`;
  }

  return instructions;
}

/**
 * Formats the results of previous steps to be included in the prompt for the current step.
 * This provides the necessary data context for the agent to execute its task.
 * @param {Object} context - The execution context containing results from previous steps.
 * @returns {string} A formatted string of previous step results.
 */
function formatPreviousStepResults(context) {
  if (!context.steps || Object.keys(context.steps).length === 0) {
    return 'No data from previous steps is available.';
  }

  let resultsSection = '-- AVAILABLE DATA FROM PREVIOUS STEPS --\n\n';
  resultsSection +=
    'Use the following data from completed steps to perform your task. Reference specific values (like IDs, names, or content) from this data in your tool call.\n\n';

  for (const [stepId, stepResult] of Object.entries(context.steps)) {
    resultsSection += `[Step: "${stepId}"]\n`;
    if (stepResult.success && stepResult.result) {
      const fullResult = getFullStepResult(stepResult.result);
      resultsSection += `Status: SUCCESS\n`;
      resultsSection += `Data: ${fullResult}\n\n`;
    } else {
      resultsSection += `Status: FAILED\n`;
      resultsSection += `Error: ${stepResult.error || 'Unknown error'}\n\n`;
    }
  }
  return resultsSection;
}

/**
 * Creates a clear, direct, and unambiguous task prompt for a single workflow step execution.
 * This prompt is designed to prevent the agent from deviating from its execution role and
 * ensures it performs its designated task without creating new workflows or calling unspecified tools.
 *
 * @param {Object} step - The workflow step to be executed.
 * @param {Object} context - The current execution context of the workflow.
 * @returns {string} An explicit prompt for the agent to execute the step.
 */
function createTaskPromptForStep(step, context) {
  const { replaceSpecialVars } = require('librechat-data-provider');

  let prompt = `
-- WORKFLOW EXECUTION CONTEXT --

You are in WORKFLOW EXECUTION MODE. Your ONLY job is to execute a single step within a larger automated workflow. You are not in a conversational or creative mode.

- Workflow Name: "${context.workflow?.name || 'Unknown Workflow'}"
- Current Step ID: "${step.id}"
- Current Step Name: "${step.name}"

-- CURRENT STEP DETAILS --

You are to execute the following step:

- Step Name: "${step.name}"
- Step Type: "${step.type}"
${step.config?.instruction ? `- Instruction: "${step.config.instruction}"` : ''}

- Tool to Use: "${step.config?.toolName || 'Not specified'}"
- Parameters to Use:
${
  step.config?.parameters
    ? JSON.stringify(step.config.parameters, null, 2)
    : 'No parameters specified.'
}

${formatPreviousStepResults(context)}
-- YOUR TASK --

Your task is to execute the step described above using the provided data and tool configurations. You MUST call the specified tool with the specified parameters.

-- CRITICAL EXECUTION RULES --

1.  **EXECUTE, DO NOT CREATE**: You are EXECUTING a step. You MUST NOT create a new workflow.
2.  **USE SPECIFIED TOOL**: You MUST call the tool named "${
  step.config?.toolName || 'Not specified'
}". Do NOT use any other tool.
3.  **USE SPECIFIED PARAMETERS**: You MUST use the parameters exactly as listed above. Do not invent or modify them. If previous step data is needed to fill a parameter, extract the exact values.
4.  **NO CONVERSATION**: This is a direct command. Do not ask for clarification, confirmation, or engage in conversation.
5.  **IMMEDIATE ACTION**: Execute the tool call immediately.
6.  **ONE ACTION ONLY**: Perform this single action and then stop.
`;

  return replaceSpecialVars({ text: prompt });
}

module.exports = {
  createTaskPromptForStep,
}; 
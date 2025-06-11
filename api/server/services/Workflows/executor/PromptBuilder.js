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
              if (responseStr.includes('data') || responseStr.includes('items')) {
                availableData.push({ description: `data/items from ${stepId}`, usage: 'Use for email content' });
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

IMPORTANT: Use this timezone-aware date/time information when fetching data that depends on the current date (e.g., "today's data", "recent activities", etc.).`;
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
 * Generate tool discovery and selection guidance
 * @param {Object} step - Current workflow step
 * @param {Object} context - Execution context
 * @returns {string} Tool discovery guidance
 */
function generateToolDiscoveryGuidance(step, context) {
  const stepName = step.name.toLowerCase();
  const stepObjective = generateActionInstructions(step.name, step.config);
  const suggestedTool = step.config?.toolName;
  
  let guidance = `**YOUR OBJECTIVE:** ${stepObjective}\n\n`;
  
  if (suggestedTool) {
    guidance += `**SUGGESTED TOOL:** The workflow suggests using "${suggestedTool}". However, your primary responsibility is to achieve the objective above. If this tool doesn't exist or isn't appropriate, find the correct tool that accomplishes the goal.\n\n`;
  }
  
  guidance += `**TOOL DISCOVERY APPROACH:**\n`;
  guidance += `1. **ANALYZE YOUR OBJECTIVE:** Understand exactly what you need to accomplish\n`;
  guidance += `2. **IDENTIFY REQUIRED CAPABILITY:** Determine what type of tool/API you need\n`;
  guidance += `3. **DISCOVER AVAILABLE TOOLS:** Look through your available tools to find the right one\n`;
  guidance += `4. **SELECT THE BEST MATCH:** Choose the tool that best accomplishes your objective\n\n`;
  
  // Generate capability-based guidance
  guidance += generateCapabilityGuidance(stepName, stepObjective, context);
  
  return guidance;
}

/**
 * Generate capability-based guidance for tool selection
 * @param {string} stepName - Step name
 * @param {string} stepObjective - Step objective
 * @param {Object} context - Execution context
 * @returns {string} Capability guidance
 */
function generateCapabilityGuidance(stepName, stepObjective, context) {
  let guidance = `**CAPABILITY REQUIREMENTS:**\n`;
  
  // Data retrieval capabilities
  if (stepName.includes('fetch') || stepName.includes('get') || stepName.includes('retrieve')) {
    guidance += `**Data Retrieval Operations Needed:**\n`;
    guidance += `- Look for tools that can access and retrieve data\n`;
    guidance += `- Common patterns: *GET*, *FETCH*, *RETRIEVE*, *LIST* in tool names\n`;
    guidance += `- Capabilities needed: data access, filtering, result limiting\n`;
    guidance += `- Focus on tools that match your data source requirements\n\n`;
    
    guidance += `**Expected Parameters:**\n`;
    guidance += `- Filtering parameters (date ranges, specific criteria)\n`;
    guidance += `- Field selection (choose specific data fields)\n`;
    guidance += `- Sorting and ordering options\n`;
    guidance += `- Result limiting (top N results)\n\n`;
  }
  
  // Email capabilities
  else if (stepName.includes('email') || stepName.includes('message') || stepName.includes('send')) {
    guidance += `**Email Operations Needed:**\n`;
    guidance += `- Look for tools that can send emails or manage messages\n`;
    guidance += `- Common patterns: *EMAIL*, *MESSAGE*, *SEND*, *MAIL* in tool names\n`;
    guidance += `- Capabilities needed: send email, create drafts, manage recipients\n\n`;
  }
  
  // Trello capabilities
  else if (stepName.includes('trello') || stepName.includes('card') || stepName.includes('board')) {
    guidance += `**Trello Operations Needed:**\n`;
    guidance += `- Look for tools that can manage Trello boards, lists, and cards\n`;
    guidance += `- Common patterns: *TRELLO*, *CARD*, *BOARD*, *LIST* in tool names\n`;
    guidance += `- Capabilities needed: find boards, search lists, create cards\n\n`;
  }
  
  // Search/Find capabilities
  else if (stepName.includes('find') || stepName.includes('search') || stepName.includes('get')) {
    guidance += `**Search/Retrieval Operations Needed:**\n`;
    guidance += `- Look for tools that can search or retrieve data\n`;
    guidance += `- Common patterns: *SEARCH*, *FIND*, *GET*, *LIST*, *FETCH* in tool names\n`;
    guidance += `- Consider what platform/service you're searching\n\n`;
  }
  
  // Generic guidance
  else {
    guidance += `**General Operation Requirements:**\n`;
    guidance += `- Analyze your step objective to understand required capabilities\n`;
    guidance += `- Look for tools with relevant keywords in their names\n`;
    guidance += `- Consider the platform or service you need to interact with\n\n`;
  }
  
  guidance += `**TOOL SELECTION PRIORITY:**\n`;
  guidance += `1. **EXACT MATCH:** Tools that exactly match your required capability\n`;
  guidance += `2. **PLATFORM MATCH:** Tools for the right platform or service\n`;
  guidance += `3. **CAPABILITY MATCH:** Tools that can perform the required action\n`;
  guidance += `4. **AVOID WRONG TOOLS:** Don't force incompatible tools to work\n\n`;
  
  return guidance;
}

/**
 * Generate intelligent parameter guidance for the agent
 * @param {Object} step - Current workflow step
 * @param {Object} context - Execution context
 * @returns {string} Parameter guidance
 */
function generateParameterGuidance(step, context) {
  const toolName = step.config?.toolName;
  const stepName = step.name.toLowerCase();
  const stepObjective = generateActionInstructions(step.name, step.config);
  
  let guidance = '';
  
  // Check if there are any configured parameters that make sense
  const hasValidParameters = step.config?.parameters && 
    Object.keys(step.config.parameters).length > 0 &&
    !hasNonsensicalParameters(step.config.parameters);
  
  if (hasValidParameters) {
    guidance += `Use these pre-configured parameters as your starting point:\n\`\`\`json\n${JSON.stringify(step.config.parameters, null, 2)}\n\`\`\`\n\n`;
  }
  
  // Provide tool-specific guidance
  if (toolName) {
    if (toolName.includes('TRELLO')) {
      guidance += generateTrelloGuidance(toolName, stepName, stepObjective, context);
    } else if (toolName.includes('STRAVA')) {
      guidance += generateStravaGuidance(toolName, stepName, stepObjective, context);
    } else {
      guidance += generateGenericToolGuidance(toolName, stepName, stepObjective, context);
    }
  } else {
    guidance += 'No specific tool specified. Determine the appropriate tool and parameters based on your step objective.';
  }
  
  return guidance;
}

/**
 * Check if parameters contain nonsensical values
 * @param {Object} parameters - Parameters to check
 * @returns {boolean} True if parameters are nonsensical
 */
function hasNonsensicalParameters(parameters) {
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string') {
      // Check for clearly nonsensical patterns
      if (value.includes('$ $') || value === '$' || value.trim() === '' || 
          value.includes('$,') || value.match(/^[,$\s]+$/)) {
        return true;
      }
    }
  }
  return false;
}



/**
 * Generate Trello guidance
 * @param {string} toolName - Tool name
 * @param {string} stepName - Step name
 * @param {string} stepObjective - Step objective
 * @param {Object} context - Execution context
 * @returns {string} Guidance
 */
function generateTrelloGuidance(toolName, stepName, stepObjective, context) {
  let guidance = `**Trello API Tool Guidance:**\n`;
  
  if (toolName.includes('SEARCH') || toolName.includes('FIND')) {
    guidance += `- Use "query" parameter to search for boards, lists, or cards\n`;
    guidance += `- Be specific with search terms\n\n`;
  } else if (toolName.includes('CREATE') && toolName.includes('CARD')) {
    guidance += `- Provide "name" for card title\n`;
    guidance += `- Provide "listId" for the target list\n`;
    guidance += `- Use "desc" for card description\n`;
    guidance += `- If adding checklist items, use appropriate checklist parameters\n\n`;
  }
  
  guidance += `**Data Flow Considerations:**\n`;
  if (context.steps && Object.keys(context.steps).length > 0) {
    guidance += `- You may need board/list IDs from previous steps\n`;
    guidance += `- Extract data from previous step results\n`;
    guidance += `- Transform data into appropriate card format\n\n`;
  }
  
  return guidance;
}

/**
 * Generate Strava guidance
 * @param {string} toolName - Tool name
 * @param {string} stepName - Step name
 * @param {string} stepObjective - Step objective
 * @param {Object} context - Execution context
 * @returns {string} Guidance
 */
function generateStravaGuidance(toolName, stepName, stepObjective, context) {
  let guidance = `**Strava API Tool Guidance:**\n`;
  
  if (toolName.includes('ACTIVITIES')) {
    guidance += `- Use "limit" to control number of activities returned\n`;
    guidance += `- Use date parameters if filtering by time range\n`;
    guidance += `- Include detailed activity information if needed\n\n`;
  }
  
  return guidance;
}

/**
 * Generate tool-specific guidance
 * @param {string} toolName - Tool name
 * @param {string} stepName - Step name
 * @param {string} stepObjective - Step objective
 * @param {Object} context - Execution context
 * @returns {string} Guidance
 */
function generateGenericToolGuidance(toolName, stepName, stepObjective, context) {
  let guidance = `**Tool: ${toolName}**\n`;
  guidance += `- Analyze your step objective: "${stepObjective}"\n`;
  guidance += `- Determine the appropriate parameters to achieve this goal\n`;
  guidance += `- Use data from previous steps if available\n`;
  guidance += `- Follow the tool's expected parameter format\n`;
  guidance += `- Construct parameters based on the tool's documentation and requirements\n\n`;
  
  return guidance;
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
 * This prompt is designed to empower the agent to reason about its task, use context from previous
 * steps, and execute its designated task intelligently to contribute to the overall workflow goal.
 *
 * @param {Object} step - The workflow step to be executed.
 * @param {Object} context - The current execution context of the workflow.
 * @returns {string} An explicit prompt for the agent to execute the step.
 */
function createTaskPromptForStep(step, context) {
  const { replaceSpecialVars } = require('librechat-data-provider');
  const stepName = step.name.toLowerCase();
  const hasPreviousSteps = context.steps && Object.keys(context.steps).length > 0;

  let dynamicInstructions = '';

  // Generate dynamic, context-aware instructions for the agent to follow.
  if (hasPreviousSteps) {
    let specificGuidance = '';
    // This is where we add special-cased logic for known complex patterns.
    if (
      stepName.includes('create draft') ||
      stepName.includes('create reply') ||
      stepName.includes('draft reply')
    ) {
      const hasStyleAnalysisStep = Object.values(context.steps).some((s) =>
        s.result?.stepName?.toLowerCase().includes('writing style'),
      );
      const hasUnreadFetchStep = Object.values(context.steps).some((s) =>
        s.result?.stepName?.toLowerCase().includes('fetch unread'),
      );

      if (hasStyleAnalysisStep && hasUnreadFetchStep) {
        specificGuidance = `
**Critical Guidance for this Email Drafting Step:**
1.  **Analyze Writing Style:** Review the data from the '...Writing Style Analysis' step. Understand the user's tone, common phrases, and signature.
2.  **Process Unread Emails:** The data from the 'Fetch Unread Emails' step contains a list of emails. You are to process **each** of these emails.
3.  **Synthesize and Draft:** For each unread email, you MUST formulate a contextually appropriate response based on its content. The response MUST match the user's writing style you analyzed.
4.  **Execute Tool:** Call the \`${
  step.config?.toolName
}\` tool to create a draft for EACH email. Do not send, only draft. The parameters you provide to the tool (like 'recipient', 'subject', 'body') must be derived from the unread email and your synthesized response.
`;
      }
    } else if (stepName.includes('fetch unread')) {
      specificGuidance = `
**Critical Guidance for this Fetch Step:**
- Your goal is to get emails that require a response. Use appropriate filtering to retrieve only unread emails.
- Be efficient. Limit the results to a reasonable number.
`;
    } else if (stepName.includes('writing style')) {
      specificGuidance = `
**Critical Guidance for this Analysis Step:**
- Your goal is to get examples of the user's writing. Fetch a small number of their most RECENT sent emails.
- Ensure you query the appropriate folder for sent items.
`;
    }

    dynamicInstructions = `
-- 3. INTELLIGENT TASK INSTRUCTIONS --
This step builds upon the results of previous steps. You must intelligently use the data provided below to achieve this step's goal.
${specificGuidance}
- Your primary responsibility is to produce a USEFUL result that contributes to the overall workflow.
`;
  } else {
    dynamicInstructions = `
-- 3. INTELLIGENT TASK INSTRUCTIONS --
This is the first step in the workflow. Execute it as defined to begin the process.
`;
  }

  let prompt = `
-- MISSION BRIEFING --

You are an intelligent agent executing one step within a larger automated workflow. Your job is to think, reason, and use the provided tools and data to accomplish your assigned task, contributing to the overall goal of the workflow.

-- 1. OVERALL WORKFLOW GOAL --
Your step is part of a workflow created to achieve the following user request:
"${context.workflow?.description || context.workflow?.name || 'No overall goal provided.'}"

-- 2. YOUR CURRENT STEP & OBJECTIVE --
- Step Name: "${step.name}"
- Step Objective: ${generateActionInstructions(step.name, step.config)}
${dynamicInstructions}
-- 4. AVAILABLE DATA & TOOLS --
${formatPreviousStepResults(context)}
**Tool Discovery & Selection:**
${generateToolDiscoveryGuidance(step, context)}

-- 5. YOUR TASK & CRITICAL EXECUTION RULES --

1.  **OBJECTIVE FIRST**: Your primary task is to achieve your step objective. Focus on the GOAL, not on using specific tools.
2.  **TOOL DISCOVERY**: Find the right tool for the job. Don't force incompatible tools. If the suggested tool doesn't exist or work, discover and use the correct one.
3.  **INTELLIGENT TOOL SELECTION**: Look through your available tools and select the one that best matches your required capability. Tool names often contain relevant keywords.
4.  **SMART PARAMETERIZATION**: Once you've selected the right tool, construct appropriate parameters using standard API conventions and patterns.
5.  **CONTEXT UTILIZATION**: Use data from previous steps and the current context to inform your tool selection and parameters.
6.  **IMMEDIATE ACTION**: Once you've identified the right approach, execute it. Don't ask for confirmation.
7.  **ONE FOCUSED ACTION**: Perform one well-reasoned action that achieves your objective, then stop.
`;

  return replaceSpecialVars({ text: prompt });
}

module.exports = {
  createTaskPromptForStep,
}; 
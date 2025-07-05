const express = require('express');
const OpenAI = require('openai');
const { promptTokensEstimate } = require('openai-chat-tokens');
const { EModelEndpoint, supportsBalanceCheck } = require('librechat-data-provider');
const { getCustomConfig, getBalanceConfig } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const { checkBalance } = require('~/models/balanceMethods');
const { spendTokens } = require('~/models/spendTokens');
const { getValueKey } = require('~/models/tx');
const { stripAutoInjectedSections } = require('~/server/utils/agentUtils');
const { logger } = require('~/config');

const router = express.Router();

router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const { title, description, instructions, availableVariables } = req.body;
    
    // Strip auto-injected sections from instructions before processing
    const cleanInstructions = stripAutoInjectedSections(instructions);

    // Get prompt assist configuration
    const customConfig = await getCustomConfig();
    const promptAssistConfig = customConfig?.promptAssist;

    if (!promptAssistConfig?.enabled) {
      return res.status(400).json({ error: 'Prompt assist is not enabled' });
    }

    const provider = promptAssistConfig.provider || 'openAI';
    const model = promptAssistConfig.model || 'gpt-4o-mini';

    if (provider !== 'openAI') {
      return res.status(400).json({ error: 'Only OpenAI provider is currently supported' });
    }

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    // Create OpenAI client directly
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Prepare messages for token estimation
    const systemPrompt = `You are an expert at writing clear, effective prompts for AI assistants. 
Your task is to enhance the given instructions to make them more clear, comprehensive, and effective.

CRITICAL FORMATTING RULES - FOLLOW EXACTLY:
- Do NOT include the title or description in your response (they are already set by the user)
- NEVER use asterisks (*) or double asterisks (**) for ANY reason
- NEVER use markdown formatting like **bold**, *italic*, ##headers, or backticks
- NEVER write **Target Audience** or **Value Proposition** - write Target Audience or VALUE PROPOSITION instead
- Use ONLY plain text with numbers (1. 2. 3.) or simple dashes (-) for structure
- For emphasis use CAPITAL LETTERS, not asterisks
- Start directly with the enhanced instructions content
- IMPORTANT: Only mention each special variable (like {{current_date}}, {{current_user}}, {{tools}}, etc.) once in your response to avoid redundancy

The enhanced prompt should:
- Be clear and unambiguous
- Include relevant context and constraints
- Specify the desired output format when applicable
- Be well-structured and easy to follow
- Be written as flowing text, not bullet points or numbered lists (better for system prompts)
- Be concise to optimize token usage without reducing quality
- Incorporate dynamic variables when they would enhance the functionality${
      availableVariables && availableVariables.length > 0
        ? `\n\nAvailable Variables (use these when appropriate):
${availableVariables.map((v) => `- ${v.syntax}: ${v.description}`).join('\n')}

When enhancing the prompt, write instructions that inform the AI about what data it has access to. For example:
- Instead of "use {{current_date}}" write "you have access to the current date" or "the current date is {{current_date}}"
- Instead of "use {{current_user}}" write "you know the current user is {{current_user}}" or "the user you're helping is {{current_user}}"
- Instead of "use {{tools}}" write "you have access to these tools: {{tools}}" or "your available tools are {{tools}}"
The AI will see the actual values (like "July 4, 2025" or "John Smith") not the variable syntax, so write instructions accordingly.`
        : ''
    }

Return ONLY the enhanced instructions content without any title, description, headers, or markdown formatting.`;

    const userPrompt = `Based on the following information, enhance the instructions for an AI assistant:

Title: ${title || 'Untitled Assistant'}
Description: ${description || 'No description provided'}
Current Instructions: ${cleanInstructions || 'No instructions provided yet'}

Create enhanced instructions that will help the AI assistant perform its intended function effectively. Consider incorporating the available variables where they would be beneficial. Remember to return only the instructions content without repeating the title or description.`;

    // Estimate token usage for balance check
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const promptTokens = promptTokensEstimate({ messages, model });
    const estimatedCompletionTokens = 1000; // Max tokens we're requesting

    // Check balance if enabled
    const balanceConfig = await getBalanceConfig();
    if (balanceConfig?.enabled && supportsBalanceCheck[EModelEndpoint.openAI]) {
      try {
        await checkBalance({
          req,
          res,
          txData: {
            user: req.user.id,
            tokenType: 'prompt',
            amount: promptTokens + estimatedCompletionTokens,
            model,
            endpoint: EModelEndpoint.openAI,
            context: 'prompt-assist',
          },
        });
      } catch (err) {
        logger.error('[/api/prompt-assist] Balance check failed:', err);
        return res.status(402).json({
          error: 'Insufficient balance',
          details: err.message,
        });
      }
    }

    // Use OpenAI client directly
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const enhancedPrompt = response.choices[0]?.message?.content || '';

    // Log token usage
    if (response.usage) {
      logger.info(
        `[/api/prompt-assist] Token usage for instruction enhancement - Total: ${response.usage.total_tokens} tokens (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens}) for user: ${req.user.id} using model: ${model}`,
      );
    }

    // Record token usage
    if (balanceConfig?.enabled && response.usage) {
      const { prompt_tokens, completion_tokens } = response.usage;
      await spendTokens(
        {
          user: req.user.id,
          conversationId: 'prompt-assist',
          model,
          context: 'prompt-assist',
          endpoint: EModelEndpoint.openAI,
          endpointTokenConfig: customConfig?.endpoints?.[EModelEndpoint.openAI]?.tokenConfig,
          valueKey: getValueKey(model, EModelEndpoint.openAI),
        },
        {
          promptTokens: prompt_tokens,
          completionTokens: completion_tokens,
        },
      );
    }

    res.json({ enhancedPrompt });
  } catch (error) {
    logger.error('[/api/prompt-assist] Error enhancing prompt:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

router.post('/enhance-message', requireJwtAuth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get prompt assist configuration
    const customConfig = await getCustomConfig();
    const promptAssistConfig = customConfig?.promptAssist;

    if (!promptAssistConfig?.enabled) {
      return res.status(400).json({ error: 'Prompt assist is not enabled' });
    }

    const provider = promptAssistConfig.provider || 'openAI';
    const model = promptAssistConfig.model || 'gpt-4o-mini';

    if (provider !== 'openAI') {
      return res.status(400).json({ error: 'Only OpenAI provider is currently supported' });
    }

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    // Create OpenAI client directly
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Prepare system prompt
    const systemPrompt = `You are an expert at refining user prompts for AI assistants. Your job is to optimize prompts based on the type of AI task being requested.

CONTEXT-AWARE OPTIMIZATION:

For IMAGE GENERATION requests (create/make/generate image, picture, artwork, etc.):
- Elaborate the prompt to be more descriptive and specific for image models
- Add visual details like style, lighting, composition, quality descriptors
- Transform simple requests into detailed image generation prompts
- Example: "make an image of a cat" → "Create a high-quality, detailed image of a cute cat with soft fur, sitting in natural lighting, photorealistic style"

For GENERAL TASKS (explanations, writing, analysis, etc.):
- Be conservative, only add essential missing information
- Don't add unnecessary placeholders if the AI can reasonably respond
- Focus on clarity and grammar fixes
- Example: "explain quantum computing" → "Explain quantum computing" (no change needed)

For UNCLEAR/INCOMPLETE requests:
- Add placeholders only when the request is genuinely impossible to execute
- Example: "write code" → "Write code for [specify what functionality you need] in [specify programming language]"

Rules:
- Return ONLY the refined prompt text, not explanations or analysis
- Identify the type of task first, then apply appropriate optimization
- For image requests: make them detailed and descriptive
- For other requests: be conservative and minimal
- Keep the user's original intent and scope intact

Examples:
- "make an image of a cat" → "Create a high-quality, detailed image of a cat with soft fur, sitting gracefully, natural lighting, photorealistic style"
- "generate a sunset picture" → "Generate a beautiful sunset image with vibrant orange and pink colors, dramatic clouds, serene landscape, high resolution, cinematic lighting"
- "explain quantum computing" → "Explain quantum computing" (no change needed)
- "write some code" → "Write some code" (AI can ask follow-up questions)
- "create a meeting" → "Create a meeting" (AI can ask for details)
- "help me with math" → "Help me with [specify the math topic or problem you need assistance with]"

Key principle: Optimize based on task type - elaborate for image generation, be conservative for everything else.

Return only the improved prompt text without quotes, explanations, or additional formatting.

CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE:
- NEVER use asterisks (*) or double asterisks (**) for ANY reason
- NEVER use markdown formatting of any kind
- NEVER write **bold text** - write BOLD TEXT or Bold Text instead
- NEVER use backticks for code or formatting
- Use ONLY plain text with clear structure
- Use ONLY numbers (1. 2. 3.) or simple dashes (-) for lists
- For emphasis, use CAPITAL LETTERS instead of asterisks
- Write headings as plain text (e.g., "Target Audience:" not "**Target Audience**")`;

    const userPrompt = `Improve this user prompt by adding only the essential information needed for an AI to execute the request. Return the refined prompt text:

${message}`;

    // Prepare messages for API call
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Estimate token usage for balance check
    const promptTokens = promptTokensEstimate({ messages, model });
    const estimatedCompletionTokens = 500; // Max tokens we're requesting

    // Check balance if enabled
    const balanceConfig = await getBalanceConfig();
    if (balanceConfig?.enabled && supportsBalanceCheck[EModelEndpoint.openAI]) {
      try {
        await checkBalance({
          req,
          res,
          txData: {
            user: req.user.id,
            tokenType: 'prompt',
            amount: promptTokens + estimatedCompletionTokens,
            model,
            endpoint: EModelEndpoint.openAI,
            context: 'prompt-assist-message',
          },
        });
      } catch (err) {
        logger.error('[/api/prompt-assist/enhance-message] Balance check failed:', err);
        return res.status(402).json({
          error: 'Insufficient balance',
          details: err.message,
          originalMessage: message,
        });
      }
    }

    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 500,
    });

    const enhancedMessage = response.choices[0]?.message?.content || message;

    // Log token usage
    if (response.usage) {
      logger.info(
        `[/api/prompt-assist/enhance-message] Token usage for message enhancement - Total: ${response.usage.total_tokens} tokens (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens}) for user: ${req.user.id} using model: ${model}`,
      );
    }

    // Record token usage
    if (balanceConfig?.enabled && response.usage) {
      const { prompt_tokens, completion_tokens } = response.usage;
      await spendTokens(
        {
          user: req.user.id,
          conversationId: 'prompt-assist-message',
          model,
          context: 'prompt-assist-message',
          endpoint: EModelEndpoint.openAI,
          endpointTokenConfig: customConfig?.endpoints?.[EModelEndpoint.openAI]?.tokenConfig,
          valueKey: getValueKey(model, EModelEndpoint.openAI),
        },
        {
          promptTokens: prompt_tokens,
          completionTokens: completion_tokens,
        },
      );
    }

    res.json({ enhancedMessage });
  } catch (error) {
    logger.error('[/api/prompt-assist/enhance-message] Error enhancing message:', error);
    res.status(500).json({ error: 'Failed to enhance message', originalMessage: req.body.message });
  }
});

module.exports = router;

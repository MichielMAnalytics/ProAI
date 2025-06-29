const express = require('express');
const OpenAI = require('openai');
const { promptTokensEstimate } = require('openai-chat-tokens');
const { EModelEndpoint, supportsBalanceCheck } = require('librechat-data-provider');
const { getCustomConfig, getBalanceConfig } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const { checkBalance } = require('~/models/balanceMethods');
const { spendTokens } = require('~/models/spendTokens');
const { getValueKey } = require('~/models/tx');
const { logger } = require('~/config');

const router = express.Router();

router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const { title, description, instructions, availableVariables } = req.body;

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

The enhanced prompt should:
- Be clear and unambiguous
- Include relevant context and constraints
- Specify the desired output format when applicable
- Include examples if helpful
- Be well-structured and easy to follow
- Incorporate dynamic variables when they would enhance the functionality${
      availableVariables && availableVariables.length > 0
        ? `\n\nAvailable Variables (use these when appropriate):
${availableVariables.map((v) => `- ${v.syntax}: ${v.description}`).join('\n')}

When enhancing the prompt, consider incorporating these variables where they would be useful. For example, if the assistant needs current information, suggest using {{current_date}} or {{current_datetime}}. If it should personalize responses, mention {{current_user}}.`
        : ''
    }

Return ONLY the enhanced instructions content without any title, description, headers, or markdown formatting.`;

    const userPrompt = `Based on the following information, enhance the instructions for an AI assistant:

Title: ${title || 'Untitled Assistant'}
Description: ${description || 'No description provided'}
Current Instructions: ${instructions || 'No instructions provided yet'}

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
    const systemPrompt = `You are an expert at improving user messages to AI assistants to make them much clearer, more specific, and more effective for getting high-quality responses.

Your task is to significantly enhance the user's message while preserving their original intent. The enhancement should:
- Expand on the core request with specific details and context
- Add relevant parameters, constraints, and requirements that would help the AI provide a better response
- Include desired output format, length, or structure when applicable
- Add context about the use case, target audience, or specific goals
- Make the request actionable and comprehensive
- Transform vague requests into detailed, specific instructions

IMPORTANT GUIDELINES:
- Transform brief requests into detailed, comprehensive prompts
- Add relevant context that would help the AI understand the full scope
- Include specific requirements like format, length, tone, target audience
- Preserve the user's original intent but make it much more detailed
- Return ONLY the enhanced message text without quotes, explanations, or additional formatting
- Do not add quotes around the response

Examples:
- "help me write code" → "Help me write clean, well-documented Python code for [specific functionality]. Include error handling, follow PEP 8 standards, and add inline comments explaining the logic. Provide the complete code with example usage."
- "make a sales email" → "Create a professional sales email template for B2B cold outreach targeting [specific industry/role]. The email should be personalized, include a clear value proposition, have a compelling subject line, and end with a specific call-to-action. Keep it under 150 words and maintain a consultative tone."

Return the enhanced message as plain text.

CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE:
- NEVER use asterisks (*) or double asterisks (**) for ANY reason
- NEVER use markdown formatting of any kind
- NEVER write **bold text** - write BOLD TEXT or Bold Text instead
- NEVER use backticks for code or formatting
- Use ONLY plain text with clear structure
- Use ONLY numbers (1. 2. 3.) or simple dashes (-) for lists
- For emphasis, use CAPITAL LETTERS instead of asterisks
- Write headings as plain text (e.g., "Target Audience:" not "**Target Audience**")`;

    const userPrompt = `Transform this user message into a detailed, comprehensive prompt that will help an AI assistant provide the best possible response:

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

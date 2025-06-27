const express = require('express');
const OpenAI = require('openai');
const { getCustomConfig } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
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
    
    // Construct the prompt for the LLM
    const variablesSection = availableVariables && availableVariables.length > 0 
      ? `\n\nAvailable Variables (use these when appropriate):
${availableVariables.map(v => `- ${v.syntax}: ${v.description}`).join('\n')}

When enhancing the prompt, consider incorporating these variables where they would be useful. For example, if the assistant needs current information, suggest using {{current_date}} or {{current_datetime}}. If it should personalize responses, mention {{current_user}}.`
      : '';

    const systemPrompt = `You are an expert at writing clear, effective prompts for AI assistants. 
Your task is to enhance the given instructions to make them more clear, comprehensive, and effective.

IMPORTANT FORMATTING RULES:
- Do NOT include the title or description in your response (they are already set by the user)
- Do NOT use markdown formatting like **bold** or ##headers
- Use plain text with clear structure using dashes, numbers, or bullet points
- Start directly with the enhanced instructions content

The enhanced prompt should:
- Be clear and unambiguous
- Include relevant context and constraints
- Specify the desired output format when applicable
- Include examples if helpful
- Be well-structured and easy to follow
- Incorporate dynamic variables when they would enhance the functionality${variablesSection}

Return ONLY the enhanced instructions content without any title, description, headers, or markdown formatting.`;

    const userPrompt = `Based on the following information, enhance the instructions for an AI assistant:

Title: ${title || 'Untitled Assistant'}
Description: ${description || 'No description provided'}
Current Instructions: ${instructions || 'No instructions provided yet'}

Create enhanced instructions that will help the AI assistant perform its intended function effectively. Consider incorporating the available variables where they would be beneficial. Remember to return only the instructions content without repeating the title or description.`;

    // Use OpenAI client directly
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const enhancedPrompt = response.choices[0]?.message?.content || '';
    
    res.json({ enhancedPrompt });
  } catch (error) {
    logger.error('[/api/prompt-assist] Error enhancing prompt:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

module.exports = router;
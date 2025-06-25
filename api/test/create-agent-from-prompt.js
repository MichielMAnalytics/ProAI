#!/usr/bin/env node


// Basic usage:
//   cd api && node test/create-agent-from-prompt.js burn_monitor.txt

//   With custom user ID:
//   cd api && node test/create-agent-from-prompt.js burn_monitor.txt 68341a46ee1d93d1f7d18834

//   With options:
//   cd api && node test/create-agent-from-prompt.js burn_monitor.txt 68341a46ee1d93d1f7d18834
//   '{"tools":["web_search","workflows"],"provider":"anthropic","model":"claude-3-sonnet"}'

const path = require('path');

// Disable MeiliSearch BEFORE loading dotenv to avoid connection errors in script
process.env.SEARCH = 'false';
process.env.MEILI_NO_SYNC = 'true';
delete process.env.MEILI_HOST;
delete process.env.MEILI_MASTER_KEY;

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Re-disable after dotenv loads
process.env.SEARCH = 'false';
process.env.MEILI_NO_SYNC = 'true';
delete process.env.MEILI_HOST;
delete process.env.MEILI_MASTER_KEY;

const fs = require('fs');
const { nanoid } = require('nanoid');

const { connectDb } = require('../db/connect');
const { Agent } = require('../db/models');

/**
 * Parse agent prompt file to extract Name, Description, Instructions, and Default prompts
 * @param {string} filePath - Path to the prompt file
 * @returns {Object} Parsed agent data
 */
function parsePromptFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let name = '';
  let description = '';
  let instructions = '';
  let defaultPrompts = [];
  let currentSection = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('Name:')) {
      currentSection = 'name';
      name = line.replace('Name:', '').trim();
      continue;
    }
    
    if (line.startsWith('Description:')) {
      currentSection = 'description';
      description = line.replace('Description:', '').trim();
      continue;
    }
    
    if (line.startsWith('Instructions:')) {
      currentSection = 'instructions';
      instructions = line.replace('Instructions:', '').trim();
      continue;
    }
    
    if (line.startsWith('Default prompts:')) {
      currentSection = 'default_prompts';
      continue;
    }
    
    // Continue reading content for current section
    if (currentSection === 'name' && line && !line.startsWith('Description:') && !line.startsWith('Instructions:') && !line.startsWith('Default prompts:')) {
      name += (name ? ' ' : '') + line;
    } else if (currentSection === 'description' && line && !line.startsWith('Instructions:') && !line.startsWith('Default prompts:')) {
      description += (description ? ' ' : '') + line;
    } else if (currentSection === 'instructions' && line && !line.startsWith('Default prompts:')) {
      instructions += (instructions ? '\n' : '') + lines[i]; // Keep original formatting for instructions
    } else if (currentSection === 'default_prompts' && line) {
      // Parse numbered list items or quoted strings
      const promptMatch = line.match(/^\d+\.\s*["'](.+)["']\s*$/) || line.match(/^\d+\.\s*(.+)$/);
      if (promptMatch) {
        const prompt = promptMatch[1].trim();
        if (prompt) {
          defaultPrompts.push(prompt);
        }
      } else if (line.startsWith('"') && line.endsWith('"')) {
        // Handle quoted strings without numbers
        defaultPrompts.push(line.slice(1, -1));
      } else if (line && !line.match(/^\d+\.\s*$/)) {
        // Handle unquoted strings that aren't just numbers
        defaultPrompts.push(line);
      }
    }
  }
  
  return {
    name: name.trim(),
    description: description.trim(),
    instructions: instructions.trim(),
    defaultPrompts: defaultPrompts
  };
}

/**
 * Create an agent with the provided data.
 */
async function createAgent(agentData) {
  const { author, ...versionData } = agentData;
  const timestamp = new Date();
  const initialAgentData = {
    ...agentData,
    versions: [
      {
        ...versionData,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
  return (await Agent.create(initialAgentData)).toObject();
}

/**
 * Update an existing agent with a new version
 */
async function updateAgentVersion(existingAgent, newAgentData) {
  const { author, ...versionData } = newAgentData;
  const timestamp = new Date();
  
  // Create new version object
  const newVersion = {
    ...versionData,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  
  // Update the main agent fields with new data
  const updatedAgent = await Agent.findByIdAndUpdate(
    existingAgent._id,
    {
      ...newAgentData,
      $push: { versions: newVersion },
      updatedAt: timestamp,
    },
    { new: true }
  );
  
  return updatedAgent.toObject();
}

/**
 * Create agent in database from prompt file
 * @param {string} filename - Name of the prompt file
 * @param {string} userId - MongoDB ObjectId of the user (optional, defaults to 6831a77a46d7304e714d8248)
 * @param {Object} options - Additional options
 */
async function createAgentFromPrompt(filename, userId = '6831a77a46d7304e714d8248', options = {}) {
  try {
    // Connect to database
    await connectDb();
    
    // Build file path
    const promptsPath = path.join(__dirname, '../../user_agent_system_prompts');
    const filePath = path.join(promptsPath, filename);
    
    // Parse prompt file
    const { name, description, instructions, defaultPrompts } = parsePromptFile(filePath);
    
    if (!name || !description || !instructions) {
      throw new Error('Missing required fields: Name, Description, or Instructions');
    }
    
    // Check if an agent with the same name and author already exists
    const existingAgent = await Agent.findOne({ name, author: userId });
    
    let agent;
    let isNewAgent = false;
    
    if (existingAgent) {
      console.log(`🔄 Found existing agent "${name}" - creating new version...`);
      
      // Prepare agent data for new version (keep existing ID)
      const agentData = {
        id: existingAgent.id, // Keep the same ID
        name,
        description,
        instructions,
        provider: options.provider || 'openAI',
        model: options.model || 'gpt-4.1-mini',
        artifacts: options.artifacts || 'default',
        author: userId,
        tools: options.tools || ['workflows'],
        tool_kwargs: options.tool_kwargs || [],
        agent_ids: options.agent_ids || [],
        conversation_starters: options.conversation_starters || [],
        default_prompts: options.default_prompts || defaultPrompts || [],
        projectIds: options.projectIds || [],
        model_parameters: options.model_parameters || {},
        end_after_tools: options.end_after_tools || false,
        hide_sequential_outputs: options.hide_sequential_outputs || false
      };
      
      // Update existing agent with new version
      agent = await updateAgentVersion(existingAgent, agentData);
      
    } else {
      console.log(`🆕 Creating new agent "${name}"...`);
      isNewAgent = true;
      
      // Generate unique agent ID for new agent
      const agentId = `agent_${nanoid()}`;
      
      // Prepare agent data with defaults
      const agentData = {
        id: agentId,
        name,
        description,
        instructions,
        provider: options.provider || 'openAI',
        model: options.model || 'gpt-4.1-mini',
        artifacts: options.artifacts || 'default',
        author: userId,
        tools: options.tools || ['workflows'],
        tool_kwargs: options.tool_kwargs || [],
        agent_ids: options.agent_ids || [],
        conversation_starters: options.conversation_starters || [],
        default_prompts: options.default_prompts || defaultPrompts || [],
        projectIds: options.projectIds || [],
        model_parameters: options.model_parameters || {},
        end_after_tools: options.end_after_tools || false,
        hide_sequential_outputs: options.hide_sequential_outputs || false
      };
      
      // Create new agent in database
      agent = await createAgent(agentData);
    }
    
    console.log(`✅ Agent ${isNewAgent ? 'created' : 'updated'} successfully!`);
    console.log(`📄 Name: ${agent.name}`);
    console.log(`🆔 ID: ${agent.id}`);
    console.log(`👤 Author: ${agent.author}`);
    console.log(`📝 Description: ${agent.description}`);
    console.log(`📊 Versions: ${agent.versions ? agent.versions.length : 1}`);
    
    return agent;
    
  } catch (error) {
    console.error('❌ Error creating agent:', error.message);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node create-agent-from-prompt.js <filename> [user_id] [options]');
    console.log('');
    console.log('Arguments:');
    console.log('  filename   - Name of the prompt file (e.g., burn_monitor.txt)');
    console.log('  user_id    - MongoDB ObjectId of the user (optional, defaults to 6831a77a46d7304e714d8248)');
    console.log('');
    console.log('Options (JSON format):');
    console.log('  --provider       - AI provider (default: "openAI")');
    console.log('  --model          - Model name (default: "gpt-4.1-mini")');
    console.log('  --tools          - Array of tool names');
    console.log('');
    console.log('Examples:');
    console.log('  node create-agent-from-prompt.js burn_monitor.txt');
    console.log('  node create-agent-from-prompt.js burn_monitor.txt 68341a46ee1d93d1f7d18834');
    console.log('  node create-agent-from-prompt.js burn_monitor.txt 68341a46ee1d93d1f7d18834 \'{"tools":["web_search"],"provider":"anthropic","model":"claude-3-sonnet"}\'');
    process.exit(1);
  }
  
  const filename = args[0];
  const userId = args[1] || '6831a77a46d7304e714d8248'; // Default user ID
  const optionsJson = args[2] || '{}';
  
  let options = {};
  try {
    options = JSON.parse(optionsJson);
  } catch (error) {
    console.error('❌ Invalid JSON in options:', error.message);
    process.exit(1);
  }
  
  createAgentFromPrompt(filename, userId, options)
    .then(() => {
      console.log('🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error.message);
      process.exit(1);
    });
}

module.exports = { createAgentFromPrompt, parsePromptFile };
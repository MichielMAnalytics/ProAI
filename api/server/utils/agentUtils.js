const { logger } = require('~/config');

/**
 * Removes auto-injected sections from instructions for prompt assist processing
 * @param {string} instructions - The instructions with potentially injected sections
 * @returns {string} Instructions with auto-injected sections removed
 */
const stripAutoInjectedSections = (instructions = '') => {
  let result = instructions;

  // Remove Variables section
  const variablesStart = result.indexOf('--- Available Variables ---');
  const variablesEnd = result.indexOf('--- End Variables ---');
  if (variablesStart !== -1 && variablesEnd !== -1) {
    const endIndex = variablesEnd + '--- End Variables ---'.length;
    result = result.slice(0, variablesStart) + result.slice(endIndex);
    logger.info('[stripAutoInjectedSections] Removed variables section for prompt assist');
  }

  // Remove Workflow Capabilities section
  const workflowStart = result.indexOf('--- Workflow Capabilities ---');
  const workflowEnd = result.indexOf('--- End Workflow Capabilities ---');
  if (workflowStart !== -1 && workflowEnd !== -1) {
    const endIndex = workflowEnd + '--- End Workflow Capabilities ---'.length;
    result = result.slice(0, workflowStart) + result.slice(endIndex);
    logger.info(
      '[stripAutoInjectedSections] Removed workflow capabilities section for prompt assist',
    );
  }

  // Clean up any extra whitespace
  result = result.trim().replace(/\n{3,}/g, '\n\n');

  return result;
};

module.exports = {
  stripAutoInjectedSections,
};

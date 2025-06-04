const { logger } = require('~/config');

/**
 * Condition evaluator for workflow conditions
 * 
 * Safely evaluates condition expressions using workflow context.
 * Supports basic comparison operations and logical operators.
 * 
 * Examples:
 * - "{{steps.step1.result.status}} === 'success'"
 * - "{{variables.count}} > 10"
 * - "{{steps.condition1.result}} && {{steps.condition2.result}}"
 */

/**
 * Evaluate a condition expression against context
 * @param {string} condition - The condition expression to evaluate
 * @param {Object} context - The execution context
 * @returns {boolean} Evaluation result
 */
function evaluateCondition(condition, context) {
  try {
    logger.debug(`[ConditionEvaluator] Evaluating condition: ${condition}`);

    // Replace context variables in the condition
    const resolvedCondition = resolveVariables(condition, context);
    
    logger.debug(`[ConditionEvaluator] Resolved condition: ${resolvedCondition}`);

    // Safely evaluate the condition
    const result = safeEvaluate(resolvedCondition);
    
    logger.debug(`[ConditionEvaluator] Evaluation result: ${result}`);

    return Boolean(result);
  } catch (error) {
    logger.error(`[ConditionEvaluator] Error evaluating condition: ${condition}`, error);
    throw new Error(`Condition evaluation failed: ${error.message}`);
  }
}

/**
 * Replace context variables in condition string
 * @param {string} condition - Condition with variables like {{steps.step1.result}}
 * @param {Object} context - Execution context
 * @returns {string} Condition with variables replaced
 */
function resolveVariables(condition, context) {
  return condition.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
    const value = getValueFromPath(context, varPath.trim());
    
    if (value === undefined || value === null) {
      return 'null';
    }
    
    // Handle different value types
    if (typeof value === 'string') {
      return JSON.stringify(value); // Properly escape strings
    } else if (typeof value === 'boolean') {
      return value.toString();
    } else if (typeof value === 'number') {
      return value.toString();
    } else {
      return JSON.stringify(value);
    }
  });
}

/**
 * Get value from object path (e.g., "steps.step1.result.data")
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot-separated path
 * @returns {*} Value at path or undefined
 */
function getValueFromPath(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Safely evaluate a condition expression
 * Uses a whitelist approach to only allow safe operations
 * @param {string} expression - The expression to evaluate
 * @returns {*} Evaluation result
 */
function safeEvaluate(expression) {
  // List of allowed operators and keywords
  const allowedTokens = [
    // Comparison operators
    '===', '!==', '==', '!=', '>', '<', '>=', '<=',
    // Logical operators
    '&&', '||', '!',
    // Parentheses
    '(', ')',
    // Literals
    'true', 'false', 'null', 'undefined',
    // Numbers (will be validated separately)
    // Strings (will be validated separately)
  ];

  // Check for dangerous patterns
  const dangerousPatterns = [
    /function\s*\(/i,
    /eval\s*\(/i,
    /new\s+/i,
    /import\s+/i,
    /require\s*\(/i,
    /process\./i,
    /global\./i,
    /window\./i,
    /document\./i,
    /\[.*\]/,  // Array access
    /\.\w+\s*\(/,  // Method calls
    /=(?!=)/,  // Assignment operators
    /\+\+|--/,  // Increment/decrement
  ];

  // Check for dangerous patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(expression)) {
      throw new Error(`Unsafe operation detected in condition: ${expression}`);
    }
  }

  // Tokenize the expression
  const tokens = tokenize(expression);
  
  // Validate all tokens
  for (const token of tokens) {
    if (!isValidToken(token, allowedTokens)) {
      throw new Error(`Invalid token in condition: ${token}`);
    }
  }

  // Use Function constructor for safer evaluation than eval
  // This creates a new function scope and doesn't have access to the current scope
  try {
    const func = new Function(`return (${expression});`);
    return func();
  } catch (error) {
    throw new Error(`Failed to evaluate expression: ${expression} - ${error.message}`);
  }
}

/**
 * Tokenize an expression into individual tokens
 * @param {string} expression - Expression to tokenize
 * @returns {Array<string>} Array of tokens
 */
function tokenize(expression) {
  // Regular expression to match tokens
  const tokenRegex = /(\d+\.?\d*|"[^"]*"|'[^']*'|[a-zA-Z_]\w*|[=!<>]=?|&&|\|\||[()!])/g;
  return expression.match(tokenRegex) || [];
}

/**
 * Check if a token is valid/allowed
 * @param {string} token - Token to validate
 * @param {Array<string>} allowedTokens - List of allowed tokens
 * @returns {boolean} Whether token is valid
 */
function isValidToken(token, allowedTokens) {
  // Check if token is in allowed list
  if (allowedTokens.includes(token)) {
    return true;
  }

  // Check if token is a number
  if (/^\d+\.?\d*$/.test(token)) {
    return true;
  }

  // Check if token is a quoted string
  if (/^["'][^"']*["']$/.test(token)) {
    return true;
  }

  // All other tokens are not allowed
  return false;
}

/**
 * Helper function to create common conditions
 * These can be used as shortcuts in workflow definitions
 */
const ConditionHelpers = {
  /**
   * Check if a step was successful
   * @param {string} stepId - Step ID to check
   * @returns {string} Condition expression
   */
  stepSucceeded: (stepId) => `{{steps.${stepId}.success}} === true`,

  /**
   * Check if a step failed
   * @param {string} stepId - Step ID to check
   * @returns {string} Condition expression
   */
  stepFailed: (stepId) => `{{steps.${stepId}.success}} === false`,

  /**
   * Check if a variable equals a value
   * @param {string} varName - Variable name
   * @param {*} value - Value to compare
   * @returns {string} Condition expression
   */
  variableEquals: (varName, value) => {
    const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
    return `{{variables.${varName}}} === ${valueStr}`;
  },

  /**
   * Check if a numeric variable is greater than a value
   * @param {string} varName - Variable name
   * @param {number} value - Value to compare
   * @returns {string} Condition expression
   */
  variableGreaterThan: (varName, value) => `{{variables.${varName}}} > ${value}`,

  /**
   * Check if a string variable contains a substring
   * @param {string} varName - Variable name
   * @param {string} substring - Substring to search for
   * @returns {string} Condition expression
   */
  variableContains: (varName, substring) => 
    `{{variables.${varName}}}.indexOf("${substring}") !== -1`,
};

module.exports = {
  evaluateCondition,
  resolveVariables,
  safeEvaluate,
  ConditionHelpers,
}; 
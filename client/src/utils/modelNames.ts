/**
 * Formats model names for display by removing unnecessary suffixes and dates
 * while preserving the original model name for API calls
 */

/**
 * Cleans up model names for display purposes
 * @param modelName - The original model name
 * @returns A cleaned up display name
 */
export function formatModelDisplayName(modelName: string): string {
  if (!modelName) return modelName;

  // For Google models: remove everything from '-preview' onwards
  if (modelName.includes('-preview')) {
    return modelName.split('-preview')[0];
  }

  // For Anthropic models: remove date patterns (YYYYMMDD or YYYY-MM-DD)
  // Matches patterns like -20250514, -2025-02-19, -20241022
  const datePattern = /-(?:\d{4}-\d{2}-\d{2}|\d{8})$/;
  if (datePattern.test(modelName)) {
    return modelName.replace(datePattern, '');
  }

  // Return original name if no patterns match
  return modelName;
}

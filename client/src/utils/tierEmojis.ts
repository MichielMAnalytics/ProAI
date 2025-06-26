/**
 * Utility functions for mapping tier names to emojis
 */

/**
 * Gets the appropriate emoji for a given tier
 * @param tierName - The name of the tier (e.g., "Free", "Pro", "Max")
 * @param tier - The tier type (e.g., "free", "pro", "max")
 * @returns The emoji string for the tier
 */
export const getTierEmoji = (tierName: string, tier: string): string => {
  const tierLower = tier?.toLowerCase();
  
  switch (tierLower) {
    case 'free':
      return '🍼';
    case 'pro':
      return '🚀';
    case 'max':
      return '👑';
    default:
      return '✨'; // Default emoji for unknown tiers
  }
};

/**
 * Emoji mapping for different tier levels
 */
export const TIER_EMOJIS = {
  FREE: '🍼',
  PRO: '🚀',
  MAX: '👑',
  DEFAULT: '✨'
} as const;

/**
 * Gets emoji by tier name
 * @param tierName - The tier name ('free', 'pro', 'max')
 * @returns The emoji for that tier level
 */
export const getTierEmojiByName = (tierName: string): string => {
  const tierLower = tierName?.toLowerCase();
  
  switch (tierLower) {
    case 'free':
      return TIER_EMOJIS.FREE;
    case 'pro':
      return TIER_EMOJIS.PRO;
    case 'max':
      return TIER_EMOJIS.MAX;
    default:
      return TIER_EMOJIS.DEFAULT;
  }
}; 
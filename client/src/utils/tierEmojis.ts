/**
 * Utility functions for mapping tier names to emojis
 */

/**
 * Gets the appropriate emoji for a given tier
 * @param tierName - The name of the tier (e.g., "Pro Tier 1", "Pro Tier 2")
 * @param tier - The tier type (e.g., "free", "pro")
 * @returns The emoji string for the tier
 */
export const getTierEmoji = (tierName: string, tier: string): string => {
  if (tier === 'free') {
    return '🍼';
  }
  
  // Handle Pro tier 1-8
  if (tierName?.toLowerCase().includes('pro')) {
    const tierMatch = tierName.match(/(\d+)/);
    if (tierMatch) {
      const tierNumber = parseInt(tierMatch[1]);
      const emojiMap: { [key: number]: string } = {
        1: '🌱',
        2: '🌿', 
        3: '🌳',
        4: '🚀',
        5: '⭐',
        6: '💎',
        7: '👑',
        8: '🏆'
      };
      return emojiMap[tierNumber] || '✨';
    }
  }
  
  return '✨'; // Default emoji for other tiers
};

/**
 * Emoji mapping for different tier levels
 */
export const TIER_EMOJIS = {
  FREE: '🍼',
  PRO_1: '🌱',
  PRO_2: '🌿',
  PRO_3: '🌳',
  PRO_4: '🚀',
  PRO_5: '⭐',
  PRO_6: '💎',
  PRO_7: '👑',
  PRO_8: '🏆',
  DEFAULT: '✨'
} as const;

/**
 * Gets emoji by tier number for Pro tiers
 * @param tierNumber - The tier number (1-8)
 * @returns The emoji for that tier level
 */
export const getProTierEmoji = (tierNumber: number): string => {
  const key = `PRO_${tierNumber}` as keyof typeof TIER_EMOJIS;
  return TIER_EMOJIS[key] || TIER_EMOJIS.DEFAULT;
}; 
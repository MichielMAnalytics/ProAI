/**
 * Formats a balance number to a human-readable string with appropriate suffixes
 * @param balance - The balance number to format
 * @returns Formatted balance string (e.g., "1.5B", "200M", "10K", "500.00")
 */
export const formatBalance = (balance: number): string => {
  if (balance >= 1e9) {
    return (balance / 1e9).toFixed(balance >= 10e9 ? 1 : 2) + 'B';
  } else if (balance >= 1e6) {
    return (balance / 1e6).toFixed(balance >= 10e6 ? 1 : 2) + 'M';
  } else if (balance >= 1e3) {
    return (balance / 1e3).toFixed(balance >= 10e3 ? 1 : 2) + 'K';
  } else {
    return balance.toFixed(2);
  }
};

export default formatBalance;

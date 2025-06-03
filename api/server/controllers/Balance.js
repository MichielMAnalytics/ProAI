const Balance = require('~/models/Balance');
const BalanceService = require('~/server/services/BalanceService');

async function balanceController(req, res) {
  try {
    // Check if client wants detailed balance info
    const detailed = req.query.detailed === 'true';
    
    if (detailed) {
      // Return complete balance information including tier
      const balanceInfo = await BalanceService.getUserBalanceInfo(req.user.id);
      
      res.status(200).json({
        balance: String(balanceInfo.tokenCredits),
        tier: balanceInfo.tier,
        tierName: balanceInfo.tierName,
        autoRefillEnabled: balanceInfo.autoRefillEnabled,
        refillAmount: balanceInfo.refillAmount,
        refillIntervalValue: balanceInfo.refillIntervalValue,
        refillIntervalUnit: balanceInfo.refillIntervalUnit,
        lastRefill: balanceInfo.lastRefill
      });
    } else {
      // Backward compatibility: return just balance as string
      const { tokenCredits: balance = '' } =
        (await Balance.findOne({ user: req.user.id }, 'tokenCredits').lean()) ?? {};
      res.status(200).send('' + balance);
    }
  } catch (error) {
    console.error('Error getting balance info:', error);
    res.status(500).json({ error: 'Failed to get balance information' });
  }
}

module.exports = balanceController;

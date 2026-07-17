/** Profit = withdrawal proceeds minus distributed application amount. */
export function computeProfitFromWithdrawal(withdrawalMoney, distributedAmount) {
  if (withdrawalMoney == null || withdrawalMoney === '') return null;
  const withdrawal = Number(withdrawalMoney);
  const distributed = Number(distributedAmount ?? 0);
  if (Number.isNaN(withdrawal)) return null;
  return Math.round((withdrawal - distributed) * 100) / 100;
}

/** Resolve P&L from withdrawal when set, else legacy profit_loss. */
export function getApplicationProfit(app) {
  const withdrawal = app.withdrawalMoney ?? app.withdrawal_money;
  if (withdrawal != null && withdrawal !== '') {
    return computeProfitFromWithdrawal(withdrawal, app.amount);
  }
  const pl = app.profitLoss ?? app.profit_loss;
  if (pl != null && pl !== '') return Number(pl);
  return null;
}

/** Resolve withdrawal display: stored value, or inferred from legacy profit_loss. */
export function getApplicationWithdrawal(app) {
  const withdrawal = app.withdrawalMoney ?? app.withdrawal_money;
  if (withdrawal != null && withdrawal !== '') return Number(withdrawal);
  const pl = app.profitLoss ?? app.profit_loss;
  if (pl != null && pl !== '' && app.amount != null) {
    return Math.round((Number(app.amount) + Number(pl)) * 100) / 100;
  }
  return null;
}

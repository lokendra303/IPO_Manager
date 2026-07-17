/** Profit = withdrawal proceeds minus distributed application amount. */
export function computeProfitFromWithdrawal(withdrawalMoney: number | string | null | undefined, distributedAmount: number | string | null | undefined) {
  if (withdrawalMoney == null || withdrawalMoney === '') return null;
  const withdrawal = Number(withdrawalMoney);
  const distributed = Number(distributedAmount ?? 0);
  if (Number.isNaN(withdrawal)) return null;
  return Math.round((withdrawal - distributed) * 100) / 100;
}

/** Resolve P&L from withdrawal when set, else legacy profit_loss. */
export function getApplicationProfit(app: {
  withdrawalMoney?: number | string | null;
  withdrawal_money?: number | string | null;
  amount?: number | string | null;
  profitLoss?: number | string | null;
  profit_loss?: number | string | null;
}) {
  const withdrawal = app.withdrawalMoney ?? app.withdrawal_money;
  if (withdrawal != null && withdrawal !== '') {
    return computeProfitFromWithdrawal(withdrawal, app.amount);
  }
  const pl = app.profitLoss ?? app.profit_loss;
  if (pl != null && pl !== '') return Number(pl);
  return null;
}

/** Resolve withdrawal display: stored value, or inferred from legacy profit_loss. */
export function getApplicationWithdrawal(app: {
  withdrawalMoney?: number | string | null;
  withdrawal_money?: number | string | null;
  amount?: number | string | null;
  profitLoss?: number | string | null;
  profit_loss?: number | string | null;
}) {
  const withdrawal = app.withdrawalMoney ?? app.withdrawal_money;
  if (withdrawal != null && withdrawal !== '') return Number(withdrawal);
  const pl = app.profitLoss ?? app.profit_loss;
  if (pl != null && pl !== '' && app.amount != null) {
    return Math.round((Number(app.amount) + Number(pl)) * 100) / 100;
  }
  return null;
}

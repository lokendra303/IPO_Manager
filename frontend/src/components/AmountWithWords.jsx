import { formatCurrency, amountToWordsInr, pnlClassName } from '../utils/format';

/** Shows ₹ figure plus amount in words (Indian English). */
export default function AmountWithWords({
  value,
  compact = false,
  className = '',
  showWords = true,
}) {
  const n = Number(value ?? 0);
  const words = amountToWordsInr(n);
  const figureClass = pnlClassName(n);

  return (
    <div className={`amount-with-words${compact ? ' amount-with-words--compact' : ''} ${className}`.trim()}>
      <span className={figureClass ? `amount-with-words__figure ${figureClass}` : 'amount-with-words__figure'}>
        {formatCurrency(n)}
      </span>
      {showWords && (
        <span className="amount-with-words__text">{words}</span>
      )}
    </div>
  );
}

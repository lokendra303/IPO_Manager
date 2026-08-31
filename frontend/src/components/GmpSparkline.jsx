export default function GmpSparkline({ points = [], height = 72 }) {
  const values = (points || [])
    .map((p) => ({ t: p.recordedAt, v: Number(p.gmp) }))
    .filter((p) => Number.isFinite(p.v));
  if (values.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: 13 }}>
        Not enough GMP history yet
      </div>
    );
  }
  const min = Math.min(...values.map((p) => p.v));
  const max = Math.max(...values.map((p) => p.v));
  const span = max - min || 1;
  const w = 320;
  const pad = 8;
  const coords = values.map((p, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label="GMP history">
      <polyline
        fill="none"
        stroke="#0d9488"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(' ')}
      />
      {coords.map((c, i) => {
        const [x, y] = c.split(',');
        return <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 4 : 2.5} fill="#0d9488" />;
      })}
      <text x={w - pad} y={14} textAnchor="end" fontSize="11" fill="#0f766e">
        ₹{last.v}
      </text>
    </svg>
  );
}

import { Typography } from 'antd';

/** Full note text in tables — wraps and expands if very long. */
export default function NoteCell({ value, maxWidth = 400 }) {
  if (!value) return '—';
  const text = String(value);
  if (text.length <= 80) {
    return <span className="table-note-cell">{text}</span>;
  }
  return (
    <Typography.Paragraph
      className="table-note-cell"
      ellipsis={{ rows: 3, expandable: true, symbol: 'Show more' }}
      style={{ marginBottom: 0, maxWidth }}
    >
      {text}
    </Typography.Paragraph>
  );
}

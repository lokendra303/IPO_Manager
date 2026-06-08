export function errorHandler(err, req, res, _next) {
  if (err.code === 'ER_DUP_ENTRY') {
    const msg = String(err.sqlMessage || '');
    let error = 'Duplicate entry — record already exists';
    if (/users\.email|for key ['']users\.email['']/i.test(msg) || /'email'/i.test(msg)) {
      error = 'This email is already registered';
    } else if (/members\.pan|uk_member_pan|for key.*pan/i.test(msg)) {
      error = 'A member with this PAN already exists in your team';
    } else if (/uk_ipo_member/i.test(msg)) {
      error = 'This member already has an application for this IPO';
    } else if (/system_admins\.email/i.test(msg)) {
      error = 'This admin email is already in use';
    } else if (msg) {
      error = `Duplicate entry: ${msg.replace(/^Duplicate entry /i, '')}`;
    }
    return res.status(409).json({ error });
  }

  if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
    console.error(err);
    return res.status(503).json({
      error: 'Database schema is out of date. Run npm run migrate in the backend folder.',
    });
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT') {
    console.error(err);
    return res.status(503).json({ error: 'Database temporarily unavailable. Please try again.' });
  }

  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err, req, res, _next) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry — record already exists' });
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

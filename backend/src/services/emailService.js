import nodemailer from 'nodemailer';

let transporter;

function getFrontendUrl() {
  const url = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getFromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@ipo-manager.local';
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in the server environment.'
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();
  await transport.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });
}

export async function sendVerificationEmail(email, token) {
  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: email,
    subject: 'Confirm your IPO Team Manager email',
    text: [
      'Thanks for registering with IPO Team Manager.',
      '',
      'Please confirm your email address by opening this link:',
      verifyUrl,
      '',
      'This link expires in 24 hours.',
      'If you did not create an account, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Thanks for registering with <strong>IPO Team Manager</strong>.</p>
      <p>Please confirm your email address:</p>
      <p><a href="${verifyUrl}">Confirm email address</a></p>
      <p>Or copy this link into your browser:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours.</p>
      <p>If you did not create an account, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: email,
    subject: 'Reset your IPO Team Manager password',
    text: [
      'We received a request to reset your IPO Team Manager password.',
      '',
      'Open this link to choose a new password:',
      resetUrl,
      '',
      'This link expires in 1 hour.',
      'If you did not request a reset, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>We received a request to reset your <strong>IPO Team Manager</strong> password.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>Or copy this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request a reset, you can ignore this email.</p>
    `,
  });
}

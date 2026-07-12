import '../env.js';
import nodemailer from 'nodemailer';

let transporter;

function stripEnvQuotes(value) {
  if (!value || typeof value !== 'string') return '';
  let v = value.trim();
  while (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getFrontendUrl() {
  const url = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Build a nodemailer-compatible From header (works with Vercel env vars). */
function getFromAddress() {
  const user = stripEnvQuotes(process.env.SMTP_USER);
  const appName = stripEnvQuotes(process.env.APP_NAME) || 'IPO Team Manager';
  const fromName = stripEnvQuotes(process.env.SMTP_FROM_NAME);
  const rawFrom = stripEnvQuotes(process.env.SMTP_FROM);

  if (rawFrom) {
    const bracketMatch = rawFrom.match(/^(.+?)\s*<([^<>@\s]+@[^<>@\s]+)>$/);
    if (bracketMatch) {
      return {
        name: stripEnvQuotes(bracketMatch[1]) || appName,
        address: bracketMatch[2].trim(),
      };
    }
    if (rawFrom.includes('@')) {
      return { name: fromName || appName, address: rawFrom };
    }
    if (user) {
      return { name: rawFrom, address: user };
    }
    return rawFrom;
  }

  if (fromName && user) {
    return { name: fromName, address: user };
  }

  if (user) {
    return { name: appName, address: user };
  }

  return 'noreply@ipo-manager.local';
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = stripEnvQuotes(process.env.SMTP_USER);
  const pass = stripEnvQuotes(process.env.SMTP_PASS);

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
    ...(port === 587 ? { requireTLS: true } : {}),
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

export async function sendRegistrationOtpEmail(email, otp) {
  return sendOtpEmail(email, otp, {
    subject: 'Confirm your IPO Team Manager email',
    plainIntro:
      'Thanks for registering with IPO Team Manager. Enter this code in the app to confirm your email address.',
    htmlIntro:
      'Thanks for registering with <strong>IPO Team Manager</strong>. Enter this code in the app to confirm your email address.',
  });
}

export async function sendOtpEmail(email, otp, { subject, plainIntro, htmlIntro }) {
  const introText = plainIntro || htmlIntro?.replace(/<[^>]+>/g, '') || '';
  const introHtml = htmlIntro || plainIntro || '';

  await sendMail({
    to: email,
    subject,
    text: [
      introText,
      '',
      `Your one-time verification code is: ${otp}`,
      '',
      'This code expires in 10 minutes.',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>${introHtml}</p>
      <p>Your one-time verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

export async function sendAdminPasswordOtpEmail(email, otp) {
  return sendOtpEmail(email, otp, {
    subject: 'Your admin password reset code',
    plainIntro: 'We received a request to reset your IPO Team Manager administrator password.',
    htmlIntro: 'We received a request to reset your <strong>IPO Team Manager</strong> administrator password.',
  });
}

export async function sendManagerPasswordOtpEmail(email, otp) {
  return sendOtpEmail(email, otp, {
    subject: 'Your password reset code',
    plainIntro: 'We received a request to reset your IPO Team Manager password.',
    htmlIntro: 'We received a request to reset your <strong>IPO Team Manager</strong> password.',
  });
}

export async function sendProfileChangeOtpEmail(email, otp) {
  return sendOtpEmail(email, otp, {
    subject: 'Verify your profile change',
    plainIntro: 'Use this code to confirm a change to your IPO Team Manager account settings.',
    htmlIntro: 'Use this code to confirm a change to your <strong>IPO Team Manager</strong> account settings.',
  });
}

export async function sendCurrentEmailChangeOtpEmail(email, otp) {
  return sendOtpEmail(email, otp, {
    subject: 'Confirm your current email',
    plainIntro: 'You requested to change the email on your IPO Team Manager account. Enter this code to confirm you own your current email address.',
    htmlIntro: 'You requested to change the email on your <strong>IPO Team Manager</strong> account. Enter this code to confirm you own your <strong>current</strong> email address.',
  });
}

export async function sendNewEmailChangeOtpEmail(email, otp) {
  return sendOtpEmail(email, otp, {
    subject: 'Confirm your new email',
    plainIntro: 'You requested to use this email for your IPO Team Manager account. Enter this code to confirm you own this new email address.',
    htmlIntro: 'You requested to use this email for your <strong>IPO Team Manager</strong> account. Enter this code to confirm you own this <strong>new</strong> email address.',
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

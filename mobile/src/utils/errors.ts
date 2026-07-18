export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || fallback;
}

type UndoSettleRow = { label: string; value: string };

/** Structured undo-settle failure for Alert popups. */
export function getUndoSettleBlockedModal(err: unknown): {
  title: string;
  summary: string;
  rows: UndoSettleRow[];
  steps: string[];
} {
  const data = (err as { response?: { data?: any } })?.response?.data || {};
  const code = data.code || '';
  const d = data.details || {};
  const money = (v: unknown) =>
    `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (code === 'UNDO_SETTLE_INSUFFICIENT_WALLET' || code === 'UNDO_SETTLE_INSUFFICIENT_ACCOUNT') {
    const accountLine = d.accountLabel
      ? `Account "${d.accountLabel}" no longer has enough balance.`
      : 'The wallet no longer has enough balance.';
    return {
      title: 'Cannot undo settle yet',
      summary: `${accountLine} The returned money was likely paid to a fund provider or withdrawn as manager profit.`,
      rows: [
        d.memberName ? { label: 'Member', value: String(d.memberName) } : null,
        d.ipoName ? { label: 'IPO', value: String(d.ipoName) } : null,
        d.accountLabel ? { label: 'Account', value: String(d.accountLabel) } : null,
        { label: 'Return credited', value: money(d.credited) },
        { label: 'Available now', value: money(d.walletBalance) },
        { label: 'Short by', value: money(d.shortfall) },
      ].filter(Boolean) as UndoSettleRow[],
      steps: [
        'Reverse the provider payout, or put the same amount back into the wallet.',
        'If you used Personal withdrawal, reverse that too if needed.',
        'Then tap Undo settle again.',
      ],
    };
  }

  if (code === 'UNDO_SETTLE_ACCOUNT_MISSING') {
    return {
      title: 'Cannot undo settle yet',
      summary: 'The bank account that received this return is missing.',
      rows: [
        d.memberName ? { label: 'Member', value: String(d.memberName) } : null,
        d.ipoName ? { label: 'IPO', value: String(d.ipoName) } : null,
      ].filter(Boolean) as UndoSettleRow[],
      steps: ['Restore that bank account under Wallet, then try Undo settle again.'],
    };
  }

  return {
    title: 'Cannot undo settle yet',
    summary: getErrorMessage(err, 'Undo settle is not available right now.'),
    rows: [],
    steps: ['Check wallet balance and provider payouts, then try again.'],
  };
}

export function getAuthErrorModal(err: unknown, context: 'manager' | 'member' | 'register' = 'manager') {
  const raw = getErrorMessage(err, '');
  const lower = raw.toLowerCase();

  if (context === 'member') {
    if (lower.includes('multiple teams')) {
      return { title: 'PAN linked to more than one team', content: raw };
    }
    if (lower.includes('no active member') || lower.includes('invalid credentials')) {
      return {
        title: 'Member sign-in failed',
        content:
          'We could not find an active member with this PAN. Check the number, or ask your manager to add you under Members.',
      };
    }
    return { title: 'Member sign-in failed', content: raw || 'Something went wrong. Please try again.' };
  }

  if (context === 'register') {
    if (lower.includes('pending approval')) {
      return {
        title: 'Registration pending',
        content:
          'This email already has a registration waiting for administrator approval. Use the Manager tab to sign in once approved.',
      };
    }
    if (lower.includes('already registered')) {
      return {
        title: 'Email already in use',
        content: 'An account with this email already exists. Sign in instead, or use a different email.',
      };
    }
    return { title: 'Registration failed', content: raw || 'Could not create your account. Please try again.' };
  }

  if (lower.includes('confirm your email') || lower.includes('email not verified')) {
    return {
      title: 'Email not confirmed',
      content:
        'Please enter the 6-digit verification code sent to your email before signing in, or use "Resend verification code".',
    };
  }

  if (lower.includes('pending administrator approval') || lower.includes('pending approval')) {
    return {
      title: 'Account pending approval',
      content: 'Your registration is waiting for system administrator approval. You will receive access once approved.',
    };
  }

  if (lower.includes('disabled')) {
    return { title: 'Account disabled', content: raw || 'Your team account has been disabled by the system administrator.' };
  }

  if (lower.includes('registration was rejected') || lower.includes('rejected')) {
    return { title: 'Registration rejected', content: raw || 'Your registration was rejected. Contact the system administrator for details.' };
  }

  if (lower.includes('invalid credentials') || lower.includes('password required')) {
    return {
      title: 'Sign-in failed',
      content: 'The email or password you entered is incorrect. Please check your details and try again.',
    };
  }

  return { title: 'Sign-in failed', content: raw || 'Something went wrong. Please try again.' };
}

export function getForgotPasswordError(err: unknown, context: 'manager' | 'admin' = 'manager') {
  const raw = getErrorMessage(err, '');
  const lower = raw.toLowerCase();
  const e = err as { response?: { status?: number } };
  const status = e?.response?.status;

  if (context === 'admin') {
    if (status === 404 || lower.includes('no administrator account')) {
      return {
        title: 'Email not registered',
        message: 'No system administrator account exists with this email. Check the spelling or contact your platform admin.',
        type: 'error' as const,
      };
    }
    return { title: 'Could not send code', message: raw || 'Something went wrong. Please try again.', type: 'error' as const };
  }

  if (status === 404 || lower.includes('no manager account is registered')) {
    return {
      title: 'Email not registered',
      message: 'No manager account exists with this email. Check the spelling, or register a new team from the sign-in page.',
      type: 'error' as const,
    };
  }

  if (lower.includes('confirm your email')) {
    return { title: 'Email not verified', message: raw, type: 'warning' as const, showResendVerification: true };
  }

  if (lower.includes('pending administrator approval') || lower.includes('pending approval')) {
    return { title: 'Account not active yet', message: raw, type: 'warning' as const };
  }

  if (lower.includes('rejected')) return { title: 'Registration rejected', message: raw, type: 'error' as const };
  if (lower.includes('disabled')) return { title: 'Account disabled', message: raw, type: 'error' as const };
  if (lower.includes('not active')) return { title: 'Account not active', message: raw, type: 'warning' as const };

  return { title: 'Could not send code', message: raw || 'Something went wrong. Please try again.', type: 'error' as const };
}

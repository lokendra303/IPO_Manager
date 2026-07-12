export function getErrorMessage(err, fallback = 'Something went wrong') {
  return err?.response?.data?.error || err?.message || fallback;
}

/** User-friendly title + body for login/register failures (use with Modal). */
export function getAuthErrorModal(err, context = 'manager') {
  const raw = getErrorMessage(err, '');
  const lower = raw.toLowerCase();

  if (context === 'member') {
    if (lower.includes('multiple teams')) {
      return {
        title: 'PAN linked to more than one team',
        content: raw,
      };
    }
    if (lower.includes('no active member') || lower.includes('invalid credentials')) {
      return {
        title: 'Member sign-in failed',
        content:
          'We could not find an active member with this PAN. Check the number, or ask your manager to add you under Members.',
      };
    }
    return {
      title: 'Member sign-in failed',
      content: raw || 'Something went wrong. Please try again.',
    };
  }

  if (context === 'register') {
    if (lower.includes('pending approval')) {
      return {
        title: 'Registration pending',
        content: 'This email already has a registration waiting for administrator approval. Use the Manager tab to sign in once approved.',
      };
    }
    if (lower.includes('already registered')) {
      return {
        title: 'Email already in use',
        content: 'An account with this email already exists. Sign in instead, or use a different email.',
      };
    }
    return {
      title: 'Registration failed',
      content: raw || 'Could not create your account. Please try again.',
    };
  }

  if (lower.includes('confirm your email') || lower.includes('email not verified')) {
    return {
      title: 'Email not confirmed',
      content:
        'Please enter the 6-digit verification code sent to your email before signing in, or use "Resend verification code" below.',
    };
  }

  if (lower.includes('pending administrator approval') || lower.includes('pending approval')) {
    return {
      title: 'Account pending approval',
      content:
        'Your registration is waiting for system administrator approval. You will receive access once approved.',
    };
  }

  if (lower.includes('disabled')) {
    return {
      title: 'Account disabled',
      content: raw || 'Your team account has been disabled by the system administrator.',
    };
  }

  if (lower.includes('registration was rejected') || lower.includes('rejected')) {
    return {
      title: 'Registration rejected',
      content: raw || 'Your registration was rejected. Contact the system administrator for details.',
    };
  }

  if (lower.includes('invalid credentials') || lower.includes('password required')) {
    return {
      title: 'Sign-in failed',
      content:
        'The email or password you entered is incorrect. Please check your details and try again.',
    };
  }

  return {
    title: 'Sign-in failed',
    content: raw || 'Something went wrong. Please try again.',
  };
}

/** Forgot-password / resend OTP errors with title and optional UI hints. */
export function getForgotPasswordError(err, context = 'manager') {
  const raw = getErrorMessage(err, '');
  const lower = raw.toLowerCase();
  const status = err?.response?.status;

  if (context === 'admin') {
    if (status === 404 || lower.includes('no administrator account')) {
      return {
        title: 'Email not registered',
        message:
          'No system administrator account exists with this email. Check the spelling or contact your platform admin.',
        type: 'error',
      };
    }
    return {
      title: 'Could not send code',
      message: raw || 'Something went wrong. Please try again.',
      type: 'error',
    };
  }

  if (status === 404 || lower.includes('no manager account is registered')) {
    return {
      title: 'Email not registered',
      message:
        'No manager account exists with this email. Check the spelling, or register a new team from the sign-in page.',
      type: 'error',
    };
  }

  if (lower.includes('confirm your email')) {
    return {
      title: 'Email not verified',
      message: raw,
      type: 'warning',
      showResendVerification: true,
    };
  }

  if (lower.includes('pending administrator approval') || lower.includes('pending approval')) {
    return {
      title: 'Account not active yet',
      message: raw,
      type: 'warning',
    };
  }

  if (lower.includes('rejected')) {
    return {
      title: 'Registration rejected',
      message: raw,
      type: 'error',
    };
  }

  if (lower.includes('disabled')) {
    return {
      title: 'Account disabled',
      message: raw,
      type: 'error',
    };
  }

  if (lower.includes('not active')) {
    return {
      title: 'Account not active',
      message: raw,
      type: 'warning',
    };
  }

  return {
    title: 'Could not send code',
    message: raw || 'Something went wrong. Please try again.',
    type: 'error',
  };
}

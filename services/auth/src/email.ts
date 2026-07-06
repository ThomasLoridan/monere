import { getEnv, createLogger, fetchJson } from '@monere/shared';

const log = createLogger('auth-email');

export interface SendResult {
  sent: boolean;
  /** Only populated in development without a RESEND_API_KEY, so the
   *  signup flow stays testable. NEVER set in production. */
  devCode?: string;
}

/** Sends the verification code via Resend (https://resend.com).
 *  Real transactional email — no code appears in the response in production. */
export async function sendVerificationEmail(
  to: string,
  code: string,
  purpose: 'signup' | 'reset',
): Promise<SendResult> {
  const env = getEnv();
  const subject =
    purpose === 'signup'
      ? `${code} — votre code de vérification Monere`
      : `${code} — réinitialisation de votre mot de passe Monere`;
  const heading =
    purpose === 'signup' ? 'Bienvenue sur Monere' : 'Réinitialisation du mot de passe';
  const lead =
    purpose === 'signup'
      ? 'Saisissez ce code dans l’application pour vérifier votre adresse e-mail :'
      : 'Saisissez ce code dans l’application pour choisir un nouveau mot de passe :';

  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY manquant — impossible d’envoyer l’e-mail de vérification');
    }
    log.warn(
      { to },
      `RESEND_API_KEY absent — code de dev retourné à l'app (mode développement uniquement)`,
    );
    return { sent: false, devCode: code };
  }

  await fetchJson('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: {
      from: env.MAIL_FROM,
      to: [to],
      subject,
      html: `
        <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px">Monere</div>
          <h1 style="font-size:18px;margin:24px 0 8px">${heading}</h1>
          <p style="color:#555;font-size:14px;line-height:1.5">${lead}</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:10px;background:#f4f4f7;border-radius:12px;padding:18px 0;text-align:center;margin:20px 0">${code}</div>
          <p style="color:#888;font-size:12px">Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
        </div>`,
    },
    timeoutMs: 8000,
  });
  log.info({ to }, 'verification email sent');
  return { sent: true };
}

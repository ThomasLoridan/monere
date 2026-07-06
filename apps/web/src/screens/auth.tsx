/* Onboarding + Login/Signup + email verification code — real auth flow */
import React from 'react';
import { Icon } from '../components/Icon';
import { Wordmark, StockLogo } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import type { ScreenProps } from '../state/nav';

const ONBOARD_SLIDES = [
  {
    eyebrow: 'Marchés',
    title: (
      <>
        Les marchés,
        <br />
        en <em>direct</em>.
      </>
    ),
    body: "S&P 500, CAC 40, DAX… suis les indices US et européens et chaque valeur qui les compose, en un coup d'œil.",
    preview: 'markets',
  },
  {
    eyebrow: 'Earnings',
    title: (
      <>
        Earnings,
        <br />
        <em>décodés</em>.
      </>
    ),
    body: 'Calendrier officiel, historique battre/manquer et impact réel sur le cours après — avec les sources à chaque fois.',
    preview: 'earnings',
  },
  {
    eyebrow: 'Stratégie',
    title: (
      <>
        Simule avant
        <br />
        d'<em>investir</em>.
      </>
    ),
    body: "Teste une stratégie autour d'un earnings, au comptant ou avec effet de levier, avant d'engager un euro.",
    preview: 'simulate',
  },
];

function OnboardSlidePreview({ kind }: { kind: string }) {
  if (kind === 'markets') {
    return (
      <div className="ob-card ob-card-markets">
        <div className="idx-chip active" style={{ minWidth: 0, pointerEvents: 'none' }}>
          <div className="flag">USA · INX</div>
          <div className="name">S&amp;P 500</div>
          <div className="val num">5 847,32</div>
          <div className="delta delta-up">+0.74%</div>
        </div>
        <div
          className="stock-row"
          style={{
            pointerEvents: 'none',
            background: 'var(--surface)',
            borderRadius: 14,
            marginTop: 10,
          }}
        >
          <StockLogo stock={{ ticker: 'NVDA', domain: 'nvidia.com' }} />
          <div className="stock-meta">
            <div className="tk">NVDA</div>
            <div className="nm">NVIDIA Corp.</div>
          </div>
          <div className="stock-price">
            <div className="p num">138,07</div>
            <div className="d num delta-up">+2.10%</div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'earnings') {
    return (
      <div className="ob-card ob-card-earnings">
        <div
          className="earning-row"
          style={{ pointerEvents: 'none', background: 'var(--surface)' }}
        >
          <StockLogo stock={{ ticker: 'NVDA', domain: 'nvidia.com' }} />
          <div className="info">
            <div className="tk">
              NVDA{' '}
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-3)' }}>Q4 FY26</span>
            </div>
            <div className="nm">19 févr. · Après clôture</div>
          </div>
          <div className="pred">
            <div>Historique</div>
            <div className="conf beat">Battre · 8/8</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="ob-card ob-card-sim">
      <div className="sim-result" style={{ margin: 0, pointerEvents: 'none' }}>
        <div className="lbl">Résultat estimé</div>
        <div className="v pos">+412 €</div>
        <div className="sub">+8.24% sur 5j · sortie estimée 149,32 USD</div>
      </div>
    </div>
  );
}

export function OnboardingScreen({ nav }: ScreenProps) {
  const [i, setI] = React.useState(0);
  const touchX = React.useRef<number | null>(null);
  const last = i === ONBOARD_SLIDES.length - 1;

  const go = (n: number) => setI(Math.max(0, Math.min(ONBOARD_SLIDES.length - 1, n)));

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]!.clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0]!.clientX - touchX.current;
    if (dx < -40) go(i + 1);
    if (dx > 40) go(i - 1);
    touchX.current = null;
  };

  const slide = ONBOARD_SLIDES[i]!;

  return (
    <div className="auth-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="auth-top">
        <Wordmark size={20} />
        {!last && (
          <button className="ob-skip" onClick={() => nav('login')}>
            Passer
          </button>
        )}
      </div>

      <div className="ob-preview">
        <OnboardSlidePreview kind={slide.preview} />
      </div>

      <div className="ob-copy">
        <div className="eyebrow">{slide.eyebrow}</div>
        <h1 className="h-display" style={{ marginTop: 8 }}>
          {slide.title}
        </h1>
        <p className="sub" style={{ maxWidth: 300 }}>
          {slide.body}
        </p>
      </div>

      <div className="ob-dots">
        {ONBOARD_SLIDES.map((_, d) => (
          <button key={d} className={'ob-dot ' + (d === i ? 'active' : '')} onClick={() => go(d)} />
        ))}
      </div>

      <div className="auth-bottom">
        <button className="cta accent" onClick={() => (last ? nav('login') : go(i + 1))}>
          {last ? 'Commencer' : 'Suivant'}
        </button>
        {!last && (
          <button className="auth-link" onClick={() => nav('login')}>
            J'ai déjà un compte
          </button>
        )}
      </div>
    </div>
  );
}

/** 6-digit verification code input row */
function CodeInputs({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (code: string) => void;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const setDigit = (i: number, d: string) => {
    const clean = d.replace(/\D/g, '');
    if (!clean && d !== '') return;
    const next = (value.slice(0, i) + (clean[clean.length - 1] ?? '') + value.slice(i + 1)).slice(
      0,
      6,
    );
    onChange(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.length === 6 && !next.includes(' ')) onComplete(next);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length >= 4) {
      e.preventDefault();
      onChange(text);
      if (text.length === 6) onComplete(text);
    }
  };

  return (
    <div className="code-inputs" onPaste={onPaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
          }}
          aria-label={`Chiffre ${i + 1} du code`}
        />
      ))}
    </div>
  );
}

type Mode = 'login' | 'signup' | 'verify' | 'reset-request' | 'reset-confirm';

export function LoginScreen({ nav, back }: ScreenProps) {
  const auth = useAuth();
  const [mode, setMode] = React.useState<Mode>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [devCode, setDevCode] = React.useState<string | null>(null);

  const fail = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : 'Erreur réseau — réessayez');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const res = await auth.login(email, password);
        if (res.verificationRequired) {
          setMode('verify');
          setDevCode(res.devCode ?? null);
          setInfo('E-mail non vérifié — un nouveau code vient de vous être envoyé.');
        }
      } else if (mode === 'signup') {
        const res = await auth.signup(email, password);
        setMode('verify');
        setDevCode(res.devCode ?? null);
        setInfo(
          res.emailSent
            ? `Un code de vérification à 6 chiffres a été envoyé à ${email}.`
            : 'Mode développement : e-mail non configuré, le code est affiché ci-dessous.',
        );
      } else if (mode === 'reset-request') {
        const res = await auth.requestReset(email);
        setDevCode(res.devCode ?? null);
        setMode('reset-confirm');
        setInfo(`Si un compte existe pour ${email}, un code de réinitialisation a été envoyé.`);
      } else if (mode === 'reset-confirm') {
        await auth.confirmReset(email, code, newPassword);
        setMode('login');
        setPassword('');
        setInfo('Mot de passe mis à jour — connectez-vous.');
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (c: string) => {
    setError(null);
    setBusy(true);
    try {
      await auth.verify(email, c);
      // succès → App bascule automatiquement sur Home (user non-null)
    } catch (err) {
      fail(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await auth.resendCode(email);
      setDevCode(res.devCode ?? null);
      setInfo('Nouveau code envoyé.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  // ── Verify screen ─────────────────────────────────────────
  if (mode === 'verify' || mode === 'reset-confirm') {
    const isReset = mode === 'reset-confirm';
    return (
      <div className="auth-screen">
        <div className="auth-top">
          <button
            className="iconbtn ghost"
            onClick={() => {
              setMode('login');
              setCode('');
              setError(null);
            }}
          >
            <Icon name="back" size={18} />
          </button>
        </div>
        <div className="auth-hero">
          <Wordmark size={30} />
          <div className="eyebrow" style={{ marginTop: 14 }}>
            {isReset ? 'Réinitialisation' : 'Vérification'}
          </div>
          <h1 className="h-display" style={{ marginTop: 6 }}>
            Code reçu<span className="it">.</span>
          </h1>
          <p className="sub" style={{ marginTop: 8 }}>
            Saisissez le code à 6 chiffres envoyé à<br />
            <strong>{email}</strong>
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <CodeInputs
            value={code}
            onChange={setCode}
            onComplete={(c) => {
              if (!isReset) void verifyCode(c);
            }}
          />

          {isReset && (
            <div className="auth-field" style={{ marginTop: 10 }}>
              <Icon name="shield" size={15} color="var(--ink-3)" />
              <input
                type="password"
                placeholder="Nouveau mot de passe (10+ caractères, Aa1)"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          )}

          {devCode && (
            <div className="auth-info">
              Mode développement (RESEND_API_KEY absent) — code :{' '}
              <strong className="num">{devCode}</strong>
            </div>
          )}
          {info && !devCode && <div className="auth-info">{info}</div>}
          {error && <div className="auth-error">{error}</div>}

          {isReset ? (
            <button
              type="submit"
              className="cta accent"
              style={{ marginTop: 12 }}
              disabled={busy || code.length !== 6}
            >
              {busy ? 'Vérification…' : 'Changer le mot de passe'}
            </button>
          ) : (
            <button
              type="button"
              className="cta accent"
              style={{ marginTop: 12 }}
              disabled={busy || code.length !== 6}
              onClick={() => void verifyCode(code)}
            >
              {busy ? 'Vérification…' : 'Vérifier'}
            </button>
          )}
          <button
            type="button"
            className="auth-link"
            style={{ marginTop: 10 }}
            onClick={() => void resend()}
            disabled={busy}
          >
            Renvoyer le code
          </button>
        </form>
      </div>
    );
  }

  // ── Login / signup / reset-request ────────────────────────
  return (
    <div className="auth-screen">
      <div className="auth-top">
        <button className="iconbtn ghost" onClick={back}>
          <Icon name="back" size={18} />
        </button>
      </div>

      <div className="auth-hero">
        <Wordmark size={30} />
        <div className="eyebrow" style={{ marginTop: 14 }}>
          {mode === 'login'
            ? 'Connexion'
            : mode === 'signup'
              ? 'Créer un compte'
              : 'Mot de passe oublié'}
        </div>
        <h1 className="h-display" style={{ marginTop: 6 }}>
          {mode === 'login' ? (
            <>
              Bon retour<span className="it">.</span>
            </>
          ) : mode === 'signup' ? (
            <>
              Bienvenue<span className="it">.</span>
            </>
          ) : (
            <>
              Réinitialiser<span className="it">.</span>
            </>
          )}
        </h1>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <Icon name="news" size={15} color="var(--ink-3)" />
          <input
            type="email"
            placeholder="Adresse e-mail"
            required
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {mode !== 'reset-request' && (
          <div className="auth-field">
            <Icon name="shield" size={15} color="var(--ink-3)" />
            <input
              type="password"
              required
              minLength={mode === 'signup' ? 10 : 1}
              placeholder={
                mode === 'signup' ? 'Mot de passe (10+ caractères, Aa1)' : 'Mot de passe'
              }
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        {mode === 'login' && (
          <button
            type="button"
            className="auth-link"
            style={{ alignSelf: 'flex-end', marginTop: -6 }}
            onClick={() => {
              setMode('reset-request');
              setError(null);
              setInfo(null);
            }}
          >
            Mot de passe oublié ?
          </button>
        )}

        {info && <div className="auth-info">{info}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="cta accent" style={{ marginTop: 8 }} disabled={busy}>
          {busy
            ? 'Un instant…'
            : mode === 'login'
              ? 'Se connecter'
              : mode === 'signup'
                ? 'Créer mon compte'
                : 'Envoyer le code'}
        </button>
      </form>

      <div
        className="auth-bottom"
        style={{ position: 'static', marginTop: 'auto', paddingTop: 18 }}
      >
        <button
          className="auth-link"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
          </span>
        </button>
      </div>
    </div>
  );
}

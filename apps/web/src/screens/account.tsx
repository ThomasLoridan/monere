/* ACCOUNT — real profile, premium status, logout */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import type { ScreenProps } from '../state/nav';

export function AccountScreen({
  nav,
  back,
  openPaywall,
}: ScreenProps & { openPaywall: () => void }) {
  const { user, logout, setPremium } = useAuth();
  const isPremium = Boolean(user?.premium);
  const initials = (user?.email ?? 'M').slice(0, 2).toUpperCase();

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={back}>
            <Icon name="back" size={18} />
          </button>
        }
      />

      <div className="investor-hero" style={{ paddingTop: 12 }}>
        <div
          className="dn-avatar"
          style={{ width: 72, height: 72, fontSize: 22, borderRadius: 22, margin: '0 auto' }}
        >
          {initials}
        </div>
        <div style={{ marginTop: 14 }}>
          <span className={'badge ' + (isPremium ? 'accent' : '')}>
            {isPremium ? 'Monere Premium' : 'Compte gratuit'}
          </span>
          {user?.role === 'admin' && (
            <span className="badge accent" style={{ marginLeft: 6 }}>
              Admin
            </span>
          )}
        </div>
      </div>

      <div className="settings-head">Abonnement</div>
      <div className="settings-group">
        <button
          className="setting-row"
          style={{
            width: '100%',
            border: 0,
            textAlign: 'left',
            font: 'inherit',
            cursor: 'pointer',
          }}
          onClick={() => (isPremium ? void setPremium(false) : openPaywall())}
        >
          <div className="ic">
            <Icon name={isPremium ? 'check' : 'sim'} size={16} />
          </div>
          <div className="lbl">{isPremium ? 'Membre Premium' : 'Passer à Premium'}</div>
          <div className="v">{isPremium ? 'Résilier' : 'Débloquer →'}</div>
        </button>
        <button
          className="setting-row"
          style={{
            width: '100%',
            border: 0,
            textAlign: 'left',
            font: 'inherit',
            cursor: 'pointer',
          }}
          onClick={() => nav('pricing')}
        >
          <div className="ic">
            <Icon name="cog" size={16} />
          </div>
          <div className="lbl">Voir tous les plans</div>
          <Icon name="chevron" size={13} color="var(--ink-4)" />
        </button>
        <button
          className="setting-row"
          style={{
            width: '100%',
            border: 0,
            textAlign: 'left',
            font: 'inherit',
            cursor: 'pointer',
          }}
          onClick={() => nav('billing')}
        >
          <div className="ic">
            <Icon name="doc" size={16} />
          </div>
          <div className="lbl">Facturation</div>
          <Icon name="chevron" size={13} color="var(--ink-4)" />
        </button>
      </div>

      <div className="settings-head">Profil</div>
      <div className="settings-group">
        <div className="setting-row">
          <div className="ic">
            <Icon name="news" size={16} />
          </div>
          <div className="lbl">E-mail</div>
          <div className="v" style={{ fontSize: 12.5 }}>
            {user?.email}
          </div>
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="check" size={16} />
          </div>
          <div className="lbl">E-mail vérifié</div>
          <div className="v">{user?.emailVerified ? 'Oui ✓' : 'Non'}</div>
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="shield" size={16} />
          </div>
          <div className="lbl">Sessions</div>
          <div className="v" style={{ fontSize: 12 }}>
            Rotation des tokens active
          </div>
        </div>
      </div>

      {user?.role === 'admin' && (
        <>
          <div className="settings-head">Administration</div>
          <div className="settings-group">
            <button
              className="setting-row"
              style={{
                width: '100%',
                border: 0,
                textAlign: 'left',
                font: 'inherit',
                cursor: 'pointer',
              }}
              onClick={() => nav('admin')}
            >
              <div className="ic">
                <Icon name="shield" size={16} />
              </div>
              <div className="lbl">Espace administrateur</div>
              <Icon name="chevron" size={14} color="var(--ink-3)" />
            </button>
          </div>
        </>
      )}

      <div className="settings-head">Application</div>
      <div className="settings-group">
        <button
          className="setting-row"
          style={{
            width: '100%',
            border: 0,
            textAlign: 'left',
            font: 'inherit',
            cursor: 'pointer',
          }}
          onClick={() => nav('settings')}
        >
          <div className="ic">
            <Icon name="cog" size={16} />
          </div>
          <div className="lbl">Réglages de l'app</div>
          <Icon name="chevron" size={14} color="var(--ink-3)" />
        </button>
        <button
          className="setting-row"
          style={{
            width: '100%',
            border: 0,
            textAlign: 'left',
            font: 'inherit',
            cursor: 'pointer',
          }}
          onClick={() => nav('notifications')}
        >
          <div className="ic">
            <Icon name="bell" size={16} />
          </div>
          <div className="lbl">Notifications</div>
          <Icon name="chevron" size={14} color="var(--ink-3)" />
        </button>
      </div>

      <div style={{ padding: '16px 20px 0' }}>
        <button
          className="cta ghost"
          onClick={() => void logout()}
          style={{ color: 'var(--neg)', borderColor: 'var(--neg-soft)' }}
        >
          Se déconnecter
        </button>
      </div>

      <div
        style={{ textAlign: 'center', margin: '18px 20px 0', color: 'var(--ink-3)', fontSize: 11 }}
      >
        Membre depuis{' '}
        {user
          ? new Date(user.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
          : '—'}
      </div>
    </div>
  );
}

/* SETTINGS — appearance, notification prefs (server-persisted), alerts */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, SettingsSwitch } from '../components/ui';
import { useTweaks, ACCENT_OPTIONS } from '../state/tweaks';
import { useAuth } from '../auth/AuthContext';
import { useAlerts } from '../data/hooks';
import type { ScreenProps } from '../state/nav';

export function SettingsScreen({ nav }: ScreenProps) {
  const { tweaks, setTweak } = useTweaks();
  const { user, updateNotifPrefs } = useAuth();
  const { data: alertsData } = useAlerts();
  const activeAlerts = (alertsData?.alerts ?? []).filter((a) => a.active).length;
  const prefs = user?.notifPrefs ?? {};
  const isPremium = Boolean(user?.premium);

  const toggleNotif = (key: string) => {
    void updateNotifPrefs({ ...prefs, [key]: !(prefs[key] ?? true) });
  };
  const prefOn = (key: string) => prefs[key] ?? true;

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={() => nav('home')}>
            <Icon name="back" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">Paramètres</div>
        <h1>Réglages.</h1>
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
          onClick={() => nav('pricing')}
        >
          <div className="ic">
            <Icon name={isPremium ? 'check' : 'sim'} size={16} />
          </div>
          <div className="lbl">{isPremium ? 'Monere Premium' : 'Passer à Premium'}</div>
          <Icon name="chevron" size={13} color="var(--ink-4)" />
        </button>
      </div>

      <div className="settings-head">Compte</div>
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
          onClick={() => nav('account')}
        >
          <div className="ic">
            <Icon name="users" size={16} />
          </div>
          <div className="lbl">Profil & sécurité</div>
          <div className="v" style={{ fontSize: 12 }}>
            {user?.email}
          </div>
          <Icon name="chevron" size={13} color="var(--ink-4)" />
        </button>
        <div className="setting-row">
          <div className="ic">
            <Icon name="globe" size={16} />
          </div>
          <div className="lbl">Devise par défaut</div>
          <div className="v">EUR</div>
        </div>
      </div>

      <div className="settings-head">Apparence</div>
      <div className="settings-group">
        <div className="setting-row">
          <div
            className="ic"
            style={{
              background: tweaks.dark ? '#0B0B0F' : '#FAFAF7',
              color: tweaks.dark ? '#fff' : '#0B0B0F',
              border: '1px solid var(--border-strong)',
            }}
          >
            <Icon
              name={tweaks.dark ? 'moon' : 'sun'}
              size={16}
              color={tweaks.dark ? '#fff' : '#0B0B0F'}
            />
          </div>
          <div className="lbl">Mode sombre</div>
          <SettingsSwitch on={tweaks.dark} onChange={(v) => setTweak('dark', v)} />
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="wand" size={16} />
          </div>
          <div className="lbl">Couleur d'accent</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ACCENT_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setTweak('accent', c)}
                aria-label={`Accent ${c}`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 100,
                  background: c,
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  boxShadow:
                    tweaks.accent === c
                      ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}`
                      : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                }}
              />
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="star" size={16} />
          </div>
          <div className="lbl">Animation des chiffres</div>
          <SettingsSwitch on={tweaks.animateNums} onChange={(v) => setTweak('animateNums', v)} />
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="news" size={16} />
          </div>
          <div className="lbl">Densité des listes</div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'var(--surface-2)',
              padding: 3,
              borderRadius: 100,
            }}
          >
            {(['cosy', 'compact'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setTweak('density', d)}
                style={{
                  border: 0,
                  padding: '4px 10px',
                  borderRadius: 100,
                  fontSize: 11.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: tweaks.density === d ? 'var(--surface)' : 'transparent',
                  color: tweaks.density === d ? 'var(--ink-1)' : 'var(--ink-3)',
                  boxShadow: tweaks.density === d ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                {d === 'cosy' ? 'Cosy' : 'Compact'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-head">Notifications</div>
      <div className="settings-group">
        <div className="setting-row">
          <div className="ic">
            <Icon name="bell" size={16} />
          </div>
          <div className="lbl">Earnings de mes favoris</div>
          <SettingsSwitch on={prefOn('earnings')} onChange={() => toggleNotif('earnings')} />
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="news" size={16} />
          </div>
          <div className="lbl">Actualités prioritaires</div>
          <SettingsSwitch on={prefOn('news')} onChange={() => toggleNotif('news')} />
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="bolt" size={16} />
          </div>
          <div className="lbl">Alertes de dernière minute</div>
          <SettingsSwitch on={prefOn('breaking')} onChange={() => toggleNotif('breaking')} />
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="info" size={16} />
          </div>
          <div className="lbl">Alertes de prix (push)</div>
          <SettingsSwitch on={prefOn('price')} onChange={() => toggleNotif('price')} />
        </div>
        <div className="setting-row">
          <div className="ic">
            <Icon name="users" size={16} />
          </div>
          <div className="lbl">Activité smart money</div>
          <SettingsSwitch on={prefOn('smart')} onChange={() => toggleNotif('smart')} />
        </div>
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
            <Icon name="cal" size={16} />
          </div>
          <div className="lbl">Historique des notifications</div>
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
          onClick={() => nav('alerts')}
        >
          <div className="ic">
            <Icon name="info" size={16} />
          </div>
          <div className="lbl">Gérer les alertes de prix</div>
          <div className="v">
            {activeAlerts} active{activeAlerts > 1 ? 's' : ''}
          </div>
          <Icon name="chevron" size={14} color="var(--ink-3)" />
        </button>
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

      <div
        style={{ textAlign: 'center', margin: '24px 20px 0', color: 'var(--ink-3)', fontSize: 11 }}
      >
        Monere v1.0.0 · données réelles (Finnhub · Yahoo Finance · SEC EDGAR)
      </div>
    </div>
  );
}

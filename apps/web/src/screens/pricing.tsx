/* PRICING + BILLING — plan comparison; premium toggle is a server-side demo
   (no payment processor wired — documented honestly in the UI) */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { frDate } from '../lib/format';
import type { ScreenProps } from '../state/nav';

export function PricingScreen({
  nav,
  back,
  openPaywall,
}: ScreenProps & { openPaywall: () => void }) {
  const { user, setPremium } = useAuth();
  const isPremium = Boolean(user?.premium);
  const [period, setPeriod] = React.useState<'monthly' | 'yearly'>('monthly');

  const free = [
    'Marchés & indices en direct',
    'Graphs, ratios & actualités réelles',
    'Calendrier des earnings officiel',
    'Simulateur de stratégie',
    'Suivi smart money (SEC, STOCK Act)',
    "Jusqu'à 5 alertes de prix",
  ];
  const premium = [
    'Tout Monere Gratuit, plus :',
    'Historique complet battre/manquer',
    'Analyses IA détaillées avec sources',
    'Alertes de prix illimitées',
    'Suivi smart money en temps réel',
  ];

  const priceMonthly = 9.99;
  const priceYearly = 79.99;
  const displayPrice = period === 'monthly' ? priceMonthly : priceYearly / 12;

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={back}>
            <Icon name="back" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">Monere Premium</div>
        <h1>
          Passez à l'analyse
          <br />
          <em>approfondie</em>.
        </h1>
      </div>

      <div className="pricing-period">
        <button
          className={period === 'monthly' ? 'active' : ''}
          onClick={() => setPeriod('monthly')}
        >
          Mensuel
        </button>
        <button className={period === 'yearly' ? 'active' : ''} onClick={() => setPeriod('yearly')}>
          Annuel <span className="save">-33%</span>
        </button>
      </div>

      <div className="pricing-cards">
        <div className="pricing-card">
          <div className="pc-head">
            <div className="pc-name">Gratuit</div>
            <div className="pc-price">
              <span className="amt">0&nbsp;€</span>
              <span className="per">/mois</span>
            </div>
          </div>
          <ul className="pc-features">
            {free.map((f, i) => (
              <li key={i}>
                <Icon name="check" size={14} color="var(--ink-3)" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            className="cta"
            disabled={!isPremium}
            onClick={() => void setPremium(false)}
            style={{ opacity: isPremium ? 1 : 0.5 }}
          >
            {isPremium ? 'Repasser en gratuit' : 'Plan actuel'}
          </button>
        </div>

        <div className="pricing-card featured">
          <div className="pc-badge">Recommandé</div>
          <div className="pc-head">
            <div className="pc-name">Premium</div>
            <div className="pc-price">
              <span className="amt">{displayPrice.toFixed(2).replace('.', ',')}&nbsp;€</span>
              <span className="per">/mois</span>
            </div>
            {period === 'yearly' && (
              <div className="pc-sub">
                Facturé {priceYearly.toFixed(2).replace('.', ',')}&nbsp;€/an
              </div>
            )}
          </div>
          <ul className="pc-features">
            {premium.map((f, i) => (
              <li key={i} className={i === 0 ? 'lead' : ''}>
                {i > 0 && <Icon name="check" size={14} color="var(--accent)" />}
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            className="cta accent"
            disabled={isPremium}
            onClick={openPaywall}
            style={{ opacity: isPremium ? 0.6 : 1 }}
          >
            {isPremium ? 'Déjà abonné ✓' : "Commencer l'essai gratuit"}
          </button>
        </div>
      </div>

      <div className="pricing-foot">
        7 jours d'essai gratuit · Annulez à tout moment · Paiement non branché en environnement de
        démo
      </div>
      {isPremium && (
        <div style={{ padding: '0 20px 24px', textAlign: 'center' }}>
          <button className="paywall-plans-link" onClick={() => nav('billing')}>
            Voir mes factures
          </button>
        </div>
      )}
    </div>
  );
}

export function BillingScreen({
  nav,
  back,
  openPaywall,
}: ScreenProps & { openPaywall: () => void }) {
  const { user, setPremium } = useAuth();
  const isPremium = Boolean(user?.premium);
  const since = user?.premiumSince ? new Date(user.premiumSince) : new Date();
  const nextBilling = new Date(since);
  nextBilling.setMonth(nextBilling.getMonth() + 1);

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={back}>
            <Icon name="back" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">Abonnement</div>
        <h1>Facturation.</h1>
      </div>

      <div className="settings-group" style={{ margin: '0 20px 20px' }}>
        <div className="setting-row">
          <div className="ic">
            <Icon name={isPremium ? 'check' : 'sim'} size={16} />
          </div>
          <div className="lbl">Plan actuel</div>
          <div className="v">{isPremium ? 'Premium' : 'Gratuit'}</div>
        </div>
        {isPremium && (
          <>
            <div className="setting-row">
              <div className="ic">
                <Icon name="cal" size={16} />
              </div>
              <div className="lbl">Abonné depuis</div>
              <div className="v">
                {frDate(since, { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div className="setting-row">
              <div className="ic">
                <Icon name="wallet" size={16} />
              </div>
              <div className="lbl">Moyen de paiement</div>
              <div className="v">Non configuré (démo)</div>
            </div>
          </>
        )}
      </div>

      {isPremium ? (
        <div style={{ padding: '0 20px 28px' }}>
          <div className="watchlist-empty" style={{ margin: '0 0 16px' }}>
            Aucun processeur de paiement n'est branché sur cet environnement — l'abonnement Premium
            est un statut de démonstration stocké côté serveur.
          </div>
          <button
            className="cta"
            onClick={() => void setPremium(false)}
            style={{ color: 'var(--neg)' }}
          >
            Résilier l'abonnement
          </button>
        </div>
      ) : (
        <div className="watchlist-empty" style={{ margin: '20px' }}>
          Aucune facture — vous êtes sur le plan gratuit.
          <button className="cta accent" style={{ marginTop: 16 }} onClick={openPaywall}>
            Passer à Premium
          </button>
        </div>
      )}
    </div>
  );
}

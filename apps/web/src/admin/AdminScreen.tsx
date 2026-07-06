/* ADMIN — platform stats, user management, audit trail, service health.
   Server-side enforced (role=admin on every /api/admin route); this screen
   is just the window onto it. */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { AppBar, LoadingRows } from '../components/ui';
import { get, patch } from '../lib/api';
import { usePlatformHealth } from '../data/hooks';
import { frDate } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import type { ScreenProps } from '../state/nav';

interface AdminStats {
  users: number;
  verified: number;
  premium: number;
  admins: number;
  alerts: number;
  activeSessions: number;
}
interface AdminUser {
  id: string;
  email: string;
  role: string;
  premium: boolean;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}
interface AuditEntry {
  id: string;
  action: string;
  email: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export function AdminScreen({ nav, back }: ScreenProps) {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<'overview' | 'users' | 'audit'>('overview');

  if (user?.role !== 'admin') {
    return (
      <div className="screen">
        <AppBar
          left={
            <button className="iconbtn ghost" onClick={back}>
              <Icon name="back" size={18} />
            </button>
          }
        />
        <div className="watchlist-empty" style={{ marginTop: 60 }}>
          <Icon name="lock" size={28} color="var(--ink-3)" />
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 24,
              color: 'var(--ink-2)',
              margin: '12px 0 6px',
            }}
          >
            Accès réservé
          </div>
          <div style={{ fontSize: 13 }}>Cet espace nécessite un compte administrateur.</div>
        </div>
      </div>
    );
  }

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
        <div className="eyebrow">Espace sécurisé · rôle admin</div>
        <h1>
          Console
          <br />
          <em>administrateur</em>.
        </h1>
      </div>

      <div className="filter-pills" style={{ paddingTop: 14 }}>
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Vue d'ensemble
        </button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Utilisateurs
        </button>
        <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
          Journal d'audit
        </button>
      </div>

      {tab === 'overview' && <AdminOverview />}
      {tab === 'users' && <AdminUsers />}
      {tab === 'audit' && <AdminAudit />}
    </div>
  );
}

function AdminOverview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => get<AdminStats>('/admin/stats'),
    refetchInterval: 30_000,
  });
  const { data: health } = usePlatformHealth(true);

  return (
    <>
      <div className="section-head">
        <div className="title">Plateforme</div>
      </div>
      {isLoading || !stats ? (
        <LoadingRows count={2} height={70} />
      ) : (
        <div className="admin-grid">
          <div className="admin-stat">
            <div className="v">{stats.users}</div>
            <div className="l">Utilisateurs</div>
          </div>
          <div className="admin-stat">
            <div className="v">{stats.verified}</div>
            <div className="l">E-mails vérifiés</div>
          </div>
          <div className="admin-stat">
            <div className="v">{stats.premium}</div>
            <div className="l">Premium</div>
          </div>
          <div className="admin-stat">
            <div className="v">{stats.activeSessions}</div>
            <div className="l">Sessions actives</div>
          </div>
          <div className="admin-stat">
            <div className="v">{stats.alerts}</div>
            <div className="l">Alertes actives</div>
          </div>
          <div className="admin-stat">
            <div className="v">{stats.admins}</div>
            <div className="l">Admins</div>
          </div>
        </div>
      )}

      <div className="section-head">
        <div className="title">Santé des micro-services</div>
        <span
          className="action"
          style={{ color: health?.allHealthy ? 'var(--pos)' : 'var(--neg)' }}
        >
          {health ? (health.allHealthy ? 'Tous opérationnels' : 'Dégradé') : '…'}
        </span>
      </div>
      <div className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Statut</th>
              <th>Uptime</th>
            </tr>
          </thead>
          <tbody>
            {(health?.services ?? []).map((s) => (
              <tr key={s.service}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.service}</td>
                <td>
                  <span className={'admin-pill ' + (s.status === 'ok' ? 'ok' : 'down')}>
                    {s.status}
                  </span>
                </td>
                <td className="num">
                  {s.uptime >= 3600
                    ? `${Math.floor(s.uptime / 3600)}h${Math.floor((s.uptime % 3600) / 60)}`
                    : `${Math.floor(s.uptime / 60)}min`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AdminUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () =>
      get<{ total: number; users: AdminUser[] }>(
        `/admin/users?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      patch(`/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  return (
    <>
      <div className="search-bar-wrap" style={{ paddingTop: 8 }}>
        <div className="search-bar">
          <Icon name="search" size={16} color="var(--ink-3)" />
          <input
            placeholder="Rechercher par e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="section-head">
        <div className="title">Utilisateurs · {data?.total ?? '…'}</div>
      </div>
      {isLoading ? (
        <LoadingRows count={4} height={44} />
      ) : (
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Statut</th>
                <th>Créé</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} style={{ opacity: u.disabled ? 0.5 : 1 }}>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email}
                  </td>
                  <td>
                    <span className={'admin-pill ' + (u.role === 'admin' ? 'admin' : '')}>
                      {u.role}
                    </span>{' '}
                    {u.premium && <span className="admin-pill admin">premium</span>}{' '}
                    {!u.emailVerified && <span className="admin-pill down">non vérifié</span>}
                    {u.disabled && <span className="admin-pill down">désactivé</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{frDate(u.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="admin-action"
                      onClick={() => update.mutate({ id: u.id, body: { disabled: !u.disabled } })}
                    >
                      {u.disabled ? 'Réactiver' : 'Désactiver'}
                    </button>
                    <button
                      className="admin-action"
                      onClick={() => update.mutate({ id: u.id, body: { premium: !u.premium } })}
                    >
                      {u.premium ? '−Premium' : '+Premium'}
                    </button>
                    <button
                      className="admin-action"
                      onClick={() =>
                        update.mutate({
                          id: u.id,
                          body: { role: u.role === 'admin' ? 'user' : 'admin' },
                        })
                      }
                    >
                      {u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AdminAudit() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => get<{ total: number; logs: AuditEntry[] }>('/admin/audit?pageSize=60'),
    refetchInterval: 20_000,
  });

  return (
    <>
      <div className="section-head">
        <div className="title">Journal d'audit · {data?.total ?? '…'} événements</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          auth, admin, premium
        </span>
      </div>
      {isLoading ? (
        <LoadingRows count={5} height={40} />
      ) : (
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Utilisateur</th>
                <th>IP</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(data?.logs ?? []).map((l) => (
                <tr key={l.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{l.action}</td>
                  <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.email ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{l.ip ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(l.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

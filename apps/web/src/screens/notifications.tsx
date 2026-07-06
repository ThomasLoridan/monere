/* NOTIFICATION CENTER — server-persisted history */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, NOTIF_META, LoadingRows } from '../components/ui';
import { useNotifications, useMarkAllRead } from '../data/hooks';
import { frDate } from '../lib/format';
import type { ScreenProps, ScreenName } from '../state/nav';

export function NotificationsScreen({ nav, back }: ScreenProps) {
  const { data, isLoading } = useNotifications();
  const markAll = useMarkAllRead();
  const notifications = data?.notifications ?? [];

  React.useEffect(() => {
    if ((data?.unread ?? 0) > 0) markAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.unread]);

  const [filter, setFilter] = React.useState('all');
  const filters = [
    { id: 'all', label: 'Tout' },
    { id: 'earnings', label: 'Earnings' },
    { id: 'news', label: 'Actualités' },
    { id: 'price', label: 'Prix' },
    { id: 'smart', label: 'Smart money' },
  ];
  const items =
    filter === 'all' ? notifications : notifications.filter((n) => n.category === filter);

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
        <div className="eyebrow">Notifications · {notifications.length}</div>
        <h1>
          Ton <em>fil</em>
          <br />
          d'alertes.
        </h1>
      </div>

      <div className="filter-pills" style={{ paddingTop: 16 }}>
        {filters.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? 'active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows count={4} />
      ) : items.length === 0 ? (
        <div className="watchlist-empty">Aucune notification dans cette catégorie.</div>
      ) : (
        <div style={{ margin: '4px 16px 0' }}>
          {items.map((n) => {
            const meta = NOTIF_META[n.category] ?? NOTIF_META.news!;
            return (
              <button
                key={n.id}
                className={'notif-row' + (n.read ? '' : ' unread')}
                onClick={() =>
                  n.navScreen &&
                  nav(n.navScreen as ScreenName, n.navParams as Record<string, string>)
                }
              >
                <div className="notif-row-ic" style={{ background: meta.grad }}>
                  <Icon name={meta.icon} size={15} />
                </div>
                <div className="notif-row-main">
                  <div className="notif-row-top">
                    <span className="notif-row-title">{n.title}</span>
                    <span className="notif-row-time">{frDate(n.createdAt)}</span>
                  </div>
                  <div className="notif-row-body">{n.body}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

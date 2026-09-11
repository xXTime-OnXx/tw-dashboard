import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { X, ExternalLink, Star } from 'lucide-react';
import type { Annotation, Player, Village, Window } from '../../../packages/contracts/src/index.ts';
import { api, number, time } from './api.ts';
import { Button } from './components/ui/button.tsx';
type Detail = {
  player: Player;
  villages: Village[];
  history: {
    captured_at: string;
    points: string;
    villages: number;
    attack: string | null;
    defense: string | null;
    support: string | null;
    all: string | null;
  }[];
  events: {
    event_id: string;
    village_id: number;
    occurred_at: string;
    old_owner_id: number;
    new_owner_id: number;
  }[];
  tribes: { captured_at: string; tribe: number }[];
  annotation: Annotation;
  observedAt: string;
  baselineAt: string | null;
  resolution: string;
};
export function Profile({
  world,
  id,
  window,
  onClose,
  onPerspective,
}: {
  world: string;
  id: number;
  window: Window;
  onClose: () => void;
  onPerspective: (id: number) => void;
}) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['profile', world, id, window],
    queryFn: () => api<Detail>(`/${world}/players/${id}?window=${window}`),
  });
  const [annotation, setAnnotation] = useState<Annotation>({
    relationship: 'unknown',
    watched: false,
    note: '',
  });
  const [dirty, setDirty] = useState(false);
  const [metric, setMetric] = useState('points');
  useEffect(() => {
    setDirty(false);
  }, [id]);
  useEffect(() => {
    if (query.data && !dirty) setAnnotation(query.data.annotation);
  }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: () =>
      api(`/${world}/players/${id}/annotation`, {
        method: 'PUT',
        body: JSON.stringify(annotation),
      }),
    onSuccess: () => {
      setDirty(false);
      void cache.invalidateQueries();
    },
  });
  const d = query.data;
  return (
    <aside className="profile" aria-label="Player profile">
      <div className="panel-heading">
        <span className="eyebrow">PLAYER INTELLIGENCE</span>
        <Button variant="ghost" aria-label="Close profile" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      {query.isPending ? (
        <p>Loading player…</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        d && (
          <>
            <h2>{d.player.name}</h2>
            <div className="muted">
              Player #{id} · Rank {number(d.player.rank)}
            </div>
            <div className="profile-actions">
              <Button onClick={() => onPerspective(id)}>Use perspective</Button>
              <a
                className="game-link"
                href={`https://${world}.die-staemme.de/game.php?screen=info_player&id=${id}`}
                target="_blank"
                rel="noreferrer"
              >
                In game <ExternalLink size={13} />
              </a>
            </div>
            <div className="metrics">
              <div>
                <b>{number(d.player.points)}</b>
                <span>Points</span>
              </div>
              <div>
                <b>{d.player.villages}</b>
                <span>Villages</span>
              </div>
            </div>
            <div className="section-label">World-wide bashpoints</div>
            <div className="bash-grid">
              {(['attack', 'defense', 'support', 'all'] as const).map((k) => (
                <div key={k}>
                  <span>{k === 'all' ? 'Total' : k}</span>
                  <b>{number(d.player[k])}</b>
                </div>
              ))}
            </div>
            <div className="chart-heading">
              <h3>History</h3>
              <select
                aria-label="Chart metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                {['points', 'villages', 'attack', 'defense', 'support', 'all'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            {!d.baselineAt && <p className="notice">Insufficient history for this comparison.</p>}
            <div className="chart">
              <ResponsiveContainer width="100%" height={185}>
                <LineChart
                  data={d.history.map((h) => ({
                    ...h,
                    value:
                      h[metric as keyof typeof h] === null
                        ? null
                        : Number(h[metric as keyof typeof h]),
                    label: time(h.captured_at),
                  }))}
                >
                  <CartesianGrid stroke="#293238" vertical={false} />
                  <XAxis dataKey="label" hide />
                  <YAxis
                    width={50}
                    tick={{ fill: '#97a5ad', fontSize: 11 }}
                    tickFormatter={(v) =>
                      Intl.NumberFormat('en', { notation: 'compact' }).format(v)
                    }
                  />
                  <Tooltip contentStyle={{ background: '#182127', border: '1px solid #3d4950' }} />
                  <Line
                    type="linear"
                    dataKey="value"
                    name={metric}
                    stroke="#d9ae6b"
                    strokeWidth={2}
                    dot={d.history.length < 3}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="muted small">
              {d.resolution} observations · {time(d.observedAt)}. Chart values are rounded for
              display; exact totals appear above.
            </p>
            <h3>Your assessment</h3>
            <div className="assessment">
              <select
                aria-label="Relationship"
                value={annotation.relationship}
                onChange={(e) => {
                  setDirty(true);
                  setAnnotation({
                    ...annotation,
                    relationship: e.target.value as Annotation['relationship'],
                  });
                }}
              >
                {['unknown', 'friendly', 'neutral', 'hostile'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <Button
                aria-pressed={annotation.watched}
                onClick={() => {
                  setDirty(true);
                  setAnnotation({ ...annotation, watched: !annotation.watched });
                }}
              >
                <Star size={15} fill={annotation.watched ? 'currentColor' : 'none'} /> Watch
              </Button>
            </div>
            <textarea
              aria-label="Private notes"
              placeholder="Private notes about this player…"
              value={annotation.note}
              maxLength={10000}
              onChange={(e) => {
                setDirty(true);
                setAnnotation({ ...annotation, note: e.target.value });
              }}
            />
            <Button
              variant="default"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save assessment'}
            </Button>
            {save.error && <p role="alert">{save.error.message}</p>}
            {save.isSuccess && !dirty && <span className="saved">Saved</span>}
            <h3>
              Villages <span className="muted">{d.villages.length}</span>
            </h3>
            <div className="village-list">
              {d.villages.map((v) => (
                <a
                  key={v.id}
                  href={`https://${world}.die-staemme.de/game.php?screen=info_village&id=${v.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{v.name}</span>
                  <code>
                    {v.x}|{v.y}
                  </code>
                  <b>{number(v.points)}</b>
                </a>
              ))}
            </div>
            <h3>Recorded conquests</h3>
            {!d.events.length && (
              <p className="muted">
                No recorded conquests in this window. This does not establish inactivity.
              </p>
            )}
            {d.events.map((e) => (
              <div key={e.event_id} className="event">
                <b className={e.new_owner_id === id ? 'positive' : 'negative'}>
                  {e.new_owner_id === id ? 'Gained' : 'Lost'} village #{e.village_id}
                </b>
                <span>{time(e.occurred_at)}</span>
                <small>
                  Owner {e.old_owner_id} → {e.new_owner_id}
                </small>
              </div>
            ))}
            <h3>Observed tribe changes</h3>
            {!d.tribes.length ? (
              <p className="muted">No observed changes in this window.</p>
            ) : (
              d.tribes.map((t) => (
                <div key={t.captured_at} className="event">
                  Tribe #{t.tribe}
                  <span>{time(t.captured_at)}</span>
                </div>
              ))
            )}
          </>
        )
      )}
    </aside>
  );
}

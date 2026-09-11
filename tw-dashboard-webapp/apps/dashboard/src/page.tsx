import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import {
  Castle,
  Users,
  Map,
  Activity,
  Search as SearchIcon,
  Star,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Shield,
  RefreshCw,
} from 'lucide-react';
import type { PlayerRow, Surroundings, Freshness } from '../../../packages/contracts/src/index.ts';
import { api, number, signed, time } from './api.ts';
import { Button } from './components/ui/button.tsx';
import { Profile } from './profile.tsx';
import type { Search } from './main.tsx';
const WorldMap = lazy(() => import('./map.tsx'));
export function Dashboard() {
  const s = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const world = 'de259';
  const [playerSearch, setPlayerSearch] = useState('');
  const [filters, setFilters] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const update = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });
  const prefs = useQuery({
    queryKey: ['preferences'],
    queryFn: () =>
      api<{ perspective?: number; radius: number; window: Search['window'] }>('/preferences'),
  });
  useEffect(() => {
    if (prefs.data && s.perspective === undefined && prefs.data.perspective !== undefined)
      update({ ...prefs.data });
  }, [prefs.data]);
  const players = useQuery({
    queryKey: ['search', world, playerSearch],
    queryFn: () =>
      api<{ id: number; name: string; points: string; villages: number; tag: string | null }[]>(
        `/${world}/players?q=${encodeURIComponent(playerSearch)}`,
      ),
  });
  const worlds = useQuery({ queryKey: ['worlds'], queryFn: () => api<Freshness[]>('/worlds') });
  const fresh = worlds.data?.find((w) => w.world === world);
  const params = new URLSearchParams({
    perspective: String(s.perspective ?? 0),
    radius: String(s.radius),
    window: s.window,
    search: s.search,
    sort: s.sort,
    direction: s.direction,
    page: String(s.page),
    excludeTribe: String(s.excludeTribe),
    watched: String(s.watched),
  });
  if (s.center !== undefined) params.set('center', String(s.center));
  if (s.relationship) params.set('relationship', s.relationship);
  const q = useQuery({
    queryKey: ['surroundings', world, params.toString()],
    enabled: s.perspective !== undefined,
    queryFn: () => api<Surroundings>(`/${world}/surroundings?${params}`),
  });
  const status = useQuery({
    queryKey: ['status', world],
    enabled: s.view === 'status',
    queryFn: () =>
      api<{
        freshness: Freshness;
        runs: { id: number; status: string; started_at: string }[];
        groups: { captured_at: string; kind: string; status: string; error: string }[];
        storage: { bytes: string }[];
        coverage: { first: string | null; last: string | null; snapshots: number }[];
      }>(`/${world}/status`),
  });
  useEffect(() => {
    if (s.perspective === undefined) return;
    const timer = setTimeout(() => {
      void api('/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          world,
          perspective: s.perspective,
          radius: s.radius,
          window: s.window,
        }),
      })
        .then(() => setPreferenceError(''))
        .catch(() => setPreferenceError('Could not save perspective defaults.'));
    }, 400);
    return () => clearTimeout(timer);
  }, [s.perspective, s.radius, s.window]);
  const perspective = (id: number) => {
    update({ perspective: id, center: undefined, page: 0 });
  };
  const columns: ColumnDef<PlayerRow>[] = [
    {
      id: 'name',
      header: 'Player',
      cell: ({ row: { original: p } }) => (
        <button className="player-cell" onClick={() => update({ selected: p.id })}>
          <span className={'avatar ' + p.annotation.relationship}>
            {p.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <strong>
              {p.name} {p.annotation.watched && <Star size={12} fill="currentColor" />}
            </strong>
            <small>
              {p.tribeTag ?? 'No tribe'} · #{p.rank}
            </small>
          </span>
        </button>
      ),
    },
    {
      id: 'distance',
      header: 'Proximity',
      cell: ({ row: { original: p } }) => (
        <>
          <strong>
            {p.distance.toFixed(1)} <span className="muted">fields</span>
          </strong>
          <small>
            {p.localVillages} nearby · {p.villages} total
          </small>
        </>
      ),
    },
    {
      id: 'points',
      header: 'Points',
      cell: ({ row: { original: p } }) => (
        <>
          <strong>{number(p.points)}</strong>
          <small className={p.delta && BigInt(p.delta) > 0n ? 'positive' : 'muted'}>
            {signed(p.delta)} in {s.window}
          </small>
        </>
      ),
    },
    {
      id: 'attack',
      header: 'Offense',
      cell: ({ row: { original: p } }) => (
        <>
          <strong>{number(p.attack)}</strong>
          <small className="muted">{signed(p.attackDelta)}</small>
        </>
      ),
    },
    {
      id: 'defense',
      header: 'Defense / support',
      cell: ({ row: { original: p } }) => (
        <>
          <strong>{number(p.defense)}</strong>
          <small>{number(p.support)} support</small>
        </>
      ),
    },
    {
      id: 'all',
      header: 'Total bashpoints',
      cell: ({ row: { original: p } }) => <strong>{number(p.all)}</strong>,
    },
    {
      id: 'conquests',
      header: 'Conquests',
      cell: ({ row: { original: p } }) => (
        <>
          <span className="positive">+{p.gained}</span> <span className="negative">−{p.lost}</span>
          <small>recorded</small>
        </>
      ),
    },
    {
      id: 'lastChange',
      header: 'Last observed change',
      cell: ({ row: { original: p } }) => (
        <span className="muted">{p.lastChange ? time(p.lastChange) : 'Not established'}</span>
      ),
    },
    {
      id: 'evidence',
      header: 'Evidence',
      cell: ({ row: { original: p } }) => (
        <div className="evidence">
          {p.evidence.length ? (
            p.evidence.map((e, i) => (
              <details key={e.kind + i}>
                <summary>{e.label}</summary>
                <div>
                  {e.detail}
                  <small>
                    {time(e.from)} → {time(e.to)}
                  </small>
                  <small>Sources: {e.sourceIds.join(', ')}</small>
                </div>
              </details>
            ))
          ) : (
            <span className="muted">{p.coverage ? 'No flags' : 'Insufficient data'}</span>
          )}
        </div>
      ),
    },
  ];
  const table = useReactTable({
    data: q.data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });
  const error = q.error ?? worlds.error ?? players.error;
  return (
    <div className={'app ' + (s.selected !== undefined ? 'with-profile' : '')}>
      <header className="topbar">
        <a href="/" className="brand">
          <Castle size={25} />
          <span>WATCHTOWER</span>
        </a>
        <span className="world-badge">DE 259</span>
        <div className="private">
          <Shield size={13} /> Private intelligence
        </div>
      </header>
      <div className="workspace">
        <main>
          <div className="title-row">
            <div>
              <div className="eyebrow">YOUR SURROUNDINGS, IN CONTEXT</div>
              <h1>Field intelligence</h1>
            </div>
            <Button
              variant="ghost"
              aria-label="Refresh data"
              onClick={() => {
                void q.refetch();
                void worlds.refetch();
              }}
            >
              <RefreshCw size={17} />
            </Button>
          </div>
          <section className="perspective-bar" aria-label="Perspective controls">
            <label>
              <span>Perspective player</span>
              <div className="search-input">
                <SearchIcon size={15} />
                <input
                  aria-label="Search perspective players"
                  placeholder={q.data?.perspective?.name ?? 'Search players…'}
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                />
              </div>
            </label>
            <select
              aria-label="Choose perspective player"
              value={s.perspective ?? ''}
              onChange={(e) => perspective(Number(e.target.value))}
            >
              <option value="" disabled>
                Select player
              </option>
              {s.perspective && !players.data?.some((p) => p.id === s.perspective) && (
                <option value={s.perspective}>
                  {q.data?.perspective?.name ?? `Player #${s.perspective}`}
                </option>
              )}
              {players.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.tag ? ` [${p.tag}]` : ''}
                </option>
              ))}
            </select>
            <label className="radius-control">
              <span>Radius · fields</span>
              <input
                aria-label="Radius"
                type="number"
                min={1}
                max={100}
                value={s.radius}
                onChange={(e) => {
                  const n = +e.target.value;
                  if (n >= 1 && n <= 100) update({ radius: n, page: 0 });
                }}
              />
            </label>
            <label>
              <span>Compare</span>
              <select
                aria-label="Comparison window"
                value={s.window}
                onChange={(e) => update({ window: e.target.value as Search['window'], page: 0 })}
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </section>
          <div className="freshness">
            <span className={fresh?.snapshotStale ? 'stale' : ''}>
              Snapshot {time(fresh?.publishedAt)}
            </span>
            <span className={fresh?.conquestStale ? 'stale' : ''}>
              Conquests checked {time(fresh?.conquestCheckedAt)}
            </span>
            <span>Imported {time(fresh?.importedAt)}</span>
          </div>
          <nav className="tabs" aria-label="Views">
            {(
              [
                { id: 'players', label: 'Players', icon: Users },
                { id: 'map', label: 'World map', icon: Map },
                { id: 'status', label: 'Data status', icon: Activity },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                className={s.view === t.id ? 'active' : ''}
                onClick={() => update({ view: t.id })}
              >
                <t.icon size={16} />
                {t.label}
                {t.id === 'players' && q.data && <span>{q.data.total}</span>}
              </button>
            ))}
          </nav>
          {preferenceError && (
            <p role="alert" className="notice">
              {preferenceError}
            </p>
          )}
          {error && (
            <div role="alert" className="notice error">
              {error.message}
            </div>
          )}
          {s.view === 'status' ? (
            <section className="status-view">
              <h2>Collection health</h2>
              {status.error && <p role="alert">{status.error.message}</p>}
              <div className="summary-grid">
                <div>
                  <span>Complete snapshots</span>
                  <b>{status.data?.coverage[0]?.snapshots ?? '—'}</b>
                </div>
                <div>
                  <span>History begins</span>
                  <b className="date">{time(status.data?.coverage[0]?.first)}</b>
                </div>
                <div>
                  <span>Database storage</span>
                  <b>
                    {status.data
                      ? number(Math.round(Number(status.data.storage[0].bytes) / 1048576))
                      : '—'}{' '}
                    <small>MB</small>
                  </b>
                </div>
              </div>
              <h3>Recent imports</h3>
              {status.data?.runs.length ? (
                status.data.runs.map((r) => (
                  <div className="status-row" key={r.id}>
                    <span>{time(r.started_at)}</span>
                    <b className={r.status === 'failed' ? 'negative' : 'positive'}>{r.status}</b>
                  </div>
                ))
              ) : (
                <p className="muted">No importer runs recorded.</p>
              )}
              <h3>Groups requiring attention</h3>
              {status.data?.groups.length ? (
                status.data.groups.map((g) => (
                  <p className="notice" key={g.captured_at + g.kind}>
                    {time(g.captured_at)} · {g.kind}: {g.error}
                  </p>
                ))
              ) : (
                <p className="muted">No failed groups recorded.</p>
              )}
            </section>
          ) : s.perspective === undefined ? (
            <section className="empty">
              <Castle size={36} />
              <h2>Choose your vantage point</h2>
              <p>Select a player above to discover opponents around their villages.</p>
              <span className="muted">Public observations. Private assessments.</span>
            </section>
          ) : (
            <>
              {s.view === 'players' ? (
                <>
                  <div className="summary-grid">
                    <div>
                      <span>Nearby opponents</span>
                      <b>{q.data?.total ?? '—'}</b>
                      <small>Within {s.radius} fields</small>
                    </div>
                    <div>
                      <span>Your anchor villages</span>
                      <b>{q.data?.anchors.length ?? '—'}</b>
                      <small>{q.data?.perspective?.name ?? 'Selected perspective'}</small>
                    </div>
                    <div>
                      <span>Comparison coverage</span>
                      <b className="date">
                        {q.data?.baselineAt ? 'Available' : 'Building history'}
                      </b>
                      <small>
                        {q.data?.baselineAt
                          ? `Baseline ${time(q.data.baselineAt)}`
                          : 'Changes appear when a baseline exists'}
                      </small>
                    </div>
                  </div>
                  <div className="table-toolbar">
                    <div className="search-input">
                      <SearchIcon size={15} />
                      <input
                        aria-label="Filter opponents"
                        placeholder="Find an opponent…"
                        value={s.search}
                        onChange={(e) => update({ search: e.target.value, page: 0 })}
                      />
                    </div>
                    <Button
                      aria-pressed={s.watched}
                      onClick={() => update({ watched: !s.watched, page: 0 })}
                    >
                      <Star size={14} /> Watchlist
                    </Button>
                    <Button aria-expanded={filters} onClick={() => setFilters(!filters)}>
                      <SlidersHorizontal size={14} /> Filters
                    </Button>
                  </div>
                  {filters && (
                    <div className="filter-bar">
                      <label>
                        <input
                          type="checkbox"
                          checked={s.excludeTribe}
                          onChange={(e) => update({ excludeTribe: e.target.checked, page: 0 })}
                        />{' '}
                        Exclude same tribe
                      </label>
                      <select
                        aria-label="Relationship filter"
                        value={s.relationship ?? ''}
                        onChange={(e) =>
                          update({
                            relationship: (e.target.value || undefined) as Search['relationship'],
                            page: 0,
                          })
                        }
                      >
                        <option value="">All relationships</option>
                        {['unknown', 'friendly', 'neutral', 'hostile'].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Anchor village"
                        value={s.center ?? ''}
                        onChange={(e) =>
                          update({ center: e.target.value ? +e.target.value : undefined, page: 0 })
                        }
                      >
                        <option value="">All perspective villages</option>
                        {q.data?.anchors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.x}|{v.y})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="table-scroll">
                    <table>
                      <thead>
                        {table.getHeaderGroups().map((g) => (
                          <tr key={g.id}>
                            {g.headers.map((h) => (
                              <th key={h.id}>
                                <button
                                  onClick={() => {
                                    if (
                                      [
                                        'name',
                                        'distance',
                                        'points',
                                        'attack',
                                        'conquests',
                                      ].includes(h.id)
                                    )
                                      update({
                                        sort: h.id as Search['sort'],
                                        direction:
                                          s.sort === h.id && s.direction === 'asc' ? 'desc' : 'asc',
                                        page: 0,
                                      });
                                  }}
                                >
                                  {flexRender(h.column.columnDef.header, h.getContext())}
                                  {s.sort === h.id && (
                                    <span> {s.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {table.getRowModel().rows.map((r) => (
                          <tr
                            key={r.original.id}
                            className={s.selected === r.original.id ? 'selected' : ''}
                          >
                            {r.getVisibleCells().map((c) => (
                              <td key={c.id}>
                                {flexRender(c.column.columnDef.cell, c.getContext())}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {q.isPending ? (
                    <p className="table-empty">Loading surroundings…</p>
                  ) : (
                    !q.data?.rows.length && (
                      <p className="table-empty">No opponents match this area and its filters.</p>
                    )
                  )}
                  <div className="pagination">
                    <span>
                      {q.data?.total ?? 0} players · {s.window} comparison
                    </span>
                    <Button
                      aria-label="Previous page"
                      disabled={s.page === 0}
                      onClick={() => update({ page: s.page - 1 })}
                    >
                      <ChevronLeft size={15} />
                    </Button>
                    <span>{s.page + 1}</span>
                    <Button
                      aria-label="Next page"
                      disabled={(s.page + 1) * 30 >= (q.data?.total ?? 0)}
                      onClick={() => update({ page: s.page + 1 })}
                    >
                      <ChevronRight size={15} />
                    </Button>
                  </div>
                  <p className="footnote">
                    <ArrowUpRight size={13} /> Bashpoints describe world-wide combat. Evidence flags
                    do not establish online status, troop strength, or intent.
                  </p>
                </>
              ) : (
                <Suspense fallback={<p>Loading map…</p>}>
                  <WorldMap
                    world={world}
                    anchors={q.data?.anchors ?? []}
                    radius={s.radius}
                    selected={s.selected}
                    onSelect={(id) => update({ selected: id })}
                    onFallback={() => update({ view: 'players' })}
                  />
                </Suspense>
              )}
            </>
          )}
        </main>
        {s.selected !== undefined && (
          <Profile
            key={s.selected}
            world={world}
            id={s.selected}
            window={s.window}
            onClose={() => update({ selected: undefined })}
            onPerspective={perspective}
          />
        )}
      </div>
    </div>
  );
}

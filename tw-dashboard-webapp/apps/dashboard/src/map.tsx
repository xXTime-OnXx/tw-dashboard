import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import DeckGL from '@deck.gl/react';
import { COORDINATE_SYSTEM, OrthographicView, OrthographicViewport } from '@deck.gl/core';
import { IconLayer, LineLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Village } from '../../../packages/contracts/src/index.ts';
import { api, number, time } from './api.ts';
import { Button } from './components/ui/button.tsx';

type MapVillage = Village & {
  player_name: string | null;
  tribe: number | null;
  tag: string | null;
  relationship: string;
  recent_conquest: boolean;
};

type LabelMode = 'smart' | 'village' | 'player' | 'off';
type ColorMode = 'tribe' | 'relationship';

export const VILLAGE_STAGES = [
  { min: 0, label: '0–299', name: 'Hamlet' },
  { min: 300, label: '300–999', name: 'Settlement' },
  { min: 1_000, label: '1k–2.9k', name: 'Village' },
  { min: 3_000, label: '3k–8.9k', name: 'Walled village' },
  { min: 9_000, label: '9k–10.9k', name: 'Fortified town' },
  { min: 11_000, label: '11k+', name: 'Stronghold' },
] as const;

export function villageStage(points: number | string) {
  const value = Number(points);
  for (let index = VILLAGE_STAGES.length - 1; index >= 0; index -= 1) {
    if (value >= VILLAGE_STAGES[index].min) return index;
  }
  return 0;
}

export function villageMarkerRadius(zoom: number, selected: boolean) {
  const markerRadius = Math.min(8, Math.max(3, zoom + 1));
  return selected ? markerRadius + 2 : markerRadius;
}

export function radiusZoom(radius: number, viewportHeight: number) {
  return Math.max(1, Math.min(6, Math.log2(viewportHeight / Math.max(1, radius * 2.65))));
}

function villageMarkerSize(village: MapVillage, zoom: number) {
  const stage = villageStage(village.points);
  return Math.round(Math.max(10, Math.min(32, 10 + stage * 2.7 + zoom * 0.9)));
}

function compactPoints(points: number | string) {
  const value = Number(points);
  return value >= 1_000 ? `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

const TRIBE_COLORS = [
  [105, 189, 255],
  [252, 177, 80],
  [178, 135, 255],
  [87, 203, 157],
  [255, 119, 149],
  [82, 210, 218],
  [240, 213, 103],
  [151, 196, 93],
] as const;

function markerColor(
  village: MapVillage,
  colorMode: ColorMode,
  anchors: Village[],
  selected?: number,
) {
  if (anchors.some((anchor) => anchor.id === village.id)) return [244, 193, 102, 255] as const;
  if (!village.owner) return [153, 164, 158, 245] as const;
  if (village.owner === selected) return [245, 248, 239, 255] as const;
  if (colorMode === 'relationship') {
    if (village.relationship === 'hostile') return [244, 103, 91, 255] as const;
    if (village.relationship === 'friendly') return [80, 205, 151, 255] as const;
    if (village.relationship === 'neutral') return [145, 160, 168, 255] as const;
    return [100, 158, 187, 255] as const;
  }
  return village.tribe
    ? ([...TRIBE_COLORS[Math.abs(village.tribe) % TRIBE_COLORS.length], 255] as const)
    : ([112, 159, 179, 255] as const);
}

const ICON_MAPPING = {
  stage0: { x: 20, y: 320, width: 230, height: 225, anchorY: 205, mask: false },
  stage1: { x: 260, y: 255, width: 305, height: 295, anchorY: 270, mask: false },
  stage2: { x: 550, y: 215, width: 355, height: 330, anchorY: 305, mask: false },
  stage3: { x: 890, y: 175, width: 355, height: 370, anchorY: 345, mask: false },
  stage4: { x: 1225, y: 130, width: 405, height: 420, anchorY: 395, mask: false },
  stage5: { x: 1610, y: 85, width: 562, height: 475, anchorY: 445, mask: false },
};

class MapBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

export default function WorldMap({
  world,
  anchors,
  radius,
  selected,
  onSelect,
  onFallback,
}: {
  world: string;
  anchors: Village[];
  radius: number;
  selected?: number;
  onSelect: (id: number) => void;
  onFallback: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 550 });
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const [view, setView] = useState({
    target: [500, 500, 0] as [number, number, number],
    zoom: 2,
  });
  const [bounds, setBounds] = useState({ minX: 350, maxX: 650, minY: 350, maxY: 650 });
  const [coordinate, setCoordinate] = useState('');
  const [error, setError] = useState('');
  const [colorMode, setColorMode] = useState<ColorMode>('tribe');
  const [labelMode, setLabelMode] = useState<LabelMode>('smart');
  const [picked, setPicked] = useState<MapVillage | null>(null);

  const focusPerspective = () =>
    setView({
      target: anchors[0] ? [anchors[0].x, anchors[0].y, 0] : [500, 500, 0],
      zoom: radiusZoom(radius, size.height),
    });

  useEffect(() => {
    if (anchors[0]) focusPerspective();
    // Recenter only when the perspective changes, not while the owner resizes the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchors[0]?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const viewport = new OrthographicViewport({
        ...view,
        width: size.width,
        height: size.height,
        flipY: true,
      });
      const [x1, y1] = viewport.unproject([0, 0]);
      const [x2, y2] = viewport.unproject([size.width, size.height]);
      setBounds({
        minX: Math.max(0, Math.min(999, Math.floor(Math.min(x1, x2)))),
        maxX: Math.max(0, Math.min(999, Math.ceil(Math.max(x1, x2)))),
        minY: Math.max(0, Math.min(999, Math.floor(Math.min(y1, y2)))),
        maxY: Math.max(0, Math.min(999, Math.ceil(Math.max(y1, y2)))),
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [view, size]);

  const q = useQuery({
    queryKey: ['map', world, bounds],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<{ villages: MapVillage[]; observedAt: string; truncated: boolean }>(
        `/${world}/map?${new URLSearchParams(Object.entries(bounds).map(([key, value]) => [key, String(value)]))}`,
      ),
  });
  const history = useQuery({
    queryKey: ['village-events', world, picked?.id],
    enabled: !!picked,
    queryFn: () =>
      api<{ event_id: string; occurred_at: string; old_owner_id: number; new_owner_id: number }[]>(
        `/${world}/villages/${picked!.id}/events`,
      ),
  });

  const villages = q.data?.villages ?? [];
  const mapStats = useMemo(
    () => ({
      players: new Set(villages.filter((village) => village.owner).map((village) => village.owner))
        .size,
      barbarians: villages.filter((village) => !village.owner).length,
      conquests: villages.filter((village) => village.recent_conquest).length,
    }),
    [villages],
  );

  const layers = useMemo(() => {
    const continentGrid: { from: [number, number]; to: [number, number] }[] = [];
    for (let field = 0; field <= 1_000; field += 100) {
      continentGrid.push(
        { from: [field, 0], to: [field, 1_000] },
        { from: [0, field], to: [1_000, field] },
      );
    }

    const localGrid: { from: [number, number]; to: [number, number] }[] = [];
    if (view.zoom >= 3) {
      const step = view.zoom >= 5 ? 1 : 10;
      for (let x = Math.floor(bounds.minX / step) * step; x <= bounds.maxX; x += step)
        localGrid.push({ from: [x, bounds.minY], to: [x, bounds.maxY] });
      for (let y = Math.floor(bounds.minY / step) * step; y <= bounds.maxY; y += step)
        localGrid.push({ from: [bounds.minX, y], to: [bounds.maxX, y] });
    }

    const continentLabels: { position: [number, number]; text: string }[] = [];
    for (let y = Math.floor(bounds.minY / 100) * 100; y <= bounds.maxY; y += 100) {
      for (let x = Math.floor(bounds.minX / 100) * 100; x <= bounds.maxX; x += 100) {
        if (x >= 0 && x < 1_000 && y >= 0 && y < 1_000)
          continentLabels.push({
            position: [x + 6, y + 7],
            text: `K${Math.floor(y / 100)}${Math.floor(x / 100)}`,
          });
      }
    }

    const labels = villages.filter((village) => {
      if (labelMode === 'off') return false;
      if (labelMode !== 'smart') return view.zoom >= 4;
      return (
        village.owner === selected ||
        village.recent_conquest ||
        anchors.some((anchor) => anchor.id === village.id) ||
        villageStage(village.points) >= 5 ||
        (view.zoom >= 5.5 && villageStage(village.points) >= 4)
      );
    });

    const selectVillage = (village?: MapVillage) => {
      if (!village) return;
      setPicked(village);
      if (village.owner) onSelect(village.owner);
    };

    return [
      new LineLayer({
        id: 'local-grid',
        data: localGrid,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getSourcePosition: (item) => item.from,
        getTargetPosition: (item) => item.to,
        getColor: view.zoom >= 5 ? [197, 216, 180, 24] : [197, 216, 180, 17],
        getWidth: 1,
        widthUnits: 'pixels',
      }),
      new LineLayer({
        id: 'continents',
        data: continentGrid,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getSourcePosition: (item) => item.from,
        getTargetPosition: (item) => item.to,
        getColor: [224, 193, 126, 105],
        getWidth: 1.4,
        widthUnits: 'pixels',
      }),
      new TextLayer({
        id: 'continent-labels',
        data: continentLabels,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (item) => item.position,
        getText: (item) => item.text,
        getColor: [231, 207, 157, view.zoom < 1.5 ? 150 : 75],
        getSize: view.zoom < 1.5 ? 12 : 10,
        sizeUnits: 'pixels',
        getTextAnchor: 'start',
        getAlignmentBaseline: 'top',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 700,
      }),
      new ScatterplotLayer({
        id: 'radius',
        data: anchors,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (village) => [village.x, village.y],
        getRadius: radius,
        radiusUnits: 'common',
        filled: true,
        stroked: true,
        getFillColor: [244, 193, 102, 20],
        getLineColor: [244, 193, 102, 175],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        lineWidthMinPixels: 1,
      }),
      new ScatterplotLayer<MapVillage>({
        id: 'village-dots',
        data: villages,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (village) => [village.x, village.y],
        getRadius: (village) =>
          villageMarkerSize(village, view.zoom) / 2 + (village.recent_conquest ? 2.5 : 0.5),
        radiusUnits: 'pixels',
        filled: true,
        stroked: true,
        getFillColor: [15, 24, 22, 235],
        getLineColor: (village) =>
          village.recent_conquest
            ? ([250, 92, 80, 255] as const)
            : markerColor(village, colorMode, anchors, selected),
        getLineWidth: (village) => (village.recent_conquest ? 2.5 : 1.5),
        lineWidthUnits: 'pixels',
        radiusMinPixels: 3,
        pickable: true,
        visible: view.zoom < 2.25,
        onClick: (info) => selectVillage(info.object),
      }),
      new IconLayer<MapVillage>({
        id: 'village-icons',
        data: villages,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        iconAtlas: '/map-assets/village-stages.png',
        iconMapping: ICON_MAPPING,
        getIcon: (village) => `stage${villageStage(village.points)}`,
        getPosition: (village) => [village.x, village.y],
        getSize: (village) => villageMarkerSize(village, view.zoom),
        sizeUnits: 'pixels',
        sizeMinPixels: 10,
        sizeMaxPixels: 32,
        getColor: (village) => (!village.owner ? [168, 174, 164, 235] : [255, 255, 255, 255]),
        pickable: true,
        visible: view.zoom >= 2.25,
        onClick: (info) => selectVillage(info.object),
      }),
      new ScatterplotLayer<MapVillage>({
        id: 'village-status-rings',
        data: villages.filter(
          (village) =>
            village.recent_conquest ||
            village.owner === selected ||
            anchors.some((anchor) => anchor.id === village.id),
        ),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (village) => [village.x, village.y],
        getRadius: (village) =>
          villageMarkerSize(village, view.zoom) / 2 + (village.recent_conquest ? 3 : 1),
        radiusUnits: 'pixels',
        filled: false,
        stroked: true,
        getLineColor: (village) =>
          village.recent_conquest
            ? ([250, 92, 80, 255] as const)
            : markerColor(village, colorMode, anchors, selected),
        getLineWidth: (village) => (village.recent_conquest ? 2.5 : 1.5),
        lineWidthUnits: 'pixels',
        pickable: false,
        visible: view.zoom >= 2.25,
      }),
      new ScatterplotLayer<MapVillage>({
        id: 'village-color-dots',
        data: villages,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (village) => [village.x, village.y],
        getRadius: (village) => (anchors.some((anchor) => anchor.id === village.id) ? 3 : 2.25),
        radiusUnits: 'pixels',
        radiusMinPixels: 2,
        filled: true,
        stroked: true,
        getFillColor: (village) => markerColor(village, colorMode, anchors, selected),
        getLineColor: [9, 15, 12, 225],
        getLineWidth: 0.75,
        lineWidthUnits: 'pixels',
        pickable: false,
        visible: view.zoom >= 2.25,
      }),
      new ScatterplotLayer<MapVillage>({
        id: 'village-hit-targets',
        data: villages,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (village) => [village.x, village.y],
        getRadius: (village) => Math.max(7, villageMarkerSize(village, view.zoom) / 2),
        radiusUnits: 'pixels',
        radiusMinPixels: 7,
        filled: true,
        stroked: false,
        getFillColor: [0, 0, 0, 0],
        pickable: true,
        visible: view.zoom >= 2.25,
        onClick: (info) => selectVillage(info.object),
      }),
      new TextLayer<MapVillage>({
        id: 'village-labels',
        data: labels,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (village) => [village.x, village.y],
        getText: (village) => {
          const primary =
            labelMode === 'player' ? (village.player_name ?? 'Barbarian') : village.name;
          return `${primary}  ${compactPoints(village.points)}${village.tag ? `  [${village.tag}]` : ''}`;
        },
        getPixelOffset: (village) => [0, villageMarkerSize(village, view.zoom) / 2 + 7],
        getColor: [244, 239, 218, 245],
        getBackgroundColor: [15, 24, 22, 218],
        background: true,
        backgroundPadding: [4, 2],
        getBorderColor: [209, 178, 112, 80],
        getBorderWidth: 1,
        getSize: 11,
        sizeUnits: 'pixels',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontWeight: 600,
        characterSet: 'auto',
        billboard: false,
      }),
    ];
  }, [anchors, radius, villages, selected, colorMode, labelMode, view.zoom, bounds, onSelect]);

  const fallback = (
    <div className="empty">
      <h2>Map unavailable</h2>
      <p>Your browser could not start WebGL. All villages remain available in the player table.</p>
      <Button onClick={onFallback}>Open players</Button>
    </div>
  );

  const terrainScale = 96 * 2 ** view.zoom;
  const terrainStyle = {
    backgroundSize: `${terrainScale}px ${terrainScale}px`,
    backgroundPosition: `${size.width / 2 - view.target[0] * 2 ** view.zoom}px ${size.height / 2 - view.target[1] * 2 ** view.zoom}px`,
  };
  const selectedStage = picked ? VILLAGE_STAGES[villageStage(picked.points)] : null;

  const selectVillageAtPointer = (clientX: number, clientY: number) => {
    if (!container.current) return;
    const rect = container.current.getBoundingClientRect();
    const viewport = new OrthographicViewport({
      ...view,
      width: rect.width,
      height: rect.height,
      flipY: true,
    });
    const pointer = [clientX - rect.left, clientY - rect.top];
    let closest: { village: MapVillage; distance: number } | undefined;
    for (const village of villages) {
      const projected = viewport.project([village.x, village.y]);
      const distance = Math.hypot(projected[0] - pointer[0], projected[1] - pointer[1]);
      if (!closest || distance < closest.distance) closest = { village, distance };
    }
    if (
      !closest ||
      closest.distance > Math.max(7, villageMarkerSize(closest.village, view.zoom) / 2)
    )
      return;
    setPicked(closest.village);
    if (closest.village.owner) onSelect(closest.village.owner);
  };

  return (
    <div className="world-map">
      <div className="map-tools">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const match = /^(\d{1,3})[|, ](\d{1,3})$/.exec(coordinate.trim());
            if (match && +match[1] <= 999 && +match[2] <= 999) {
              setView({ target: [+match[1], +match[2], 0], zoom: 5 });
              setError('');
            } else setError('Enter world coordinates such as 500|500');
          }}
        >
          <label className="map-tool-label">
            <span>Jump to</span>
            <input
              aria-label="Map coordinate"
              placeholder="500|500"
              value={coordinate}
              onChange={(event) => setCoordinate(event.target.value)}
            />
          </label>
          <Button>Go</Button>
        </form>
        <label className="map-tool-label">
          <span>Color shows</span>
          <select
            aria-label="Map colors"
            value={colorMode}
            onChange={(event) => setColorMode(event.target.value as ColorMode)}
          >
            <option value="tribe">Tribe territory</option>
            <option value="relationship">Relationship</option>
          </select>
        </label>
        <label className="map-tool-label">
          <span>Labels</span>
          <select
            aria-label="Map labels"
            value={labelMode}
            onChange={(event) => setLabelMode(event.target.value as LabelMode)}
          >
            <option value="smart">Smart labels</option>
            <option value="village">Village names</option>
            <option value="player">Player names</option>
            <option value="off">Hidden</option>
          </select>
        </label>
        <div className="map-zoom-controls" aria-label="Map zoom controls">
          <Button
            aria-label="Zoom out"
            onClick={() =>
              setView((current) => ({ ...current, zoom: Math.max(-1, current.zoom - 0.75) }))
            }
          >
            −
          </Button>
          <span>{Math.round(2 ** view.zoom * 10) / 10}×</span>
          <Button
            aria-label="Zoom in"
            onClick={() =>
              setView((current) => ({ ...current, zoom: Math.min(7, current.zoom + 0.75) }))
            }
          >
            +
          </Button>
        </div>
        <Button onClick={focusPerspective}>Fit radius</Button>
      </div>
      {error && (
        <p className="map-error" role="alert">
          {error}
        </p>
      )}
      {q.error && (
        <p className="map-error" role="alert">
          {q.error.message}
        </p>
      )}
      <div
        className="map-canvas"
        ref={container}
        onClickCapture={(event) => {
          if (event.target instanceof HTMLCanvasElement)
            selectVillageAtPointer(event.clientX, event.clientY);
        }}
      >
        <div className="map-terrain" style={terrainStyle} aria-hidden="true" />
        <MapBoundary fallback={fallback}>
          <DeckGL
            views={new OrthographicView({ id: 'world', flipY: true })}
            viewState={view}
            controller={{ dragPan: true, scrollZoom: true, doubleClickZoom: true, keyboard: true }}
            onViewStateChange={({ viewState }) => {
              const nextTarget = viewState.target ?? view.target;
              const nextZoom = typeof viewState.zoom === 'number' ? viewState.zoom : view.zoom;
              setView({
                ...viewState,
                target: [
                  Math.max(0, Math.min(999, nextTarget[0])),
                  Math.max(0, Math.min(999, nextTarget[1])),
                  0,
                ],
                zoom: Math.max(-1, Math.min(7, nextZoom)),
              } as typeof view);
            }}
            layers={layers}
            onClick={({ object }) => {
              const village = object as MapVillage | undefined;
              if (!village || typeof village.owner !== 'number') return;
              setPicked(village);
              if (village.owner) onSelect(village.owner);
            }}
            getTooltip={({ object }) =>
              object
                ? {
                    text: `${object.name}\n${object.x}|${object.y} · ${object.player_name ?? 'Barbarian'}${object.tag ? ` [${object.tag}]` : ''}\n${number(object.points)} points · ${VILLAGE_STAGES[villageStage(object.points)].name}${object.recent_conquest ? '\nConquered in the last 24h' : ''}`,
                    className: 'map-tooltip',
                  }
                : null
            }
          />
        </MapBoundary>
        <div className="map-readout">
          <b>
            {Math.round(view.target[0])}|{Math.round(view.target[1])}
          </b>
          <span>
            K{Math.floor(view.target[1] / 100)}
            {Math.floor(view.target[0] / 100)}
          </span>
        </div>
        <div className="map-stats" aria-live="polite">
          <span>
            <b>{q.isFetching ? '…' : villages.length}</b> villages
          </span>
          <span>
            <b>{mapStats.players}</b> players
          </span>
          <span>
            <b>{mapStats.barbarians}</b> barbarian
          </span>
          <span className={mapStats.conquests ? 'is-alert' : ''}>
            <b>{mapStats.conquests}</b> recent conquests
          </span>
          <span data-testid="map-count" className="map-count-test">
            {villages.length} villages
          </span>
        </div>
        <div className="map-stage-key">
          <div className="map-stage-heading">
            <b>Village points</b>
            <span>Bigger settlement = more points</span>
          </div>
          <img
            src="/map-assets/village-stages.png"
            alt="Six village sizes, from hamlet to stronghold"
          />
          <div className="map-stage-labels">
            {VILLAGE_STAGES.map((stage) => (
              <span key={stage.min}>{stage.label}</span>
            ))}
          </div>
        </div>
        <div className="map-status-key">
          <span>
            <i className="key-dot territory" /> Tribe / relationship
          </span>
          <span>
            <i className="key-ring perspective" /> Perspective radius
          </span>
          <span>
            <i className="key-ring selected" /> Selected player
          </span>
          <span>
            <i className="key-ring conquest" /> Conquest &lt;24h
          </span>
          <span>
            <i className="key-ring barbarian" /> Barbarian
          </span>
        </div>
      </div>
      {q.data?.truncated && (
        <p className="notice">This view is dense. Zoom in to load every village.</p>
      )}
      {picked && selectedStage && (
        <div className="map-detail">
          <div className="map-detail-primary">
            <b>{picked.name}</b>
            <code>
              {picked.x}|{picked.y}
            </code>
            <span>
              {picked.player_name ?? 'Barbarian'}
              {picked.tag ? ` · [${picked.tag}]` : ''}
            </span>
          </div>
          <div className="map-detail-facts">
            <span>
              <b>{number(picked.points)}</b> points
            </span>
            <span>
              Stage {villageStage(picked.points) + 1}/6 · {selectedStage.name}
            </span>
            <span>{picked.owner ? picked.relationship : 'Unowned'}</span>
            {picked.recent_conquest && <span className="recent-badge">Conquered in last 24h</span>}
          </div>
          <details>
            <summary>Recorded ownership history</summary>
            {history.data?.length ? (
              history.data.map((event) => (
                <p key={event.event_id}>
                  {time(event.occurred_at)} · {event.old_owner_id} → {event.new_owner_id}
                </p>
              ))
            ) : (
              <p>No recorded events available.</p>
            )}
          </details>
        </div>
      )}
    </div>
  );
}

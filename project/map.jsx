// map.jsx — Map-first Nearby view.
// Style target: Apple Maps / Google Maps dark mode.
// Radar identity is intentionally restrained: one faint 500m ring + active
// ping pulses on talking dots only. No sweep, no breathing halo, no glow.

const MAP_POSITIONS = {
  d1: { x: 148, y: 240 }, // apex_92      — Valencia & 19th
  d2: { x: 168, y: 308 }, // nightrun     — Market arterial
  d3: { x: 55,  y: 175 }, // drift_king   — Guerrero & 20th
  d4: { x: 232, y: 240 }, // miata_life   — Mission & 19th
  d5: { x: 56,  y: 325 }, // canyon_carver— Guerrero / Market
  d6: { x: 320, y: 40  }, // vroom_vroom  — Capp & 22nd
  d7: { x: 232, y: 430 }, // turbobrick   — Mission & 16th
};

function MapView({ drivers, onTapDriver, focusId, selectedId, onSelectDriver, talking }) {
  const W = 390, H = 460;
  const center = { x: 195, y: 230 };

  // Street definitions — supports straight + curved paths.
  // kind: 'arterial' | 'minor' | 'tiny'
  const hStreets = [
    { name: '22ND ST', y: 40,  kind: 'minor' },
    { name: '21ST ST', y: 110, kind: 'minor' },
    { name: '20TH ST', y: 175, kind: 'minor' },
    { name: '19TH ST', y: 240, kind: 'minor' },
    { name: '17TH ST', y: 360, kind: 'minor' },
    { name: '16TH ST', y: 430, kind: 'minor' },
  ];
  const vStreets = [
    { name: 'GUERRERO',   x: 55,  kind: 'minor' },
    { name: 'VALENCIA',   x: 148, kind: 'minor' },
    { name: 'MISSION ST', x: 232, kind: 'arterial' },
    { name: 'CAPP ST',    x: 320, kind: 'minor' },
  ];

  // Subtle building footprints inside blocks
  const buildings = [
    // row above 21st
    [62,52,30,54],[100,52,40,54],[152,52,28,54],[186,52,52,54],[238,52,30,54],[276,55,40,50],[326,52,55,30],
    // 21st-20th
    [62,118,38,52],[105,118,38,52],[152,118,42,52],[200,118,30,52],[238,118,40,52],[284,118,32,52],[326,118,55,52],
    // 20th-19th
    [62,183,38,52],[105,183,38,52],[152,183,42,52],[200,183,30,52],[238,183,40,52],[284,183,32,52],[326,183,55,52],
    // 19th-Market
    [62,248,28,42],[95,248,52,42],[152,248,55,42],[214,248,18,42],[238,248,42,42],[286,248,32,42],[326,250,40,40],
    // Market - 17th (irregular)
    [62,332,28,22],[95,332,52,22],[152,332,55,22],[214,332,18,22],[238,332,42,22],[286,332,32,22],[326,332,55,22],
    // 17th-16th
    [62,368,38,58],[105,368,38,58],[152,368,42,58],[200,368,30,58],[238,368,40,58],[284,368,32,58],[326,368,55,58],
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#06070a' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <pattern id="rp_lotHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
          </pattern>
          <radialGradient id="rp_edgeFade" cx="50%" cy="50%" r="78%">
            <stop offset="65%" stopColor="rgba(0,0,0,0)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0.85)"/>
          </radialGradient>
        </defs>

        {/* Base land */}
        <rect width={W} height={H} fill="#0a0b0e"/>

        {/* Dolores Park */}
        <g>
          <rect x="245" y="50" width="80" height="100" rx="3" fill="#0f1a13"/>
          {/* tree dots */}
          {[[262,72],[288,68],[308,78],[260,98],[290,100],[314,112],[270,128],[300,130],[284,142]].map((p,i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill="rgba(95,150,108,0.5)"/>
          ))}
          <text x="285" y="105" textAnchor="middle"
            fill="rgba(150,200,170,0.75)"
            fontFamily="Space Grotesk, sans-serif" fontStyle="italic"
            fontSize="9" letterSpacing="0.04em">Dolores Park</text>
        </g>

        {/* Mission Bay channel (water, bottom-left) */}
        <path d="M 0 405 Q 50 392 78 432 Q 95 452 78 460 L 0 460 Z" fill="#0a1622"/>
        <text x="22" y="450"
          fill="rgba(140,180,210,0.6)"
          fontFamily="Space Grotesk, sans-serif" fontStyle="italic"
          fontSize="8" letterSpacing="0.02em">Mission Channel</text>

        {/* Parking lot near Mission/17th */}
        <g>
          <rect x="240" y="280" width="46" height="44" fill="#15161a" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
          <rect x="240" y="280" width="46" height="44" fill="url(#rp_lotHatch)"/>
          <text x="263" y="305" textAnchor="middle"
            fill="rgba(255,255,255,0.35)"
            fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing="0.15em">P · LOT</text>
        </g>

        {/* Gas station glyph at Valencia/16th */}
        <g transform="translate(108, 392)">
          <rect width="32" height="32" rx="3" fill="#1a1620" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
          <circle cx="16" cy="16" r="4" fill="none" stroke="rgba(255,180,80,0.6)" strokeWidth="1"/>
          <text x="16" y="18" textAnchor="middle" fill="rgba(255,180,80,0.7)" fontFamily="JetBrains Mono, monospace" fontSize="6">⛽</text>
        </g>

        {/* Building footprints */}
        {buildings.map((b, i) => (
          <rect key={'b'+i} x={b[0]} y={b[1]} width={b[2]} height={b[3]}
            fill="#101115"
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.4"/>
        ))}

        {/* ── STREETS (surface) ─────────────────────────────── */}
        {/* horizontal */}
        {hStreets.map((s, i) => (
          <g key={'h'+i}>
            <line x1="-10" y1={s.y} x2={W+10} y2={s.y}
              stroke="#2a2b2f" strokeWidth={s.kind === 'arterial' ? 14 : 11}/>
          </g>
        ))}
        {/* vertical */}
        {vStreets.map((s, i) => (
          <g key={'v'+i}>
            <line x1={s.x} y1="-10" x2={s.x} y2={H+10}
              stroke={s.kind === 'arterial' ? '#34322c' : '#2a2b2f'}
              strokeWidth={s.kind === 'arterial' ? 14 : 11}/>
          </g>
        ))}

        {/* Market — diagonal arterial (slight slope) */}
        <line x1="-20" y1="322" x2="410" y2="285" stroke="#34322c" strokeWidth="16"/>
        {/* Mission St arterial — yellow centerline */}
        <line x1="232" y1="-10" x2="232" y2={H+10}
          stroke="rgba(255,200,90,0.18)" strokeWidth="0.7" strokeDasharray="10 7"/>
        {/* Market centerline (yellow dashed) */}
        <line x1="-20" y1="322" x2="410" y2="285"
          stroke="rgba(255,200,90,0.2)" strokeWidth="0.8" strokeDasharray="10 7"/>

        {/* Minor street centerlines (white dashed) — only on a few to avoid noise */}
        {[110, 175, 240, 360].map((y) => (
          <line key={'cl'+y} x1="-10" y1={y} x2={W+10} y2={y}
            stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="3 7"/>
        ))}
        {[148, 320].map((x) => (
          <line key={'clv'+x} x1={x} y1="-10" x2={x} y2={H+10}
            stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="3 7"/>
        ))}

        {/* Curved on-ramp at bottom-right (toward 101) */}
        <path d="M 410 405 Q 360 405 330 380 Q 305 360 305 320"
          fill="none" stroke="#3a3429" strokeWidth="11" strokeLinecap="round"/>
        <path d="M 410 405 Q 360 405 330 380 Q 305 360 305 320"
          fill="none" stroke="rgba(255,200,90,0.18)" strokeWidth="0.7" strokeDasharray="6 5"/>
        <text x="358" y="378" fill="rgba(255,200,90,0.65)"
          fontFamily="Space Grotesk, sans-serif" fontSize="9" fontWeight="600"
          transform="rotate(-35 358 378)">
          → 101 N
        </text>

        {/* Small alley between Valencia and Mission */}
        <line x1="190" y1="175" x2="190" y2="240" stroke="#1d1e22" strokeWidth="4"/>
        <text x="186" y="208" fill="rgba(180,180,180,0.4)"
          fontFamily="Space Grotesk, sans-serif" fontStyle="italic"
          fontSize="6" transform="rotate(90 186 208)">Lexington</text>

        {/* ── STREET NAMES (italic, like real maps) ─────────── */}
        {hStreets.map((s, i) => (
          <text key={'lh'+i} x={W/2 + (i%2 ? -40 : 60)} y={s.y + 3}
            textAnchor="middle"
            fill="rgba(220,220,220,0.78)"
            fontFamily="Space Grotesk, sans-serif"
            fontStyle="italic" fontSize="8.5"
            letterSpacing="0.02em">{toTitle(s.name)}</text>
        ))}
        {vStreets.map((s, i) => (
          <text key={'lv'+i}
            transform={`translate(${s.x + 3}, ${i%2 ? 92 : 198}) rotate(-90)`}
            fill="rgba(220,220,220,0.78)"
            fontFamily="Space Grotesk, sans-serif"
            fontStyle="italic" fontSize="8.5"
            letterSpacing="0.02em">{toTitle(s.name)}</text>
        ))}
        {/* Market label */}
        <text x="60" y="316"
          transform="rotate(-5 60 316)"
          fill="rgba(255,210,140,0.92)"
          fontFamily="Space Grotesk, sans-serif"
          fontStyle="italic" fontSize="10" fontWeight="600"
          letterSpacing="0.02em">Market St</text>
        <text x="285" y="298"
          transform="rotate(-5 285 298)"
          fill="rgba(255,210,140,0.6)"
          fontFamily="Space Grotesk, sans-serif"
          fontStyle="italic" fontSize="8.5">Market St</text>

        {/* ── Subtle radar identity ─────────────────────────── */}
        {/* Single 500m boundary ring, very faint */}
        <circle cx={center.x} cy={center.y} r="185" fill="none"
          stroke="rgba(255,106,26,0.18)" strokeWidth="1" strokeDasharray="2 6"/>
        <text x={center.x + 6} y={center.y - 187}
          fill="rgba(255,106,26,0.45)"
          fontFamily="JetBrains Mono, monospace" fontSize="7"
          letterSpacing="0.16em">500m · RANGE</text>

        {/* Edge fade so corners go to black */}
        <rect width={W} height={H} fill="url(#rp_edgeFade)" pointerEvents="none"/>

        {/* ── Driver dots (with distance labels) ────────────── */}
        {drivers.map(d => {
          const p = MAP_POSITIONS[d.id]; if (!p) return null;
          return (
            <MapDot key={d.id} d={d} x={p.x} y={p.y}
              isFocus={focusId === d.id}
              isSelected={selectedId === d.id}
              onTap={() => onSelectDriver && onSelectDriver(d)}/>
          );
        })}

        {/* ── User location pin ─────────────────────────────── */}
        <g transform={`translate(${center.x}, ${center.y})`}>
          {/* heading cone */}
          <path d="M 0 -30 L -12 -8 L 12 -8 Z"
            fill="rgba(255,106,26,0.22)"
            stroke="rgba(255,106,26,0.55)" strokeWidth="0.6"/>
          {/* core dot, like real maps */}
          <circle r="10" fill="#000"/>
          <circle r="8" fill={talking ? '#FF3D2E' : '#FF6A1A'}/>
          <circle r="3" fill="#fff"/>
        </g>
      </svg>

      {/* Inline driver card preview (HTML overlay) */}
      {(() => {
        const sel = drivers.find(d => d.id === selectedId);
        if (!sel) return null;
        const p = MAP_POSITIONS[sel.id]; if (!p) return null;
        return <DriverPreviewCard d={sel} mapX={p.x} mapY={p.y} W={W} H={H}
          onOpen={() => onTapDriver && onTapDriver(sel)} />;
      })()}
    </div>
  );
}

// Convert "MISSION ST" → "Mission St"
function toTitle(s) {
  return s.toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/(\d)(St|Nd|Rd|Th)/i, (_, n, suf) => n + suf.toLowerCase());
}

// ── Driver dot on the road ──────────────────────────────────
function MapDot({ d, x, y, isFocus, isSelected, onTap }) {
  const isTalking = d.talking;
  const r = d.active ? 7 : 5.5;
  const labelDim = !d.active;
  const showLabel = d.active; // hide labels for far/inactive ones to avoid clutter

  return (
    <g transform={`translate(${x}, ${y})`} style={{ cursor: 'pointer' }} onClick={onTap}>
      {/* tap target */}
      <circle r="22" fill="rgba(0,0,0,0)"/>
      {/* talking pings */}
      {isTalking && (
        <>
          <circle r="10" fill="none" stroke="rgba(255,106,26,0.85)" strokeWidth="1.5">
            <animate attributeName="r" from="7" to="26" dur="1.2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" from="0.95" to="0" dur="1.2s" repeatCount="indefinite"/>
          </circle>
          <circle r="14" fill="none" stroke="rgba(255,106,26,0.5)" strokeWidth="1">
            <animate attributeName="r" from="10" to="32" dur="1.2s" begin="0.4s" repeatCount="indefinite"/>
            <animate attributeName="opacity" from="0.7" to="0" dur="1.2s" begin="0.4s" repeatCount="indefinite"/>
          </circle>
        </>
      )}
      {/* dark backing */}
      <circle r={r + 2.5} fill="#0a0b0e"/>
      {/* main */}
      <circle r={r}
        fill={d.active ? d.color : 'rgba(255,255,255,0.22)'}
        stroke={isTalking ? '#FF6A1A' : (isSelected ? '#fff' : 'rgba(255,255,255,0.4)')}
        strokeWidth={isTalking || isSelected ? 1.6 : 0.8}/>
      {/* always-visible distance + handle for active drivers */}
      {showLabel && (
        <g transform="translate(0, 17)">
          <text textAnchor="middle"
            fill={isTalking ? '#FF6A1A' : 'rgba(255,255,255,0.9)'}
            fontFamily="JetBrains Mono, monospace" fontSize="7.5"
            fontWeight={isTalking ? '600' : '500'}
            letterSpacing="0.04em"
            style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.9)', strokeWidth: 2 }}>
            @{d.handle}
          </text>
          <text y="9" textAnchor="middle"
            fill={isTalking ? 'rgba(255,180,120,0.9)' : 'rgba(255,255,255,0.55)'}
            fontFamily="JetBrains Mono, monospace" fontSize="6.5"
            letterSpacing="0.08em"
            style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.85)', strokeWidth: 2 }}>
            {d.dist}m
          </text>
        </g>
      )}
    </g>
  );
}

// ── Selected driver inline card (above the dot) ─────────────
function DriverPreviewCard({ d, mapX, mapY, W, H, onOpen }) {
  // Position the card so it doesn't fall off the map.
  // Card is a fixed pixel-ish size positioned by percent on the container.
  // We anchor at the dot and offset.
  const cardW = 200, cardH = 92;
  // try above by default; if too close to top, go below
  const above = mapY > 200;
  // Container has fixed aspect so we use percentage positioning
  const left = (mapX / W) * 100;
  const top  = (mapY / H) * 100;

  return (
    <div style={{
      position: 'absolute',
      left: `${left}%`,
      top: `${top}%`,
      transform: `translate(-50%, ${above ? 'calc(-100% - 22px)' : '22px'})`,
      width: cardW,
      pointerEvents: 'auto',
      zIndex: 4,
      animation: 'rpFadeIn 0.18s ease',
    }}>
      <div style={{
        position: 'relative',
        padding: 12,
        borderRadius: 14,
        background: 'rgba(14,14,16,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 12px 28px rgba(0,0,0,0.55)',
        color: '#fff',
      }}>
        {/* pointer arrow */}
        <span style={{
          position: 'absolute',
          left: '50%',
          [above ? 'bottom' : 'top']: -5,
          transform: 'translateX(-50%) rotate(45deg)',
          width: 10, height: 10,
          background: 'rgba(14,14,16,0.92)',
          borderRight: above ? '1px solid rgba(255,255,255,0.14)' : 'none',
          borderBottom: above ? '1px solid rgba(255,255,255,0.14)' : 'none',
          borderLeft: !above ? '1px solid rgba(255,255,255,0.14)' : 'none',
          borderTop: !above ? '1px solid rgba(255,255,255,0.14)' : 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 44, height: 30, borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <VehicleGlyph body={d.body || 'sedan'} color={d.color} size={42} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>@{d.handle}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.car || `${d.year} ${d.make} ${d.model}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#FF6A1A' }}>{d.dist}m</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em' }}>
              {d.talking ? 'ON AIR' : 'LISTENING'}
            </div>
          </div>
        </div>

        <button onClick={onOpen} style={{
          marginTop: 10, width: '100%',
          padding: '7px 10px', borderRadius: 9,
          background: 'rgba(255,106,26,0.12)',
          border: '1px solid rgba(255,106,26,0.5)',
          color: '#FF6A1A',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
          letterSpacing: '0.16em', cursor: 'pointer',
        }}>
          OPEN DRIVER CARD
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { MapView, MapDot, MAP_POSITIONS, DriverPreviewCard });

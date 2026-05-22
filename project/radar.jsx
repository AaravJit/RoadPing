// radar.jsx — Radar screen + hold-to-talk button, the emotional core of RoadPing

const NEARBY_DRIVERS = [
  { id: 'd1', handle: 'apex_92',       year: 2022, make: 'Porsche',    model: '911 GT3',     body: 'sportsCar', color: '#E8DCC7', colorName: 'Chalk',         nick: '',           dist: 120, angle: 35,  active: true,  talking: false, car: '2022 Porsche 911 GT3' },
  { id: 'd2', handle: 'nightrun',      year: 1997, make: 'Mazda',      model: 'RX-7',        body: 'coupe',     color: '#D94F3A', colorName: 'Vintage Red',   nick: 'FD',         dist: 95,  angle: 200, active: true,  talking: true,  car: '1997 Mazda RX-7' },
  { id: 'd3', handle: 'drift_king',    year: 1999, make: 'Nissan',     model: '240SX',       body: 'coupe',     color: '#1E4FB8', colorName: 'Royal Blue',    nick: 'S15 swap',   dist: 280, angle: 290, active: true,  talking: false, car: '1999 Nissan 240SX' },
  { id: 'd4', handle: 'miata_life',    year: 1990, make: 'Mazda',      model: 'MX-5 Miata',  body: 'sportsCar', color: '#1a1b1e', colorName: 'Brilliant Black', nick: 'NA',       dist: 200, angle: 110, active: true,  talking: false, car: '1990 Mazda MX-5 Miata' },
  { id: 'd5', handle: 'canyon_carver', year: 2002, make: 'Acura',      model: 'NSX',         body: 'supercar',  color: '#F2C200', colorName: 'Spa Yellow',    nick: 'Type R',     dist: 350, angle: 250, active: true,  talking: false, car: '2002 Acura NSX' },
  { id: 'd6', handle: 'vroom_vroom',   year: 2003, make: 'BMW',        model: 'M3',          body: 'coupe',     color: '#5B6F8A', colorName: 'Silver Grey',   nick: 'E46',        dist: 410, angle: 60,  active: false, talking: false, car: '2003 BMW M3' },
  { id: 'd7', handle: 'turbobrick',    year: 1989, make: 'Volvo',      model: '240 Wagon',   body: 'wagon',     color: '#7A6B5E', colorName: 'Stone',         nick: 'TurboBrick', dist: 460, angle: 165, active: true,  talking: false, car: '1989 Volvo 240 Wagon' },
];

const ROOMS_HINT = [
  { id: 'r1', name: 'Canyon Run · Sat',  count: 4 },
  { id: 'r2', name: 'Cars & Coffee SF',  count: 12 },
];

// ─── Radar visual ─────────────────────────────────────────────
function RadarView({ drivers, onTapDriver, talking, incomingFrom, focusId }) {
  const size = 340;
  const center = size / 2;
  const maxRange = 500;
  const ringRadii = [60, 120, 168]; // visual radii for 150m, 300m, 500m
  const labels = ['150', '300', '500'];

  // sweep rotation
  const [sweep, setSweep] = React.useState(0);
  React.useEffect(() => {
    let raf;
    let last = performance.now();
    const tick = (t) => {
      const dt = (t - last) / 1000; last = t;
      setSweep(s => (s + dt * 55) % 360); // 360deg per ~6.5s
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const posOf = (dist, angleDeg) => {
    const r = (Math.min(dist, maxRange) / maxRange) * 168;
    const a = (angleDeg - 90) * Math.PI / 180;
    return { x: center + Math.cos(a) * r, y: center + Math.sin(a) * r };
  };

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      {/* concentric rings */}
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,106,26,0.10)" />
            <stop offset="60%" stopColor="rgba(255,106,26,0.03)" />
            <stop offset="100%" stopColor="rgba(255,106,26,0)" />
          </radialGradient>
          <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,106,26,0)" />
            <stop offset="100%" stopColor="rgba(255,106,26,0.55)" />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r="168" fill="url(#radarFill)" />
        {ringRadii.map((r, i) => (
          <circle key={i} cx={center} cy={center} r={r} fill="none"
            stroke={i === 2 ? 'rgba(255,106,26,0.35)' : 'rgba(255,255,255,0.08)'}
            strokeWidth={i === 2 ? 1 : 1}
            strokeDasharray={i === 2 ? '0' : '2 4'} />
        ))}
        {/* crosshairs */}
        <line x1={center} y1={center - 168} x2={center} y2={center + 168} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" />
        <line x1={center - 168} y1={center} x2={center + 168} y2={center} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" />
        {/* sweep arc */}
        <g transform={`rotate(${sweep} ${center} ${center})`}>
          <path d={`M ${center} ${center} L ${center + 168} ${center} A 168 168 0 0 0 ${center + 168 * Math.cos(-0.7)} ${center + 168 * Math.sin(-0.7)} Z`}
            fill="url(#sweepGrad)" opacity="0.65" />
        </g>
        {/* labels */}
        {ringRadii.map((r, i) => (
          <text key={i} x={center + 4} y={center - r - 4}
            fill="rgba(255,255,255,0.35)"
            fontFamily="JetBrains Mono, monospace" fontSize="9"
            letterSpacing="0.08em">
            {labels[i]}m
          </text>
        ))}
      </svg>

      {/* driver dots */}
      {drivers.map(d => {
        const p = posOf(d.dist, d.angle);
        return (
          <DriverDot key={d.id} d={d} x={p.x} y={p.y}
            isFocus={focusId === d.id}
            onTap={() => onTapDriver(d)} />
        );
      })}

      {/* center "you" pulse */}
      <CenterPulse talking={talking} incoming={!!incomingFrom} />
    </div>
  );
}

function CenterPulse({ talking, incoming }) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      transform: 'translate(-50%,-50%)',
      width: 28, height: 28,
    }}>
      {(talking || incoming) && (
        <>
          <span style={{
            position: 'absolute', inset: -20, borderRadius: '50%',
            border: '1px solid ' + (talking ? 'rgba(255,106,26,0.55)' : 'rgba(91,228,155,0.55)'),
            animation: 'rpPulse 1.4s ease-out infinite',
          }} />
          <span style={{
            position: 'absolute', inset: -40, borderRadius: '50%',
            border: '1px solid ' + (talking ? 'rgba(255,106,26,0.30)' : 'rgba(91,228,155,0.30)'),
            animation: 'rpPulse 1.4s 0.3s ease-out infinite',
          }} />
        </>
      )}
      <div style={{
        position: 'absolute', inset: 4, borderRadius: '50%',
        background: talking ? '#FF6A1A' : (incoming ? '#5BE49B' : '#fff'),
        boxShadow: `0 0 16px ${talking ? 'rgba(255,106,26,0.9)' : (incoming ? 'rgba(91,228,155,0.9)' : 'rgba(255,255,255,0.4)')}`,
      }} />
      <div style={{
        position: 'absolute', inset: 10, borderRadius: '50%',
        background: '#000',
      }} />
    </div>
  );
}

function DriverDot({ d, x, y, isFocus, onTap }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onTap}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        position: 'absolute', left: x, top: y,
        transform: 'translate(-50%,-50%)',
        cursor: 'pointer',
        width: 56, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {d.talking && (
        <>
          <span style={{
            position: 'absolute', inset: 6, borderRadius: '50%',
            border: '1.5px solid rgba(255,106,26,0.7)',
            animation: 'rpPulse 1.2s ease-out infinite',
          }} />
          <span style={{
            position: 'absolute', inset: -2, borderRadius: '50%',
            border: '1px solid rgba(255,106,26,0.35)',
            animation: 'rpPulse 1.2s 0.4s ease-out infinite',
          }} />
        </>
      )}
      <div style={{
        width: d.active ? 14 : 10, height: d.active ? 14 : 10,
        borderRadius: '50%',
        background: d.active ? d.color : 'rgba(255,255,255,0.18)',
        border: d.talking ? '2px solid #FF6A1A' : (isFocus ? '2px solid #fff' : '1px solid rgba(255,255,255,0.5)'),
        boxShadow: d.talking ? '0 0 14px rgba(255,106,26,0.9)' : (d.active ? '0 0 8px rgba(255,255,255,0.2)' : 'none'),
        transition: 'all 0.2s ease',
      }} />
      {(hover || isFocus || d.talking) && (
        <div style={{
          position: 'absolute', top: '100%', marginTop: 6, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid var(--line-2)',
          borderRadius: 6, padding: '3px 7px',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5,
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
          color: d.talking ? '#FF6A1A' : '#fff',
        }}>
          @{d.handle}<span style={{ color: 'var(--text-mute)' }}> · {d.dist}m</span>
        </div>
      )}
    </div>
  );
}

// ─── Hold-to-talk button ──────────────────────────────────────
function HoldToTalk({ state, onPressStart, onPressEnd }) {
  // state: 'idle' | 'recording' | 'sending' | 'incoming'
  const isRec = state === 'recording';
  const isSend = state === 'sending';
  const isIn = state === 'incoming';
  const label =
    isRec ? 'ON AIR' :
    isSend ? 'MIC CLOSED' :
    isIn ? 'LIVE VOICE' :
    'HOLD TO TALK';
  const ringColor = isRec ? '#FF3D2E' : isIn ? '#5BE49B' : '#FF6A1A';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      {/* waveform / status row */}
      <div style={{
        height: 26, display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5,
        letterSpacing: '0.18em', color: ringColor,
      }}>
        {isRec && <Waveform color="#FF3D2E" />}
        {isSend && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6A1A" strokeWidth="1.8">
            <rect x="9" y="3" width="6" height="11" rx="3"/>
            <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round"/>
            <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round"/>
          </svg>
        )}
        {isIn && <Waveform color="#5BE49B" />}
        <span>{label}</span>
      </div>

      <button
        onPointerDown={(e) => { e.preventDefault(); onPressStart && onPressStart(); }}
        onPointerUp={() => onPressEnd && onPressEnd()}
        onPointerCancel={() => onPressEnd && onPressEnd()}
        onPointerLeave={() => isRec && onPressEnd && onPressEnd()}
        style={{
          position: 'relative',
          width: 132, height: 132, borderRadius: '50%',
          border: 'none', cursor: 'pointer',
          background: isRec
            ? 'radial-gradient(circle at 50% 35%, #FF8A3D 0%, #FF3D2E 65%, #B71F15 100%)'
            : 'radial-gradient(circle at 50% 35%, #FFA764 0%, #FF6A1A 60%, #B73D00 100%)',
          boxShadow: isRec
            ? '0 0 0 6px rgba(255,61,46,0.18), 0 0 60px rgba(255,61,46,0.8), inset 0 -8px 16px rgba(0,0,0,0.35), inset 0 8px 16px rgba(255,255,255,0.18)'
            : '0 0 0 6px rgba(255,106,26,0.14), 0 0 40px rgba(255,106,26,0.55), inset 0 -8px 16px rgba(0,0,0,0.35), inset 0 8px 16px rgba(255,255,255,0.22)',
          transform: isRec ? 'scale(0.96)' : 'scale(1)',
          transition: 'transform 0.12s ease, box-shadow 0.2s ease, background 0.2s ease',
        }}>
        {/* pulse rings while recording */}
        {isRec && (
          <>
            <span style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1.5px solid rgba(255,61,46,0.45)', animation: 'rpPulse 1.1s ease-out infinite' }} />
            <span style={{ position: 'absolute', inset: -28, borderRadius: '50%', border: '1px solid rgba(255,61,46,0.25)', animation: 'rpPulse 1.1s 0.35s ease-out infinite' }} />
          </>
        )}
        {/* mic glyph */}
        <svg width="36" height="36" viewBox="0 0 24 24" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
          <rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  );
}

function Waveform({ color = '#FF6A1A' }) {
  // 7 vertical bars animating
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
      {[0,1,2,3,4,5,6].map(i => (
        <span key={i} style={{
          width: 2.5, borderRadius: 2, background: color,
          height: '100%',
          animation: `rpBar 0.${5+i%3}s ${i*0.07}s ease-in-out infinite alternate`,
        }} />
      ))}
    </div>
  );
}

// ─── Nearby (map-first) SCREEN ────────────────────────────────
function RadarScreen({ go, openDriver, talkState, setTalkState, incomingFrom, drivers, incomingDriver, onStop }) {
  const activeCount = drivers.filter(d => d.active).length;
  // one driver is selected by default so the map shows an inline preview card
  const [selectedId, setSelectedId] = React.useState('d1');

  return (
    <div className="rp-screen" style={{ background: '#000', position: 'absolute', inset: 0, display: 'block' }}>
      {/* FULL-BLEED MAP */}
      <MapView
        drivers={drivers}
        onTapDriver={openDriver}
        onSelectDriver={(d) => setSelectedId(d.id)}
        selectedId={selectedId}
        talking={talkState === 'recording'}
        focusId={incomingFrom}
      />

      {/* Top gradient (status legibility) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 170,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0) 100%)',
        pointerEvents: 'none', zIndex: 5,
      }} />

      {/* Top row: LIVE / RANGE / settings */}
      <div style={{
        position: 'absolute', top: 60, left: 18, right: 18, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <FloatingPill onClick={onStop}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#FF6A1A',
            boxShadow: '0 0 10px var(--accent-glow)',
            animation: 'rpBlink 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: '#FF6A1A' }}>LIVE</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.45)', marginLeft: 4, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.12)' }}>STOP</span>
        </FloatingPill>

        <FloatingPill>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.85)' }}>500m</span>
        </FloatingPill>

        <FloatingPill onClick={() => go('settings')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </FloatingPill>
      </div>

      {/* Secondary row: nearby count + rooms */}
      <div style={{
        position: 'absolute', top: 110, left: 18, right: 18, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <FloatingPill>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, color: '#fff' }}>{activeCount}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)' }}>NEARBY</span>
        </FloatingPill>

        <FloatingPill onClick={() => go('rooms')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: '#fff' }}>ROOMS</span>
        </FloatingPill>
      </div>

      {/* District label, bottom-left of map (above button) — gives context */}
      <div style={{
        position: 'absolute', bottom: 240, left: 22, zIndex: 6,
        fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.22em',
        color: 'rgba(255,255,255,0.5)',
      }}>
        MISSION DISTRICT · SF
      </div>

      {/* Bottom gradient + button area */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 45%, rgba(0,0,0,0.92) 100%)',
        pointerEvents: 'none', zIndex: 5,
      }} />

      {/* Incoming ping banner (just above the button) */}
      {incomingDriver && (
        <div style={{
          position: 'absolute', bottom: 226, left: 18, right: 18, zIndex: 12,
          animation: 'rpRise 0.32s cubic-bezier(0.2,0.8,0.2,1)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 14,
            background: 'rgba(91,228,155,0.10)',
            border: '1px solid rgba(91,228,155,0.55)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 0 28px rgba(91,228,155,0.28)',
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: incomingDriver.color, border: '1px solid rgba(255,255,255,0.2)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--safe)' }}>LIVE VOICE</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 13, fontWeight: 600 }}>@{incomingDriver.handle} <span style={{ fontFamily: 'var(--mono)', fontWeight: 400, color: 'var(--text-dim)' }}>· {incomingDriver.dist}m</span></div>
              <div style={{ marginTop: 1, fontSize: 11, color: 'var(--text-dim)' }}>{incomingDriver.car}</div>
            </div>
            <Waveform color="#5BE49B" />
          </div>
        </div>
      )}

      {/* Hold-to-talk in the thumb zone */}
      <div style={{
        position: 'absolute', bottom: 56, left: 0, right: 0, zIndex: 11,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <HoldToTalk
          state={talkState}
          onPressStart={() => setTalkState('recording')}
          onPressEnd={() => {
            setTalkState('sending');
            setTimeout(() => setTalkState('idle'), 900);
          }}
        />
      </div>
    </div>
  );
}

// Floating glass pill used by the map overlay chrome.
function FloatingPill({ children, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 32, padding: '0 12px', borderRadius: 999,
        background: 'rgba(14,14,16,0.78)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        color: '#fff', cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
      {children}
    </Tag>
  );
}

const iconBtn = {
  width: 36, height: 36, borderRadius: 12,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--line)',
  color: '#fff', cursor: 'pointer',
};

Object.assign(window, { RadarScreen, RadarView, HoldToTalk, NEARBY_DRIVERS, ROOMS_HINT, iconBtn });

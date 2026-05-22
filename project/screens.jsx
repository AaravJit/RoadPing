// screens.jsx — Launch, Start, DriverCard, RoomsList, Room, Safety, Settings

// ─── Keyframes / global styles for the app ───────────────────
function GlobalStyles() {
  return (
    <style>{`
      @keyframes rpPulse {
        0%   { transform: scale(0.6); opacity: 0.9; }
        100% { transform: scale(2.0); opacity: 0;   }
      }
      @keyframes rpBlink {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.35; }
      }
      @keyframes rpBar {
        0%   { transform: scaleY(0.25); }
        100% { transform: scaleY(1);    }
      }
      @keyframes rpSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes rpSweepIn {
        0%   { transform: rotate(-180deg); opacity: 0; }
        100% { transform: rotate(0deg);    opacity: 1; }
      }
      @keyframes rpRise {
        0%   { transform: translateY(20px); opacity: 0; }
        100% { transform: translateY(0);     opacity: 1; }
      }
      @keyframes rpSheetIn {
        0%   { transform: translateY(100%); }
        100% { transform: translateY(0);    }
      }
      @keyframes rpFadeIn {
        0%   { opacity: 0; }
        100% { opacity: 1; }
      }
    `}</style>
  );
}

// ─── Reusable: car silhouette (placeholder) ──────────────────
function CarGlyph({ color = '#FF6A1A', size = 120 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 200 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={'cg-' + color.replace('#','')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.9"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.5"/>
        </linearGradient>
      </defs>
      {/* very abstract sport car silhouette */}
      <path d="M12 78 Q 18 60 38 56 L 70 38 Q 90 30 120 32 L 158 36 Q 178 42 188 60 L 192 76 Q 192 86 184 88 L 168 88 A 14 14 0 0 0 140 88 L 78 88 A 14 14 0 0 0 50 88 L 22 88 Q 12 86 12 78 Z"
        fill={'url(#cg-' + color.replace('#','') + ')'}
        stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
      <circle cx="64" cy="88" r="10" fill="#0a0a0a" stroke={color} strokeWidth="1.5"/>
      <circle cx="154" cy="88" r="10" fill="#0a0a0a" stroke={color} strokeWidth="1.5"/>
      <path d="M78 56 L 110 40 L 138 42 L 152 56 Z" fill="rgba(0,0,0,0.45)"/>
    </svg>
  );
}

// ─── 1. Launch screen ────────────────────────────────────────
function LaunchScreen({ go }) {
  const [r, setR] = React.useState(0);
  React.useEffect(() => {
    let raf, last = performance.now();
    const tick = (t) => { const dt = (t - last)/1000; last = t; setR(x => (x + dt*90) % 360); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="rp-screen" style={{ background: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'rpFadeIn 0.6s ease' }}>
        {/* concentric rings */}
        {[60, 95, 130].map((rr, i) => (
          <div key={i} style={{
            position: 'absolute', width: rr*2, height: rr*2, borderRadius: '50%',
            border: '1px solid rgba(255,106,26,' + (0.35 - i*0.08) + ')',
          }} />
        ))}
        {/* sweep */}
        <svg width="220" height="220" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="launchSweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,106,26,0)"/>
              <stop offset="100%" stopColor="rgba(255,106,26,0.6)"/>
            </linearGradient>
          </defs>
          <g transform={`rotate(${r} 110 110)`}>
            <path d={`M 110 110 L 240 110 A 130 130 0 0 0 ${110 + 130*Math.cos(-0.7)} ${110 + 130*Math.sin(-0.7)} Z`} fill="url(#launchSweep)"/>
          </g>
        </svg>
        {/* center wordmark dot */}
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: '#FF6A1A',
          boxShadow: '0 0 24px var(--accent-glow)',
        }} />
      </div>
      <div style={{ position: 'absolute', bottom: 100, textAlign: 'center', animation: 'rpRise 0.7s 0.2s both' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>RoadPing</div>
        <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.18em', color: 'var(--text-mute)' }}>
          LIVE NEARBY VOICE FOR DRIVERS
        </div>
      </div>
      <button onClick={() => go('auth')} style={{
        position: 'absolute', bottom: 50, fontFamily: 'var(--mono)', fontSize: 11,
        letterSpacing: '0.2em', color: 'var(--text-dim)', background: 'transparent',
        border: 'none', cursor: 'pointer', padding: 12,
      }}>TAP TO BEGIN</button>
    </div>
  );
}

// ─── 2. Start RoadPing — Hidden state ─────────────────────────
function StartScreen({ go, handle, car, zoneStatus = 'safe' }) {
  // zoneStatus: 'safe' | 'tooClose'
  const blocked = zoneStatus === 'tooClose';

  return (
    <div className="rp-screen" style={{ background: '#000', padding: '60px 22px 36px' }}>
      <div style={{ paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="wordmark" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: blocked ? '#FF3D2E' : 'rgba(255,255,255,0.35)' }} />
          <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>RoadPing</span>
        </div>
        <button onClick={() => go('settings')} style={iconBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderRadius: 999,
          background: blocked ? 'rgba(255,61,46,0.10)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${blocked ? 'rgba(255,61,46,0.5)' : 'var(--line)'}` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: blocked ? '#FF3D2E' : 'rgba(255,255,255,0.55)',
            boxShadow: blocked ? '0 0 10px rgba(255,61,46,0.6)' : 'none' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em',
            color: blocked ? '#FF3D2E' : 'var(--text-dim)' }}>
            {blocked ? 'BLOCKED' : 'HIDDEN'}
          </span>
        </div>
        <div style={{ marginTop: 14, fontSize: blocked ? 26 : 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {blocked ? 'Too close to Private Zone' : 'Hidden right now'}
        </div>
        <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.45 }}>
          {blocked
            ? 'Move farther away before going live. RoadPing blocks Start near places you protected so you don\u2019t accidentally reveal a private location.'
            : 'Press Start to appear on the nearby map. Your live location will be visible to active RoadPing users within range.'}
        </div>
      </div>

      {/* status row: range + private zone */}
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface-1)', border: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--text-mute)' }}>RANGE</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 600 }}>500m</div>
        </div>
        <div style={{ padding: 14, borderRadius: 14,
          background: blocked ? 'rgba(255,61,46,0.08)' : 'var(--surface-1)',
          border: `1px solid ${blocked ? 'rgba(255,61,46,0.5)' : 'var(--line)'}` }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em',
            color: blocked ? '#FF3D2E' : 'var(--text-mute)' }}>PRIVATE ZONE</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600,
            color: blocked ? '#FF3D2E' : 'var(--safe)' }}>
            {blocked ? 'Too close' : 'Safe to Start'}
          </div>
        </div>
      </div>

      {/* center: large CTA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <button
          disabled={blocked}
          onClick={() => !blocked && go('radar')}
          style={{
            position: 'relative',
            width: 180, height: 180, borderRadius: '50%', border: 'none',
            cursor: blocked ? 'not-allowed' : 'pointer',
            background: blocked
              ? 'radial-gradient(circle at 50% 30%, #2a2a2c 0%, #161618 100%)'
              : 'radial-gradient(circle at 50% 30%, #FFA764 0%, #FF6A1A 60%, #B73D00 100%)',
            boxShadow: blocked
              ? '0 0 0 6px rgba(255,255,255,0.04), inset 0 -10px 18px rgba(0,0,0,0.4)'
              : '0 0 0 6px rgba(255,106,26,0.12), 0 0 60px rgba(255,106,26,0.55), inset 0 -10px 18px rgba(0,0,0,0.35), inset 0 10px 18px rgba(255,255,255,0.22)',
            color: blocked ? 'rgba(255,255,255,0.4)' : '#fff',
            fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em',
          }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {blocked ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
            )}
            <span>Start</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', fontWeight: 500, opacity: 0.85 }}>ROADPING</span>
          </div>
        </button>
        <div style={{ textAlign: 'center', maxWidth: 300, fontSize: 12,
          color: blocked ? 'rgba(255,61,46,0.85)' : 'var(--text-mute)', lineHeight: 1.45 }}>
          {blocked
            ? 'Move farther away from your Private Zone before going live.'
            : 'Avoid starting near home, work, school, or private property.'}
        </div>
        {blocked && (
          <button onClick={() => go('zones')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 14px', borderRadius: 999,
            background: 'rgba(255,106,26,0.10)',
            border: '1px solid rgba(255,106,26,0.5)',
            color: '#FF6A1A', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6A1A" strokeWidth="2"><path d="M3 10l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            MANAGE PRIVATE ZONES
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.16em' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/></svg>
          VOICE IS LIVE ONLY · NOT RECORDED
      </div>
    </div>
  );
}

// ─── 5. Driver / car profile card (sheet) ─────────────────────
function DriverCard({ driver, onClose, onFollow, onMute, onJoinRoom }) {
  if (!driver) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      animation: 'rpFadeIn 0.18s ease',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, #0c0c0c 0%, #050505 100%)',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        border: '1px solid var(--line)',
        borderBottom: 'none',
        padding: '14px 22px 36px',
        animation: 'rpSheetIn 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 18px' }} />

        {/* car visual */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <VehicleGlyph body={driver.body || 'sedan'} color={driver.color} size={200} />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--text-mute)' }}>
              {(driver.body || 'sedan').replace('sportsCar','SPORTS CAR').replace('crossover','CROSSOVER · EV').toUpperCase()}
            </div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>@{driver.handle}</div>
            <div style={{ marginTop: 2, color: 'var(--text-dim)', fontSize: 14 }}>
              {driver.year} {driver.make} {driver.model}
            </div>
            <div style={{ marginTop: 2, color: 'var(--text-mute)', fontSize: 12 }}>
              {driver.colorName}{driver.nick ? ` · "${driver.nick}"` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: '#FF6A1A', letterSpacing: '-0.01em' }}>{driver.dist}m</div>
            <div style={{ marginTop: 2, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-mute)', letterSpacing: '0.14em' }}>
              {driver.active ? 'ON · AIR' : 'IDLE'}
            </div>
          </div>
        </div>

        {/* meta row */}
        <div style={{
          marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        }}>
          {[
            ['BEARING', 'NW · 305°'],
            ['HEADING', 'SAME'],
            ['SHARED', '2 ROOMS'],
          ].map(([k, v]) => (
            <div key={k} style={{
              background: 'var(--surface-2)', border: '1px solid var(--line)',
              borderRadius: 12, padding: '10px 12px',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-mute)', letterSpacing: '0.14em' }}>{k}</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* actions */}
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onFollow} style={ghostBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Pin on radar
          </button>
          <button onClick={onJoinRoom} style={primaryBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2"><path d="M3 11a9 9 0 0 1 18 0M8 11a4 4 0 0 1 8 0M12 11v9"/></svg>
            Talk live
          </button>
        </div>
        <button onClick={onMute} style={{ ...ghostBtn, marginTop: 10, color: 'var(--text-dim)' }}>
          Mute @{driver.handle}
        </button>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 18 }}>
          <button onClick={onMute} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--text-mute)', padding: 6,
          }}>BLOCK</button>
          <span style={{ color: 'var(--text-mute)', alignSelf: 'center' }}>·</span>
          <button onClick={onMute} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--text-mute)', padding: 6,
          }}>REPORT</button>
        </div>
      </div>
    </div>
  );
}

// ─── 6. Rooms list + Room ────────────────────────────────────
function RoomsScreen({ go, openRoom }) {
  const rooms = [
    { id: 'r1', name: 'Canyon Run · Sat', desc: 'Pacifica → HWY 1',     count: 4,  active: 2, color: '#FF6A1A' },
    { id: 'r2', name: 'Cars & Coffee SF',  desc: 'Crissy Field meet',    count: 12, active: 7, color: '#5BE49B' },
    { id: 'r3', name: 'JDM Nights',        desc: 'Private · invite only',count: 6,  active: 1, color: '#1E4FB8' },
    { id: 'r4', name: 'Track Day · Sears', desc: 'Sears Point · 5/24',   count: 9,  active: 0, color: '#E8DCC7' },
  ];
  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      <TopBar onBack={() => go('radar')} title="Drive Rooms" />
      <div style={{ padding: '6px 22px 16px' }}>
        <button onClick={() => openRoom(rooms[0])} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px', borderRadius: 14, cursor: 'pointer',
          background: 'rgba(255,106,26,0.08)', border: '1px dashed rgba(255,106,26,0.5)',
          color: '#FF6A1A', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.16em',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6A1A" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          CREATE PRIVATE ROOM
        </button>
      </div>
      <div style={{ flex: 1, padding: '0 22px 90px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rooms.map(r => (
          <button key={r.id} onClick={() => openRoom(r)} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: 16, borderRadius: 16, cursor: 'pointer', textAlign: 'left',
            background: 'var(--surface-1)', border: '1px solid var(--line)',
            color: '#fff',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-dim)' }}>{r.desc}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: r.active > 0 ? '#FF6A1A' : 'var(--text-mute)' }}>
                {r.active}/{r.count}
              </div>
              <div style={{ marginTop: 2, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-mute)', letterSpacing: '0.12em' }}>
                {r.active > 0 ? 'ON AIR' : 'QUIET'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function RoomScreen({ go, room, talkState, setTalkState }) {
  const members = [
    { handle: 'apex_92',       car: '2022 Porsche 911 GT3', body: 'sportsCar', color: '#E8DCC7', talking: false, you: false },
    { handle: 'you',           car: '2024 Toyota GR Corolla', body: 'hatchback', color: '#FF6A1A', talking: talkState === 'recording', you: true  },
    { handle: 'drift_king',    car: '1999 Nissan 240SX',   body: 'coupe',     color: '#1E4FB8', talking: false, you: false },
    { handle: 'canyon_carver', car: '2002 Acura NSX',      body: 'supercar',  color: '#F2C200', talking: true,  you: false },
  ];

  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      <TopBar onBack={() => go('rooms')} title={room?.name || 'Canyon Run · Sat'} subtitle={room?.desc || 'Pacifica → HWY 1'} />

      <div style={{ padding: '4px 22px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF6A1A', boxShadow: '0 0 10px var(--accent-glow)', animation: 'rpBlink 1.4s ease-in-out infinite' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.16em', color: '#FF6A1A' }}>ROOM LIVE</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--text-mute)' }}>4 IN CONVOY</span>
      </div>

      {/* convoy member tiles */}
      <div style={{ padding: '18px 22px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {members.map(m => (
          <div key={m.handle} style={{
            position: 'relative',
            padding: 14, borderRadius: 16,
            background: m.talking ? 'rgba(255,106,26,0.10)' : 'var(--surface-1)',
            border: m.talking ? '1px solid rgba(255,106,26,0.6)' : '1px solid var(--line)',
            transition: 'all 0.25s ease',
          }}>
            {m.talking && (
              <span style={{
                position: 'absolute', top: 10, right: 10,
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.14em',
                color: '#FF6A1A',
              }}>•••</span>
            )}
            <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 6 }}>
              <VehicleGlyph body={m.body} color={m.color} size={90}/>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {m.you ? 'You' : '@' + m.handle}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-dim)' }}>{m.car}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ paddingBottom: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <HoldToTalk
          state={talkState}
          onPressStart={() => setTalkState('recording')}
          onPressEnd={() => { setTalkState('sending'); setTimeout(() => setTalkState('idle'), 900); }}
        />
        <button onClick={() => go('rooms')} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.18em',
          color: 'var(--text-mute)', padding: 6,
        }}>LEAVE ROOM</button>
      </div>
    </div>
  );
}

// ─── 7. Safety / stopped-mode overlay ────────────────────────
function SafetyOverlay({ onDismiss }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, animation: 'rpFadeIn 0.2s ease' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 35%, rgba(255,106,26,0.15), rgba(0,0,0,0.85) 60%)',
        backdropFilter: 'blur(10px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, padding: '110px 28px 50px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        <div style={{
          width: 84, height: 84, borderRadius: '50%',
          background: 'rgba(255,106,26,0.12)', border: '1.5px solid rgba(255,106,26,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
          boxShadow: '0 0 40px rgba(255,106,26,0.4)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF6A1A" strokeWidth="1.7">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.22em', color: '#FF6A1A' }}>DRIVING DETECTED · 48 MPH</div>
        <div style={{ marginTop: 14, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Eyes on the road.
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: 'var(--text-dim)', maxWidth: 280, lineHeight: 1.45 }}>
          Voice-only mode is on. The radar and dots are hidden until you stop. Talk by holding the wheel button or the big orange one.
        </div>

        <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
          <div style={{
            width: 92, height: 92, borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 30%, #FFA764 0%, #FF6A1A 60%, #B73D00 100%)',
            boxShadow: '0 0 40px rgba(255,106,26,0.6), inset 0 -8px 16px rgba(0,0,0,0.35), inset 0 8px 16px rgba(255,255,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="#fff"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none"/></svg>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.18em', color: 'var(--text-mute)' }}>HOLD ANYWHERE TO TALK</div>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={onDismiss} style={{
          ...ghostBtn, width: '100%', justifyContent: 'center',
        }}>I'm stopped · show radar</button>
      </div>
    </div>
  );
}

// ─── 8. Settings ─────────────────────────────────────────────
function SettingsScreen({ go, handle, car, vehicle, range, setRange, dnd, setDnd, ptt, setPtt, onShowSafety }) {
  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      <TopBar onBack={() => go('radar')} title="Settings" />
      <div style={{ flex: 1, overflow: 'auto', padding: '0 22px 90px' }}>

        {/* identity card */}
        <div style={{
          padding: 18, borderRadius: 18,
          background: 'linear-gradient(180deg, #131313 0%, #0a0a0a 100%)',
          border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <VehicleGlyph body={vehicle?.body || 'hatchback'} color={vehicle?.color || '#FF6A1A'} size={110} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>@{handle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{car}</div>
            <button style={{
              marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
              padding: '6px 10px', borderRadius: 8, color: '#FF6A1A',
              background: 'rgba(255,106,26,0.10)', border: '1px solid rgba(255,106,26,0.4)', cursor: 'pointer',
            }}>EDIT VEHICLE</button>
          </div>
        </div>

        <SettingsGroup title="Signal">
          <SettingsRow label="Visible to nearby drivers" right={<Toggle on={true} />} />
          <RangeRow value={range} onChange={setRange} />
          <SettingsRow label="Do not disturb (mute incoming)" right={<Toggle on={dnd} onClick={() => setDnd(!dnd)} />} />
        </SettingsGroup>

        <SettingsGroup title="Push to talk">
          <SettingsRow label="Steering-wheel button" right={<Toggle on={ptt} onClick={() => setPtt(!ptt)} />} />
          <SettingsRow label="Voice-activated (BETA)" right={<Toggle on={false} />} />
        </SettingsGroup>

        <SettingsGroup title="Safety">
          <SettingsRow label="Driving mode (auto-detect)" right={<Toggle on={true} />} />
          <SettingsRow label="Hide dots above 25 mph" right={<Toggle on={true} />} />
          <button onClick={onShowSafety} style={{
            ...ghostBtn, width: '100%', marginTop: 8, justifyContent: 'center',
            color: '#FF6A1A', borderColor: 'rgba(255,106,26,0.4)',
          }}>Preview driving overlay</button>
        </SettingsGroup>

        <SettingsGroup title="Privacy">
          <div style={{ padding: '14px', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>Voice is live only and not saved.</span>
            <br/>RoadPing does not record, replay, or store conversations. Your live location is only shared while RoadPing is started.
          </div>
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingsRow label="Blocked drivers" right={<Chev />} />
          <SettingsRow label="Privacy policy" right={<Chev />} />
          <SettingsRow label="Help & rules of the road" right={<Chev />} />
        </SettingsGroup>

        <div style={{ padding: '14px 4px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: 'var(--text-mute)' }}>
          ROADPING v0.1.0 · BUILD 2026.05
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-mute)', padding: '0 4px 8px' }}>
        {title.toUpperCase()}
      </div>
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--line)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}
function SettingsRow({ label, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 14px', borderBottom: '1px solid var(--line)',
      fontSize: 14,
    }}>
      <span>{label}</span>
      {right}
    </div>
  );
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 40, height: 24, borderRadius: 12,
      background: on ? '#FF6A1A' : 'rgba(255,255,255,0.12)',
      boxShadow: on ? '0 0 12px rgba(255,106,26,0.5)' : 'none',
      border: 'none', cursor: 'pointer', position: 'relative',
      transition: 'all 0.2s ease',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.18s ease',
      }} />
    </button>
  );
}
function Chev() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>;
}

function RangeRow({ value, onChange }) {
  const ranges = [250, 500, 1000, 2000];
  return (
    <div style={{ padding: '14px 14px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>Broadcast range</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#FF6A1A' }}>{value}m</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {ranges.map(r => (
          <button key={r} onClick={() => onChange(r)} style={{
            padding: '8px 0', borderRadius: 8,
            background: value === r ? 'rgba(255,106,26,0.15)' : 'rgba(255,255,255,0.04)',
            border: value === r ? '1px solid rgba(255,106,26,0.6)' : '1px solid var(--line)',
            color: value === r ? '#FF6A1A' : 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.05em', cursor: 'pointer',
          }}>{r}m</button>
        ))}
      </div>
    </div>
  );
}

// ─── Top bar (back button) ───────────────────────────────────
function TopBar({ onBack, title, subtitle }) {
  return (
    <div style={{
      padding: '62px 22px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{ ...iconBtn, width: 36, height: 36 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{subtitle}</div>}
      </div>
    </div>
  );
}

// ─── Shared buttons ──────────────────────────────────────────
const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-2)',
  color: '#fff', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500,
};
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
  background: 'linear-gradient(180deg, #FFA764, #FF6A1A)',
  border: 'none', color: '#0a0a0a',
  fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600,
  boxShadow: '0 0 22px rgba(255,106,26,0.4)',
};

// ─── Incoming ping toast (shown on radar) ────────────────────
function IncomingToast({ from, onClose }) {
  React.useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!from) return null;
  return (
    <div style={{
      position: 'absolute', top: 100, left: 16, right: 16, zIndex: 40,
      animation: 'rpRise 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 16,
        background: 'rgba(91,228,155,0.10)',
        border: '1px solid rgba(91,228,155,0.55)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 0 30px rgba(91,228,155,0.3)',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: from.color, border: '1px solid rgba(255,255,255,0.2)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--safe)' }}>LIVE VOICE</div>
          <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}>@{from.handle} <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 400 }}>· {from.dist}m</span></div>
        </div>
        <Waveform color="#5BE49B" />
      </div>
    </div>
  );
}

Object.assign(window, {
  GlobalStyles, LaunchScreen, StartScreen,
  DriverCard, RoomsScreen, RoomScreen,
  SafetyOverlay, SettingsScreen, IncomingToast,
  ghostBtn, primaryBtn, TopBar, CarGlyph,
});

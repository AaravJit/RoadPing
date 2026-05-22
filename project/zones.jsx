// zones.jsx — Add Custom Private Zone flow (frontend only).
// Mini-map + draggable center pin + radius chips + name field.

function CustomZoneScreen({ go, back }) {
  const [name, setName] = React.useState('');
  const [radius, setRadius] = React.useState(500); // 300 | 500 | 700
  const [pin, setPin] = React.useState({ x: 50, y: 50 }); // percent within map area
  const mapRef = React.useRef(null);
  const dragRef = React.useRef(false);

  const radiusPx = {
    300: 56,
    500: 86,
    700: 116,
  }[radius];

  const startDrag = (e) => {
    dragRef.current = true;
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    move(e);
  };
  const move = (e) => {
    if (!dragRef.current) return;
    const r = mapRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    setPin({ x, y });
  };
  const endDrag = (e) => {
    dragRef.current = false;
    e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId);
  };

  const onSave = () => {
    // frontend-only — bounce back to zones list
    go('zones');
  };

  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      {/* Top bar */}
      <div style={{ padding: '62px 22px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={back} style={{ ...iconBtn, width: 36, height: 36 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-mute)' }}>
          ADD CUSTOM ZONE
        </div>
        <button onClick={onSave} style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.18em',
          color: name ? '#FF6A1A' : 'var(--text-mute)',
          background: 'transparent', border: 'none', cursor: name ? 'pointer' : 'not-allowed',
          padding: 6,
        }} disabled={!name}>SAVE</button>
      </div>

      {/* Mini-map */}
      <div style={{ padding: '6px 16px 0' }}>
        <div
          ref={mapRef}
          onPointerDown={startDrag}
          onPointerMove={move}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'relative',
            width: '100%', aspectRatio: '1 / 1',
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid var(--line-2)',
            background: '#06070a',
            touchAction: 'none',
            cursor: 'grab',
          }}>
          <MiniMapSVG />

          {/* radius ring + pin */}
          <div style={{
            position: 'absolute',
            left: `${pin.x}%`, top: `${pin.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}>
            {/* radius fill */}
            <div style={{
              width: radiusPx * 2, height: radiusPx * 2, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,106,26,0.22) 0%, rgba(255,106,26,0.06) 70%, rgba(255,106,26,0) 100%)',
              border: '1.5px dashed rgba(255,106,26,0.7)',
              position: 'absolute',
              left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              transition: 'width 0.25s ease, height 0.25s ease',
            }} />
            {/* radius label */}
            <div style={{
              position: 'absolute', left: '50%', top: `calc(50% - ${radiusPx + 14}px)`,
              transform: 'translateX(-50%)',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
              color: '#FF6A1A',
              background: 'rgba(0,0,0,0.7)', padding: '3px 7px', borderRadius: 4,
              whiteSpace: 'nowrap',
            }}>{radius}m</div>
            {/* draggable pin */}
            <div style={{
              position: 'relative',
              width: 28, height: 28, borderRadius: '50%',
              background: '#FF6A1A',
              boxShadow: '0 0 0 4px rgba(0,0,0,0.6), 0 0 18px rgba(255,106,26,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#fff',
              }} />
            </div>
          </div>

          {/* drag hint, fades away if pin has moved */}
          <div style={{
            position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center',
            fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
          }}>DRAG TO POSITION</div>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 22px 16px' }}>
        {/* radius */}
        <FieldLabel>Radius</FieldLabel>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[300, 500, 700].map(r => (
            <button key={r} onClick={() => setRadius(r)} style={{
              padding: '12px 0', borderRadius: 12,
              background: radius === r ? 'rgba(255,106,26,0.10)' : 'var(--surface-1)',
              border: radius === r ? '1px solid rgba(255,106,26,0.6)' : '1px solid var(--line)',
              color: radius === r ? '#FF6A1A' : '#fff',
              fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.06em', cursor: 'pointer',
            }}>{r}m</button>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <Field label="Zone name">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Mom's house · Studio · Storage"
              style={fieldInput}/>
          </Field>
        </div>

        <div style={{
          marginTop: 14, padding: 14, borderRadius: 12,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)',
          fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5,
        }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>RoadPing will block Start when you are too close to this zone.</span>
          <br/>Private Zones are never shown to other users.
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 22px 44px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onSave} disabled={!name} style={{
          width: '100%', padding: '15px 16px', borderRadius: 14, border: 'none',
          background: name ? 'linear-gradient(180deg, #FFA764, #FF6A1A)' : 'rgba(255,255,255,0.06)',
          color: name ? '#0a0a0a' : 'rgba(255,255,255,0.35)',
          fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600,
          letterSpacing: '-0.01em', cursor: name ? 'pointer' : 'not-allowed',
          boxShadow: name ? '0 8px 24px rgba(255,106,26,0.35)' : 'none',
        }}>Save Private Zone</button>
        <button onClick={back} style={{
          width: '100%', padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500,
        }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Simplified street pattern used for the zone mini-map ─
function MiniMapSVG() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0 }}>
      <rect width="200" height="200" fill="#080a0d"/>
      {/* horizontal streets */}
      {[36, 76, 116, 156].map((y, i) => (
        <line key={'h'+i} x1="0" y1={y} x2="200" y2={y}
          stroke="#1c1d20" strokeWidth="5"/>
      ))}
      {/* vertical streets */}
      {[36, 88, 140].map((x, i) => (
        <line key={'v'+i} x1={x} y1="0" x2={x} y2="200"
          stroke="#1c1d20" strokeWidth="5"/>
      ))}
      {/* diagonal arterial */}
      <line x1="-10" y1="180" x2="220" y2="120" stroke="#2a2521" strokeWidth="7"/>
      {/* street centerlines (sparse) */}
      <line x1="0" y1="76" x2="200" y2="76" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" strokeDasharray="3 6"/>
      <line x1="88" y1="0" x2="88" y2="200" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" strokeDasharray="3 6"/>
      {/* a park block */}
      <rect x="146" y="42" width="46" height="32" fill="#0e1612"/>
      {/* edge fade */}
      <defs>
        <radialGradient id="rp_zoneFade" cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="rgba(0,0,0,0)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.65)"/>
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill="url(#rp_zoneFade)" pointerEvents="none"/>
    </svg>
  );
}

Object.assign(window, { CustomZoneScreen, MiniMapSVG });

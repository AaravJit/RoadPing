// onboarding.jsx — Sign-in + setup flow for RoadPing.
// Auth → Driver profile → Car profile → Visibility → Private Zones → Safety → Permissions → Hidden (Start)

// ─── Shell ────────────────────────────────────────────────
function OnboardingShell({ step, total, onBack, eyebrow, title, body, children,
                          primaryLabel = 'Continue', onPrimary,
                          secondaryLabel, onSecondary,
                          primaryDisabled = false }) {
  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      {/* top bar */}
      <div style={{ padding: '62px 22px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack ? (
          <button onClick={onBack} style={{ ...iconBtn, width: 36, height: 36 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
        ) : <div style={{ width: 36, height: 36 }} />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < step ? '#FF6A1A' : 'rgba(255,255,255,0.10)',
              boxShadow: i === step - 1 ? '0 0 8px rgba(255,106,26,0.6)' : 'none',
              transition: 'all 0.2s ease',
            }} />
          ))}
        </div>
        <div style={{
          width: 36, textAlign: 'right',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.12em',
        }}>
          {step}/{total}
        </div>
      </div>

      {/* header */}
      <div style={{ padding: '14px 22px 8px' }}>
        {eyebrow && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: '#FF6A1A', marginBottom: 8 }}>
            {eyebrow}
          </div>
        )}
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {title}
        </div>
        {body && (
          <div style={{ marginTop: 10, fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {body}
          </div>
        )}
      </div>

      {/* content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 16px' }}>
        {children}
      </div>

      {/* footer */}
      <div style={{ padding: '14px 22px 44px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          disabled={primaryDisabled}
          onClick={onPrimary}
          style={{
            width: '100%', padding: '15px 16px', borderRadius: 14,
            border: 'none', cursor: primaryDisabled ? 'not-allowed' : 'pointer',
            background: primaryDisabled ? 'rgba(255,255,255,0.06)' : 'linear-gradient(180deg, #FFA764, #FF6A1A)',
            color: primaryDisabled ? 'rgba(255,255,255,0.3)' : '#0a0a0a',
            fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600,
            letterSpacing: '-0.01em',
            boxShadow: primaryDisabled ? 'none' : '0 8px 24px rgba(255,106,26,0.35)',
          }}>{primaryLabel}</button>
        {secondaryLabel && (
          <button onClick={onSecondary} style={{
            width: '100%', padding: '12px 16px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500,
          }}>{secondaryLabel}</button>
        )}
      </div>
    </div>
  );
}

// ─── 2. Auth ──────────────────────────────────────────────
function AuthScreen({ go }) {
  return (
    <div className="rp-screen" style={{ background: '#000', padding: '60px 22px 44px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF6A1A', boxShadow: '0 0 14px var(--accent-glow)' }} />
          <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>RoadPing</span>
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.12 }}>
          Live nearby voice<br/>for drivers.
        </div>
        <div style={{ marginTop: 14, fontSize: 15, color: 'var(--text-dim)', lineHeight: 1.5, maxWidth: 320 }}>
          Hold to talk live with drivers near you. Voice is not recorded or saved.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <AuthBtn onClick={() => go('driver')} variant="primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M17.05 12.04c-.04-2.86 2.34-4.23 2.45-4.3-1.34-1.95-3.42-2.22-4.16-2.25-1.77-.18-3.45 1.04-4.35 1.04-.91 0-2.29-1.02-3.77-.99-1.94.03-3.73 1.13-4.73 2.86-2.02 3.51-.52 8.69 1.45 11.54.96 1.4 2.1 2.97 3.6 2.91 1.45-.06 2-.94 3.75-.94 1.75 0 2.24.94 3.76.91 1.55-.03 2.54-1.42 3.49-2.83 1.1-1.62 1.55-3.2 1.58-3.28-.04-.02-3.04-1.17-3.07-4.65zM14.5 4.13c.8-.97 1.34-2.31 1.2-3.65-1.15.05-2.55.77-3.38 1.73-.74.85-1.4 2.22-1.22 3.53 1.29.1 2.6-.65 3.4-1.61z"/></svg>
          Continue with Apple
        </AuthBtn>
        <AuthBtn onClick={() => go('driver')}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M23 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.18c-.27 1.42-1.07 2.62-2.28 3.43v2.84h3.69c2.16-1.99 3.41-4.92 3.41-8.51z" fill="#4285F4"/><path d="M12 23.5c3.08 0 5.66-1.02 7.55-2.77l-3.69-2.84c-1.02.68-2.32 1.09-3.86 1.09-2.97 0-5.49-2-6.39-4.7H1.81v2.95C3.69 20.92 7.55 23.5 12 23.5z" fill="#34A853"/><path d="M5.61 14.28c-.23-.68-.36-1.4-.36-2.15s.13-1.47.36-2.15V7.04H1.81C1.04 8.55.6 10.23.6 12s.44 3.45 1.21 4.96l3.8-2.68z" fill="#FBBC05"/><path d="M12 5.4c1.67 0 3.18.57 4.36 1.7l3.27-3.27C17.66 1.99 15.08.5 12 .5 7.55.5 3.69 3.08 1.81 7.04l3.8 2.95c.9-2.7 3.42-4.59 6.39-4.59z" fill="#EA4335"/></svg>
          Continue with Google
        </AuthBtn>
        <AuthBtn onClick={() => go('driver')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
          Continue with email or phone
        </AuthBtn>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5, maxWidth: 300, alignSelf: 'center' }}>
        By continuing you agree to RoadPing's Terms and Privacy. Voice is live only and not saved.
      </div>
    </div>
  );
}

function AuthBtn({ children, onClick, variant }) {
  const primary = variant === 'primary';
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      width: '100%', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
      background: primary ? '#fff' : 'rgba(255,255,255,0.06)',
      border: primary ? 'none' : '1px solid var(--line-2)',
      color: primary ? '#0a0a0a' : '#fff',
      fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600,
    }}>{children}</button>
  );
}

// ─── 3. Driver profile ────────────────────────────────────
function DriverSetupScreen({ go, back, handle, setHandle }) {
  const [name, setName] = React.useState('Sasha');
  return (
    <OnboardingShell
      step={1} total={4} onBack={back}
      eyebrow="STEP 1 OF 4"
      title="Your driver profile"
      body="How nearby drivers see you on the map."
      onPrimary={() => go('vehicle')}
      primaryDisabled={!handle}
      primaryLabel="Continue">
      {/* photo */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
        <button style={{
          width: 96, height: 96, borderRadius: '50%',
          background: 'var(--surface-1)', border: '1.5px dashed var(--line-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-mute)', cursor: 'pointer',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Handle" required>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-mute)', fontSize: 16 }}>@</span>
            <input value={handle} onChange={e => setHandle(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
              placeholder="fortyfive_drift" style={fieldInput}/>
          </div>
        </Field>
        <Field label="Display name" optional>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" style={fieldInput}/>
        </Field>
      </div>
    </OnboardingShell>
  );
}

// ─── 4. Car profile ───────────────────────────────────────
function CarSetupScreen({ go, back, car, setCar }) {
  const [year, setYear] = React.useState(2023);
  const [make, setMake] = React.useState('Toyota');
  const [model, setModel] = React.useState('GR Corolla');
  const [color, setColor] = React.useState('amber');
  const [nick, setNick] = React.useState('');

  const colors = [
    { id: 'white', hex: '#E8E6E0' },
    { id: 'silver',hex: '#9aa0a6' },
    { id: 'black', hex: '#15161a' },
    { id: 'red',   hex: '#D94F3A' },
    { id: 'amber', hex: '#FF6A1A' },
    { id: 'blue',  hex: '#1E4FB8' },
    { id: 'green', hex: '#3C7A4B' },
    { id: 'yellow',hex: '#F2C200' },
  ];
  const selected = colors.find(c => c.id === color) || colors[0];

  return (
    <OnboardingShell
      step={2} total={4} onBack={back}
      eyebrow="STEP 2 OF 4"
      title="Your car"
      body="Shown on your driver card to nearby drivers."
      onPrimary={() => { setCar(`${year} ${make} ${model}`); go('visibility'); }}
      primaryLabel="Continue">
      {/* car photo placeholder w/ silhouette tinted to selected color */}
      <div style={{
        marginBottom: 20, padding: 14, borderRadius: 16,
        background: 'linear-gradient(180deg, #131316 0%, #0a0a0c 100%)',
        border: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 110,
      }}>
        <CarGlyph color={selected.hex} size={170} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, marginBottom: 14 }}>
        <Field label="Year">
          <input value={year} type="number" onChange={e => setYear(e.target.value)} style={fieldInput}/>
        </Field>
        <Field label="Make">
          <input value={make} onChange={e => setMake(e.target.value)} style={fieldInput}/>
        </Field>
      </div>
      <Field label="Model">
        <input value={model} onChange={e => setModel(e.target.value)} style={fieldInput}/>
      </Field>

      <div style={{ marginTop: 16 }}>
        <FieldLabel>Color</FieldLabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {colors.map(c => (
            <button key={c.id} onClick={() => setColor(c.id)} style={{
              width: 34, height: 34, borderRadius: '50%', cursor: 'pointer',
              background: c.hex, border: 'none',
              outline: color === c.id ? '2px solid #fff' : '2px solid rgba(255,255,255,0.08)',
              outlineOffset: color === c.id ? 2 : 0,
              transition: 'outline 0.15s ease',
            }} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Nickname" optional>
          <input value={nick} onChange={e => setNick(e.target.value)} placeholder="e.g. The Heritage" style={fieldInput}/>
        </Field>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.02em' }}>
        License plate is never collected.
      </div>
    </OnboardingShell>
  );
}

// ─── 5. Visibility education ──────────────────────────────
function VisibilityEducationScreen({ go, back }) {
  return (
    <OnboardingShell
      step={3} total={4} onBack={back}
      eyebrow="STEP 3 OF 4"
      title="You're hidden until you press Start."
      body="When live, your location appears to nearby active RoadPing users within range. Press Stop anytime to disappear from the map."
      onPrimary={() => go('zones')}
      primaryLabel="Got it">
      {/* 3-state visual */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <VisRow label="Hidden" sub="Nobody can see you." tint="muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        </VisRow>
        <ChainArrow />
        <VisRow label="Press Start RoadPing" sub="Tap the big orange button." tint="accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6A1A" strokeWidth="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="#FF6A1A"/></svg>
        </VisRow>
        <ChainArrow />
        <VisRow label="Visible on nearby map" sub="Drivers within 500m can see you." tint="ok">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5BE49B" strokeWidth="1.7"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </VisRow>
      </div>
    </OnboardingShell>
  );
}

function VisRow({ label, sub, tint, children }) {
  const c =
    tint === 'accent' ? 'rgba(255,106,26,0.5)' :
    tint === 'ok' ? 'rgba(91,228,155,0.5)' :
    'rgba(255,255,255,0.12)';
  const bg =
    tint === 'accent' ? 'rgba(255,106,26,0.08)' :
    tint === 'ok' ? 'rgba(91,228,155,0.06)' :
    'var(--surface-1)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: 14, borderRadius: 14,
      background: bg, border: `1px solid ${c}`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{children}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-dim)' }}>{sub}</div>
      </div>
    </div>
  );
}
function ChainArrow() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-mute)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </div>
  );
}

// ─── 6. Private zones ─────────────────────────────────────
function PrivateZonesScreen({ go, back }) {
  const [zones, setZones] = React.useState([
    { id: 'home',   label: 'Home',         set: false, hint: 'Default block: 250m' },
    { id: 'work',   label: 'Work / School',set: false, hint: 'Default block: 150m' },
  ]);
  const add = (id) => setZones(z => z.map(x => x.id === id ? { ...x, set: true } : x));

  return (
    <OnboardingShell
      step={4} total={4} onBack={back}
      eyebrow="STEP 4 OF 4"
      title="Private Zones"
      body="RoadPing won't go live near places you don't want to reveal. Private Zones are never shown to other users."
      onPrimary={() => go('safety')}
      primaryLabel="Done"
      secondaryLabel="Skip for now"
      onSecondary={() => go('safety')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {zones.map(z => (
          <div key={z.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 14, borderRadius: 14,
            background: 'var(--surface-1)', border: '1px solid var(--line)',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: z.set ? 'rgba(91,228,155,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${z.set ? 'rgba(91,228,155,0.5)' : 'var(--line)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {z.id === 'home' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={z.set ? '#5BE49B' : '#fff'} strokeWidth="1.7"><path d="M3 10l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={z.set ? '#5BE49B' : '#fff'} strokeWidth="1.7"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{z.label}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-dim)' }}>
                {z.set ? 'Saved · block 250m radius' : z.hint}
              </div>
            </div>
            {z.set ? (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
                color: '#5BE49B', padding: '4px 10px', borderRadius: 999,
                background: 'rgba(91,228,155,0.10)', border: '1px solid rgba(91,228,155,0.4)',
              }}>SET</span>
            ) : (
              <button onClick={() => add(z.id)} style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
                color: '#FF6A1A', padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(255,106,26,0.10)', border: '1px solid rgba(255,106,26,0.45)',
              }}>+ ADD</button>
            )}
          </div>
        ))}
        <button onClick={() => go('customZone')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: 14, borderRadius: 14, cursor: 'pointer',
          background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--line-2)',
          color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.18em',
        }}>
          + ADD CUSTOM ZONE
        </button>
      </div>

      <div style={{
        marginTop: 18, padding: 14, borderRadius: 12,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)',
        fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5,
      }}>
        <span style={{ color: '#fff', fontWeight: 600 }}>Heads-up.</span> If you press Start while inside a Private Zone, RoadPing will refuse to go live until you move farther away.
      </div>
    </OnboardingShell>
  );
}

// ─── 7. Safety / privacy agreement ────────────────────────
function SafetyAgreementScreen({ go, back }) {
  const items = [
    {
      icon: 'eye',
      title: 'You are hidden until you press Start.',
      body: 'Your live position is only shared with nearby RoadPing users when you choose to go live.'
    },
    {
      icon: 'mic',
      title: 'Voice is live only.',
      body: 'RoadPing does not save, replay, or store conversations. Nothing is recorded.'
    },
    {
      icon: 'wheel',
      title: 'Eyes on the road.',
      body: 'Use full map controls only while parked, stopped, or as a passenger. Voice-only mode kicks in while driving.'
    },
  ];

  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      <div style={{ padding: '62px 22px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={back} style={{ ...iconBtn, width: 36, height: 36 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: '#FF6A1A' }}>
          SAFETY · PRIVACY
        </div>
        <div style={{ width: 36 }} />
      </div>
      <div style={{ padding: '14px 22px 0' }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          A few rules<br/>before we drive.
        </div>
      </div>
      <div style={{ flex: 1, padding: '22px 22px 0', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14,
            padding: 16, borderRadius: 16,
            background: 'var(--surface-1)', border: '1px solid var(--line)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,106,26,0.10)', border: '1px solid rgba(255,106,26,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FF6A1A',
            }}>
              {it.icon === 'eye' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>}
              {it.icon === 'mic' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>}
              {it.icon === 'wheel' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M3 12h6M21 12h-6M12 21v-6"/></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>{it.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '18px 22px 44px' }}>
        <button onClick={() => go('permissions')} style={{
          width: '100%', padding: '15px 16px', borderRadius: 14, border: 'none',
          background: 'linear-gradient(180deg, #FFA764, #FF6A1A)',
          color: '#0a0a0a', fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600,
          letterSpacing: '-0.01em', cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(255,106,26,0.35)',
        }}>I Understand</button>
      </div>
    </div>
  );
}

// ─── 8. Permissions ───────────────────────────────────────
function PermissionsScreen({ go, back }) {
  const [perms, setPerms] = React.useState({ location: 'idle', mic: 'idle', notif: 'idle' });
  const grant = (k) => setPerms(p => ({ ...p, [k]: 'granted' }));
  const allGranted = Object.values(perms).every(v => v === 'granted');

  const rows = [
    {
      id: 'location', icon: 'pin',
      title: 'Location',
      body: 'See nearby drivers and your live position only when you press Start.'
    },
    {
      id: 'mic', icon: 'mic',
      title: 'Microphone',
      body: 'Live hold-to-talk voice. Voice is not recorded or saved.'
    },
    {
      id: 'notif', icon: 'bell',
      title: 'Notifications',
      body: 'Incoming live voice and room alerts.'
    },
  ];

  return (
    <div className="rp-screen" style={{ background: '#000' }}>
      <div style={{ padding: '62px 22px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={back} style={{ ...iconBtn, width: 36, height: 36 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-mute)' }}>
          PERMISSIONS
        </div>
        <div style={{ width: 36 }} />
      </div>
      <div style={{ padding: '14px 22px 0' }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          A few permissions before you can go live.
        </div>
      </div>
      <div style={{ flex: 1, padding: '22px 22px 0', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => (
          <div key={r.id} style={{
            display: 'flex', gap: 14,
            padding: 16, borderRadius: 16,
            background: perms[r.id] === 'granted' ? 'rgba(91,228,155,0.06)' : 'var(--surface-1)',
            border: `1px solid ${perms[r.id] === 'granted' ? 'rgba(91,228,155,0.4)' : 'var(--line)'}`,
            transition: 'all 0.2s ease',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: perms[r.id] === 'granted' ? '#5BE49B' : '#fff',
            }}>
              {r.icon === 'pin'  && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
              {r.icon === 'mic'  && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>}
              {r.icon === 'bell' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{r.title}</div>
              <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.5 }}>{r.body}</div>
            </div>
            {perms[r.id] === 'granted' ? (
              <span style={{
                alignSelf: 'flex-start',
                fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em',
                color: '#5BE49B', padding: '5px 9px', borderRadius: 999,
                background: 'rgba(91,228,155,0.10)', border: '1px solid rgba(91,228,155,0.4)',
              }}>ALLOWED</span>
            ) : (
              <button onClick={() => grant(r.id)} style={{
                alignSelf: 'flex-start',
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
                color: '#FF6A1A', padding: '6px 10px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(255,106,26,0.10)', border: '1px solid rgba(255,106,26,0.45)',
              }}>ALLOW</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: '18px 22px 44px' }}>
        <button onClick={() => go('start')} style={{
          width: '100%', padding: '15px 16px', borderRadius: 14, border: 'none',
          background: allGranted
            ? 'linear-gradient(180deg, #FFA764, #FF6A1A)'
            : 'rgba(255,255,255,0.06)',
          color: allGranted ? '#0a0a0a' : 'rgba(255,255,255,0.45)',
          fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600,
          letterSpacing: '-0.01em', cursor: 'pointer',
          boxShadow: allGranted ? '0 8px 24px rgba(255,106,26,0.35)' : 'none',
          transition: 'all 0.2s ease',
        }}>{allGranted ? 'Continue' : 'Allow all to continue'}</button>
      </div>
    </div>
  );
}

// ─── Field primitives ─────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
      color: 'var(--text-mute)', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}
function Field({ label, required, optional, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <FieldLabel>{label}</FieldLabel>
        {required && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#FF6A1A' }}>•</span>}
        {optional && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-mute)' }}>(optional)</span>}
      </div>
      <div style={{
        marginTop: 6, padding: '12px 14px', borderRadius: 12,
        background: 'var(--surface-1)', border: '1px solid var(--line)',
      }}>
        {children}
      </div>
    </div>
  );
}
const fieldInput = {
  background: 'transparent', border: 'none', outline: 'none',
  color: '#fff', fontFamily: 'var(--sans)', fontSize: 16,
  width: '100%', padding: 0,
};

Object.assign(window, {
  OnboardingShell,
  AuthScreen, DriverSetupScreen, CarSetupScreen,
  VisibilityEducationScreen, PrivateZonesScreen,
  SafetyAgreementScreen, PermissionsScreen,
});

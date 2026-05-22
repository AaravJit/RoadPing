// vehicles.jsx — Vehicle data, body-type silhouettes, and the
// Vehicle Setup onboarding screen + bottom-sheet pickers.

// ─── Data ────────────────────────────────────────────────
const MAKES = [
  // Popular at top
  { name: 'BMW',           popular: true,  kind: 'car' },
  { name: 'Honda',         popular: true,  kind: 'car' },
  { name: 'Toyota',        popular: true,  kind: 'car' },
  { name: 'Nissan',        popular: true,  kind: 'car' },
  { name: 'Tesla',         popular: true,  kind: 'car' },
  { name: 'Porsche',       popular: true,  kind: 'car' },
  { name: 'Subaru',        popular: true,  kind: 'car' },
  // Cars
  { name: 'Ford',          kind: 'car' },
  { name: 'Chevrolet',     kind: 'car' },
  { name: 'Mercedes-Benz', kind: 'car' },
  { name: 'Audi',          kind: 'car' },
  { name: 'Dodge',         kind: 'car' },
  { name: 'Mazda',         kind: 'car' },
  { name: 'Hyundai',       kind: 'car' },
  { name: 'Kia',           kind: 'car' },
  { name: 'Volkswagen',    kind: 'car' },
  { name: 'Lexus',         kind: 'car' },
  { name: 'Acura',         kind: 'car' },
  { name: 'Volvo',         kind: 'car' },
  // Motorcycles
  { name: 'Kawasaki',      kind: 'moto' },
  { name: 'Yamaha',        kind: 'moto' },
  { name: 'Suzuki',        kind: 'moto' },
  { name: 'Ducati',        kind: 'moto' },
];

const MODELS_BY_MAKE = {
  BMW: [
    { model: '320i', body: 'sedan' }, { model: '330i', body: 'sedan' },
    { model: 'M3',   body: 'sedan' }, { model: 'M4',   body: 'coupe' },
    { model: 'M5',   body: 'sedan' }, { model: 'X3',   body: 'suv' },
    { model: 'X5',   body: 'suv' },
  ],
  Honda: [
    { model: 'Civic Si',      body: 'sedan' },
    { model: 'Civic Type R',  body: 'hatchback' },
    { model: 'Accord',        body: 'sedan' },
    { model: 'CR-V',          body: 'suv' },
    { model: 'S2000',         body: 'sportsCar' },
    { model: 'CBR500R',       body: 'motorcycle' },
  ],
  Toyota: [
    { model: 'Camry',     body: 'sedan' },
    { model: 'Corolla',   body: 'sedan' },
    { model: 'GR Corolla',body: 'hatchback' },
    { model: 'Supra',     body: 'sportsCar' },
    { model: 'GR86',      body: 'coupe' },
    { model: 'Tacoma',    body: 'pickup' },
    { model: '4Runner',   body: 'suv' },
  ],
  Nissan: [
    { model: '350Z',  body: 'coupe' },
    { model: '370Z',  body: 'coupe' },
    { model: 'GT-R',  body: 'supercar' },
    { model: '240SX', body: 'coupe' },
    { model: 'Altima',body: 'sedan' },
    { model: 'Sentra',body: 'sedan' },
  ],
  Ford: [
    { model: 'F-150',          body: 'pickup' },
    { model: 'Mustang GT',     body: 'coupe' },
    { model: 'Mustang Mach 1', body: 'coupe' },
    { model: 'Bronco',         body: 'suv' },
  ],
  Chevrolet: [
    { model: 'Camaro SS',     body: 'coupe' },
    { model: 'Camaro ZL1',    body: 'coupe' },
    { model: 'Corvette C8',   body: 'sportsCar' },
    { model: 'Corvette Z06',  body: 'supercar' },
    { model: 'Silverado',     body: 'pickup' },
  ],
  'Mercedes-Benz': [
    { model: 'C-Class',  body: 'sedan' },
    { model: 'E-Class',  body: 'sedan' },
    { model: 'AMG GT',   body: 'sportsCar' },
    { model: 'GLC',      body: 'suv' },
  ],
  Audi: [
    { model: 'A4',  body: 'sedan' },
    { model: 'RS6', body: 'wagon' },
    { model: 'R8',  body: 'supercar' },
    { model: 'Q5',  body: 'suv' },
    { model: 'TT',  body: 'coupe' },
  ],
  Tesla: [
    { model: 'Model 3', body: 'sedan' },
    { model: 'Model S', body: 'sedan' },
    { model: 'Model Y', body: 'crossover' },
    { model: 'Model X', body: 'suv' },
    { model: 'Cybertruck', body: 'pickup' },
  ],
  Dodge: [
    { model: 'Charger',    body: 'sedan' },
    { model: 'Challenger', body: 'coupe' },
    { model: 'Ram 1500',   body: 'pickup' },
  ],
  Subaru: [
    { model: 'WRX',      body: 'sedan' },
    { model: 'WRX STI',  body: 'sedan' },
    { model: 'BRZ',      body: 'coupe' },
    { model: 'Forester', body: 'suv' },
  ],
  Mazda: [
    { model: 'MX-5 Miata', body: 'sportsCar' },
    { model: 'CX-5',       body: 'suv' },
    { model: 'RX-7',       body: 'coupe' },
    { model: 'Mazda3',     body: 'hatchback' },
  ],
  Hyundai: [
    { model: 'Elantra N',   body: 'sedan' },
    { model: 'Sonata',      body: 'sedan' },
    { model: 'Veloster N',  body: 'hatchback' },
    { model: 'Tucson',      body: 'suv' },
  ],
  Kia: [
    { model: 'Stinger',   body: 'sedan' },
    { model: 'Forte',     body: 'sedan' },
    { model: 'Telluride', body: 'suv' },
    { model: 'EV6',       body: 'crossover' },
  ],
  Volkswagen: [
    { model: 'Golf R', body: 'hatchback' },
    { model: 'GTI',    body: 'hatchback' },
    { model: 'Jetta',  body: 'sedan' },
  ],
  Lexus: [
    { model: 'IS', body: 'sedan' },
    { model: 'RC', body: 'coupe' },
    { model: 'GX', body: 'suv' },
    { model: 'LC', body: 'coupe' },
  ],
  Acura: [
    { model: 'Integra', body: 'hatchback' },
    { model: 'NSX',     body: 'supercar' },
    { model: 'TLX',     body: 'sedan' },
  ],
  Porsche: [
    { model: '911',       body: 'sportsCar' },
    { model: '911 GT3',   body: 'sportsCar' },
    { model: 'Cayman',    body: 'sportsCar' },
    { model: 'Cayenne',   body: 'suv' },
    { model: 'Macan',     body: 'suv' },
    { model: 'Taycan',    body: 'sedan' },
  ],
  Volvo: [
    { model: '240 Wagon', body: 'wagon' },
    { model: 'V70',       body: 'wagon' },
    { model: 'XC90',      body: 'suv' },
    { model: 'S60',       body: 'sedan' },
  ],
  Kawasaki: [
    { model: 'Ninja 400',    body: 'motorcycle' },
    { model: 'Ninja ZX-6R',  body: 'motorcycle' },
    { model: 'Ninja H2',     body: 'motorcycle' },
    { model: 'Z900',         body: 'motorcycle' },
  ],
  Yamaha: [
    { model: 'YZF-R3', body: 'motorcycle' },
    { model: 'YZF-R6', body: 'motorcycle' },
    { model: 'YZF-R1', body: 'motorcycle' },
    { model: 'MT-07',  body: 'motorcycle' },
    { model: 'MT-09',  body: 'motorcycle' },
  ],
  Suzuki: [
    { model: 'GSX-R600',  body: 'motorcycle' },
    { model: 'GSX-R1000', body: 'motorcycle' },
    { model: 'Hayabusa',  body: 'motorcycle' },
  ],
  Ducati: [
    { model: 'Panigale V4',   body: 'motorcycle' },
    { model: 'Monster',       body: 'motorcycle' },
    { model: 'Streetfighter', body: 'motorcycle' },
  ],
};

const COLORS = [
  { id: 'black',  hex: '#1a1b1e', name: 'Black' },
  { id: 'white',  hex: '#E8E6E0', name: 'White' },
  { id: 'silver', hex: '#a3a8ad', name: 'Silver' },
  { id: 'gray',   hex: '#54585e', name: 'Gray' },
  { id: 'red',    hex: '#D94F3A', name: 'Red' },
  { id: 'blue',   hex: '#1E4FB8', name: 'Blue' },
  { id: 'green',  hex: '#3C7A4B', name: 'Green' },
  { id: 'yellow', hex: '#F2C200', name: 'Yellow' },
  { id: 'orange', hex: '#FF6A1A', name: 'Orange' },
  { id: 'purple', hex: '#6B3FA0', name: 'Purple' },
];

const YEARS = (() => {
  const a = []; for (let y = 2026; y >= 1990; y--) a.push(y); return a;
})();

// Helpers
function bodyTypeFor(make, model) {
  const list = MODELS_BY_MAKE[make] || [];
  const m = list.find(x => x.model === model);
  return m ? m.body : 'sedan';
}

// ─── Vehicle silhouette glyph ────────────────────────────
// 200×120 viewBox; the car sits on baseline y≈84
const BODY_PATHS = {
  sedan:     { body: 'M 16 76 L 24 64 L 46 50 L 80 42 L 122 42 L 150 46 L 168 52 L 184 64 L 188 76 Z',
               window: 'M 52 50 L 80 44 L 122 44 L 144 50 L 138 60 L 60 60 Z',
               wheels: [[44,80,14],[156,80,14]] },
  coupe:     { body: 'M 14 78 L 30 66 L 60 50 L 104 38 L 144 42 L 168 54 L 184 66 L 188 78 Z',
               window: 'M 60 52 L 104 42 L 142 46 L 156 56 L 70 60 Z',
               wheels: [[44,82,14],[156,82,14]] },
  hatchback: { body: 'M 14 76 L 24 62 L 50 48 L 92 40 L 138 40 L 156 48 L 168 70 L 168 76 Z',
               window: 'M 54 50 L 92 42 L 134 44 L 150 56 L 60 60 Z',
               wheels: [[44,80,14],[148,80,14]] },
  wagon:     { body: 'M 14 78 L 24 60 L 50 44 L 76 36 L 158 36 L 174 48 L 186 64 L 188 78 Z',
               window: 'M 52 48 L 78 40 L 156 40 L 168 52 L 60 60 Z',
               wheels: [[44,82,14],[156,82,14]] },
  suv:       { body: 'M 14 78 L 22 46 L 52 32 L 150 32 L 180 46 L 188 78 Z',
               window: 'M 56 42 L 150 42 L 168 56 L 60 56 Z',
               wheels: [[40,82,14],[160,82,14]] },
  pickup:    { body: 'M 14 78 L 22 56 L 50 42 L 92 42 L 100 56 L 186 56 L 186 78 Z',
               window: 'M 54 48 L 92 48 L 96 56 L 60 56 Z',
               wheels: [[42,82,14],[156,82,14]] },
  van:       { body: 'M 14 78 L 22 42 L 36 30 L 174 30 L 184 42 L 186 78 Z',
               window: 'M 40 42 L 96 42 L 96 58 L 40 58 Z',
               wheels: [[42,82,14],[158,82,14]] },
  crossover: { body: 'M 14 78 L 24 56 L 50 42 L 84 34 L 152 36 L 174 46 L 186 60 L 188 78 Z',
               window: 'M 56 46 L 86 40 L 150 42 L 164 54 L 64 58 Z',
               wheels: [[44,82,14],[156,82,14]] },
  sportsCar: { body: 'M 8 82 L 24 72 L 60 54 L 106 42 L 156 54 L 188 68 L 196 82 Z',
               window: 'M 60 58 L 108 48 L 152 56 L 168 64 L 70 66 Z',
               wheels: [[40,86,14],[160,86,14]] },
  supercar:  { body: 'M 4 84 L 16 78 L 50 64 L 100 48 L 148 58 L 188 74 L 196 84 Z',
               window: 'M 56 66 L 102 54 L 144 62 L 168 72 L 64 72 Z',
               wheels: [[38,88,14],[162,88,14]] },
};

function VehicleGlyph({ body = 'sedan', color = '#FF6A1A', size = 160, mono = false }) {
  if (body === 'motorcycle') return <MotorcycleGlyph color={color} size={size} mono={mono}/>;
  const def = BODY_PATHS[body] || BODY_PATHS.sedan;
  const stroke = mono ? '#fff' : 'rgba(255,255,255,0.15)';
  const window = mono ? 'rgba(255,255,255,0.0)' : 'rgba(0,0,0,0.35)';
  const wheelStroke = mono ? '#fff' : color;

  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 200 110" style={{ display: 'block' }}>
      {/* shadow */}
      {!mono && <ellipse cx="100" cy="94" rx="80" ry="3" fill="rgba(0,0,0,0.4)"/>}
      {/* body */}
      <path d={def.body} fill={mono ? 'none' : color} stroke={stroke} strokeWidth={mono ? 1.4 : 0.8} strokeLinejoin="round"/>
      {/* window */}
      {!mono && <path d={def.window} fill={window}/>}
      {/* wheels */}
      {def.wheels.map((w, i) => (
        <g key={i}>
          <circle cx={w[0]} cy={w[1]} r={w[2]}     fill={mono ? 'none' : '#08090b'} stroke={wheelStroke} strokeWidth="1.4"/>
          {!mono && <circle cx={w[0]} cy={w[1]} r={w[2] - 8} fill="#1a1b1e"/>}
        </g>
      ))}
    </svg>
  );
}

function MotorcycleGlyph({ color = '#FF6A1A', size = 160, mono = false }) {
  const stroke = mono ? '#fff' : color;
  const fill = mono ? 'none' : color;
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 200 110" style={{ display: 'block' }}>
      {!mono && <ellipse cx="100" cy="98" rx="78" ry="3" fill="rgba(0,0,0,0.4)"/>}
      {/* rear wheel */}
      <circle cx="42" cy="80" r="20" fill={mono ? 'none' : '#08090b'} stroke={stroke} strokeWidth="1.4"/>
      <circle cx="42" cy="80" r="8"  fill={mono ? 'none' : '#1a1b1e'} stroke={mono ? '#fff' : 'none'} strokeWidth={mono ? 0.8 : 0}/>
      {/* front wheel */}
      <circle cx="158" cy="80" r="20" fill={mono ? 'none' : '#08090b'} stroke={stroke} strokeWidth="1.4"/>
      <circle cx="158" cy="80" r="8"  fill={mono ? 'none' : '#1a1b1e'} stroke={mono ? '#fff' : 'none'} strokeWidth={mono ? 0.8 : 0}/>
      {/* fairing/body */}
      <path d="M 42 64 L 68 38 L 110 30 L 150 34 L 168 50 L 162 70 L 138 72 L 90 72 L 62 68 Z"
        fill={fill} stroke={mono ? '#fff' : 'rgba(255,255,255,0.15)'} strokeWidth={mono ? 1.4 : 0.8}/>
      {/* front fork */}
      <path d="M 150 34 L 168 38 L 162 60" stroke={stroke} strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* handlebars */}
      <path d="M 154 30 L 162 24 M 154 30 L 146 26"
        stroke={stroke} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      {/* windscreen highlight */}
      {!mono && <path d="M 152 36 L 168 40 L 162 50 L 152 48 Z" fill="rgba(255,255,255,0.18)"/>}
    </svg>
  );
}

// ─── Searchable bottom-sheet picker ──────────────────────
function VehiclePickerSheet({ open, title, options, current, onSelect, onClose, hint }) {
  const [q, setQ] = React.useState('');
  React.useEffect(() => { if (open) setQ(''); }, [open]);
  if (!open) return null;

  const filtered = options.filter(o => {
    const label = (o.name || o.model || String(o)).toLowerCase();
    return label.includes(q.toLowerCase());
  });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, animation: 'rpFadeIn 0.18s ease' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: 60,
        background: '#08090c',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: '1px solid var(--line)', borderBottom: 'none',
        display: 'flex', flexDirection: 'column',
        animation: 'rpSheetIn 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '12px auto 8px' }} />
        <div style={{ padding: '4px 22px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-mute)' }}>
            {title.toUpperCase()}
          </div>
          <button onClick={onClose} style={{ ...iconBtn, width: 28, height: 28 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '0 16px 10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 12,
            background: 'var(--surface-1)', border: '1px solid var(--line)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={hint || 'Search'}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontFamily: 'var(--sans)', fontSize: 15, flex: 1,
              }} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 24px' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--text-mute)', fontSize: 13, textAlign: 'center' }}>
              No matches.
            </div>
          )}
          {filtered.map(o => {
            const label = o.name || o.model || String(o);
            const sublabel = o.popular ? 'POPULAR' : null;
            const selected = current === label;
            return (
              <button key={label} onClick={() => { onSelect(o); onClose(); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '13px 14px', borderRadius: 12, cursor: 'pointer', marginBottom: 2,
                background: selected ? 'rgba(255,106,26,0.10)' : 'transparent',
                border: selected ? '1px solid rgba(255,106,26,0.5)' : '1px solid transparent',
                color: '#fff', textAlign: 'left',
              }}>
                <MakeBadge name={label} />
                <span style={{ flex: 1, fontSize: 15, fontWeight: selected ? 600 : 500 }}>{label}</span>
                {sublabel && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.14em',
                    padding: '3px 7px', borderRadius: 999,
                    background: 'rgba(255,106,26,0.10)',
                    color: '#FF6A1A',
                    border: '1px solid rgba(255,106,26,0.35)',
                  }}>{sublabel}</span>
                )}
                {selected && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6A1A" strokeWidth="2.4"><path d="M20 6 9 17l-5-5"/></svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Minimal monochrome badge for a make name.
function MakeBadge({ name }) {
  if (!name || name.length === 0) {
    return <div style={badgeStyle}>—</div>;
  }
  // 1-2 letter monogram
  const m = name.split(/[\s-]/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return <div style={badgeStyle}>{m}</div>;
}
const badgeStyle = {
  width: 28, height: 28, borderRadius: 7,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.04em',
  color: 'rgba(255,255,255,0.85)', fontWeight: 600,
};

// ─── Vehicle Setup Screen ────────────────────────────────
function VehicleSetupScreen({ go, back, vehicle, setVehicle }) {
  const [make, setMake]   = React.useState(vehicle?.make  || 'Toyota');
  const [model, setModel] = React.useState(vehicle?.model || 'GR Corolla');
  const [year, setYear]   = React.useState(vehicle?.year  || 2024);
  const [color, setColor] = React.useState(vehicle?.colorId || 'orange');
  const [nick, setNick]   = React.useState(vehicle?.nick   || '');
  const [open, setOpen]   = React.useState(null); // 'make' | 'model' | 'year' | null

  const body = bodyTypeFor(make, model);
  const colorObj = COLORS.find(c => c.id === color) || COLORS[0];

  const onContinue = () => {
    setVehicle({ make, model, year, colorId: color, color: colorObj.hex, colorName: colorObj.name, nick, body });
    go('visibility');
  };

  return (
    <>
      <OnboardingShell
        step={2} total={4} onBack={back}
        eyebrow="STEP 2 OF 4"
        title="Your vehicle"
        body="Shown on your driver card to nearby drivers."
        onPrimary={onContinue}
        primaryLabel="Continue">

        {/* Live preview card */}
        <div style={{
          marginBottom: 18, padding: 16, borderRadius: 18,
          background: 'linear-gradient(180deg, #131316 0%, #0a0a0c 100%)',
          border: '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 90, marginBottom: 10 }}>
            <VehicleGlyph body={body} color={colorObj.hex} size={210} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--text-mute)' }}>
                {body.replace('sportsCar', 'SPORTS CAR').replace('crossover', 'CROSSOVER · EV').toUpperCase()}
              </div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {year} {make} {model}
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-dim)' }}>
                {colorObj.name}{nick ? ` · "${nick}"` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Field selectors */}
        <SelectorRow label="Make"  value={make}  onClick={() => setOpen('make')}  hint="Pick your make"/>
        <SelectorRow label="Model" value={model} onClick={() => setOpen('model')} hint="Pick a model"
          disabled={!make} disabledHint="Pick a make first"/>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <SelectorRow label="Year"  value={year}  onClick={() => setOpen('year')}/>
          <SelectorRow label="Color" value={colorObj.name} swatch={colorObj.hex} onClick={() => setOpen('color')}/>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Nickname" optional>
            <input value={nick} onChange={e => setNick(e.target.value)} placeholder="e.g. Daily · M5 · CBR · Z · Boosted Civic" style={fieldInput}/>
          </Field>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.02em' }}>
          License plate is never collected.
        </div>
      </OnboardingShell>

      {/* Pickers */}
      <VehiclePickerSheet
        open={open === 'make'} onClose={() => setOpen(null)}
        title="Make" hint="Search makes"
        options={MAKES} current={make}
        onSelect={(o) => {
          setMake(o.name);
          // reset model to first of new make
          const list = MODELS_BY_MAKE[o.name];
          setModel(list && list[0] ? list[0].model : '');
        }} />
      <VehiclePickerSheet
        open={open === 'model'} onClose={() => setOpen(null)}
        title={`${make} models`} hint="Search models"
        options={(MODELS_BY_MAKE[make] || []).map(m => ({ name: m.model, model: m.model }))}
        current={model}
        onSelect={(o) => setModel(o.model)} />
      <VehiclePickerSheet
        open={open === 'year'} onClose={() => setOpen(null)}
        title="Year" hint="Search years"
        options={YEARS.map(y => ({ name: String(y) }))}
        current={String(year)}
        onSelect={(o) => setYear(parseInt(o.name, 10))} />
      <ColorPickerSheet
        open={open === 'color'} onClose={() => setOpen(null)}
        current={color}
        onSelect={(c) => setColor(c.id)} />
    </>
  );
}

function SelectorRow({ label, value, onClick, hint, swatch, disabled, disabledHint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <FieldLabel>{label}</FieldLabel>
      <button onClick={disabled ? null : onClick} disabled={disabled} style={{
        marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 14px', borderRadius: 12,
        background: 'var(--surface-1)', border: '1px solid var(--line)',
        color: disabled ? 'var(--text-mute)' : '#fff',
        fontFamily: 'var(--sans)', fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
      }}>
        {swatch && (
          <span style={{ width: 18, height: 18, borderRadius: 999, background: swatch,
            border: '1px solid rgba(255,255,255,0.18)' }} />
        )}
        <span style={{ flex: 1 }}>{value || <span style={{ color: 'var(--text-mute)' }}>{disabled ? disabledHint : hint}</span>}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
  );
}

function ColorPickerSheet({ open, onClose, current, onSelect }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, animation: 'rpFadeIn 0.18s ease' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: '#08090c',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: '1px solid var(--line)', borderBottom: 'none',
        padding: '12px 22px 32px',
        animation: 'rpSheetIn 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 14px' }} />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-mute)', marginBottom: 14 }}>
          COLOR
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {COLORS.map(c => (
            <button key={c.id} onClick={() => { onSelect(c); onClose(); }} style={{
              padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
              background: current === c.id ? 'rgba(255,106,26,0.08)' : 'var(--surface-1)',
              border: current === c.id ? '1px solid rgba(255,106,26,0.5)' : '1px solid var(--line)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              color: '#fff',
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%', background: c.hex,
                border: '1px solid rgba(255,255,255,0.18)',
              }} />
              <span style={{ fontSize: 11 }}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  MAKES, MODELS_BY_MAKE, COLORS, YEARS,
  bodyTypeFor, VehicleGlyph, MotorcycleGlyph, MakeBadge,
  VehicleSetupScreen, VehiclePickerSheet, ColorPickerSheet, SelectorRow,
});

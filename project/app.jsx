// app.jsx — RoadPing main shell: full flow router, picker, iOS frame

const DEFAULT_USER = {
  handle: 'fortyfive_drift',
  // vehicle is structured so the preview card + map can use VehicleGlyph
  vehicle: {
    make: 'Toyota', model: 'GR Corolla', year: 2024,
    colorId: 'orange', color: '#FF6A1A', colorName: 'Orange',
    nick: 'Heritage', body: 'hatchback',
  },
};

const SCREEN_LIST = [
  { id: 'launch',       label: '01 Launch' },
  { id: 'auth',         label: '02 Sign in' },
  { id: 'driver',       label: '03 Driver' },
  { id: 'vehicle',      label: '04 Vehicle' },
  { id: 'visibility',   label: '05 Visibility' },
  { id: 'zones',        label: '06 Zones' },
  { id: 'customZone',   label: '07 Custom Zone' },
  { id: 'safety',       label: '08 Safety' },
  { id: 'permissions',  label: '09 Permits' },
  { id: 'start',        label: '10 Hidden · Safe' },
  { id: 'startBlocked', label: '11 Hidden · Block' },
  { id: 'radar',        label: '12 Live map' },
  { id: 'talkIdle',     label: '13 Talk · Idle' },
  { id: 'talkOn',       label: '14 Talk · On Air' },
  { id: 'talkIn',       label: '15 Incoming' },
  { id: 'card',         label: '16 Card' },
  { id: 'room',         label: '17 Room' },
  { id: 'driving',      label: '18 Driving' },
  { id: 'settings',     label: '19 Settings' },
];

function Mount() {
  const [screen, setScreen] = React.useState('launch');
  return (
    <>
      <StatefulApp screen={screen} setScreen={setScreen} />
      <PickerPortal current={screen} onPick={setScreen} />
    </>
  );
}
function StatefulApp({ screen, setScreen }) {
  return <AppCore screen={screen} setScreen={setScreen} />;
}

function AppCore({ screen, setScreen }) {
  // identity state, persists across the flow
  const [handle, setHandle] = React.useState(DEFAULT_USER.handle);
  const [vehicle, setVehicle] = React.useState(DEFAULT_USER.vehicle);
  const carString = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  // live state
  const [talkState, setTalkState] = React.useState('idle');
  const [openCard, setOpenCard]   = React.useState(null);
  const [activeRoom, setActiveRoom] = React.useState({ name: 'Canyon Run · Sat', desc: 'Pacifica → HWY 1' });
  const [incomingFrom, setIncomingFrom] = React.useState(null);
  const [drivers, setDrivers] = React.useState(NEARBY_DRIVERS);
  const [showSafety, setShowSafety] = React.useState(false);

  // settings
  const [range, setRange] = React.useState(500);
  const [dnd, setDnd]     = React.useState(false);
  const [ptt, setPtt]     = React.useState(true);

  // Map an id to the kind of live screen it represents
  const liveScreens = ['radar', 'talkIdle', 'talkOn', 'talkIn', 'card', 'driving'];

  // External picker side-effects per screen
  React.useEffect(() => {
    // openCard visibility
    if (screen === 'card') setOpenCard(drivers[0]);
    else if (!liveScreens.includes(screen)) setOpenCard(null);

    // driving safety overlay
    if (screen === 'driving') setShowSafety(true);
    else setShowSafety(false);

    // talk state per picker target
    if (screen === 'talkOn') {
      setTalkState('recording');
      setIncomingFrom(null);
    } else if (screen === 'talkIn') {
      setTalkState('incoming');
      const inc = NEARBY_DRIVERS.find(d => d.handle === 'nightrun');
      setIncomingFrom(inc);
    } else if (liveScreens.includes(screen)) {
      setTalkState('idle');
      setIncomingFrom(null);
    } else {
      setTalkState('idle');
      setIncomingFrom(null);
    }
  }, [screen]);

  // Ambient activity + delayed live incoming voice ONLY on default Live map.
  // The dedicated Talk/Incoming review screens have their own forced state.
  React.useEffect(() => {
    if (screen !== 'radar') return;
    const flip = setInterval(() => {
      setDrivers(ds => ds.map((d, i) => ({
        ...d,
        talking: i === Math.floor(Math.random() * ds.length) ? Math.random() > 0.3 : false,
      })));
    }, 2400);
    const incomingT = setTimeout(() => {
      const from = NEARBY_DRIVERS.find(d => d.handle === 'nightrun');
      setIncomingFrom(from);
      setTalkState('incoming');
      setTimeout(() => setTalkState('idle'), 2600);
      setTimeout(() => setIncomingFrom(null), 4000);
    }, 4500);
    return () => { clearInterval(flip); clearTimeout(incomingT); };
  }, [screen]);

  // Keep nightrun visibly talking on radar so the map feels alive
  React.useEffect(() => {
    if (liveScreens.includes(screen)) {
      setDrivers(ds => ds.map(d => d.handle === 'nightrun' ? { ...d, talking: true } : d));
    }
  }, [screen]);

  // Compute content
  let content;
  if (screen === 'launch') {
    content = <LaunchScreen go={setScreen} />;
  } else if (screen === 'auth') {
    content = <AuthScreen go={setScreen} />;
  } else if (screen === 'driver') {
    content = <DriverSetupScreen go={setScreen} back={() => setScreen('auth')} handle={handle} setHandle={setHandle} />;
  } else if (screen === 'vehicle') {
    content = <VehicleSetupScreen go={setScreen} back={() => setScreen('driver')} vehicle={vehicle} setVehicle={setVehicle} />;
  } else if (screen === 'visibility') {
    content = <VisibilityEducationScreen go={setScreen} back={() => setScreen('vehicle')} />;
  } else if (screen === 'zones') {
    content = <PrivateZonesScreen go={setScreen} back={() => setScreen('visibility')} />;
  } else if (screen === 'customZone') {
    content = <CustomZoneScreen go={setScreen} back={() => setScreen('zones')} />;
  } else if (screen === 'safety') {
    content = <SafetyAgreementScreen go={setScreen} back={() => setScreen('zones')} />;
  } else if (screen === 'permissions') {
    content = <PermissionsScreen go={setScreen} back={() => setScreen('safety')} />;
  } else if (screen === 'start') {
    content = <StartScreen go={setScreen} handle={handle} car={carString} zoneStatus="safe" />;
  } else if (screen === 'startBlocked') {
    content = <StartScreen go={setScreen} handle={handle} car={carString} zoneStatus="tooClose" />;
  } else if (liveScreens.includes(screen)) {
    content = (
      <RadarScreen
        go={setScreen}
        openDriver={(d) => setOpenCard(d)}
        talkState={talkState}
        setTalkState={setTalkState}
        incomingFrom={incomingFrom?.id}
        incomingDriver={incomingFrom}
        drivers={drivers}
        onStop={() => setScreen('start')}
      />
    );
  } else if (screen === 'rooms') {
    content = <RoomsScreen go={setScreen} openRoom={(r) => { setActiveRoom(r); setScreen('room'); }} />;
  } else if (screen === 'room') {
    content = <RoomScreen go={setScreen} room={activeRoom} talkState={talkState} setTalkState={setTalkState} />;
  } else if (screen === 'settings') {
    content = (
      <SettingsScreen
        go={setScreen}
        handle={handle} car={carString} vehicle={vehicle}
        range={range} setRange={setRange}
        dnd={dnd} setDnd={setDnd}
        ptt={ptt} setPtt={setPtt}
        onShowSafety={() => setShowSafety(true)}
      />
    );
  }

  return (
    <IOSDevice width={390} height={844} dark={true}>
      <div className="rp-app">
        <GlobalStyles />
        {content}

        {openCard && liveScreens.includes(screen) && (
          <DriverCard
            driver={openCard}
            onClose={() => { setOpenCard(null); if (screen === 'card') setScreen('radar'); }}
            onFollow={() => setOpenCard(null)}
            onMute={() => setOpenCard(null)}
            onJoinRoom={() => { setOpenCard(null); setScreen('room'); }}
          />
        )}

        {showSafety && (
          <SafetyOverlay onDismiss={() => { setShowSafety(false); if (screen === 'driving') setScreen('radar'); }} />
        )}
      </div>
    </IOSDevice>
  );
}

// ─── Screen picker (lives outside the phone) ─────────────────
function Picker({ current, onPick }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const active = ref.current.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);
  return (
    <div className="picker" role="tablist" ref={ref}>
      {SCREEN_LIST.map(s => (
        <button key={s.id}
          role="tab"
          aria-selected={current === s.id}
          className={current === s.id ? 'active' : ''}
          onClick={() => onPick(s.id)}>{s.label}</button>
      ))}
    </div>
  );
}

function PickerPortal({ current, onPick }) {
  const [el, setEl] = React.useState(null);
  React.useEffect(() => { setEl(document.getElementById('picker-root')); }, []);
  if (!el) return null;
  return ReactDOM.createPortal(<Picker current={current} onPick={onPick} />, el);
}

ReactDOM.createRoot(document.getElementById('stage-root')).render(<Mount />);

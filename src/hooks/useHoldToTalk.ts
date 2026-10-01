/**
 * useHoldToTalk — React view of voiceController for a Hold to Talk button.
 *
 * Visual states:
 *   idle       ready to talk
 *   arming     pressed; the server is authorizing and audio is starting
 *   speaking   your voice is going out
 *   releasing  (kept for the button's release animation)
 *   receiving  someone is talking to you (half-duplex: wait for them)
 *   unavailable voice is off for now (server not configured, not a member)
 *
 * The same press flow serves the in-app button, the system PushToTalk UI,
 * headset buttons and CarPlay; see src/services/voice/transmissionMachine.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMicPermissionStatus, requestMicPermission } from '@/services/voice';
import { voiceController, type VoiceSnapshot } from '@/services/voice/voiceController';

export type HoldState = 'idle' | 'arming' | 'speaking' | 'releasing' | 'receiving' | 'unavailable';

export interface UseHoldToTalkResult {
  state: HoldState;
  onPressIn: () => void;
  onPressOut: () => void;
  /** True when the button is disabled (not live). */
  isDisabled: boolean;
  /** The microphone permission was denied. */
  micPermissionDenied: boolean;
  /** Real audio transport (false = talking-status-only build). */
  voiceConnected: boolean;
  /** Talking and hearing continue with RoadPing in the background. */
  backgroundVoice: boolean;
  voice: VoiceSnapshot;
}

export interface UseHoldToTalkOptions {
  /** Live session id; null disables the button. */
  liveSessionId: string | null;
  enabled: boolean;
}

export function holdStateFor(v: VoiceSnapshot): HoldState {
  if (v.tx.phase === 'live') return 'speaking';
  if (v.tx.phase !== 'idle') return 'arming';
  if (v.incoming.length > 0) return 'receiving';
  if (v.issue === 'voice_unavailable' || v.issue === 'not_member') return 'unavailable';
  return 'idle';
}

export function useHoldToTalk(opts: UseHoldToTalkOptions): UseHoldToTalkResult {
  const [voice, setVoice] = useState<VoiceSnapshot>(() => voiceController.snapshot());
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const heldRef = useRef(false);

  useEffect(() => voiceController.subscribe(setVoice), []);

  const enabled = opts.enabled && opts.liveSessionId !== null;

  const onPressIn = useCallback(() => {
    if (!enabled) return;
    heldRef.current = true;
    void (async () => {
      let perm = await getMicPermissionStatus();
      if (perm !== 'granted') perm = await requestMicPermission();
      if (perm !== 'granted') {
        heldRef.current = false;
        setMicPermissionDenied(true);
        return;
      }
      setMicPermissionDenied(false);
      // Released while the permission check ran: nothing to start.
      if (!heldRef.current) return;
      voiceController.press('app');
    })();
  }, [enabled]);

  const onPressOut = useCallback(() => {
    heldRef.current = false;
    voiceController.release('released');
  }, []);

  return {
    state: holdStateFor(voice),
    onPressIn,
    onPressOut,
    isDisabled: !enabled,
    micPermissionDenied,
    voiceConnected: voice.live && voice.mode !== 'indicator',
    backgroundVoice: voice.live && voice.mode === 'ptt',
    voice,
  };
}

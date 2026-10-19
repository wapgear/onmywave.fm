import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DJPlaybackSettings, LocalStateSnapshot, NewsTransitionSettings } from '../../../shared/types';
import { isNewsTransitionSettings } from '../../../shared/news-transitions';
import { unwrap } from '../../api';
import { confirmLocalState } from '../../local-state-cache';
import { useNewsRecovery } from '../../NewsRecovery';

type PlaybackPreferences = Pick<DJPlaybackSettings, 'everySongs' | 'keepOnSeek' | 'voiceVolume'>;
function useEdit<T>(write: (value: T) => Promise<LocalStateSnapshot>) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<T | null>(null);
  const inFlight = useRef(false);
  const save = useMutation({
    mutationFn: write,
    onMutate: () => client.cancelQueries({ queryKey: ['localState'], exact: true }),
    onSuccess: async (result) => {
      await confirmLocalState(client, result);
      await client.invalidateQueries({ queryKey: ['localState'], exact: true });
      setDraft(null);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  return {
    draft,
    save,
    change(value: T) {
      if (inFlight.current) return;
      save.reset();
      setDraft(value);
    },
    submit() {
      if (draft === null || inFlight.current) return;
      inFlight.current = true;
      save.mutate(draft);
    },
  };
}
function useSettingsEdits() {
  const recovery = useNewsRecovery();
  const currentRecovery = useRef(recovery.status.phase);
  useLayoutEffect(() => {
    currentRecovery.current = recovery.status.phase;
  }, [recovery.status.phase]);
  const playback = useEdit<PlaybackPreferences>(async (value) => {
    if (currentRecovery.current !== 'ready')
      throw new Error('News data is unavailable. Recover it before changing DJ playback.');
    if (!Number.isInteger(value.everySongs) || value.everySongs < 1 || value.everySongs > 100)
      throw new Error('Choose a whole number from 1 to 100 songs.');
    return unwrap(await window.wave.saveDJPlayback(value));
  });
  const transitions = useEdit<NewsTransitionSettings>(async (value) => {
    if (!isNewsTransitionSettings(value))
      throw new Error('Choose fade times from 0 to 5 seconds and pauses from 0 to 3 seconds.');
    return unwrap(await window.wave.saveNewsTransitions(value));
  });
  return { playback, transitions };
}
const SettingsEdits = createContext<ReturnType<typeof useSettingsEdits> | null>(null);
export function SettingsEditsProvider({ children }: { children: ReactNode }) {
  const edits = useSettingsEdits();
  return <SettingsEdits.Provider value={edits}>{children}</SettingsEdits.Provider>;
}
export function useGeneralSettingsEdits() {
  const edits = useContext(SettingsEdits);
  if (!edits) throw new Error('General settings require their app owner.');
  return edits;
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { isNewsTransitionSettings } from '../../../shared/news-transitions';
import { announcementLinesError } from '../../../shared/song-announcements';
import { isSongIntervalRange } from '../../../shared/song-intervals';
import type { DJPlaybackSettings, LocalStateSnapshot, NewsTransitionSettings } from '../../../shared/types';
import { unwrap } from '../../api';
import { confirmLocalState } from '../../local-state-cache';
import { useNewsRecovery } from '../../NewsRecovery';

type PlaybackPreferences = Pick<DJPlaybackSettings, 'everySongs' | 'everySongsMax' | 'keepOnSeek' | 'voiceVolume'>;

type AnnouncementPreferences = Pick<
  DJPlaybackSettings,
  'announceTracks' | 'announceEverySongs' | 'announceEverySongsMax' | 'announcementStyle' | 'announcementLines'
>;

function useEdit<T>(write: (value: T) => Promise<LocalStateSnapshot>) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<T | null>(null);
  const inFlight = useRef(false);
  const save = useMutation({
    mutationFn: write,
    onMutate: () => client.cancelQueries({ queryKey: ['localState'], exact: true }),
    onSuccess: async (result) => {
      await confirmLocalState(client, result);
      setDraft(null);
      void client.invalidateQueries({ queryKey: ['localState'], exact: true });
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

function useSettingsEditState() {
  const recovery = useNewsRecovery();
  const currentRecovery = useRef(recovery.status.phase);

  useLayoutEffect(() => {
    currentRecovery.current = recovery.status.phase;
  }, [recovery.status.phase]);

  const playback = useEdit<PlaybackPreferences>(async (value) => {
    if (currentRecovery.current !== 'ready')
      throw new Error('News data is unavailable. Recover it before changing DJ playback.');
    if (!isSongIntervalRange(value.everySongs, value.everySongsMax))
      throw new Error('Choose a news interval from 1 to 10 songs, with the minimum no greater than the maximum.');
    return unwrap(await window.wave.saveDJPlayback(value));
  });
  const announcements = useEdit<AnnouncementPreferences>(async (value) => {
    if (currentRecovery.current !== 'ready')
      throw new Error('News data is unavailable. Recover it before changing song announcements.');
    if (!isSongIntervalRange(value.announceEverySongs, value.announceEverySongsMax))
      throw new Error(
        'Choose an announcement interval from 1 to 10 songs, with the minimum no greater than the maximum.',
      );
    const linesError = announcementLinesError(value.announcementStyle, value.announcementLines);
    if (linesError) throw new Error(linesError);
    return unwrap(await window.wave.saveDJPlayback(value));
  });
  const transitions = useEdit<NewsTransitionSettings>(async (value) => {
    if (!isNewsTransitionSettings(value))
      throw new Error('Choose fade times from 0 to 5 seconds and pauses from 0 to 3 seconds.');
    return unwrap(await window.wave.saveNewsTransitions(value));
  });
  return { playback, announcements, transitions };
}

const SettingsEdits = createContext<ReturnType<typeof useSettingsEditState> | null>(null);

export function SettingsEditsProvider({ children }: { children: ReactNode }) {
  const edits = useSettingsEditState();

  return <SettingsEdits.Provider value={edits}>{children}</SettingsEdits.Provider>;
}

export function useSettingsEdits() {
  const edits = useContext(SettingsEdits);
  if (!edits) throw new Error('Settings edits require their app owner.');
  return edits;
}

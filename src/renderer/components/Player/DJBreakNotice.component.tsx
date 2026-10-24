import { useState } from 'react';
import { createPortal } from 'react-dom';

import { useNewsRecovery } from '../../NewsRecovery';
import { usePlayer } from '../../player';

export function DJBreakNotice({ target }: { target: HTMLDivElement | null }) {
  const player = usePlayer();
  const recovery = useNewsRecovery();
  const knownSpeech =
    !!player.activeNews &&
    player.lastNews?.news.id === player.activeNews.id &&
    (player.newsPhase === 'speaking' ||
      player.newsPhase === 'paused' ||
      (player.newsPhase === 'tail' && player.lastNews.status === 'completed'));
  const showNewsControls = recovery.status.phase === 'ready' || knownSpeech;
  const breakStatus = {
    idle: '',
    waiting: 'DJ break scheduled for the end of this song.',
    fading: 'Lowering the music for your DJ.',
    'lead-in': 'Your DJ starts shortly.',
    speaking: 'Your DJ is on air.',
    tail: 'Your DJ has finished.',
    paused: 'DJ break paused. Resume when you’re ready.',
  }[player.newsPhase];
  const [breakFocus, setBreakFocus] = useState<{
    element: HTMLButtonElement;
    runId: number;
    action: 'toggle' | 'stop';
    ended?: 'cancelled' | 'stopped';
  } | null>(null);
  const ownsBreakFocus = breakFocus !== null && document.activeElement === breakFocus.element;
  const activeRun = showNewsControls && player.newsPhase !== 'idle' ? player.newsRunId : undefined;
  const keepEndedBreak =
    target !== null && breakFocus !== null && target.contains(breakFocus.element) && activeRun === undefined;
  const visibleRuns = [
    ...((ownsBreakFocus || keepEndedBreak) && breakFocus && breakFocus.runId !== activeRun ? [breakFocus.runId] : []),
    ...(activeRun !== undefined ? [activeRun] : []),
  ];
  const notice = (
    <>
      {visibleRuns.map((runId) => {
        const current = runId === activeRun;
        const terminal =
          activeRun !== undefined
            ? 'Previous DJ break ended.'
            : breakFocus?.ended === 'cancelled'
              ? 'Scheduled DJ break cancelled.'
              : breakFocus?.ended === 'stopped'
                ? 'DJ break stopped.'
                : 'DJ break ended.';
        const actions: ('toggle' | 'stop')[] = current ? ['toggle', 'stop'] : breakFocus ? [breakFocus.action] : [];

        return (
          <div key={runId} className="radio-speaking">
            <span role="status">{current ? breakStatus : terminal}</span>
            {actions.map((action) => (
              <button
                key={action}
                aria-disabled={!current || undefined}
                onFocus={(event) => setBreakFocus({ element: event.currentTarget, runId, action })}
                onBlur={(event) => {
                  const element = event.currentTarget;
                  // Keep sidebar feedback in place so blur does not move the next pointer target.
                  if (!target) setBreakFocus((value) => (value?.element === element ? null : value));
                }}
                onClick={() => {
                  if (!current) return;
                  const handled = player.controlNews(runId, action);
                  if (handled && action === 'stop')
                    setBreakFocus((value) =>
                      value?.runId === runId
                        ? { ...value, ended: player.newsPhase === 'waiting' ? 'cancelled' : 'stopped' }
                        : value,
                    );
                }}
              >
                {!current
                  ? activeRun !== undefined
                    ? 'Previous break ended'
                    : breakFocus?.ended === 'cancelled'
                      ? 'Break cancelled'
                      : breakFocus?.ended === 'stopped'
                        ? 'Break stopped'
                        : 'Break ended'
                  : action === 'stop'
                    ? player.newsPhase === 'waiting'
                      ? 'Cancel break'
                      : 'Stop DJ'
                    : player.newsPhase === 'paused' || (player.newsPhase === 'waiting' && !player.requestedPlaying)
                      ? 'Resume'
                      : 'Pause'}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );

  return target ? createPortal(notice, target) : notice;
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Radio, Settings, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { newsPreparationStatus } from '../../../shared/news-preparation-status';
import type { DJPlaybackSettings, NewsBreak } from '../../../shared/types';
import { unwrap } from '../../api';
import { useDJPlayback } from '../../dj-playback';
import { useNewsRecovery } from '../../NewsRecovery';
import { usePlayer } from '../../player';
import { useRetryFocus } from '../../useRetryFocus';
import { IconButton } from '../IconButton/IconButton.component';
import { InfoHelp } from '../InfoHelp/InfoHelp.component';
import { ErrorNotice } from '../Shared';
import type { DJPopoverProps } from './DJPopover.types';

import './DJPopover.styles.css';

export function DJPopover({ openRoom, openSettings }: DJPopoverProps) {
  const player = usePlayer();
  const automation = useDJPlayback();
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const suppressReturnFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const profileInput = useRef<HTMLSelectElement>(null);
  const profileSummary = useRef<HTMLElement>(null);
  const [scheduleFocus, setScheduleFocus] = useState<HTMLButtonElement | null>(null);
  const [profileFocus, setProfileFocus] = useState<HTMLSelectElement | null>(null);
  const [poolRetryFocus, setPoolRetryFocus] = useState<HTMLButtonElement | null>(null);
  const ownsScheduleFocus = open && scheduleFocus !== null && document.activeElement === scheduleFocus;
  const ownsProfileFocus = open && profileFocus !== null && document.activeElement === profileFocus;
  const ownsPoolRetryFocus = open && poolRetryFocus !== null && document.activeElement === poolRetryFocus;
  const retryFocus = useRetryFocus({
    ownerKey: `dj-controls:${open}:${recoveryReady}`,
    target: () => (profileInput.current?.checkVisibility() ? profileInput.current : profileSummary.current),
    canFocusSuccess: () => open && recoveryReady && automation.state.isSuccess && !automation.state.isFetching,
  });
  const preparationState = useQuery({
    queryKey: ['localState'],
    queryFn: async () => unwrap(await window.wave.getLocalState()),
    enabled: open && recoveryReady,
    refetchInterval: open && recoveryReady ? 10_000 : false,
  });
  const knownSpeech =
    !!player.activeNews &&
    player.lastNews?.news.id === player.activeNews.id &&
    (player.newsPhase === 'speaking' ||
      player.newsPhase === 'paused' ||
      (player.newsPhase === 'tail' && player.lastNews.status === 'completed'));
  const active = knownSpeech || (recoveryReady && automation.settings.enabled);
  const heardStatus =
    player.lastNews?.status === 'completed'
      ? 'Played to the end'
      : player.lastNews?.status === 'interrupted'
        ? 'Interrupted'
        : player.newsPhase === 'waiting' && player.activeNews?.id === player.lastNews?.news.id
          ? 'Waiting for the song ending'
          : player.newsPhase === 'paused'
            ? 'Paused'
            : 'On air';
  const phaseLabels = {
    idle: 'Enabled',
    waiting: 'Scheduled',
    fading: 'Fading music',
    'lead-in': 'Starting',
    speaking: 'On air',
    tail: 'Returning to music',
    paused: 'Paused',
  };
  const status =
    !recoveryReady && !knownSpeech
      ? recovery.status.phase === 'recovering'
        ? 'Recovering news'
        : 'News unavailable'
      : player.newsLoading
        ? 'Loading'
        : player.newsPhase !== 'idle'
          ? phaseLabels[player.newsPhase]
          : automation.error
            ? 'Needs attention'
            : automation.waitingForPreparation
              ? 'No saved news ready'
              : automation.preparing
                ? 'Checking pool'
                : automation.pending
                  ? 'Ready'
                  : automation.settings.enabled
                    ? player.requestedPlaying
                      ? 'Enabled'
                      : 'Waiting for music'
                    : 'Off';
  const upcoming = player.activeNews ?? (recoveryReady ? automation.pending : null);
  const preparationRoom = automation.settings.roomId
    ? preparationState.data?.roomProfiles.find((room) => room.id === automation.settings.roomId)
    : undefined;
  const editingRoom = preparationState.data?.roomProfiles.find(
    (room) => room.id === preparationState.data?.activeRoomProfileId,
  );
  const preparation = preparationRoom ? newsPreparationStatus(preparationRoom) : null;
  const playbackSetupIssues = automation.room
    ? [
        ...(!automation.state.data?.djs.some((dj) => dj.id === automation.room?.room.djId)
          ? ['choose a saved DJ']
          : []),
        ...(!automation.room.room.sourceIds.length
          ? ['select at least one news source']
          : automation.room.room.sourceIds.some((id) => !automation.sources.some((source) => source.id === id))
            ? ['review unavailable news sources']
            : []),
        ...(!automation.room.mood.trim() ? ['add a mood'] : []),
      ]
    : [];
  const playbackSetupMissing = playbackSetupIssues.length > 0;
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  function position() {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    popup.current.style.right = `${Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - popup.current.offsetWidth - 12))}px`;
    popup.current.style.bottom = `${window.innerHeight - rect.top + 12}px`;
    popup.current.style.maxHeight = `${Math.max(120, rect.top - 24)}px`;
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open]);

  function navigate(action: (source: HTMLButtonElement | null) => void) {
    suppressReturnFocus.current = true;
    popup.current?.hidePopover();
    action(trigger.current);
  }
  const updating = automation.update.isPending;
  const unconfirmed = automation.unconfirmedUpdate;
  const unconfirmedEnabled = unconfirmed?.enabled;
  const canDisable = automation.settings.enabled || unconfirmedEnabled === true;
  const scheduleUnavailable =
    !recoveryReady ||
    updating ||
    (!!unconfirmed && !canDisable) ||
    (!canDisable && (!automation.room || playbackSetupMissing));
  const profileUnavailable = !recoveryReady || updating || !!unconfirmed || !automation.state.data;
  const updateVariables = automation.update.variables;
  const updatingSchedule = updating && updateVariables?.enabled !== undefined;
  const updatingProfile = updating && updateVariables?.roomId !== undefined;
  const unconfirmedSchedule = unconfirmed?.enabled !== undefined;
  const unconfirmedProfile = unconfirmed?.roomId !== undefined;
  const scheduleError =
    automation.update.error && (updateVariables?.enabled !== undefined || unconfirmedSchedule)
      ? automation.update.error
      : null;
  const profileError =
    automation.update.error && (updateVariables?.roomId !== undefined || unconfirmedProfile)
      ? automation.update.error
      : null;
  const unresolvedMessage = (patch: Partial<DJPlaybackSettings>) => {
    const changes = [
      patch.enabled !== undefined ? `DJ requested ${patch.enabled ? 'on' : 'off'}` : null,
      patch.roomId !== undefined
        ? `profile requested ${automation.rooms.find((room) => room.id === patch.roomId)?.name ?? 'none'}`
        : null,
    ]
      .filter(Boolean)
      .join('; ');
    return `Saved change not confirmed (${changes}). Refresh DJ playback status before changing it again.`;
  };
  const retryPhase = automation.retryPhase;
  const retryWaiting = retryPhase === 'queued' || retryPhase === 'checking';
  const retryComplete = retryPhase === 'ready' || retryPhase === 'empty';
  const showPoolRetry = !!automation.error || !!retryPhase || ownsPoolRetryFocus;
  const showPoolRetryButton = !!automation.error || ownsPoolRetryFocus;
  const retryEnded = ownsPoolRetryFocus && !automation.error && !retryPhase;
  const poolRetryUnavailable = !automation.room || retryWaiting || retryComplete || retryEnded;
  function changePlayback(patch: { enabled: boolean } | { roomId: string | null }) {
    if (updating || (unconfirmed && (!('enabled' in patch) || patch.enabled !== false))) return;
    if ('enabled' in patch && patch.enabled && (!recoveryReady || !automation.room || playbackSetupMissing)) return;
    if ('roomId' in patch && !recoveryReady) return;
    automation.updatePlayback(patch);
  }
  function story(news: NewsBreak) {
    return (
      <div className="dj-story">
        <p>{news.script}</p>
        {news.articles.length ? (
          <ul>
            {news.articles.map((article) => (
              <li key={article.id}>
                <button className="dj-source-link" onClick={() => source.mutate(article.url)}>
                  <span>{article.title}</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </button>
                <small>
                  {article.source}
                  {Number.isFinite(Date.parse(article.publishedAt ?? ''))
                    ? ` · ${new Date(article.publishedAt!).toLocaleDateString()}`
                    : ' · Date unavailable'}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dj-hint">No source references saved for this recording.</p>
        )}
        {!!news.warnings.length && (
          <ul className="dj-hint dj-preparation-notes" aria-label="Preparation notes">
            {news.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        id="player-dj-controls"
        className={`player-dj ${active ? 'is-active' : ''}`}
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`DJ: ${status}. Open DJ controls`}
        onClick={position}
      >
        <Radio size={17} />
        <span>DJ</span>
        <span className="dj-button-status">{status}</span>
      </button>
      <div
        id={id}
        ref={popup}
        className="popover-surface dj-popover"
        popover="auto"
        role="dialog"
        aria-label="DJ controls"
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          const opening = event.newState === 'open';
          setOpen(opening);
          if (opening) {
            suppressReturnFocus.current = false;
            setScheduleFocus(null);
            setProfileFocus(null);
            setPoolRetryFocus(null);
            position();
            popup.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            popup.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
          } else {
            setScheduleFocus(null);
            setProfileFocus(null);
            setPoolRetryFocus(null);
            if (suppressReturnFocus.current) suppressReturnFocus.current = false;
            else if (popup.current?.contains(document.activeElement) || document.activeElement === document.body)
              trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        <header>
          <div>
            <h2>DJ breaks</h2>
            <span className={`dj-status ${active ? 'is-active' : ''}`}>
              {status === 'Scheduled'
                ? 'Scheduled near track end'
                : status === 'Loading'
                  ? 'Loading news audio…'
                  : status}
            </span>
          </div>
          <div className="dj-header-actions">
            <InfoHelp label="About DJ breaks">
              <p>
                The DJ checks for matching saved news every {automation.settings.everySongs}{' '}
                {automation.settings.everySongs === 1 ? 'song' : 'songs'}. Skips do not count. Music continues when
                nothing qualifies or the song ending is unsuitable.
              </p>
              <p>
                Saved recordings play without provider keys. Preparing new news in News bucket → Settings uses provider
                credits.
              </p>
              <section aria-labelledby={`${id}-preparation-title`} className="dj-preparation-status">
                <h3 id={`${id}-preparation-title`}>
                  Automatic news preparation{preparationRoom ? ` · ${preparationRoom.name}` : ''}
                </h3>
                {!recoveryReady && (
                  <p className="dj-hint">Preparation status is unavailable until news data is recovered.</p>
                )}
                {recoveryReady && preparationState.isPending && (
                  <p className="dj-hint" role="status">
                    Checking preparation status…
                  </p>
                )}
                {recoveryReady && preparationState.error && !preparationState.data && (
                  <p className="dj-hint" role="alert">
                    Preparation status could not be loaded. Open News bucket to check it.
                  </p>
                )}
                {recoveryReady && preparationState.isRefetchError && preparationState.data && (
                  <p className="dj-hint" role="status">
                    Could not refresh; showing the last saved status.
                  </p>
                )}
                {recoveryReady &&
                  preparationState.data &&
                  !automation.settings.roomId &&
                  automation.rooms.length > 0 && (
                    <p className="dj-hint">Choose a news profile under Current DJ to see its preparation status.</p>
                  )}
                {recoveryReady && preparationState.data && automation.settings.roomId && !preparationRoom && (
                  <p className="dj-hint">The selected news profile is unavailable. Choose another under Current DJ.</p>
                )}
                {recoveryReady && preparation && (
                  <p className="dj-hint">
                    {preparationState.error ? (
                      <>Last saved automatic setting: {preparationRoom?.workflowDraft.newsEnabled ? 'on' : 'off'}.</>
                    ) : (
                      <>
                        <strong>{preparation.label}.</strong> {preparation.detail}
                      </>
                    )}
                  </p>
                )}
                {preparationRoom && editingRoom && preparationRoom.id !== editingRoom.id && (
                  <p className="dj-hint">
                    News bucket currently shows {editingRoom.name}. Choose {preparationRoom.name} in its Setup profile
                    menu to edit the preparation shown here.
                  </p>
                )}
              </section>
            </InfoHelp>
            <IconButton popoverTarget={id} popoverTargetAction="hide" label="Close DJ controls">
              <X size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </header>
        {!recoveryReady && !knownSpeech && (
          <p className="dj-hint">DJ status and schedule controls are unavailable until news data is recovered.</p>
        )}
        <section className="dj-control">
          <div>
            <strong>DJ schedule</strong>
            <p className="dj-hint">
              Every {automation.settings.everySongs} {automation.settings.everySongs === 1 ? 'song' : 'songs'}
            </p>
          </div>
          <button
            className={canDisable ? '' : 'primary'}
            aria-describedby={playbackSetupMissing ? `${id}-playback-help` : undefined}
            disabled={scheduleUnavailable && !ownsScheduleFocus}
            aria-disabled={scheduleUnavailable || undefined}
            aria-busy={updatingSchedule || undefined}
            onFocus={(event) => setScheduleFocus(event.currentTarget)}
            onBlur={() => setScheduleFocus(null)}
            onClick={() => {
              if (scheduleUnavailable) return;
              changePlayback({ enabled: !canDisable });
            }}
          >
            {updatingSchedule
              ? updateVariables?.enabled
                ? 'Enabling DJ…'
                : 'Disabling DJ…'
              : canDisable
                ? 'Disable DJ'
                : 'Enable DJ'}
          </button>
        </section>
        {updatingSchedule && (
          <p className="dj-hint dj-action-status" role="status">
            Requested DJ setting: {updateVariables?.enabled ? 'on' : 'off'}. Last confirmed saved setting:{' '}
            {automation.settings.enabled ? 'on' : 'off'}.
          </p>
        )}
        {unconfirmedSchedule && unconfirmed && (
          <div className="dj-action-feedback">
            <p className="dj-hint" role="status">
              {unresolvedMessage(unconfirmed)}
            </p>
            <ErrorNotice
              error={
                automation.update.error ??
                new Error('The DJ setting was saved, but its current status could not be confirmed.')
              }
              retryRef={retryFocus.retryRef}
              retrying={automation.state.isFetching}
              retry={() => retryFocus.retry(() => automation.refreshPlaybackStatus())}
            />
          </div>
        )}
        {!unconfirmed && scheduleError && <ErrorNotice error={scheduleError} />}
        {playbackSetupMissing && automation.room && (
          <p id={`${id}-playback-help`} className="dj-hint" role="status">
            Finish setup for {automation.room.name} in News bucket → Settings: {playbackSetupIssues.join(', ')}.
          </p>
        )}
        {automation.settings.enabled && !automation.preparing && !upcoming && !automation.error && (
          <p className="dj-automation-note">
            Next check in {automation.songsUntilBreak} {automation.songsUntilBreak === 1 ? 'song' : 'songs'}.
          </p>
        )}
        {showPoolRetry && (
          <div className="dj-pool-retry">
            {automation.error && !retryWaiting && !retryComplete ? (
              <span role="alert">{automation.error}</span>
            ) : (
              automation.retryMessage && <span role="status">{automation.retryMessage}</span>
            )}
            {(automation.room || ownsPoolRetryFocus) && showPoolRetryButton && (
              <button
                className="dj-pool-retry-button"
                disabled={poolRetryUnavailable && !ownsPoolRetryFocus}
                aria-disabled={poolRetryUnavailable || undefined}
                aria-busy={retryWaiting || undefined}
                onFocus={(event) => setPoolRetryFocus(event.currentTarget)}
                onBlur={() => setPoolRetryFocus(null)}
                onClick={() => {
                  if (!poolRetryUnavailable && automation.error) automation.retry();
                }}
              >
                {retryEnded || !automation.room
                  ? 'Pool check ended'
                  : retryWaiting
                    ? retryPhase === 'queued'
                      ? 'Pool check queued'
                      : 'Checking saved news…'
                    : retryPhase === 'ready'
                      ? 'Saved news ready'
                      : retryPhase === 'empty'
                        ? 'No eligible saved news'
                        : 'Retry saved pool check'}
              </button>
            )}
          </div>
        )}
        <ErrorNotice error={player.error ? new Error(player.error) : null} />
        <section>
          <details className="dj-profile-details">
            <summary ref={profileSummary}>
              Current DJ ·{' '}
              {automation.state.data?.djs.find((dj) => dj.id === automation.room?.room.djId)?.name ?? 'Not selected'}
            </summary>
            <label className="dj-take-label" htmlFor={`${id}-room`}>
              News profile
            </label>
            <select
              ref={profileInput}
              id={`${id}-room`}
              value={automation.room?.id ?? ''}
              disabled={profileUnavailable && !ownsProfileFocus}
              aria-disabled={profileUnavailable || undefined}
              aria-busy={updatingProfile || undefined}
              onFocus={(event) => setProfileFocus(event.currentTarget)}
              onBlur={() => setProfileFocus(null)}
              onPointerDown={(event) => {
                if (profileUnavailable) event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (
                  profileUnavailable &&
                  [' ', 'Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
                )
                  event.preventDefault();
              }}
              onChange={(event) => {
                if (!profileUnavailable) changePlayback({ roomId: event.target.value || null });
              }}
            >
              <option value="">Choose a news profile</option>
              {automation.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {recoveryReady && automation.room ? (
              <p className="dj-hint">
                {automation.state.data?.djs.find((dj) => dj.id === automation.room?.room.djId)?.name ??
                  'Choose a host in the News bucket'}{' '}
                · {automation.sources.map((value) => value.name).join(', ') || 'No sources selected'}
              </p>
            ) : (
              recoveryReady &&
              automation.state.data && (
                <p className="dj-hint">
                  {automation.rooms.length
                    ? 'Choose a news profile above for DJ breaks.'
                    : 'No news profiles are available. Make a profile available in News bucket → Advanced room options.'}
                </p>
              )
            )}
          </details>
          {updatingProfile && (
            <p className="dj-hint dj-action-status" role="status">
              Requested profile: {automation.rooms.find((room) => room.id === updateVariables?.roomId)?.name ?? 'none'}.
              Last confirmed saved profile:{' '}
              {automation.rooms.find((room) => room.id === automation.settings.roomId)?.name ?? 'none'}.
            </p>
          )}
          {unconfirmedProfile && unconfirmed && (
            <div className="dj-action-feedback">
              <p className="dj-hint" role="status">
                {unresolvedMessage(unconfirmed)}
              </p>
              <ErrorNotice
                error={
                  automation.update.error ??
                  new Error('The profile change was saved, but its current status could not be confirmed.')
                }
                retryRef={retryFocus.retryRef}
                retrying={automation.state.isFetching}
                retry={() => retryFocus.retry(() => automation.refreshPlaybackStatus())}
              />
            </div>
          )}
          {!unconfirmed && profileError && <ErrorNotice error={profileError} />}
          {recoveryReady && automation.state.isPending && (
            <p className="dj-hint" role="status">
              Loading news profiles…
            </p>
          )}
          {recoveryReady && !unconfirmed && !automation.update.error && (
            <ErrorNotice
              error={automation.state.error}
              retryRef={retryFocus.retryRef}
              retrying={automation.state.isFetching}
              retry={() => retryFocus.retry(() => automation.refreshPlaybackStatus())}
            />
          )}
        </section>
        {upcoming && (
          <details className="dj-news-details">
            <summary>
              {player.newsPhase !== 'idle' && player.newsPhase !== 'waiting' ? 'Current news' : 'Upcoming news'}
            </summary>
            {story(upcoming)}
          </details>
        )}
        {player.lastNews && (
          <details className="dj-news-details">
            <summary>Last heard · {heardStatus}</summary>
            <p className="dj-hint">{new Date(player.lastNews.startedAt).toLocaleTimeString()}</p>
            {story(player.lastNews.news)}
          </details>
        )}
        <ErrorNotice error={source.error} />
        <footer>
          <button onClick={() => navigate(openRoom)}>
            <Radio size={15} />
            News bucket
          </button>
          <button onClick={() => navigate(openSettings)}>
            <Settings size={15} />
            DJ settings
          </button>
        </footer>
      </div>
    </>
  );
}

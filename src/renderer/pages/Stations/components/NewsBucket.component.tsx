import { ExternalLink, Newspaper, Radio, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { eligibleNewsTakes } from '../../../../shared/news-pool';
import { newsPreparationStatus } from '../../../../shared/news-preparation-status';
import type { NewsArticle, PreparedNewsScript, PreparedNewsTake, ReviewedNewsArticle } from '../../../../shared/types';
import { ErrorNotice, duration } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import { useSavedNewsAudition } from './hooks/useSavedNewsAudition';
import type { NewsBucketProps } from './NewsBucket.types';

import './NewsBucket.styles.css';

type StorySelection = { kind: 'take'; id: string } | { kind: 'script'; id: string } | { kind: 'reviewed'; id: string };

const selectionKey = (selection: StorySelection) => `${selection.kind}:${selection.id}`;

export function NewsBucket({
  library,
  localState,
  automation,
  profileStatusUnknown,
  savedNewsStale,
  openSource,
  openPreparation,
  active = true,
  openSetup,
  configureDJ,
  openSavedAudio,
}: NewsBucketProps) {
  const player = usePlayer();
  const [view, setView] = useState<'simple' | 'advanced'>('simple');
  const [listSection, setListSection] = useState<'ready' | 'heard' | 'scripts' | 'reviewed'>('ready');
  const [historyLimit, setHistoryLimit] = useState(25);
  const invokingRow = useRef<HTMLButtonElement | null>(null);
  const invokingSection = useRef<typeof listSection | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const historyList = useRef<HTMLUListElement>(null);
  const revealHistory = useRef<{ button: HTMLButtonElement; key: string } | null>(null);
  const pageProfile = localState.roomProfiles.find((room) => room.id === localState.activeRoomProfileId);
  const eligible = pageProfile ? eligibleNewsTakes(library.takes, localState, pageProfile.id) : [];
  const [selection, setSelection] = useState<StorySelection | null>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1120px)').matches && eligible[0]
      ? { kind: 'take', id: eligible[0].id }
      : null,
  );
  const selectedTake = selection?.kind === 'take' ? library.takes.find((take) => take.id === selection.id) : undefined;
  const auditionActive = active && selection?.kind === 'take' && !!selectedTake?.available;
  const audition = useSavedNewsAudition({ active: auditionActive });
  const stopAudition = audition.stop;

  const closeInspector = useCallback(() => {
    stopAudition();
    setSelection(null);
    if (invokingRow.current && !invokingRow.current.isConnected && invokingSection.current)
      setListSection(invokingSection.current);
    requestAnimationFrame(() => {
      const selectedKey = selection ? selectionKey(selection) : '';
      const row = [...document.querySelectorAll<HTMLButtonElement>('[data-story-key]')].find(
        (button) => button.dataset.storyKey === selectedKey,
      );
      const target = invokingRow.current?.isConnected ? invokingRow.current : row;
      target?.focus({ preventScroll: true });
    });
  }, [selection, stopAudition]);

  useLayoutEffect(() => {
    const pending = revealHistory.current;
    revealHistory.current = null;
    if (!pending) return;
    const activeElement = document.activeElement;
    if (
      (activeElement !== pending.button && !(activeElement === document.body && !pending.button.isConnected)) ||
      document.visibilityState !== 'visible' ||
      !document.hasFocus() ||
      document.querySelector('dialog[open], :popover-open')
    )
      return;
    const target = [...(historyList.current?.querySelectorAll<HTMLButtonElement>('[data-reviewed-key]') ?? [])].find(
      (button) => button.dataset.reviewedKey === pending.key,
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [historyLimit]);

  useEffect(() => {
    if (!selection || !active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (document.querySelector('dialog[open], :popover-open, .side-drawer')) return;
      if (
        target instanceof HTMLElement &&
        (target.closest('dialog[open], [role="dialog"], [role="menu"], [role="listbox"], :popover-open') ||
          target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      event.preventDefault();
      closeInspector();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, closeInspector, selection]);

  const scheduled = player.newsPhase === 'waiting' ? player.activeNews : null;
  const onAir = player.newsPhase === 'speaking' ? player.activeNews : null;
  const runtimePending =
    automation.settings.enabled && automation.room && automation.pending && player.newsPhase === 'idle'
      ? automation.pending
      : null;
  const currentBreak = player.activeNews && player.newsPhase !== 'idle' ? player.activeNews : runtimePending;
  const preparation = pageProfile ? newsPreparationStatus(pageProfile) : null;
  const scriptOnly = library.scripts
    .filter((script) => !library.takes.some((take) => take.scriptId === script.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const reviewed = [...(library.reviewedArticles ?? [])].sort(
    (a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt),
  );
  const visibleReviewed = reviewed.slice(0, historyLimit);
  const nextHistoryCount = Math.min(25, reviewed.length - visibleReviewed.length);
  const runtimeDJ = localState.djs.find((dj) => dj.id === automation.room?.room.djId);
  const profileDJ = localState.djs.find((dj) => dj.id === pageProfile?.room.djId);
  const profileSources =
    pageProfile?.room.sourceIds.map(
      (id) => localState.sources.find((source) => source.id === id)?.name ?? 'Unavailable source',
    ) ?? [];
  const runtimeDiffersFromPage = !!automation.room && pageProfile?.id !== automation.room.id;
  const phaseLabel =
    player.newsPhase === 'speaking'
      ? 'On air'
      : player.newsPhase === 'fading'
        ? 'Lowering music'
        : player.newsPhase === 'lead-in'
          ? 'Starting DJ break'
          : player.newsPhase === 'tail'
            ? 'Returning to music'
            : player.newsPhase === 'paused'
              ? player.lastNews?.news.id === player.activeNews?.id
                ? 'DJ break paused'
                : 'Break paused before speech'
              : scheduled
                ? 'Scheduled for this song'
                : player.newsLoading
                  ? 'Loading audio'
                  : automation.error
                    ? 'Needs attention'
                    : automation.settings.enabled && automation.preparing
                      ? 'Checking the ready pool'
                      : runtimePending
                        ? 'Ready for the next suitable song'
                        : automation.settings.enabled
                          ? 'Waiting for the next check'
                          : 'DJ playback is off';

  function articleSource(article: NewsArticle) {
    let domain = '';
    try {
      domain = new URL(article.url).hostname.replace(/^www\./u, '');
    } catch {
      /* Some saved references may have an invalid URL. */
    }
    const published = Number.isFinite(Date.parse(article.publishedAt ?? ''))
      ? new Date(article.publishedAt!).toLocaleDateString()
      : 'Date unavailable';
    return `${article.source}${domain ? ` · ${domain}` : ''} · ${published}`;
  }

  function selectStory(next: StorySelection, button: HTMLButtonElement) {
    if (selection && selectionKey(selection) === selectionKey(next)) {
      closeInspector();
      return;
    }
    stopAudition();
    invokingRow.current = button;
    invokingSection.current = listSection;
    setSelection(next);
    requestAnimationFrame(() => {
      closeButton.current?.focus({ preventScroll: true });
      closeButton.current?.closest('aside')?.scrollIntoView({ block: 'nearest' });
    });
  }

  function storyButton(selectionValue: StorySelection, title: string, meta: string, status?: string) {
    const isSelected = selection !== null && selectionKey(selection) === selectionKey(selectionValue);

    return (
      <button
        className={`news-bucket-item ${isSelected ? 'is-selected' : ''}`}
        key={selectionKey(selectionValue)}
        data-story-key={selectionKey(selectionValue)}
        aria-pressed={isSelected}
        aria-controls={selection ? 'news-story-inspector' : undefined}
        onClick={(event) => selectStory(selectionValue, event.currentTarget)}
      >
        <span className="news-bucket-item-main">
          <strong>{title}</strong>
          <span>{meta}</span>
        </span>
        {status && <span className="news-bucket-item-status">{status}</span>}
      </button>
    );
  }

  function renderArticles(articles: NewsArticle[]) {
    return articles.length ? (
      <ul className="news-bucket-sources">
        {articles.map((article) => (
          <li key={`${article.id}-${article.url}`}>
            <button onClick={() => openSource(article.url)}>
              {article.title}
              <ExternalLink size={13} aria-hidden="true" />
            </button>
            <span>{articleSource(article)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="news-bucket-muted">No source links were saved with this story.</p>
    );
  }

  function renderNotes(warnings: string[]) {
    return warnings.length ? (
      <ul className="news-bucket-preparation-notes" aria-label="Preparation notes">
        {warnings.map((warning, index) => (
          <li key={`${warning}-${index}`}>{warning}</li>
        ))}
      </ul>
    ) : null;
  }

  function renderedTake(take: PreparedNewsTake) {
    const current = audition.audition?.id === take.id ? audition.audition : null;

    return (
      <>
        <span className="eyebrow news-bucket-preview-label">Spoken preview</span>
        <p className="news-bucket-inspector-script">{take.script}</p>
        <p className="news-bucket-inspector-meta">
          {take.renderingDJ.name} ·{' '}
          {[...new Set(take.articles.map((article) => article.source))].join(', ') || 'Source unavailable'} · Saved{' '}
          {new Date(take.createdAt).toLocaleDateString()}
          {take.deliveryState?.status === 'played'
            ? ` · Played ${take.deliveryState.playedAt ? new Date(take.deliveryState.playedAt).toLocaleString() : ''}`
            : take.deliveryState?.status === 'started'
              ? ' · Started; playback completion not recorded'
              : ''}
        </p>
        {take.available ? (
          <div className="news-bucket-audition">
            <button
              onClick={() => void audition.listen(take)}
              aria-label={
                current?.phase === 'loading'
                  ? 'Cancel loading audition'
                  : current?.phase === 'playing'
                    ? 'Pause audition'
                    : current?.phase === 'paused'
                      ? 'Resume audition'
                      : `Listen to ${take.renderingDJ.name}'s saved story`
              }
            >
              {current?.phase === 'loading'
                ? 'Loading…'
                : current?.phase === 'playing'
                  ? 'Pause'
                  : current?.phase === 'paused'
                    ? 'Resume'
                    : 'Listen'}
            </button>
            {current && (
              <button className="room-link" onClick={stopAudition}>
                Stop
              </button>
            )}
            {current && current.phase !== 'loading' && (
              <span>
                {duration(current.position)}
                {audition.durations[take.id] ? ` / ${duration(audition.durations[take.id])}` : ''}
              </span>
            )}
          </div>
        ) : (
          <p className="news-bucket-muted">The saved audio file is unavailable. The script and sources remain saved.</p>
        )}
        <details className="news-bucket-detail-disclosure">
          <summary>
            Sources and notes
            {take.warnings.length
              ? ` · ${take.warnings.length} preparation ${take.warnings.length === 1 ? 'note' : 'notes'}`
              : ''}
          </summary>
          {renderArticles(take.articles)}
          {renderNotes(take.warnings)}
        </details>
        <details className="news-bucket-detail-disclosure">
          <summary>Why this story</summary>
          <p className="news-bucket-muted">{take.selection?.reason ?? 'Selection reason was not recorded.'}</p>
        </details>
      </>
    );
  }

  function renderScript(script: PreparedNewsScript) {
    const request = library.requests.find((value) => value.requestId === script.requestId);
    const origin =
      request?.origin?.kind === 'automatic'
        ? 'Automatic'
        : request?.origin?.kind === 'manual'
          ? 'Manual'
          : 'Origin unavailable';
    const profile =
      request?.origin?.profileName ?? script.provenance.roomName ?? script.provenance.roomId ?? 'Profile unavailable';

    return (
      <>
        <p className="news-bucket-inspector-script">{script.script}</p>
        <p className="news-bucket-inspector-meta">
          {origin} · {request?.status ?? 'Saved script'} · {profile} · Saved{' '}
          {new Date(script.createdAt).toLocaleDateString()} · No saved audio
        </p>
        <details className="news-bucket-detail-disclosure">
          <summary>
            Sources and notes
            {script.warnings.length
              ? ` · ${script.warnings.length} preparation ${script.warnings.length === 1 ? 'note' : 'notes'}`
              : ''}
          </summary>
          {renderArticles(script.articles)}
          {renderNotes(script.warnings)}
        </details>
      </>
    );
  }

  function renderReviewed(article: ReviewedNewsArticle) {
    const outcome =
      article.status === 'interrupted'
        ? 'Review interrupted'
        : article.status === 'submitted'
          ? 'Submitted for review'
          : article.outcome === 'selected'
            ? 'Selected for a briefing'
            : 'Reviewed · not selected';

    return (
      <>
        <p className="news-bucket-inspector-script">{article.title}</p>
        <p className="news-bucket-inspector-meta">
          {outcome} · Reviewed {new Date(article.reviewedAt).toLocaleString()}
        </p>
        <details className="news-bucket-detail-disclosure">
          <summary>{article.status === 'reviewed' ? `Review outcome · ${outcome}` : outcome}</summary>
          {renderArticles([article])}
        </details>
        {article.reason && <p className="news-bucket-muted">{article.reason}</p>}
        <p className="news-bucket-muted">
          Unselected reviews only skip an article for the same editorial setup, for up to 24 hours. Review history is
          separate from playback.
        </p>
      </>
    );
  }

  const selectedScript =
    selection?.kind === 'script' ? scriptOnly.find((script) => script.id === selection.id) : undefined;
  const selectedReviewed =
    selection?.kind === 'reviewed'
      ? reviewed.find((article) => selectionKey(selection) === `reviewed:${article.canonicalUrl}:${article.requestId}`)
      : undefined;
  const selectedTitle = selectedTake
    ? (selectedTake.articles[0]?.title ?? 'Saved story')
    : selectedScript
      ? (selectedScript.articles[0]?.title ?? 'Saved script')
      : (selectedReviewed?.title ?? 'Story details');

  const lastRunLabels = {
    running: 'Check in progress',
    prepared: 'Recording saved',
    'no-news': 'No qualifying story',
    'partial-coverage': 'Incomplete source coverage',
    failed: 'Check failed',
    interrupted: 'Check interrupted',
  };
  const heardTakes = library.takes
    .filter((take) => take.provenance.roomId === pageProfile?.id && take.deliveryState?.status === 'played')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const inProgressTakes = library.takes
    .filter((take) => take.provenance.roomId === pageProfile?.id && take.deliveryState?.status === 'started')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const listTabs: { id: 'ready' | 'heard' | 'scripts' | 'reviewed'; label: string; count: number }[] = [
    { id: 'ready', label: 'Ready', count: eligible.length },
    { id: 'heard', label: 'Heard', count: heardTakes.length },
    ...(view === 'advanced'
      ? [
          { id: 'scripts' as const, label: 'Saved scripts', count: scriptOnly.length },
          { id: 'reviewed' as const, label: 'Reviewed', count: reviewed.length },
        ]
      : []),
  ];

  return (
    <section className={`news-bucket ${view === 'advanced' ? 'is-advanced' : 'is-simple'}`} aria-label="News bucket">
      <header className="news-bucket-header">
        <div className="news-bucket-header-actions">
          <div className="news-bucket-view-toggle" role="group" aria-label="News bucket view">
            <button
              type="button"
              aria-pressed={view === 'simple'}
              onClick={() => {
                setView('simple');
                if (listSection === 'scripts' || listSection === 'reviewed') setListSection('ready');
              }}
            >
              Simple
            </button>
            <button type="button" aria-pressed={view === 'advanced'} onClick={() => setView('advanced')}>
              Advanced
            </button>
          </div>
          <div className={`news-bucket-status ${onAir ? 'is-live' : ''}`} role="status">
            <span />
            {phaseLabel}
          </div>
        </div>
      </header>

      {automation.settings.enabled && automation.room && (
        <div className="news-bucket-context">
          <Radio size={15} aria-hidden="true" />
          <p>
            <strong>Playback: {automation.room.name}</strong> · {runtimeDJ?.name ?? 'DJ not configured'} · Every{' '}
            {automation.settings.everySongs} songs
            {!runtimePending && !onAir && !scheduled
              ? ` · Next check in ${automation.songsUntilBreak} ${automation.songsUntilBreak === 1 ? 'song' : 'songs'}`
              : ''}
          </p>
        </div>
      )}

      {automation.settings.enabled && automation.room && runtimeDiffersFromPage && (
        <p className="news-bucket-notice">
          The DJ is using <strong>{automation.room.name}</strong>. This page shows saved news for{' '}
          <strong>{pageProfile?.name ?? 'the selected profile'}</strong>.
        </p>
      )}
      <ErrorNotice error={automation.error ? new Error(automation.error) : null} />
      {profileStatusUnknown && (
        <p className="news-bucket-muted" role="status">
          Automatic preparation status is unconfirmed. Showing the last loaded information.
        </p>
      )}
      {savedNewsStale && (
        <p className="news-bucket-notice" role="status">
          Saved news may be out of date. Counts and story availability reflect the last loaded results.
        </p>
      )}

      {view === 'simple' && pageProfile && (
        <div className="news-bucket-simple-settings" aria-label="Profile settings summary">
          <details>
            <summary>
              Sources &amp; schedule · {profileSources.length} sources · {preparation?.label ?? 'Status unavailable'}
            </summary>
            <p>{profileSources.join(', ') || 'No sources selected.'}</p>
            <p>{profileStatusUnknown ? 'Current preparation status is unconfirmed.' : preparation?.detail}</p>
            <p>
              {pageProfile.workflowDraft.everyHours} hour check ·{' '}
              {pageProfile.workflowDraft.importance === 'major' ? 'Major developments' : 'Relevant stories'} · Up to{' '}
              {pageProfile.workflowDraft.maxNewsClipsPerDay} recordings per day
            </p>
            {!profileStatusUnknown && preparation && (
              <p>
                {preparation.checks} / {preparation.checkLimit} checks · {preparation.recordings} /{' '}
                {preparation.recordingLimit} recordings saved today
              </p>
            )}
            {pageProfile.workflowDraft.newsLastRun && (
              <p>
                {lastRunLabels[pageProfile.workflowDraft.newsLastRun.outcome]} ·{' '}
                {new Date(
                  pageProfile.workflowDraft.newsLastRun.finishedAt ?? pageProfile.workflowDraft.newsLastRun.startedAt,
                ).toLocaleString()}
                {pageProfile.workflowDraft.newsLastRun.message
                  ? ` · ${pageProfile.workflowDraft.newsLastRun.message}`
                  : ''}
                {pageProfile.workflowDraft.newsLastRun.setupChanged
                  ? ' · Used an earlier setup; new settings apply to future checks.'
                  : ''}
              </p>
            )}
            <button className="room-link" onClick={openPreparation}>
              Preparation settings
            </button>
            <button className="room-link" onClick={() => openSetup?.('#manage-room-sources')}>
              Edit sources
            </button>
          </details>
          <details>
            <summary>Writing · {pageProfile.mood || 'No mood saved'}</summary>
            <p>
              <strong>Mood</strong> · {pageProfile.mood || 'None saved.'}
            </p>
            <p>
              <strong>Interests</strong> ·{' '}
              {pageProfile.workflowDraft.newsInterests ?? profileDJ?.news?.interests ?? 'No interests saved.'}
            </p>
            {profileDJ?.personality && (
              <p>
                <strong>Host personality</strong> · {profileDJ.personality}
              </p>
            )}
            <button className="room-link" onClick={() => openSetup?.('#station-mood')}>
              Edit writing settings
            </button>
          </details>
        </div>
      )}

      {currentBreak && (
        <section
          className="news-bucket-current"
          aria-label={onAir ? 'On-air story' : scheduled ? 'Scheduled story' : 'Playback story'}
        >
          <div>
            <span className="eyebrow">
              {onAir ? 'On air' : scheduled ? 'Scheduled for this song' : 'Claimed for playback'}
            </span>
            <strong>{currentBreak.articles[0]?.title ?? 'DJ story'}</strong>
            <p>{currentBreak.script}</p>
          </div>
          <details>
            <summary>
              Sources &amp; notes{currentBreak.warnings.length ? ` · ${currentBreak.warnings.length} notes` : ''}
            </summary>
            {renderArticles(currentBreak.articles)}
            {renderNotes(currentBreak.warnings)}
          </details>
        </section>
      )}

      {!!inProgressTakes.length && (
        <div className="news-bucket-in-progress" role="status">
          <span>Playback status</span>
          {inProgressTakes.map((take) => (
            <button
              key={take.id}
              className="room-link"
              onClick={(event) => selectStory({ kind: 'take', id: take.id }, event.currentTarget)}
            >
              {take.articles[0]?.title ?? 'Saved story'} ·{' '}
              {player.lastNews?.news.id === take.id && player.lastNews.status === 'interrupted'
                ? 'Interrupted'
                : 'In progress · completion not recorded'}
            </button>
          ))}
        </div>
      )}

      <div className="news-bucket-layout">
        {view === 'advanced' && pageProfile && (
          <aside className="news-bucket-room-sidebar" aria-label="Room settings summary">
            <span className="eyebrow">Room setup</span>
            <h3>{pageProfile.name}</h3>
            <details>
              <summary>Sources · {profileSources.length}</summary>
              <ul>
                {profileSources.map((name, index) => (
                  <li key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
              <button className="room-link" onClick={() => openSetup?.('#manage-room-sources')}>
                Edit sources
              </button>
            </details>
            <details>
              <summary>
                Host · {localState.djs.find((dj) => dj.id === pageProfile.room.djId)?.name ?? 'Not selected'}
              </summary>
              {profileDJ ? (
                <div className="news-bucket-room-copy">
                  <p>{profileDJ.personality || 'No saved personality details.'}</p>
                  <p>{profileDJ.instructions || 'No saved host instructions.'}</p>
                  <p>Exclusions: {profileDJ.exclusions || 'None saved.'}</p>
                </div>
              ) : (
                <p className="news-bucket-muted">Choose a host in settings.</p>
              )}
              <button className="room-link" onClick={() => openSetup?.('.room-host-choice .filter-select-trigger')}>
                Choose host
              </button>
              {configureDJ && (
                <button className="room-link" onClick={configureDJ}>
                  Manage hosts
                </button>
              )}
            </details>
            <details>
              <summary>Writing · {pageProfile.mood ? pageProfile.mood : 'No mood saved'}</summary>
              <div className="news-bucket-room-copy">
                <p>
                  <strong>Mood</strong>
                  <br />
                  {pageProfile.mood || 'None saved.'}
                </p>
                <p>
                  <strong>Interests</strong>
                  <br />
                  {pageProfile.workflowDraft.newsInterests ?? profileDJ?.news?.interests ?? 'No interests saved.'}
                </p>
              </div>
              <button className="room-link" onClick={() => openSetup?.('#station-mood')}>
                Edit mood
              </button>
              <button className="room-link" onClick={() => openSetup?.('#room-news-interests')}>
                Edit interests
              </button>
            </details>
            <details>
              <summary>
                Schedule · {profileStatusUnknown ? 'Status unconfirmed' : (preparation?.label ?? 'Status unavailable')}
              </summary>
              <div className="news-bucket-room-copy">
                <p>
                  {pageProfile.workflowDraft.everyHours} hour checks ·{' '}
                  {pageProfile.workflowDraft.importance === 'major' ? 'Major developments' : 'Relevant stories'}
                </p>
                <p>Up to {pageProfile.workflowDraft.maxNewsClipsPerDay} recordings per day.</p>
                {preparation && !profileStatusUnknown && (
                  <p>
                    {preparation.checks} / {preparation.checkLimit} checks and {preparation.recordings} /{' '}
                    {preparation.recordingLimit} recordings saved today.
                  </p>
                )}
                {pageProfile.workflowDraft.newsLastRun && (
                  <p>
                    {lastRunLabels[pageProfile.workflowDraft.newsLastRun.outcome]} ·{' '}
                    {new Date(
                      pageProfile.workflowDraft.newsLastRun.finishedAt ??
                        pageProfile.workflowDraft.newsLastRun.startedAt,
                    ).toLocaleString()}
                  </p>
                )}
              </div>
              <button className="room-link" onClick={openPreparation}>
                Edit preparation settings
              </button>
            </details>
          </aside>
        )}

        <div className="news-bucket-list-column">
          <div className="news-bucket-list-tabs" role="group" aria-label="Story list">
            {listTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={listSection === tab.id}
                onClick={() => setListSection(tab.id)}
              >
                <span>{tab.label}</span>
                <span>{tab.count}</span>
              </button>
            ))}
          </div>
          {listSection === 'ready' && (
            <section className="news-bucket-list-section" aria-label="Ready stories">
              {!eligible.length ? (
                <div className="news-bucket-empty">
                  <Newspaper size={22} strokeWidth={1.5} aria-hidden="true" />
                  <h4>
                    {savedNewsStale ? 'No ready stories in the last loaded results' : 'No fresh recordings ready'}
                  </h4>
                  <p>
                    {savedNewsStale
                      ? 'Refresh status to confirm what is ready now.'
                      : 'Stories appear here after they are prepared for this setup.'}
                  </p>
                  <button className="room-link" onClick={openPreparation}>
                    News settings
                  </button>
                </div>
              ) : (
                <div className="news-bucket-item-list">
                  {eligible.map((take) =>
                    storyButton(
                      { kind: 'take', id: take.id },
                      take.articles[0]?.title ?? 'Saved story',
                      `${[...new Set(take.articles.map((article) => article.source))].join(', ') || 'Source unavailable'} · Saved ${new Date(take.createdAt).toLocaleDateString()}`,
                      'Ready',
                    ),
                  )}
                </div>
              )}
            </section>
          )}
          {listSection === 'heard' && (
            <section className="news-bucket-list-section" aria-label="Played stories">
              {heardTakes.length ? (
                <div className="news-bucket-item-list">
                  {heardTakes.map((take) =>
                    storyButton(
                      { kind: 'take', id: take.id },
                      take.articles[0]?.title ?? 'Saved story',
                      `${[...new Set(take.articles.map((article) => article.source))].join(', ') || 'Source unavailable'} · ${new Date(take.deliveryState?.playedAt ?? take.createdAt).toLocaleDateString()}`,
                      'Played',
                    ),
                  )}
                </div>
              ) : (
                <p className="news-bucket-muted">No recordings with confirmed playback yet.</p>
              )}
            </section>
          )}
          {listSection === 'scripts' && view === 'advanced' && (
            <section className="news-bucket-list-section" aria-label="Saved scripts">
              <p className="news-bucket-muted">Saved scripts without audio across all profiles.</p>
              {scriptOnly.length ? (
                <div className="news-bucket-item-list">
                  {scriptOnly.map((script) =>
                    storyButton(
                      { kind: 'script', id: script.id },
                      script.articles[0]?.title ?? 'Saved script',
                      `${script.provenance.dj.name} · Saved ${new Date(script.createdAt).toLocaleDateString()}`,
                      'No audio',
                    ),
                  )}
                </div>
              ) : (
                <p className="news-bucket-muted">No saved scripts without audio.</p>
              )}
            </section>
          )}
          {listSection === 'reviewed' && view === 'advanced' && (
            <section className="news-bucket-list-section" aria-label="Reviewed stories">
              <p className="news-bucket-muted">
                Unselected reviews only skip an article for the same editorial setup, for up to 24 hours. Review history
                is separate from playback.
              </p>
              {reviewed.length ? (
                <>
                  <ul ref={historyList} className="news-bucket-reviewed">
                    {visibleReviewed.map((article) => (
                      <ReviewedRow
                        key={`${article.canonicalUrl}-${article.requestId}`}
                        article={article}
                        openSource={openSource}
                        select={(button) =>
                          selectStory({ kind: 'reviewed', id: `${article.canonicalUrl}:${article.requestId}` }, button)
                        }
                        selected={
                          selection?.kind === 'reviewed' &&
                          selection.id === `${article.canonicalUrl}:${article.requestId}`
                        }
                      />
                    ))}
                  </ul>
                  {nextHistoryCount > 0 && (
                    <button
                      className="news-bucket-show-more"
                      onClick={(event) => {
                        const first = reviewed[visibleReviewed.length];
                        revealHistory.current =
                          first &&
                          document.activeElement === event.currentTarget &&
                          event.currentTarget.matches(':focus-visible')
                            ? {
                                button: event.currentTarget,
                                key: JSON.stringify([first.canonicalUrl, first.requestId]),
                              }
                            : null;
                        setHistoryLimit((limit) => limit + 25);
                      }}
                    >
                      Show {nextHistoryCount} more reviewed {nextHistoryCount === 1 ? 'story' : 'stories'}
                    </button>
                  )}
                </>
              ) : (
                <p className="news-bucket-muted">No stories have been reviewed yet.</p>
              )}
            </section>
          )}
        </div>

        {selection && (
          <aside id="news-story-inspector" className="news-bucket-inspector" aria-label="Story inspector">
            <header>
              <div>
                <span className="eyebrow">Story details</span>
                <h3>{selectedTitle}</h3>
              </div>
              <button
                ref={closeButton}
                className="news-bucket-inspector-close"
                aria-label="Close story details"
                onClick={closeInspector}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>
            {selectedTake ? (
              renderedTake(selectedTake)
            ) : selectedScript ? (
              renderScript(selectedScript)
            ) : selectedReviewed ? (
              renderReviewed(selectedReviewed)
            ) : (
              <p className="news-bucket-muted">This story is no longer available.</p>
            )}
            <ErrorNotice error={audition.audioError ? new Error(audition.audioError) : null} />
            {selectedTake && openSavedAudio && (
              <button className="room-link" onClick={openSavedAudio}>
                Open saved audio
              </button>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function ReviewedRow({
  article,
  openSource,
  select,
  selected,
}: {
  article: ReviewedNewsArticle;
  openSource: (url: string) => void;
  select: (button: HTMLButtonElement) => void;
  selected: boolean;
}) {
  const outcome =
    article.status === 'interrupted'
      ? 'Review interrupted'
      : article.status === 'submitted'
        ? 'Submitted for review'
        : article.outcome === 'selected'
          ? 'Selected for a briefing'
          : 'Reviewed · not selected';

  return (
    <li className={`news-bucket-reviewed-row ${selected ? 'is-selected' : ''}`}>
      <div>
        <button
          className="news-bucket-article-link"
          data-story-key={`reviewed:${article.canonicalUrl}:${article.requestId}`}
          data-reviewed-key={JSON.stringify([article.canonicalUrl, article.requestId])}
          onClick={(event) => select(event.currentTarget)}
        >
          {article.title}
        </button>
        <span>
          {article.source} ·{' '}
          {Number.isFinite(Date.parse(article.publishedAt ?? ''))
            ? new Date(article.publishedAt!).toLocaleDateString()
            : 'Date unavailable'}
        </span>
        <button className="room-link" onClick={() => openSource(article.url)}>
          <ExternalLink size={12} aria-hidden="true" /> Open source
        </button>
      </div>
      <div className="news-bucket-reviewed-meta">
        <span>{outcome}</span>
        <time dateTime={article.reviewedAt}>{new Date(article.reviewedAt).toLocaleDateString()}</time>
      </div>
    </li>
  );
}

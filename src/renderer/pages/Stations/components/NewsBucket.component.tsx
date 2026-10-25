import { AtSign, ChevronDown, ExternalLink, Globe, Newspaper, Pause, Play, Radio, Rss, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { eligibleNewsTakes } from '../../../../shared/news-pool';
import type { NewsArticle, PreparedNewsScript, PreparedNewsTake, ReviewedNewsArticle } from '../../../../shared/types';
import { ErrorNotice, duration } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import { useSavedNewsAudition } from './hooks/useSavedNewsAudition';
import type { NewsBucketProps } from './NewsBucket.types';

import './NewsBucket.styles.css';

type StorySelection =
  | { kind: 'candidate'; id: string; requestId: string }
  | { kind: 'take'; id: string }
  | { kind: 'script'; id: string }
  | { kind: 'reviewed'; id: string };

const selectionKey = (selection: StorySelection) =>
  selection.kind === 'candidate'
    ? `${selection.kind}:${selection.requestId}:${selection.id}`
    : `${selection.kind}:${selection.id}`;

const relativeTime = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Saved date unavailable';
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, divisor] of units)
    if (Math.abs(seconds) >= divisor) return formatter.format(Math.round(seconds / divisor), unit);
  return 'Just now';
};

export function NewsBucket({
  library,
  localState,
  automation,
  profileStatusUnknown,
  savedNewsStale,
  openSource,
  openPreparation,
  roomSettings,
  active = true,
}: NewsBucketProps) {
  const player = usePlayer();
  const [listSection, setListSection] = useState<'ready' | 'heard' | 'collected' | 'selected' | 'scripts' | 'reviewed'>(
    'ready',
  );
  const [historyLimit, setHistoryLimit] = useState(25);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const invokingRow = useRef<HTMLButtonElement | null>(null);
  const invokingSection = useRef<typeof listSection | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const historyList = useRef<HTMLUListElement>(null);
  const revealHistory = useRef<{ button: HTMLButtonElement; key: string } | null>(null);
  const pageProfile = localState.roomProfiles.find((room) => room.id === localState.activeRoomProfileId);
  const eligible = pageProfile ? eligibleNewsTakes(library.takes, localState, pageProfile.id) : [];
  const latestRoomRequest = pageProfile
    ? [...library.requests]
        .filter((request) =>
          request.checkpoint
            ? request.checkpoint.provenance.roomId === pageProfile.id
            : request.origin?.profileId === pageProfile.id,
        )
        .sort(
          (left, right) =>
            (Date.parse(right.origin?.startedAt ?? right.checkpoint?.createdAt ?? '') || 0) -
            (Date.parse(left.origin?.startedAt ?? left.checkpoint?.createdAt ?? '') || 0),
        )
        .at(0)
    : undefined;
  const checkpoint = latestRoomRequest?.checkpoint;
  const collectedCandidates = checkpoint?.collection?.candidates ?? [];
  const checkpointSelection = checkpoint?.selection;
  const selectedCandidate = checkpointSelection?.candidateId
    ? collectedCandidates.find((candidate) => candidate.id === checkpointSelection.candidateId)
    : undefined;
  const [selection, setSelection] = useState<StorySelection | null>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1120px)').matches && eligible[0]
      ? { kind: 'take', id: eligible[0].id }
      : null,
  );
  const selectedTake = selection?.kind === 'take' ? library.takes.find((take) => take.id === selection.id) : undefined;
  const inspectorCandidate =
    selection?.kind === 'candidate' && selection.requestId === latestRoomRequest?.requestId
      ? collectedCandidates.find((candidate) => candidate.id === selection.id)
      : undefined;
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
  const scriptOnly = library.scripts
    .filter((script) => !library.takes.some((take) => take.scriptId === script.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const reviewed = [...(library.reviewedArticles ?? [])].sort(
    (a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt),
  );
  const visibleReviewed = reviewed.slice(0, historyLimit);
  const nextHistoryCount = Math.min(25, reviewed.length - visibleReviewed.length);
  const runtimeDJ = localState.djs.find((dj) => dj.id === automation.room?.room.djId);
  function sourceIcon(sourceName: string) {
    const kind = localState.sources.find((source) => source.name === sourceName)?.kind;
    const Icon = kind === 'rss' ? Rss : kind === 'twitter' ? AtSign : kind === 'hacker-news' ? Newspaper : Globe;

    return <Icon size={22} strokeWidth={1.7} aria-hidden="true" />;
  }
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

  function storyButton(selectionValue: StorySelection, title: string, meta: string, sourceName?: string) {
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
        <span className="news-bucket-item-icon">{sourceIcon(sourceName ?? '')}</span>
        <span className="news-bucket-item-main">
          <strong>{title}</strong>
          <span>{meta}</span>
        </span>
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

  function renderCollectionStatus() {
    const collection = checkpoint?.collection;
    if (!collection) return null;
    const sourceSummary = collection.sourceResults.map((result) => {
      const name = localState.sources.find((source) => source.id === result.sourceId)?.name ?? result.sourceId;
      return `${name}: ${result.status} · ${result.articleCount} ${result.articleCount === 1 ? 'story' : 'stories'}`;
    });
    const warnings = [
      ...collection.warnings,
      ...collection.sourceResults.flatMap((result) => {
        const name = localState.sources.find((source) => source.id === result.sourceId)?.name ?? result.sourceId;
        return result.warnings.map((warning) => `${name}: ${warning}`);
      }),
    ];

    return (
      <>
        {sourceSummary.length > 0 && (
          <ul className="news-bucket-preparation-notes" aria-label="Source check results">
            {sourceSummary.map((summary) => (
              <li key={summary}>{summary}</li>
            ))}
          </ul>
        )}
        {renderNotes(warnings)}
      </>
    );
  }

  function renderedTake(take: PreparedNewsTake) {
    const current = audition.audition?.id === take.id ? audition.audition : null;

    return (
      <>
        <h3 className="news-bucket-preview-label">Spoken preview</h3>
        <p className="news-bucket-inspector-script">{take.script}</p>
        {take.available ? (
          <div className="news-bucket-audition">
            <button
              className="news-bucket-audition-play"
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
              {current?.phase === 'loading' ? (
                'Loading…'
              ) : current?.phase === 'playing' ? (
                <>
                  <span className="news-bucket-audition-disc">
                    <Pause size={14} aria-hidden="true" />
                  </span>{' '}
                  Pause
                </>
              ) : (
                <>
                  <span className="news-bucket-audition-disc">
                    <Play size={14} aria-hidden="true" />
                  </span>{' '}
                  {current?.phase === 'paused' ? 'Resume' : 'Listen'}
                </>
              )}
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
          <summary>Why this story</summary>
          <p className="news-bucket-muted">{take.selection?.reason ?? 'Selection reason was not recorded.'}</p>
        </details>
        <details className="news-bucket-detail-disclosure">
          <summary>
            Source details
            {take.warnings.length
              ? ` · ${take.warnings.length} preparation ${take.warnings.length === 1 ? 'note' : 'notes'}`
              : ''}
          </summary>
          <p className="news-bucket-inspector-meta">
            Host: {take.renderingDJ.name} · Saved {new Date(take.createdAt).toLocaleString()}
            {take.deliveryState?.status === 'played'
              ? ` · Played ${take.deliveryState.playedAt ? new Date(take.deliveryState.playedAt).toLocaleString() : 'time unavailable'}`
              : take.deliveryState?.status === 'started'
                ? ' · Playback started; completion not recorded'
                : take.deliveryState?.status === 'claimed'
                  ? ' · Reserved for playback'
                  : ''}
          </p>
          {renderArticles(take.articles)}
          {renderNotes(take.warnings)}
        </details>
      </>
    );
  }

  function renderScript(script: PreparedNewsScript) {
    const request = library.requests.find((value) => value.requestId === script.requestId);
    const profile =
      request?.origin?.profileName ?? script.provenance.roomName ?? script.provenance.roomId ?? 'Profile unavailable';

    return (
      <>
        <p className="news-bucket-inspector-script">{script.script}</p>
        <details className="news-bucket-detail-disclosure">
          <summary>Why this story</summary>
          <p className="news-bucket-muted">{script.selection?.reason ?? 'Selection reason was not recorded.'}</p>
        </details>
        <details className="news-bucket-detail-disclosure">
          <summary>
            Source details
            {script.warnings.length
              ? ` · ${script.warnings.length} preparation ${script.warnings.length === 1 ? 'note' : 'notes'}`
              : ''}
          </summary>
          <p className="news-bucket-inspector-meta">
            {request?.origin?.kind ?? 'Origin unavailable'} · {request?.status ?? 'Saved script'} · {profile} · Created{' '}
            {new Date(script.createdAt).toLocaleString()} · No saved audio
          </p>
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
        <details className="news-bucket-detail-disclosure">
          <summary>Why this story</summary>
          <p className="news-bucket-inspector-meta">
            {outcome} · Reviewed {new Date(article.reviewedAt).toLocaleString()}
          </p>
          <p className="news-bucket-muted">{article.reason ?? 'No review reason was saved.'}</p>
        </details>
        <details className="news-bucket-detail-disclosure">
          <summary>Source details</summary>
          {renderArticles([article])}
        </details>
        <p className="news-bucket-muted">
          Unselected reviews only skip an article for the same editorial setup for up to 24 hours. Review history is
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
    .sort(
      (a, b) =>
        Date.parse(b.deliveryState?.playedAt ?? b.createdAt) - Date.parse(a.deliveryState?.playedAt ?? a.createdAt),
    );
  const inProgressTakes = library.takes
    .filter((take) => take.provenance.roomId === pageProfile?.id && take.deliveryState?.status === 'started')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const listTabs: { id: 'ready' | 'heard' | 'collected' | 'selected'; label: string; count: number }[] = [
    { id: 'ready', label: 'Ready', count: eligible.length },
    { id: 'heard', label: 'Heard', count: heardTakes.length },
    ...(checkpoint?.collection
      ? [{ id: 'collected' as const, label: 'Collected', count: collectedCandidates.length }]
      : []),
    ...(checkpoint?.selection
      ? [{ id: 'selected' as const, label: 'Selected', count: selectedCandidate ? 1 : 0 }]
      : []),
  ];
  const currentListSection =
    listSection === 'collected' && !checkpoint?.collection
      ? 'ready'
      : listSection === 'selected' && !checkpoint?.selection
        ? 'ready'
        : listSection;
  const historySection =
    currentListSection === 'scripts' || currentListSection === 'reviewed' ? currentListSection : '';
  const lastRun = pageProfile?.workflowDraft.newsLastRun;
  const lastRunTime = lastRun?.finishedAt ?? lastRun?.startedAt;
  const candidateStory = inspectorCandidate;
  const requestWhy = checkpointSelection?.reason;
  const selectedCandidateIsInspector = !!candidateStory && candidateStory.id === checkpointSelection?.candidateId;
  const selectedTitle = selectedTake
    ? (selectedTake.articles[0]?.title ?? 'Saved story')
    : selectedScript
      ? (selectedScript.articles[0]?.title ?? 'Saved script')
      : (selectedReviewed?.title ?? candidateStory?.title ?? 'Story details');
  const selectedSource =
    selectedTake?.articles[0]?.source ??
    selectedScript?.articles[0]?.source ??
    selectedReviewed?.source ??
    candidateStory?.source;
  const selectedStatus = selectedTake
    ? selectedTake.deliveryState?.status === 'played'
      ? selectedTake.deliveryState.playedAt
        ? `Heard ${relativeTime(selectedTake.deliveryState.playedAt)}`
        : 'Heard · play time unavailable'
      : selectedTake.deliveryState?.status === 'started'
        ? `Started · completion not recorded · Saved ${relativeTime(selectedTake.createdAt)}`
        : selectedTake.deliveryState?.status === 'claimed'
          ? `Reserved for playback · Saved ${relativeTime(selectedTake.createdAt)}`
          : `Ready · Not yet heard · Saved ${relativeTime(selectedTake.createdAt)}`
    : selectedScript
      ? `Saved script · ${relativeTime(selectedScript.createdAt)}`
      : selectedReviewed
        ? `${selectedReviewed.status === 'interrupted' ? 'Review interrupted' : selectedReviewed.status === 'submitted' ? 'Submitted for review' : selectedReviewed.outcome === 'selected' ? 'Selected for a briefing' : 'Reviewed · not selected'} · ${relativeTime(selectedReviewed.reviewedAt)}`
        : candidateStory
          ? `${selectedCandidateIsInspector ? 'Selected' : 'Collected'} · ${relativeTime(selectedCandidateIsInspector ? (checkpointSelection?.decidedAt ?? '') : (checkpoint?.collection?.collectedAt ?? ''))}`
          : 'Details unavailable';

  return (
    <section className="news-bucket" aria-label="News bucket">
      <div className="news-bucket-layout">
        <div className="news-bucket-room-sidebar">
          <button
            className="news-bucket-settings-toggle"
            aria-expanded={settingsExpanded}
            aria-controls="news-room-settings-content"
            onClick={() => setSettingsExpanded((value) => !value)}
          >
            <span>Room settings</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <div
            id="news-room-settings-content"
            className={`news-bucket-room-content ${settingsExpanded ? 'is-expanded' : ''}`}
          >
            {roomSettings ?? (
              <button className="news-bucket-settings-fallback" onClick={openPreparation}>
                News settings
              </button>
            )}
          </div>
        </div>

        <div className="news-bucket-list-column">
          <div className="news-bucket-check-row" role="status">
            <span className="news-bucket-check-label">Last check</span>
            {lastRun ? (
              <span>
                <strong>{lastRunLabels[lastRun.outcome]}</strong>
                {lastRunTime && <time dateTime={lastRunTime}> · {relativeTime(lastRunTime)}</time>}
                {lastRun.message && <span className="news-bucket-check-message"> · {lastRun.message}</span>}
                {lastRun.setupChanged && <span> · Used earlier settings</span>}
              </span>
            ) : (
              <span>No check recorded for this room.</span>
            )}
          </div>

          {automation.settings.enabled && automation.room && (
            <div className="news-bucket-runtime" role="status">
              <Radio size={16} aria-hidden="true" />
              <span>
                {automation.room.id === pageProfile?.id ? 'Playback' : `Playback uses ${automation.room.name}`} ·{' '}
                {runtimeDJ?.name ?? 'DJ not configured'} · {phaseLabel}
                {automation.room.id === pageProfile?.id && !runtimePending && !onAir && !scheduled
                  ? ` · Next check in ${automation.songsUntilBreak} ${automation.songsUntilBreak === 1 ? 'song' : 'songs'}`
                  : ''}
              </span>
            </div>
          )}
          {runtimeDiffersFromPage && automation.settings.enabled && automation.room && (
            <p className="news-bucket-inline-notice">
              Playback is set to <strong>{automation.room.name}</strong>; this list belongs to{' '}
              <strong>{pageProfile?.name ?? 'the selected room'}</strong>.
            </p>
          )}
          <ErrorNotice error={automation.error ? new Error(automation.error) : null} />
          {profileStatusUnknown && (
            <p className="news-bucket-inline-notice" role="status">
              Preparation status is unconfirmed. Showing the last loaded information.
            </p>
          )}
          {savedNewsStale && (
            <p className="news-bucket-inline-notice" role="status">
              Saved news may be out of date; availability reflects the last loaded results.
            </p>
          )}
          {currentBreak && (
            <details className="news-bucket-live-story">
              <summary>
                <span>{onAir ? 'On air' : scheduled ? 'Scheduled' : 'Playback'}</span>
                <strong>{currentBreak.articles[0]?.title ?? 'DJ story'}</strong>
              </summary>
              <p>{currentBreak.script}</p>
              <details className="news-bucket-detail-disclosure">
                <summary>
                  Source details{currentBreak.warnings.length ? ` · ${currentBreak.warnings.length} notes` : ''}
                </summary>
                {renderArticles(currentBreak.articles)}
                {renderNotes(currentBreak.warnings)}
              </details>
            </details>
          )}
          {!!inProgressTakes.length && (
            <div className="news-bucket-in-progress" role="status">
              <span>Playback started · completion unconfirmed</span>
              {inProgressTakes.map((take) => (
                <button
                  key={take.id}
                  className="room-link"
                  onClick={(event) => selectStory({ kind: 'take', id: take.id }, event.currentTarget)}
                >
                  {take.articles[0]?.title ?? 'Saved story'}
                </button>
              ))}
            </div>
          )}

          <div className="news-bucket-list-toolbar">
            <div className="news-bucket-list-tabs" role="group" aria-label="Story list">
              {listTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={currentListSection === tab.id}
                  onClick={() => setListSection(tab.id)}
                >
                  <span>{tab.label}</span>
                  <span>{tab.count}</span>
                </button>
              ))}
            </div>
            <label className="news-bucket-history-select">
              <span className="sr-only">Story history</span>
              <select
                aria-label="Story history"
                value={historySection}
                onChange={(event) =>
                  setListSection(
                    event.target.value === 'scripts' || event.target.value === 'reviewed'
                      ? event.target.value
                      : 'ready',
                  )
                }
              >
                <option value="">More history</option>
                <option value="scripts">Saved scripts</option>
                <option value="reviewed">Reviewed stories</option>
              </select>
            </label>
          </div>

          {currentListSection === 'ready' && (
            <section className="news-bucket-list-section" aria-label="Ready stories">
              {!eligible.length ? (
                <div className="news-bucket-empty">
                  <Newspaper size={26} strokeWidth={1.5} aria-hidden="true" />
                  <h2>
                    {savedNewsStale ? 'No ready stories in the last loaded results' : 'No fresh recordings ready'}
                  </h2>
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
                  {eligible.map((take) => {
                    const article = take.articles[0];
                    return storyButton(
                      { kind: 'take', id: take.id },
                      article?.title ?? 'Saved story',
                      `${article?.source ?? 'Source unavailable'} · Saved ${relativeTime(take.createdAt)}`,
                      article?.source,
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {currentListSection === 'heard' && (
            <section className="news-bucket-list-section" aria-label="Heard stories">
              {heardTakes.length ? (
                <div className="news-bucket-item-list">
                  {heardTakes.map((take) => {
                    const article = take.articles[0];
                    return storyButton(
                      { kind: 'take', id: take.id },
                      article?.title ?? 'Saved story',
                      `${article?.source ?? 'Source unavailable'} · ${take.deliveryState?.playedAt ? `Heard ${relativeTime(take.deliveryState.playedAt)}` : 'Heard time unavailable'}`,
                      article?.source,
                    );
                  })}
                </div>
              ) : (
                <p className="news-bucket-muted">No recordings with confirmed playback yet.</p>
              )}
            </section>
          )}
          {currentListSection === 'collected' && checkpoint?.collection && (
            <section className="news-bucket-list-section" aria-label="Collected stories">
              <p className="news-bucket-section-note">
                Collected for {relativeTime(checkpoint.collection.collectedAt)} ·{' '}
                {checkpoint.collection.candidates.length} candidates
              </p>
              {checkpoint.collection.incomplete && (
                <p className="news-bucket-inline-notice">Source coverage was incomplete.</p>
              )}
              {checkpoint.collection.candidates.length ? (
                <div className="news-bucket-item-list">
                  {checkpoint.collection.candidates.map((candidate) =>
                    storyButton(
                      { kind: 'candidate', id: candidate.id, requestId: latestRoomRequest!.requestId },
                      candidate.title,
                      `${candidate.source} · ${candidate.publishedAt ? relativeTime(candidate.publishedAt) : 'Date unavailable'}`,
                      candidate.source,
                    ),
                  )}
                </div>
              ) : (
                <p className="news-bucket-muted">No candidates were collected in this check.</p>
              )}
              {renderCollectionStatus()}
            </section>
          )}
          {currentListSection === 'selected' && checkpointSelection && (
            <section className="news-bucket-list-section" aria-label="Editorial selection">
              {selectedCandidate ? (
                <div className="news-bucket-item-list">
                  {storyButton(
                    { kind: 'candidate', id: selectedCandidate.id, requestId: latestRoomRequest!.requestId },
                    selectedCandidate.title,
                    `${selectedCandidate.source} · Selected ${relativeTime(checkpointSelection.decidedAt)}`,
                    selectedCandidate.source,
                  )}
                </div>
              ) : (
                <div className="news-bucket-empty">
                  <h2>No story selected</h2>
                  <p>{checkpointSelection.reason}</p>
                </div>
              )}
            </section>
          )}
          {currentListSection === 'scripts' && (
            <section className="news-bucket-list-section" aria-label="Saved scripts">
              <p className="news-bucket-section-note">Saved scripts without audio across all rooms.</p>
              {scriptOnly.length ? (
                <div className="news-bucket-item-list">
                  {scriptOnly.map((script) => {
                    const article = script.articles[0];
                    return storyButton(
                      { kind: 'script', id: script.id },
                      article?.title ?? 'Saved script',
                      `${article?.source ?? script.provenance.dj.name} · Saved ${relativeTime(script.createdAt)}`,
                      article?.source,
                    );
                  })}
                </div>
              ) : (
                <p className="news-bucket-muted">No saved scripts without audio.</p>
              )}
            </section>
          )}
          {currentListSection === 'reviewed' && (
            <section className="news-bucket-list-section" aria-label="Reviewed stories">
              <p className="news-bucket-section-note">
                Review history is separate from playback. Unselected reviews skip an article for the same editorial
                setup for up to 24 hours.
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
                <h2 className="news-bucket-inspector-heading">Story</h2>
                <h3 className="news-bucket-inspector-title">{selectedTitle}</h3>
                <p>
                  {selectedSource ?? 'Source unavailable'} · {selectedStatus}
                </p>
              </div>
              <button
                ref={closeButton}
                className="news-bucket-inspector-close"
                aria-label="Close story details"
                onClick={closeInspector}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            {selectedTake ? (
              renderedTake(selectedTake)
            ) : selectedScript ? (
              renderScript(selectedScript)
            ) : selectedReviewed ? (
              renderReviewed(selectedReviewed)
            ) : candidateStory ? (
              <>
                <h3 className="news-bucket-preview-label">Collected story</h3>
                <p className="news-bucket-inspector-script">{candidateStory.summary || 'No summary was saved.'}</p>
                <details className="news-bucket-detail-disclosure">
                  <summary>Why this story</summary>
                  <p className="news-bucket-muted">
                    {selectedCandidateIsInspector && requestWhy
                      ? requestWhy
                      : 'This candidate was collected but not selected. No candidate-specific reason was saved.'}
                  </p>
                </details>
                <details className="news-bucket-detail-disclosure">
                  <summary>Source details</summary>
                  {renderArticles([candidateStory])}
                  {renderCollectionStatus()}
                </details>
              </>
            ) : (
              <p className="news-bucket-muted">This story is no longer available.</p>
            )}
            <ErrorNotice error={audition.audioError ? new Error(audition.audioError) : null} />
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

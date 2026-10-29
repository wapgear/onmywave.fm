import { ArrowLeft, ExternalLink, Inbox, Pause, Play, Radio, Search, Settings, Star, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { canonicalArticleUrl, eligibleNewsTakes } from '../../../../shared/news-pool';
import type { NewsArticle, PreparedNewsScript, PreparedNewsTake, ReviewedNewsArticle } from '../../../../shared/types';
import { Select } from '../../../components/Select/Select.component';
import { ErrorNotice, duration } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import { useNewsFavorites } from './hooks/useNewsFavorites';
import { useSavedNewsAudition } from './hooks/useSavedNewsAudition';
import type { NewsBucketDestination, NewsBucketProps } from './NewsBucket.types';

import './NewsBucket.styles.css';

type StorySelection =
  | { kind: 'candidate'; id: string; requestId: string }
  | { kind: 'take'; id: string }
  | { kind: 'script'; id: string }
  | { kind: 'reviewed'; id: string }
  | { kind: 'favorite'; id: string };

type Destination = NewsBucketDestination;

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
  destination,
  onDestinationChange,
}: NewsBucketProps) {
  const player = usePlayer();
  const [pastFilter, setPastFilter] = useState('heard');
  const [historyLimit, setHistoryLimit] = useState(25);
  const favorites = useNewsFavorites(library);
  const invokingRow = useRef<HTMLButtonElement | null>(null);
  const invokingSection = useRef<Destination | null>(null);
  const readerHeading = useRef<HTMLHeadingElement>(null);
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
  const [selection, setSelection] = useState<StorySelection | null>(() =>
    destination === 'upcoming' && window.matchMedia('(min-width: 1280px)').matches && eligible[0]
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

  const closeInspector = useCallback(
    (restoreTo?: 'navigation') => {
      const focusedElement = document.activeElement;
      stopAudition();
      setSelection(null);
      if (invokingRow.current && !invokingRow.current.isConnected && invokingSection.current)
        onDestinationChange(invokingSection.current);
      requestAnimationFrame(() => {
        if (document.activeElement !== focusedElement && document.activeElement !== document.body) return;
        const selectedKey = selection ? selectionKey(selection) : '';
        const row = [...document.querySelectorAll<HTMLButtonElement>('[data-story-key]')].find(
          (button) => button.dataset.storyKey === selectedKey,
        );
        const currentCategory = document.querySelector<HTMLButtonElement>(
          '.news-bucket-navigation [aria-current="page"]',
        );
        const navigation = currentCategory?.checkVisibility()
          ? currentCategory
          : document.querySelector<HTMLSelectElement>('.news-bucket-navigation-select select');
        const target =
          restoreTo === 'navigation'
            ? navigation
            : invokingRow.current?.isConnected && invokingRow.current.checkVisibility()
              ? invokingRow.current
              : row?.checkVisibility()
                ? row
                : navigation;
        target?.focus({ preventScroll: true });
      });
    },
    [onDestinationChange, selection, stopAudition],
  );

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
                      ? 'Finding a ready story'
                      : runtimePending
                        ? 'Ready for the next suitable song'
                        : automation.settings.enabled
                          ? 'Waiting for a ready story'
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
    invokingSection.current = destination;
    setSelection(next);
    requestAnimationFrame(() => {
      readerHeading.current?.focus({ preventScroll: true });
    });
  }

  function favoriteButton(article: NewsArticle) {
    const saved = favorites.isFavorite(article);

    return (
      <button
        className="news-bucket-star"
        aria-label={`${saved ? 'Remove from' : 'Add to'} favorites: ${article.title}`}
        aria-pressed={saved}
        disabled={favorites.pending}
        onClick={() =>
          favorites.toggle(article, () => {
            if (saved && selection?.kind === 'favorite' && selection.id === canonicalArticleUrl(article.url)) {
              const reader = document.getElementById('news-story-inspector');
              if (reader?.checkVisibility() && reader.dataset.readerKey === selectionKey(selection))
                closeInspector('navigation');
            }
          })
        }
      >
        <Star size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    );
  }

  function publicationTime(article: NewsArticle) {
    return article.publishedAt && Number.isFinite(Date.parse(article.publishedAt))
      ? `Published ${relativeTime(article.publishedAt).toLocaleLowerCase()}`
      : 'Published date unavailable';
  }

  function storyButton(
    selectionValue: StorySelection,
    title: string,
    meta: string,
    article?: NewsArticle,
    excerpt?: string,
  ) {
    const isSelected = selection !== null && selectionKey(selection) === selectionKey(selectionValue);
    const recordStatus =
      article && meta.startsWith(`${article.source} · `) ? meta.slice(article.source.length + 3) : meta;

    return (
      <div className={`news-bucket-story-row ${isSelected ? 'is-selected' : ''}`} key={selectionKey(selectionValue)}>
        <button
          className="news-bucket-item"
          data-story-key={selectionKey(selectionValue)}
          aria-pressed={isSelected}
          aria-controls={selection ? 'news-story-inspector' : undefined}
          onClick={(event) => selectStory(selectionValue, event.currentTarget)}
        >
          <span className="news-bucket-item-main">
            <strong>{title}</strong>
            {article && (
              <span className="news-bucket-item-byline">
                {article.source} · {publicationTime(article)}
              </span>
            )}
            {excerpt && <span className="news-bucket-item-excerpt">{excerpt}</span>}
            <span className="news-bucket-item-status">{recordStatus}</span>
          </span>
        </button>
        {article && favoriteButton(article)}
      </div>
    );
  }

  function navigate(next: Destination) {
    stopAudition();
    setSelection(null);
    onDestinationChange(next);
    setHistoryLimit(25);
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
        <div className="news-bucket-spoken-story">
          <h3 className="news-bucket-preview-label">Spoken story</h3>
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
              <span className="news-bucket-audition-host">{take.renderingDJ.name}</span>
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
            <p className="news-bucket-muted">
              The saved audio file is unavailable. The script and sources remain saved.
            </p>
          )}
        </div>
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
            {take.provenance.roomName ??
              localState.roomProfiles.find((profile) => profile.id === take.provenance.roomId)?.name ??
              'Original room unavailable'}{' '}
            · Host: {take.renderingDJ.name} · Saved {new Date(take.createdAt).toLocaleString()}
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
          : eligible.some((take) => take.id === selectedTake.id)
            ? `Ready · Not yet heard · Saved ${relativeTime(selectedTake.createdAt)}`
            : `Saved recording · ${selectedTake.available ? 'Not upcoming' : 'Audio unavailable'} · ${relativeTime(selectedTake.createdAt)}`
    : selectedScript
      ? `Saved script · ${relativeTime(selectedScript.createdAt)}`
      : selectedReviewed
        ? `${selectedReviewed.status === 'interrupted' ? 'Review interrupted' : selectedReviewed.status === 'submitted' ? 'Submitted for review' : selectedReviewed.outcome === 'selected' ? 'Selected for a briefing' : 'Reviewed · not selected'} · ${relativeTime(selectedReviewed.reviewedAt)}`
        : candidateStory
          ? `${selectedCandidateIsInspector ? 'Selected' : 'Collected'} · ${relativeTime(selectedCandidateIsInspector ? (checkpointSelection?.decidedAt ?? '') : (checkpoint?.collection?.collectedAt ?? ''))}`
          : 'Details unavailable';

  const selectedFavorite =
    selection?.kind === 'favorite'
      ? favorites.favorites.find((article) => article.canonicalUrl === selection.id)
      : undefined;
  const favoriteArticles = [...favorites.favorites].sort(
    (a, b) => Date.parse(b.favoritedAt) - Date.parse(a.favoritedAt),
  );
  const allTakes = [...library.takes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const destinations = [
    { id: 'upcoming' as const, label: 'Upcoming', count: eligible.length },
    { id: 'check' as const, label: 'Check news' },
    { id: 'past' as const, label: 'Past news', count: heardTakes.length },
    { id: 'favorites' as const, label: 'Favorites', count: favoriteArticles.length },
    { id: 'settings' as const, label: 'Settings' },
  ];
  const descriptions = {
    upcoming: `${eligible.length} ready for the next DJ break.`,
    check: 'Latest source check for this room.',
    past: 'Listening history and saved news records.',
    favorites: 'Starred articles from all rooms.',
    settings: 'Sources, schedule, and writing for this room.',
  };
  const currentDestination = destinations.find((item) => item.id === destination)!;
  const inspectedArticle =
    selectedTake?.articles[0] ?? selectedScript?.articles[0] ?? selectedReviewed ?? candidateStory ?? selectedFavorite;

  function takeRow(take: PreparedNewsTake, status: string) {
    return storyButton(
      { kind: 'take', id: take.id },
      take.articles[0]?.title ?? 'Saved story',
      `${take.articles[0]?.source ?? 'Source unavailable'} · ${status}`,
      take.articles[0],
      take.script,
    );
  }

  return (
    <section className="news-bucket" aria-label="News bucket">
      <div className="news-bucket-layout">
        <nav className="news-bucket-navigation" aria-label="News categories">
          <label className="news-bucket-navigation-select" htmlFor="news-category">
            <span className="sr-only">News category</span>
            <Select
              id="news-category"
              aria-label="News category"
              value={destination}
              onChange={(event) => navigate(event.target.value as Destination)}
            >
              {destinations.map(({ id, label, count }) => (
                <option key={id} value={id}>
                  {label}
                  {count !== undefined ? ` · ${count}` : ''}
                </option>
              ))}
            </Select>
          </label>
          {destinations.map(({ id, label, count }) => (
            <button
              key={id}
              className={id === 'settings' ? 'news-bucket-nav-settings' : ''}
              aria-current={destination === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              {id === 'settings' && <Settings size={16} aria-hidden="true" />}
              <span>{label}</span>
              {count !== undefined && <span className="news-bucket-count">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="news-bucket-content">
          <ErrorNotice error={favorites.error} />
          <div className="news-bucket-settings-page" hidden={destination !== 'settings'}>
            <header className="news-bucket-content-heading">
              <h2>News settings</h2>
              <p>{descriptions.settings}</p>
            </header>
            {roomSettings ?? (
              <button className="room-link" onClick={openPreparation}>
                Open news settings
              </button>
            )}
          </div>
          {destination !== 'settings' && (
            <div className="news-bucket-reading-layout" key={destination}>
              <div className="news-bucket-list-column">
                <header className="news-bucket-content-heading">
                  <h2>{currentDestination.label}</h2>
                  <p>{descriptions[destination]}</p>
                </header>
                {(destination === 'upcoming' || destination === 'check') && (
                  <div className="news-bucket-check-row" role="status">
                    <span>
                      Last source check · {lastRun ? lastRunLabels[lastRun.outcome] : 'No check recorded'}
                      {lastRunTime && <time dateTime={lastRunTime}> · {relativeTime(lastRunTime)}</time>}
                      {lastRun?.setupChanged && ' · Used earlier settings'}
                    </span>
                  </div>
                )}
                {destination === 'check' && lastRun?.message && <p className="news-bucket-muted">{lastRun.message}</p>}
                {automation.settings.enabled && automation.room && destination === 'upcoming' && (
                  <div className="news-bucket-runtime" role="status">
                    <Radio size={16} aria-hidden="true" />
                    <span>
                      {runtimeDJ?.name ?? 'DJ'} · {phaseLabel}
                      {!runtimePending && !onAir && !scheduled
                        ? ` · Playback checks again in ${automation.songsUntilBreak} ${automation.songsUntilBreak === 1 ? 'song' : 'songs'}`
                        : ''}
                    </span>
                  </div>
                )}
                {runtimeDiffersFromPage && automation.settings.enabled && automation.room && (
                  <p className="news-bucket-inline-notice">
                    Playback uses <strong>{automation.room.name}</strong>; this list belongs to{' '}
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
                    Saved news may be out of date. Refresh status to confirm availability.
                  </p>
                )}
                {destination === 'upcoming' && currentBreak && (
                  <details className="news-bucket-live-story">
                    <summary>
                      <span>{onAir ? 'On air' : scheduled ? 'Scheduled' : 'Playback'}</span>
                      <strong>{currentBreak.articles[0]?.title ?? 'DJ story'}</strong>
                    </summary>
                    <p>{currentBreak.script}</p>
                    {renderArticles(currentBreak.articles)}
                    {renderNotes(currentBreak.warnings)}
                  </details>
                )}
                {destination === 'upcoming' && inProgressTakes.length > 0 && (
                  <details className="news-bucket-detail-disclosure">
                    <summary>Playback completion unconfirmed · {inProgressTakes.length}</summary>
                    {inProgressTakes.map((take) => takeRow(take, 'Started · completion not recorded'))}
                  </details>
                )}
                {destination === 'upcoming' && (
                  <section className="news-bucket-list-section" aria-label="Upcoming stories">
                    {eligible.length ? (
                      <div className="news-bucket-item-list">
                        {eligible.map((take) => takeRow(take, `Saved ${relativeTime(take.createdAt)}`))}
                      </div>
                    ) : (
                      <div className="news-bucket-empty">
                        <Inbox size={28} aria-hidden="true" />
                        <h2>{pageProfile?.workflowDraft.newsEnabled ? 'No stories ready yet' : 'Set up your news'}</h2>
                        <p>
                          {savedNewsStale
                            ? 'Refresh status to confirm what is ready.'
                            : pageProfile?.workflowDraft.newsEnabled
                              ? 'Your DJ is watching your sources. Fresh recordings appear here when a story qualifies.'
                              : 'Choose your sources and host, then turn on automatic news in Settings.'}
                        </p>
                        <button className="room-link" onClick={() => navigate('settings')}>
                          Review news settings
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {destination === 'check' && (
                  <section className="news-bucket-list-section" aria-label="Latest source check">
                    {checkpoint?.collection ? (
                      <>
                        <p className="news-bucket-section-note">
                          {collectedCandidates.length} stories found · {relativeTime(checkpoint.collection.collectedAt)}
                          {checkpoint.collection.incomplete && ' · Source coverage incomplete'}
                        </p>
                        <div className="news-bucket-item-list">
                          {collectedCandidates.map((article) =>
                            storyButton(
                              { kind: 'candidate', id: article.id, requestId: latestRoomRequest!.requestId },
                              article.title,
                              `${article.source} · ${article.id === checkpointSelection?.candidateId ? 'Selected for a briefing' : 'Found in latest check'}`,
                              article,
                              article.summary,
                            ),
                          )}
                        </div>
                        <details className="news-bucket-detail-disclosure">
                          <summary>Check details</summary>
                          {checkpointSelection && <p className="news-bucket-muted">{checkpointSelection.reason}</p>}
                          {renderCollectionStatus()}
                        </details>
                      </>
                    ) : (
                      <div className="news-bucket-empty">
                        <Search size={28} aria-hidden="true" />
                        <h2>{lastRun ? 'No story list saved for this check' : 'No source check yet'}</h2>
                        <p>
                          {lastRun
                            ? 'The saved result is shown above. Stories from future checks will appear here.'
                            : 'Automatic checks find stories from your selected sources. Turn them on in News settings.'}
                        </p>
                        <button className="room-link" onClick={() => navigate('settings')}>
                          Review news settings
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {destination === 'past' && (
                  <>
                    <label className="news-bucket-history-select" htmlFor="story-history">
                      Show
                      <Select
                        id="story-history"
                        aria-label="Story history"
                        value={pastFilter}
                        onChange={(event) => {
                          setPastFilter(event.target.value);
                          stopAudition();
                          setSelection(null);
                          setHistoryLimit(25);
                        }}
                      >
                        <option value="heard">Heard recordings · {heardTakes.length}</option>
                        <option value="scripts">Saved scripts · {scriptOnly.length}</option>
                        <option value="reviewed">Reviewed stories · {reviewed.length}</option>
                        <option value="all">All saved recordings · {allTakes.length}</option>
                      </Select>
                    </label>
                    {pastFilter === 'heard' && (
                      <section aria-label="Heard recordings">
                        {heardTakes.length ? (
                          heardTakes.map((take) =>
                            takeRow(
                              take,
                              take.deliveryState?.playedAt
                                ? `Heard ${relativeTime(take.deliveryState.playedAt)}`
                                : 'Heard · time unavailable',
                            ),
                          )
                        ) : (
                          <p className="news-bucket-muted">No completed news playback for this room yet.</p>
                        )}
                      </section>
                    )}
                    {pastFilter === 'all' && (
                      <section aria-label="All saved recordings">
                        <p className="news-bucket-section-note">
                          Saved recordings from all rooms and older setups. A recording is marked heard only after
                          completed playback.
                        </p>
                        {allTakes.length ? (
                          allTakes.map((take) =>
                            takeRow(
                              take,
                              take.deliveryState?.status === 'played'
                                ? `Heard${take.deliveryState.playedAt ? ` ${relativeTime(take.deliveryState.playedAt)}` : ' · time unavailable'}`
                                : take.deliveryState?.status === 'started'
                                  ? 'Completion unconfirmed'
                                  : take.deliveryState?.status === 'claimed'
                                    ? 'Reserved for playback'
                                    : !take.available
                                      ? 'Audio unavailable'
                                      : eligible.some((ready) => ready.id === take.id)
                                        ? 'Ready to listen'
                                        : 'Saved recording',
                            ),
                          )
                        ) : (
                          <p className="news-bucket-muted">No saved recordings yet.</p>
                        )}
                      </section>
                    )}
                    {pastFilter === 'scripts' && (
                      <section aria-label="Saved scripts">
                        <p className="news-bucket-section-note">Scripts without audio, across all rooms.</p>
                        {scriptOnly.length ? (
                          scriptOnly.map((script) =>
                            storyButton(
                              { kind: 'script', id: script.id },
                              script.articles[0]?.title ?? 'Saved script',
                              `${script.articles[0]?.source ?? 'Source unavailable'} · Script only · ${relativeTime(script.createdAt)}`,
                              script.articles[0],
                              script.script,
                            ),
                          )
                        ) : (
                          <p className="news-bucket-muted">No saved scripts without audio.</p>
                        )}
                      </section>
                    )}
                    {pastFilter === 'reviewed' && (
                      <section aria-label="Reviewed stories">
                        <p className="news-bucket-section-note">
                          Editorial reviews across all rooms. A review does not mean a story was heard.
                        </p>
                        {visibleReviewed.map((article) =>
                          storyButton(
                            { kind: 'reviewed', id: `${article.canonicalUrl}:${article.requestId}` },
                            article.title,
                            `${article.source} · ${article.status === 'interrupted' ? 'Review interrupted' : article.status === 'submitted' ? 'Review pending' : article.outcome === 'selected' ? 'Selected for a briefing' : 'Not selected'} · ${relativeTime(article.reviewedAt)}`,
                            article,
                          ),
                        )}
                        {!reviewed.length && <p className="news-bucket-muted">No reviewed stories yet.</p>}
                        {nextHistoryCount > 0 && (
                          <button
                            className="news-bucket-show-more"
                            onClick={(event) => {
                              const button = event.currentTarget;
                              const first = reviewed[historyLimit];
                              const restoreFocus = button.matches(':focus-visible');
                              setHistoryLimit((limit) => limit + 25);
                              if (!first || !restoreFocus) return;
                              requestAnimationFrame(() => {
                                if (
                                  !document.hasFocus() ||
                                  document.querySelector('dialog[open], :popover-open') ||
                                  (document.activeElement !== button && document.activeElement !== document.body)
                                )
                                  return;
                                const row = [...document.querySelectorAll<HTMLButtonElement>('[data-story-key]')].find(
                                  (item) =>
                                    item.dataset.storyKey === `reviewed:${first.canonicalUrl}:${first.requestId}`,
                                );
                                row?.focus({ preventScroll: true });
                                row?.scrollIntoView({ block: 'nearest' });
                              });
                            }}
                          >
                            Show {nextHistoryCount} more stories
                          </button>
                        )}
                      </section>
                    )}
                  </>
                )}
                {destination === 'favorites' && (
                  <section aria-label="Favorite articles">
                    {favoriteArticles.length ? (
                      favoriteArticles.map((article) =>
                        storyButton(
                          { kind: 'favorite', id: article.canonicalUrl },
                          article.title,
                          `${article.source} · Favorited ${relativeTime(article.favoritedAt)}`,
                          article,
                        ),
                      )
                    ) : (
                      <div className="news-bucket-empty">
                        <Star size={28} aria-hidden="true" />
                        <h2>Keep the stories you like</h2>
                        <p>Star any article to find it here, even after its recording is gone.</p>
                      </div>
                    )}
                  </section>
                )}
              </div>
              {selection && (
                <aside
                  key={selectionKey(selection)}
                  id="news-story-inspector"
                  className="news-bucket-inspector"
                  aria-label="Story inspector"
                  data-reader-key={selectionKey(selection)}
                >
                  <div className="news-bucket-reader-toolbar">
                    <button className="news-bucket-reader-back" onClick={() => closeInspector()}>
                      <ArrowLeft size={16} aria-hidden="true" />
                      Back to stories
                    </button>
                    <span className="news-bucket-reader-eyebrow">
                      {selectedTake
                        ? eligible.some((take) => take.id === selectedTake.id)
                          ? 'Ready to listen'
                          : selectedTake.deliveryState?.status === 'played'
                            ? 'From your history'
                            : 'Saved recording'
                        : selectedScript
                          ? 'Script only'
                          : selectedFavorite
                            ? 'Favorite article'
                            : candidateStory
                              ? 'Source check'
                              : 'Editorial review'}
                    </span>
                    <div className="news-bucket-reader-actions">
                      {inspectedArticle && favoriteButton(inspectedArticle)}
                      <button
                        className="news-bucket-inspector-close"
                        aria-label="Close story details"
                        onClick={() => closeInspector()}
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <header>
                    <h2 ref={readerHeading} tabIndex={-1}>
                      {selectedFavorite?.title ?? selectedTitle}
                    </h2>
                    <p>
                      {inspectedArticle
                        ? `${inspectedArticle.source} · ${publicationTime(inspectedArticle)}`
                        : (selectedSource ?? 'Source unavailable')}
                    </p>
                  </header>
                  {selectedTake ? (
                    renderedTake(selectedTake)
                  ) : selectedScript ? (
                    renderScript(selectedScript)
                  ) : selectedReviewed ? (
                    renderReviewed(selectedReviewed)
                  ) : candidateStory ? (
                    <>
                      <h3 className="news-bucket-preview-label">Story summary</h3>
                      <p className="news-bucket-inspector-script">
                        {candidateStory.summary || 'No summary was saved.'}
                      </p>
                      {selectedCandidateIsInspector && requestWhy && (
                        <details className="news-bucket-detail-disclosure">
                          <summary>Why this story</summary>
                          <p className="news-bucket-muted">{requestWhy}</p>
                        </details>
                      )}
                      {renderArticles([candidateStory])}
                    </>
                  ) : selectedFavorite ? (
                    <>
                      <p className="news-bucket-muted">Saved to Favorites. Open the source to read the article.</p>
                      {renderArticles([selectedFavorite])}
                    </>
                  ) : (
                    <p className="news-bucket-muted">This story is no longer available.</p>
                  )}
                  {selectedTake && <p className="news-bucket-inspector-meta">{selectedStatus}</p>}
                  <ErrorNotice error={audition.audioError ? new Error(audition.audioError) : null} />
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

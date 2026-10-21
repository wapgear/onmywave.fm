import { ExternalLink, Newspaper, Radio } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { eligibleNewsTakes } from '../../../../shared/news-pool';
import { newsPreparationStatus } from '../../../../shared/news-preparation-status';
import type { NewsArticle, NewsBreak, PreparedNewsScript, ReviewedNewsArticle } from '../../../../shared/types';
import { ErrorNotice } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import type { NewsBucketProps } from './NewsBucket.types';

import './NewsBucket.styles.css';

export function NewsBucket({
  library,
  localState,
  automation,
  profileStatusUnknown,
  savedNewsStale,
  openSource,
  openPreparation,
}: NewsBucketProps) {
  const player = usePlayer();
  const [historyLimit, setHistoryLimit] = useState(25);
  const historyList = useRef<HTMLUListElement>(null);
  const revealHistory = useRef<{ button: HTMLButtonElement; key: string } | null>(null);

  useLayoutEffect(() => {
    const pending = revealHistory.current;
    revealHistory.current = null;
    if (!pending) return;
    const active = document.activeElement;
    if (
      (active !== pending.button && !(active === document.body && !pending.button.isConnected)) ||
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

  const pageProfile = localState.roomProfiles.find((room) => room.id === localState.activeRoomProfileId);
  const eligible = pageProfile ? eligibleNewsTakes(library.takes, localState, pageProfile.id) : [];
  const active = player.activeNews;
  const activeBreak = active && player.newsPhase !== 'waiting' && player.newsPhase !== 'idle' ? active : null;
  const scheduled = player.newsPhase === 'waiting' && active ? active : null;
  const onAir = player.newsPhase === 'speaking' ? active : null;
  const runtimePending =
    automation.settings.enabled && automation.room && automation.pending && player.newsPhase === 'idle'
      ? automation.pending
      : null;
  const preparation = pageProfile ? newsPreparationStatus(pageProfile) : null;
  const lastRun = pageProfile?.workflowDraft.newsLastRun;
  const lastLabels = {
    running: 'Check in progress',
    prepared: 'Recording saved',
    'no-news': 'No qualifying story',
    'partial-coverage': 'Incomplete source coverage',
    failed: 'Check failed',
    interrupted: 'Check interrupted',
  };
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
              ? player.lastNews?.news.id === active?.id
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

    return (
      <span>
        {article.source}
        {domain ? ` · ${domain}` : ''}
        {Number.isFinite(Date.parse(article.publishedAt ?? ''))
          ? ` · ${new Date(article.publishedAt!).toLocaleDateString()}`
          : ' · Date unavailable'}
      </span>
    );
  }

  function preparationNotes(warnings: string[]) {
    return warnings.length ? (
      <ul className="news-bucket-preparation-notes" aria-label="Preparation notes">
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    ) : null;
  }

  function story(take: NewsBreak) {
    return (
      <>
        <p className="news-bucket-script">{take.script}</p>
        {take.articles.length ? (
          <ul className="news-bucket-sources">
            {take.articles.map((article) => (
              <li key={`${article.id}-${article.url}`}>
                <button onClick={() => openSource(article.url)}>
                  {article.title}
                  <ExternalLink size={13} aria-hidden="true" />
                </button>
                {articleSource(article)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="news-bucket-muted">No source links were saved with this recording.</p>
        )}
        {preparationNotes(take.warnings)}
      </>
    );
  }

  function savedScript(script: PreparedNewsScript) {
    const request = library.requests.find((value) => value.requestId === script.requestId);
    const origin =
      request?.origin?.kind === 'automatic'
        ? 'Automatic'
        : request?.origin?.kind === 'manual'
          ? 'Manual'
          : 'Origin unavailable';
    const status = request?.status ?? 'saved script';
    const profile =
      request?.origin?.profileName ?? script.provenance.roomName ?? script.provenance.roomId ?? 'Profile unavailable';

    return (
      <article className="news-bucket-draft" key={script.id}>
        <p>{script.script}</p>
        <div className="news-bucket-draft-meta">
          <span>
            {origin} · {status} · Saved {new Date(script.createdAt).toLocaleDateString()} · no saved audio
          </span>
          <span>
            Host: {script.provenance.dj.name} · Profile: {profile}
          </span>
        </div>
        <p className="news-bucket-muted">Saved script only. No recording is saved for this text.</p>
        {script.articles.map((article) => (
          <p className="news-bucket-draft-source" key={`${article.id}-${article.url}`}>
            <button onClick={() => openSource(article.url)}>
              {article.title}
              <ExternalLink size={13} aria-hidden="true" />
            </button>
            {articleSource(article)}
          </p>
        ))}
        {preparationNotes(script.warnings)}
      </article>
    );
  }

  return (
    <section className="news-bucket" aria-labelledby="news-bucket-title">
      <header className="news-bucket-header">
        <div>
          <span className="eyebrow">Your radio</span>
          <h2 id="news-bucket-title">What your DJ will say</h2>
          <p>See what is ready to hear, what was prepared, and where each story came from.</p>
        </div>
        <div className={`news-bucket-status ${onAir ? 'is-live' : ''}`} role="status">
          <span />
          {phaseLabel}
        </div>
      </header>

      <div className="news-bucket-context">
        <Radio size={16} aria-hidden="true" />
        {automation.settings.enabled && automation.room ? (
          <p>
            <strong>Playback: {automation.room.name}</strong> · {runtimeDJ?.name ?? 'DJ not configured'} · Every{' '}
            {automation.settings.everySongs} songs
            {!runtimePending && !onAir && !scheduled
              ? ` · Next check in ${automation.songsUntilBreak} ${automation.songsUntilBreak === 1 ? 'song' : 'songs'}`
              : ''}
          </p>
        ) : (
          <p>
            <strong>Playback is off.</strong> The ready queue below remains available for this profile.
          </p>
        )}
      </div>
      {pageProfile && preparation && (
        <section className="news-bucket-preparation" aria-labelledby="news-preparation-title">
          <div className="news-bucket-section-heading">
            <div>
              <span className="eyebrow">{pageProfile.name}</span>
              <h3 id="news-preparation-title">Automatic news preparation</h3>
            </div>
            <button onClick={openPreparation}>News settings</button>
          </div>
          <p className="news-bucket-muted" role="status">
            {profileStatusUnknown ? (
              <>
                Current automatic preparation status could not be confirmed. Last saved automatic setting:{' '}
                {pageProfile.workflowDraft.newsEnabled ? 'on' : 'off'}. Retry the failed status check above.
              </>
            ) : (
              <>
                <strong>{preparation.label}.</strong> {preparation.detail}
              </>
            )}
          </p>
          {!profileStatusUnknown && (
            <>
              <dl className="news-bucket-counts" aria-label={`Preparation for ${pageProfile.name}`}>
                <div>
                  <dt>Scheduled checks started today</dt>
                  <dd>
                    {preparation.checks} / {preparation.checkLimit}
                  </dd>
                </div>
                <div>
                  <dt>Automatic recordings saved today</dt>
                  <dd>
                    {preparation.recordings} / {preparation.recordingLimit}
                  </dd>
                </div>
                <div>
                  <dt>{savedNewsStale ? 'Last loaded ready recordings' : 'Ready for this profile'}</dt>
                  <dd>{eligible.length}</dd>
                </div>
              </dl>
              <p className="news-bucket-muted">
                Only scheduled preparation is counted for this profile in your Mac's local day. Checks can use paid text
                generation even when no recording is made.
              </p>
              {lastRun ? (
                <div className="news-bucket-last-run">
                  <h4>{lastLabels[lastRun.outcome]}</h4>
                  <time dateTime={lastRun.finishedAt ?? lastRun.startedAt}>
                    {new Date(lastRun.finishedAt ?? lastRun.startedAt).toLocaleString()}
                  </time>
                  {lastRun.message && <p>{lastRun.message}</p>}
                  {lastRun.setupChanged && (
                    <p>
                      This check used an earlier setup. Its result stays saved; new settings apply to future checks.
                    </p>
                  )}
                </div>
              ) : (
                <p className="news-bucket-muted">No scheduled check has been recorded for this profile yet.</p>
              )}
            </>
          )}
          {!pageProfile.room.djId || !pageProfile.room.sourceIds.length || !pageProfile.mood.trim() ? (
            <p className="news-bucket-notice">
              Choose sources, a host, and a mood in News settings to finish setup. Music and saved audio remain
              available.
            </p>
          ) : null}
        </section>
      )}
      {automation.settings.enabled && automation.room && runtimeDiffersFromPage && (
        <p className="news-bucket-notice">
          The DJ is using <strong>{automation.room.name}</strong>. This page shows the ready queue for{' '}
          <strong>{pageProfile?.name ?? 'the selected profile'}</strong>.
        </p>
      )}
      <ErrorNotice error={automation.error ? new Error(automation.error) : null} />

      <section className="news-bucket-feature" aria-labelledby="news-bucket-up-next">
        <div className="news-bucket-section-heading">
          <div>
            <span className="eyebrow">Playback</span>
            <h3 id="news-bucket-up-next">
              {onAir ? 'On air now' : scheduled ? 'Scheduled for this song' : 'Next DJ break'}
            </h3>
          </div>
        </div>
        {activeBreak ? (
          <>
            <p className="news-bucket-phase-note">{phaseLabel}</p>
            <article className="news-bucket-story">{story(activeBreak)}</article>
          </>
        ) : scheduled ? (
          <article className="news-bucket-story">{story(scheduled)}</article>
        ) : runtimePending ? (
          <article className="news-bucket-story">
            {story(runtimePending)}
            <p className="news-bucket-muted">
              Claimed for the DJ shown above. It waits until a song ending can fit the break.
            </p>
          </article>
        ) : (
          <div className="news-bucket-empty">
            <Newspaper size={24} strokeWidth={1.5} />
            <h4>{automation.settings.enabled ? 'No story is currently scheduled' : 'Automatic DJ playback is off'}</h4>
            <p>
              {automation.settings.enabled
                ? 'A story appears here after the DJ claims it for playback. The ready queue below shows matching saved recordings.'
                : 'Stories prepared for this profile stay visible in its ready queue below.'}
            </p>
          </div>
        )}
      </section>

      <section className="news-bucket-ready" aria-labelledby="news-bucket-ready-title">
        <div className="news-bucket-section-heading">
          <div>
            <span className="eyebrow">{savedNewsStale ? 'Last loaded saved news' : 'Saved news'}</span>
            <h3 id="news-bucket-ready-title">
              {savedNewsStale ? 'Last loaded matches for' : 'Ready for'} {pageProfile?.name ?? 'this profile'}
            </h3>
          </div>
          <span>
            {eligible.length} {eligible.length === 1 ? 'recording' : 'recordings'}
          </span>
        </div>
        <p className="news-bucket-muted">
          {savedNewsStale
            ? 'These are the last loaded matches for the saved setup. Refresh status to confirm which recordings are ready now.'
            : 'These recordings match your current setup and are fresh enough to play. Older and already heard stories stay out. The DJ chooses one when a break is due.'}
        </p>
        {!eligible.length ? (
          <p className="news-bucket-history-empty">
            {savedNewsStale
              ? 'No matching recordings were in the last loaded results.'
              : 'No fresh matching recordings are ready for this profile.'}{' '}
            <button className="room-link" onClick={openPreparation}>
              Set up news preparation
            </button>
          </p>
        ) : (
          <ol className="news-bucket-ready-list">
            {eligible.map((take, index) => (
              <li key={take.id}>
                <div className="news-bucket-ready-number">{index + 1}</div>
                <div className="news-bucket-ready-body">
                  <div className="news-bucket-ready-meta">
                    <strong>{take.renderingDJ.name}</strong>
                    <span>Saved {new Date(take.createdAt).toLocaleDateString()}</span>
                  </div>
                  {story(take)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="news-bucket-drafts" aria-labelledby="news-bucket-drafts-title">
        <div className="news-bucket-section-heading">
          <div>
            <span className="eyebrow">{savedNewsStale ? 'Last loaded scripts' : 'Saved history'}</span>
            <h3 id="news-bucket-drafts-title">Saved text across all profiles</h3>
          </div>
          <span>
            {scriptOnly.length}
            {savedNewsStale ? ' last loaded' : ''}
          </span>
        </div>
        <p className="news-bucket-muted">
          These saved records are read-only. New stories and recordings are prepared automatically from your room
          settings.
        </p>
        {!scriptOnly.length ? (
          <div className="news-bucket-draft-empty">
            <p>
              {savedNewsStale
                ? 'No script-only records were in the last loaded results.'
                : 'No saved scripts are waiting without audio.'}
            </p>
          </div>
        ) : (
          <div className="news-bucket-draft-list">{scriptOnly.map(savedScript)}</div>
        )}
      </section>

      <section className="news-bucket-history" aria-labelledby="news-bucket-history-title">
        <div className="news-bucket-section-heading">
          <div>
            <span className="eyebrow">{savedNewsStale ? 'Last loaded article history' : 'Article history'}</span>
            <h3 id="news-bucket-history-title">Reviewed across all profiles</h3>
          </div>
          <span>
            {reviewed.length} {reviewed.length === 1 ? 'story' : 'stories'}
            {savedNewsStale ? ' last loaded' : ''}
          </span>
        </div>
        <p className="news-bucket-muted">Reviewed stories are excluded from future news selection in every profile.</p>
        {!reviewed.length ? (
          <p className="news-bucket-history-empty">
            {savedNewsStale
              ? 'No reviewed stories were in the last loaded history.'
              : 'No stories have been reviewed yet.'}
          </p>
        ) : (
          <>
            <ul ref={historyList} className="news-bucket-reviewed">
              {visibleReviewed.map((article) => (
                <ReviewedRow
                  key={`${article.canonicalUrl}-${article.requestId}`}
                  article={article}
                  openSource={openSource}
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
                      ? { button: event.currentTarget, key: JSON.stringify([first.canonicalUrl, first.requestId]) }
                      : null;
                  setHistoryLimit((limit) => limit + 25);
                }}
              >
                Show {nextHistoryCount} more reviewed {nextHistoryCount === 1 ? 'story' : 'stories'}
              </button>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function ReviewedRow({ article, openSource }: { article: ReviewedNewsArticle; openSource: (url: string) => void }) {
  const outcome =
    article.status === 'interrupted'
      ? 'Review interrupted'
      : article.status === 'submitted'
        ? 'Submitted for review'
        : article.outcome === 'selected'
          ? 'Selected for a briefing'
          : 'Reviewed · not selected';
  let domain = '';
  try {
    domain = new URL(article.url).hostname.replace(/^www\./u, '');
  } catch {
    /* Preserve saved source rows even when a reference is malformed. */
  }

  return (
    <li className="news-bucket-reviewed-row">
      <div>
        <button
          className="news-bucket-article-link"
          data-reviewed-key={JSON.stringify([article.canonicalUrl, article.requestId])}
          onClick={() => openSource(article.url)}
        >
          {article.title}
          <ExternalLink size={13} aria-hidden="true" />
        </button>
        <span>
          {article.source}
          {domain ? ` · ${domain}` : ''}
          {Number.isFinite(Date.parse(article.publishedAt ?? ''))
            ? ` · Published ${new Date(article.publishedAt!).toLocaleDateString()}`
            : ' · Date unavailable'}
        </span>
      </div>
      <div className="news-bucket-reviewed-meta">
        <span>{outcome}</span>
        <time dateTime={article.reviewedAt}>{new Date(article.reviewedAt).toLocaleDateString()}</time>
      </div>
    </li>
  );
}

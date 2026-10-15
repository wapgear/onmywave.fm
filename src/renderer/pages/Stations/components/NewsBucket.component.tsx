import { useState } from 'react';
import { ExternalLink, Newspaper, Radio } from 'lucide-react';
import type { LocalState, NewsArticle, NewsBreak, PreparedNewsLibrary, PreparedNewsTake, PreparedNewsScript, ReviewedNewsArticle } from '../../../../shared/types';
import { eligibleNewsTakes } from '../../../../shared/news-pool';
import { usePlayer } from '../../../player';
import { ErrorNotice } from '../../../components/Shared';
import './NewsBucket.styles.css';

type Automation = {
  settings: LocalState['djPlayback'];
  room?: LocalState['roomProfiles'][number];
  preparing: boolean;
  pending: PreparedNewsTake | null;
  error: string | null;
  songsUntilBreak: number;
};

export function NewsBucket({ library, localState, automation, openSource, openPreparation, openDraft }: {
  library: PreparedNewsLibrary;
  localState: LocalState;
  automation: Automation;
  openSource: (url: string) => void;
  openPreparation: () => void;
  openDraft: (script: PreparedNewsScript) => void;
}) {
  const player = usePlayer();
  const [historyLimit, setHistoryLimit] = useState(25);
  const pageProfile = localState.roomProfiles.find(room => room.id === localState.activeRoomProfileId);
  const eligible = pageProfile ? eligibleNewsTakes(library.takes, localState, pageProfile.id) : [];
  const active = player.activeNews;
  const activeBreak = active && player.newsPhase !== 'waiting' && player.newsPhase !== 'idle' ? active : null;
  const scheduled = player.newsPhase === 'waiting' && active ? active : null;
  const onAir = player.newsPhase === 'speaking' ? active : null;
  const runtimePending = automation.settings.enabled && automation.room && automation.pending && player.newsPhase === 'idle' ? automation.pending : null;
  const pageDj = localState.djs.find(dj => dj.id === pageProfile?.room.djId);
  const pageSources = [...new Set(pageProfile?.room.sourceIds ?? [])].map(id => localState.sources.find(source => source.id === id)).filter((source): source is NonNullable<typeof source> => Boolean(source));
  const pageInterests = pageProfile?.workflowDraft.newsInterests ?? pageDj?.news?.interests ?? '';
  const pageDrafts = pageProfile && pageDj ? library.scripts.filter(script => !library.takes.some(take => take.scriptId === script.id)
    && matchesProfile(script, pageProfile, pageDj, pageInterests, pageSources))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  const reviewed = [...(library.reviewedArticles ?? [])].sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt));
  const visibleReviewed = reviewed.slice(0, historyLimit);
  const runtimeDJ = localState.djs.find(dj => dj.id === automation.room?.room.djId);
  const runtimeDiffersFromPage = !!automation.room && pageProfile?.id !== automation.room.id;
  const phaseLabel = player.newsPhase === 'speaking' ? 'On air'
    : player.newsPhase === 'fading' ? 'Lowering music'
      : player.newsPhase === 'lead-in' ? 'Starting DJ break'
        : player.newsPhase === 'tail' ? 'Returning to music'
          : player.newsPhase === 'paused' ? player.lastNews?.news.id === active?.id ? 'DJ break paused' : 'Break paused before speech'
            : scheduled ? 'Scheduled for this song'
              : player.newsLoading ? 'Loading audio'
                : automation.error ? 'Needs attention'
                  : automation.settings.enabled && automation.preparing ? 'Checking the ready pool'
                    : runtimePending ? 'Ready for the next suitable song'
                      : automation.settings.enabled ? 'Waiting for the next check' : 'DJ playback is off';

  function articleSource(article: NewsArticle) {
    let domain = '';
    try { domain = new URL(article.url).hostname.replace(/^www\./u, ''); } catch { /* Some saved references may have an invalid URL. */ }
    return <span>{article.source}{domain ? ` · ${domain}` : ''}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString()}` : ''}</span>;
  }

  function story(take: NewsBreak) {
    return <>
      <p className="news-bucket-script">{take.script}</p>
      {take.articles.length ? <ul className="news-bucket-sources">{take.articles.map(article => <li key={`${article.id}-${article.url}`}>
        <button onClick={() => openSource(article.url)}>{article.title}<ExternalLink size={13} aria-hidden="true" /></button>
        {articleSource(article)}
      </li>)}</ul> : <p className="news-bucket-muted">No source links were saved with this recording.</p>}
    </>;
  }

  function draft(script: PreparedNewsScript) {
    return <article className="news-bucket-draft" key={script.id}><p>{script.script}</p><div className="news-bucket-draft-meta"><span>Draft · {script.provenance.dj.name} · {new Date(script.createdAt).toLocaleDateString()} · audio not generated</span><button onClick={() => openDraft(script)}>Review draft</button></div>
      {script.articles.map(article => <p className="news-bucket-draft-source" key={`${article.id}-${article.url}`}><button onClick={() => openSource(article.url)}>{article.title}<ExternalLink size={13} aria-hidden="true" /></button>{articleSource(article)}</p>)}
    </article>;
  }

  return <section className="news-bucket" aria-labelledby="news-bucket-title">
    <header className="news-bucket-header">
      <div><span className="eyebrow">Editorial inbox</span><h2 id="news-bucket-title">What your DJ will say</h2>
        <p>Review the stories in the queue and see which articles have already been reviewed.</p></div>
      <div className={`news-bucket-status ${onAir ? 'is-live' : ''}`} role="status"><span />{phaseLabel}</div>
    </header>

    <div className="news-bucket-context">
      <Radio size={16} aria-hidden="true" />
      {automation.settings.enabled && automation.room
        ? <p><strong>Playback: {automation.room.name}</strong> · {runtimeDJ?.name ?? 'DJ not configured'} · Every {automation.settings.everySongs} songs{!runtimePending && !onAir && !scheduled ? ` · Next check in ${automation.songsUntilBreak} ${automation.songsUntilBreak === 1 ? 'song' : 'songs'}` : ''}</p>
        : <p><strong>Playback is off.</strong> The ready queue below remains available for this profile.</p>}
    </div>
    {automation.settings.enabled && automation.room && runtimeDiffersFromPage && <p className="news-bucket-notice">The DJ is using <strong>{automation.room.name}</strong>. This page shows the ready queue for <strong>{pageProfile?.name ?? 'the selected profile'}</strong>.</p>}
    <ErrorNotice error={automation.error ? new Error(automation.error) : null} />

    <section className="news-bucket-feature" aria-labelledby="news-bucket-up-next">
      <div className="news-bucket-section-heading"><div><span className="eyebrow">Playback</span><h3 id="news-bucket-up-next">{onAir ? 'On air now' : scheduled ? 'Scheduled for this song' : 'Actual DJ queue'}</h3></div></div>
      {activeBreak ? <><p className="news-bucket-phase-note">{phaseLabel}</p><article className="news-bucket-story">{story(activeBreak)}</article></>
        : scheduled ? <article className="news-bucket-story">{story(scheduled)}</article>
          : runtimePending ? <article className="news-bucket-story">{story(runtimePending)}<p className="news-bucket-muted">Claimed for the DJ shown above. It waits until a song ending can fit the break.</p></article>
            : <div className="news-bucket-empty"><Newspaper size={24} strokeWidth={1.5} /><h4>{automation.settings.enabled ? 'No story is currently scheduled' : 'Automatic DJ playback is off'}</h4><p>{automation.settings.enabled ? 'A story appears here after the DJ claims it for playback. The ready queue below shows matching saved recordings.' : 'Stories prepared for this profile stay visible in its ready queue below.'}</p></div>}
    </section>

    <section className="news-bucket-ready" aria-labelledby="news-bucket-ready-title">
      <div className="news-bucket-section-heading"><div><span className="eyebrow">Eligible pool</span><h3 id="news-bucket-ready-title">Ready for {pageProfile?.name ?? 'this profile'}</h3></div><span>{eligible.length} {eligible.length === 1 ? 'recording' : 'recordings'}</span></div>
      <p className="news-bucket-muted">These recordings match this profile and freshness rules. They are not scheduled until the DJ claims one.</p>
      {!eligible.length ? <p className="news-bucket-history-empty">No fresh matching recordings are ready for this profile.</p> : <ol className="news-bucket-ready-list">{eligible.map((take, index) => <li key={take.id}><div className="news-bucket-ready-number">{index + 1}</div><div className="news-bucket-ready-body"><div className="news-bucket-ready-meta"><strong>{take.renderingDJ.name}</strong><span>Saved {new Date(take.createdAt).toLocaleDateString()}</span></div>{story(take)}</div></li>)}</ol>}
    </section>

    <section className="news-bucket-drafts" aria-labelledby="news-bucket-drafts-title">
      <div className="news-bucket-section-heading"><div><span className="eyebrow">In preparation</span><h3 id="news-bucket-drafts-title">Drafts for {pageProfile?.name ?? 'this profile'}</h3></div><span>{pageDrafts.length}</span></div>
      {!pageDrafts.length ? <div className="news-bucket-draft-empty"><p>No drafts are waiting for audio.</p><button onClick={openPreparation}>Prepare a story</button></div> : <div className="news-bucket-draft-list">{pageDrafts.map(draft)}</div>}
    </section>

    <section className="news-bucket-history" aria-labelledby="news-bucket-history-title">
      <div className="news-bucket-section-heading"><div><span className="eyebrow">Global review history</span><h3 id="news-bucket-history-title">Reviewed across all profiles</h3></div><span>{reviewed.length} {reviewed.length === 1 ? 'story' : 'stories'}</span></div>
      <p className="news-bucket-muted">Reviewed stories are excluded from future news selection in every profile.</p>
      {!reviewed.length ? <p className="news-bucket-history-empty">No stories have been reviewed yet.</p> : <><ul className="news-bucket-reviewed">{visibleReviewed.map(article => <ReviewedRow key={`${article.canonicalUrl}-${article.requestId}`} article={article} openSource={openSource} />)}</ul>{reviewed.length > visibleReviewed.length && <button className="news-bucket-show-more" onClick={() => setHistoryLimit(limit => limit + 25)}>Show 25 more reviewed stories</button>}</>}
    </section>
  </section>;
}

function matchesProfile(script: PreparedNewsScript, profile: LocalState['roomProfiles'][number], dj: LocalState['djs'][number], interests: string, sources: LocalState['sources']): boolean {
  if (script.provenance.roomId && script.provenance.roomId !== profile.id) return false;
  if (script.provenance.dj.id !== dj.id || JSON.stringify(script.provenance.dj) !== JSON.stringify(dj) || script.provenance.mood !== profile.mood) return false;
  if ((script.provenance.newsInterests ?? script.provenance.dj.news?.interests ?? '') !== interests) return false;
  const identity = (items: LocalState['sources']) => items.map(source => ({ id: source.id, url: source.url })).sort((a, b) => a.id.localeCompare(b.id) || a.url.localeCompare(b.url));
  return JSON.stringify(identity(script.provenance.sources)) === JSON.stringify(identity(sources));
}

function ReviewedRow({ article, openSource }: { article: ReviewedNewsArticle; openSource: (url: string) => void }) {
  const outcome = article.status === 'interrupted' ? 'Review interrupted'
    : article.status === 'submitted' ? 'Submitted for review'
      : article.outcome === 'selected' ? 'Selected for a briefing' : 'Reviewed · not selected';
  let domain = '';
  try { domain = new URL(article.url).hostname.replace(/^www\./u, ''); } catch { /* Preserve saved source rows even when a reference is malformed. */ }
  return <li className="news-bucket-reviewed-row"><div><button className="news-bucket-article-link" onClick={() => openSource(article.url)}>{article.title}<ExternalLink size={13} aria-hidden="true" /></button><span>{article.source}{domain ? ` · ${domain}` : ''}{article.publishedAt ? ` · Published ${new Date(article.publishedAt).toLocaleDateString()}` : ''}</span></div><div className="news-bucket-reviewed-meta"><span>{outcome}</span><time dateTime={article.reviewedAt}>{new Date(article.reviewedAt).toLocaleDateString()}</time></div></li>;
}

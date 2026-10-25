import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Headphones, LoaderCircle, Pause, Play, Square } from 'lucide-react';
import { useState } from 'react';

import type { PreparedNewsTake } from '../../../../shared/types';
import { unwrap } from '../../../api';
import { ErrorNotice, duration } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import { useSavedNewsAudition } from './hooks/useSavedNewsAudition';
import type { PreparedTakesProps } from './PreparedTakes.types';

import './PreparedTakes.styles.css';

const provider = (take: PreparedNewsTake) =>
  take.engine === 'elevenlabs-v4' ? 'ElevenLabs' : take.engine === 'openai-tts' ? 'OpenAI' : 'Saved recording';

const savedDate = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Saved take';

export function PreparedTakes({ library, refresh, active = true }: PreparedTakesProps) {
  const player = usePlayer();
  const [stopFocusRun, setStopFocusRun] = useState<{
    element: HTMLButtonElement;
    runId?: number;
    stopped?: boolean;
  } | null>(null);
  const breakStatus = {
    idle: '',
    waiting: 'DJ break scheduled for the end of this song.',
    fading: 'Lowering the music for your DJ.',
    'lead-in': 'Your DJ starts shortly.',
    speaking: 'Your DJ is on air.',
    tail: 'Finishing the break before music resumes.',
    paused: 'DJ break paused. Use the player to resume.',
  }[player.newsPhase];
  const { audition, durations, audioError, listen, stop } = useSavedNewsAudition({ active });
  const takes = [...library.takes].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id.localeCompare(a.id),
  );
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });

  const activeTake = library.takes.find((take) => take.id === player.activeNewsId);
  const savedBreakActive = !!activeTake && player.newsPhase !== 'idle';
  const ownsStopFocus = active && stopFocusRun !== null && document.activeElement === stopFocusRun.element;
  const staleStopFocus = ownsStopFocus && savedBreakActive && stopFocusRun.runId !== player.newsRunId;
  const canStopBreak = savedBreakActive && !staleStopFocus && player.newsRunId !== undefined;

  return (
    <section className="prepared-takes" aria-labelledby="prepared-takes-title">
      <header className="prepared-takes-heading">
        <div>
          <h2 id="prepared-takes-title">Saved audio</h2>
          <p>Listen to saved recordings and review their scripts, settings, and sources.</p>
        </div>
        <button onClick={() => void refresh()}>Refresh</button>
      </header>
      {(savedBreakActive || ownsStopFocus) && (
        <div className="prepared-on-air">
          <span role="status">
            {staleStopFocus
              ? 'Previous DJ break ended. Use the player controls for the current break.'
              : savedBreakActive
                ? `${activeTake!.renderingDJ.name} · ${savedDate(activeTake!.createdAt)}. ${breakStatus}`
                : stopFocusRun?.stopped
                  ? 'DJ break stopped.'
                  : 'DJ break ended.'}
          </span>
          <button
            onFocus={(event) => setStopFocusRun({ element: event.currentTarget, runId: player.newsRunId })}
            onBlur={() => setStopFocusRun(null)}
            aria-disabled={!canStopBreak || undefined}
            onClick={() => {
              const runId = ownsStopFocus ? stopFocusRun.runId : player.newsRunId;
              if (canStopBreak && runId !== undefined && player.controlNews(runId, 'stop'))
                setStopFocusRun((value) => (value ? { ...value, stopped: true } : value));
            }}
          >
            {staleStopFocus
              ? 'Previous break ended'
              : savedBreakActive
                ? player.newsPhase === 'waiting'
                  ? 'Cancel scheduled break'
                  : 'Stop break'
                : stopFocusRun?.stopped
                  ? 'Break stopped'
                  : 'Break ended'}
          </button>
        </div>
      )}
      <ErrorNotice error={audioError ? new Error(audioError) : null} />
      {!takes.length && (
        <div className="prepared-empty">
          <Headphones size={28} />
          <h3>No saved audio yet</h3>
          <p>Automatically prepared recordings will appear here.</p>
        </div>
      )}
      <ol className="prepared-take-list">
        {takes.map((take) => {
          const current = audition?.id === take.id ? audition : null;
          const measured = durations[take.id];

          return (
            <li
              key={take.id}
              id={`prepared-take-${take.id}`}
              tabIndex={-1}
              aria-label={`Saved take from ${savedDate(take.createdAt)}`}
              className="prepared-take"
            >
              <div className="prepared-take-heading">
                <div>
                  <h3>{take.renderingDJ.name || 'Saved DJ take'}</h3>
                  <p>
                    <time dateTime={take.createdAt}>{savedDate(take.createdAt)}</time> · {provider(take)} · {take.voice}
                  </p>
                </div>
              </div>
              <div className="prepared-audition">
                <button
                  disabled={!take.available}
                  onClick={() => void listen(take)}
                  aria-label={
                    current?.phase === 'loading'
                      ? 'Cancel loading audition'
                      : current?.phase === 'playing'
                        ? 'Pause audition'
                        : current?.phase === 'paused'
                          ? 'Resume audition'
                          : `Audition take from ${savedDate(take.createdAt)}`
                  }
                >
                  {current?.phase === 'loading' ? (
                    <LoaderCircle size={15} className="spinning" />
                  ) : current?.phase === 'playing' ? (
                    <Pause size={15} />
                  ) : (
                    <Play size={15} />
                  )}
                  {current?.phase === 'loading'
                    ? 'Loading…'
                    : current?.phase === 'playing'
                      ? 'Pause'
                      : current?.phase === 'paused'
                        ? 'Resume'
                        : 'Listen'}
                </button>
                {current && (
                  <button onClick={stop} aria-label="Stop audition">
                    <Square size={13} />
                    Stop
                  </button>
                )}
                <span className="prepared-duration">
                  {current ? `${duration(current.position)} / ` : ''}
                  {measured ? duration(measured) : 'Duration checked on listen'}
                </span>
              </div>
              {!take.available && (
                <p className="prepared-missing">
                  The saved audio file is missing or incomplete. Its script, settings, and source details remain in the
                  archive.
                </p>
              )}
              {take.deliveryState?.status === 'started' && player.activeNewsId !== take.id && (
                <p className="prepared-help">
                  This recording may already have played and stays out of automatic breaks. You can still listen here.
                </p>
              )}
              <p className="prepared-script">{take.script}</p>
              <details className="prepared-provenance">
                <summary>Saved mood, settings, and sources</summary>
                <dl>
                  <div>
                    <dt>Mood</dt>
                    <dd>{take.provenance.mood || 'No mood specified'}</dd>
                  </div>
                  <div>
                    <dt>News interests</dt>
                    <dd>
                      {(take.provenance.newsInterests ?? take.provenance.dj.news?.interests) ||
                        'Any topics from selected sources'}
                    </dd>
                  </div>
                  <div>
                    <dt>Writing DJ</dt>
                    <dd>{take.provenance.dj.name}</dd>
                  </div>
                  <div>
                    <dt>Audio model</dt>
                    <dd>{take.model}</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>{take.delivery || 'Default delivery'}</dd>
                  </div>
                  <div>
                    <dt>Voice</dt>
                    <dd>{take.voice}</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>{take.renderingDJ.language || 'Default'}</dd>
                  </div>
                  <div>
                    <dt>Personality</dt>
                    <dd>{take.renderingDJ.personality || 'Default delivery'}</dd>
                  </div>
                </dl>
                {!!take.provenance.sources.length && (
                  <div className="prepared-source-links">
                    <h4>Configured feeds</h4>
                    {take.provenance.sources.map((feed) => (
                      <button key={feed.id} onClick={() => source.mutate(feed.url)}>
                        <ExternalLink size={12} />
                        <span>{feed.name || feed.url}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!!take.articles.length && (
                  <div className="prepared-source-links">
                    <h4>Story references</h4>
                    {take.articles.map((article) => (
                      <div key={article.id}>
                        <button onClick={() => source.mutate(article.url)}>
                          <ExternalLink size={12} />
                          <span>{article.title}</span>
                        </button>
                        <p>
                          {article.source}
                          {Number.isFinite(Date.parse(article.publishedAt ?? ''))
                            ? ` · ${savedDate(article.publishedAt!)}`
                            : ' · Date unavailable'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {!!take.warnings.length && (
                  <ul className="prepared-warnings">
                    {take.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                )}
              </details>
              <p className="prepared-take-footer">Saved locally</p>
            </li>
          );
        })}
      </ol>
      <ErrorNotice error={source.error} />
    </section>
  );
}

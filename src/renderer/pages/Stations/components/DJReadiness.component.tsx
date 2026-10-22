import type { ReactNode } from 'react';

type DJReadinessProps = {
  preparationProfile: string;
  preparationStatus: string;
  savedAudioLabel: string;
  savedAudioStatus: string;
  playbackStatus: string;
  openDJControls: () => void;
  nextStep: { message: string; action?: { label: string; run: () => void; kind?: 'playback' } };
  children?: ReactNode;
};

export function DJReadiness({
  preparationProfile,
  preparationStatus,
  savedAudioLabel,
  savedAudioStatus,
  playbackStatus,
  openDJControls,
  nextStep,
  children,
}: DJReadinessProps) {
  return (
    <section className="dj-readiness" aria-labelledby="dj-readiness-title">
      <div className="dj-readiness-main">
        <h2 id="dj-readiness-title">DJ setup</h2>
        <dl className="dj-readiness-facts">
          <div>
            <dt>Preparation · {preparationProfile}</dt>
            <dd>{preparationStatus}</dd>
          </div>
          <div>
            <dt>{savedAudioLabel}</dt>
            <dd>{savedAudioStatus}</dd>
          </div>
          <div>
            <dt>Playback</dt>
            <dd className="dj-readiness-playback">
              <span>{playbackStatus}</span>
              {nextStep.action?.kind !== 'playback' && (
                <button className="room-link" onClick={openDJControls}>
                  DJ controls
                </button>
              )}
            </dd>
          </div>
        </dl>
        {children}
      </div>
      <div className="dj-readiness-next">
        <span>Next step: {nextStep.message}</span>
        {nextStep.action ? (
          <>
            <button onClick={nextStep.action.run}>{nextStep.action.label}</button>
          </>
        ) : null}
      </div>
    </section>
  );
}

import { Mic } from 'lucide-react';

import type { DJPlaybackSettingsPatch } from '../../../../shared/dj-playback';
import {
  ANNOUNCEMENT_LINES_MAX_LENGTH,
  announcementLinesError,
  announcementStyles,
  announcementTemplates,
  formatSongAnnouncement,
  type AnnouncementStyle,
} from '../../../../shared/song-announcements';

import './SongAnnouncementPreferences.styles.css';

const styleDescriptions: Record<AnnouncementStyle, string> = {
  varied: 'Mix the three styles',
  warm: 'Relaxed and companionable',
  energetic: 'Lively and inviting',
  minimal: 'Straight to the music',
  custom: 'Write your introductions',
};

export function SongAnnouncementPreferences({
  style,
  lines,
  disabled,
  onChange,
}: {
  style: AnnouncementStyle;
  lines: string;
  disabled: boolean;
  onChange: (patch: DJPlaybackSettingsPatch) => void;
}) {
  const error = announcementLinesError(style, lines);
  const examples = style === 'custom' && !error ? announcementTemplates(style, lines).slice(0, 3) : [];

  return (
    <div className="song-announcement-preferences">
      <div className="song-announcement-heading">
        <h3 id="announcement-style-title">Wording style</h3>
        <span className="song-announcement-voice preference-note">
          <Mic size={12} aria-hidden="true" />
          Your DJ’s saved voice
        </span>
      </div>
      <p className="preference-note" id="announcement-style-hint">
        Choose how your DJ introduces the next song.
      </p>
      <fieldset
        className="song-announcement-styles"
        id="announcement-style"
        disabled={disabled}
        aria-labelledby="announcement-style-title"
        aria-describedby="announcement-style-hint announcement-variety-hint announcement-preview-hint"
      >
        {announcementStyles.map((option) => {
          const template =
            option.value === 'varied' || option.value === 'custom'
              ? null
              : announcementTemplates(option.value, '')[option.value === 'warm' ? 1 : 0];

          return (
            <label key={option.value} className="song-announcement-choice">
              <input
                type="radio"
                name="announcement-style"
                value={option.value}
                checked={style === option.value}
                aria-labelledby={`announcement-style-${option.value}-label`}
                aria-describedby={`announcement-style-${option.value}-description announcement-style-${option.value}-example`}
                onChange={() => onChange({ announcementStyle: option.value })}
              />
              <span className="song-announcement-choice-heading">
                <span id={`announcement-style-${option.value}-label`} className="song-announcement-choice-title">
                  {option.label}
                </span>
                <span id={`announcement-style-${option.value}-description`} className="preference-note">
                  {styleDescriptions[option.value]}
                </span>
              </span>
              <span id={`announcement-style-${option.value}-example`} className="song-announcement-choice-example">
                {template
                  ? formatSongAnnouncement(template, 'Midnight City', 'M83')
                  : option.value === 'varied'
                    ? 'A mix of warm, upbeat and short introductions.'
                    : 'Use your own wording, spoken by your DJ.'}
              </span>
              <span className="song-announcement-selected" aria-hidden="true">
                {style === option.value ? 'Selected' : ''}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="preference-note" id="announcement-preview-hint">
        Text examples · No credits used
      </p>
      <p className="preference-note" id="announcement-variety-hint">
        Wording varies between new recordings. A repeated song may reuse its introduction.
      </p>
      {style === 'custom' && (
        <>
          <label htmlFor="announcement-lines">Your announcement lines</label>
          <textarea
            id="announcement-lines"
            value={lines}
            disabled={disabled}
            required
            rows={4}
            maxLength={ANNOUNCEMENT_LINES_MAX_LENGTH}
            placeholder={'Let’s get lost in {track}.\nYour next little escape: {track}.'}
            aria-describedby={`announcement-lines-hint${error ? ' announcement-lines-error' : ''}`}
            aria-invalid={!!error}
            onChange={(event) => onChange({ announcementLines: event.target.value })}
          />
          <p className="preference-note" id="announcement-lines-hint">
            One line per introduction, up to 12 lines of 200 characters. Include {'{track}'} once in each line for the
            title and artist. Write in any language; add several lines for variety.
          </p>
          {error && (
            <p className="song-announcement-error" id="announcement-lines-error" role="status">
              {error}
            </p>
          )}
        </>
      )}
      {examples.length > 0 && (
        <div className="song-announcement-examples" aria-label="Announcement examples">
          <p className="preference-note">A few ways it could sound</p>
          <ul>
            {examples.map((template) => (
              <li key={template}>{formatSongAnnouncement(template, 'Midnight City', 'M83')}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

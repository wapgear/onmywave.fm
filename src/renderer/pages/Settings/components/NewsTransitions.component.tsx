import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import { defaultNewsTransitionSettings } from '../../../../shared/news-transitions';
import type { NewsTransitionSettings } from '../../../../shared/types';
import { unwrap } from '../../../api';
import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { Select } from '../../../components/Select/Select.component';
import { ErrorNotice } from '../../../components/Shared';
import { useRetryFocus } from '../../../useRetryFocus';
import { useGeneralSettingsEdits } from '../SettingsEdits';
import { NewsTransitionPreview } from './NewsTransitionPreview.component';

import './NewsTransitions.styles.css';

const presets: { id: string; name: string; settings: NewsTransitionSettings }[] = [
  { id: 'natural', name: 'Natural', settings: defaultNewsTransitionSettings() },
  {
    id: 'tight',
    name: 'Tight',
    settings: {
      mode: 'over-music',
      fadeOutSeconds: 0.5,
      leadInSeconds: 0.2,
      postSpeechSeconds: 0.2,
      fadeInSeconds: 0.5,
    },
  },
  { id: 'bulletin', name: 'News bulletin', settings: { ...defaultNewsTransitionSettings(), mode: 'between-songs' } },
];

const fields = [
  { key: 'fadeOutSeconds', label: 'Lower music over', max: 5 },
  {
    key: 'leadInSeconds',
    label: 'Breathing room before speech',
    max: 3,
  },
  { key: 'postSpeechSeconds', label: 'Pause after speech', max: 3 },
  { key: 'fadeInSeconds', label: 'Bring music back over', max: 5 },
] as const;

export function NewsTransitions() {
  const styleId = useId();
  const modeId = useId();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const heading = useRef<HTMLHeadingElement>(null);
  const transitionStyle = useRef<HTMLSelectElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [ownsSaveFocus, setOwnsSaveFocus] = useState(false);
  const retryFocus = useRetryFocus({
    ownerKey: 'settings:general:news-transitions',
    target: () =>
      transitionStyle.current && !transitionStyle.current.matches(':disabled')
        ? transitionStyle.current
        : heading.current,
    canFocusSuccess: () => !state.isError && !state.isFetching && !!state.data,
  });
  const edit = useGeneralSettingsEdits().transitions;
  const { draft, save } = edit;
  const settings = draft ?? state.data?.newsTransitions ?? defaultNewsTransitionSettings();
  const preset = presets.find((item) =>
    Object.entries(item.settings).every(([key, value]) => settings[key as keyof NewsTransitionSettings] === value),
  );
  function change(patch: Partial<NewsTransitionSettings>) {
    edit.change({ ...settings, ...patch });
  }

  return (
    <section className="news-transition-settings" aria-labelledby="news-transitions-title">
      <SectionHeading
        title="DJ transitions"
        helpLabel="DJ transition timing"
        ref={heading}
        tabIndex={-1}
        id="news-transitions-title"
      >
        <p>Saved timings apply to the next scheduled break.</p>
        <p>
          Over music keeps a quiet music bed beneath the DJ; between songs lets the song finish before speech starts.
          Standalone song introductions always play between songs.
        </p>
        <p>
          Preview uses your current timings without saving, with sample music and a saved voice. It makes no generation
          requests. Your music stays paused afterward; changing songs or seeking stops the sample.
        </p>
      </SectionHeading>
      <ErrorNotice
        error={state.error}
        retryRef={retryFocus.retryRef}
        retrying={state.isFetching}
        retry={() => retryFocus.retry(() => state.refetch())}
      />
      {state.isPending && <p role="status">Loading transition settings…</p>}
      <form
        className="preference-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (save.isPending || !draft || !state.data) return;
          const button = saveButton.current;
          const active = document.activeElement;
          if (
            button &&
            active instanceof HTMLElement &&
            event.currentTarget.contains(active) &&
            document.visibilityState === 'visible' &&
            document.hasFocus() &&
            !document.querySelector('dialog[open], :popover-open')
          ) {
            button.focus({ preventScroll: true });
            button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
          edit.submit();
        }}
      >
        <fieldset className="preference-fields" disabled={!state.data || save.isPending}>
          <div className="news-transition-grid">
            <label htmlFor={styleId}>
              Transition style
              <Select
                id={styleId}
                ref={transitionStyle}
                value={preset?.id ?? 'custom'}
                onChange={(event) => {
                  const selected = presets.find((item) => item.id === event.target.value);
                  if (selected) change(selected.settings);
                }}
              >
                <option value="custom" disabled>
                  Custom
                </option>
                {presets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label htmlFor={modeId}>
              Play the DJ
              <Select
                id={modeId}
                value={settings.mode}
                onChange={(event) => change({ mode: event.target.value as NewsTransitionSettings['mode'] })}
              >
                <option value="over-music">Over the end of a song</option>
                <option value="between-songs">Between songs</option>
              </Select>
            </label>
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                <div className="news-transition-time">
                  <input
                    type="number"
                    min={0}
                    max={field.max}
                    step="0.1"
                    required
                    value={Number.isNaN(settings[field.key]) ? '' : settings[field.key]}
                    onChange={(event) =>
                      change({ [field.key]: event.target.value === '' ? NaN : Number(event.target.value) })
                    }
                  />
                  <span>seconds</span>
                </div>
              </label>
            ))}
          </div>
          <NewsTransitionPreview key={JSON.stringify(settings)} settings={settings} />
        </fieldset>
        <button
          ref={saveButton}
          type="submit"
          className="primary settings-save"
          disabled={!save.isPending && (!state.data || (!draft && !ownsSaveFocus))}
          aria-disabled={save.isPending || !draft || !state.data || undefined}
          aria-busy={save.isPending || undefined}
          onFocus={() => setOwnsSaveFocus(true)}
          onBlur={() => setOwnsSaveFocus(false)}
        >
          {save.isPending ? 'Saving…' : 'Save DJ transitions'}
        </button>
        <ErrorNotice error={save.error} />
        {save.isSuccess && !draft && (
          <p className="form-hint" role="status">
            DJ transitions saved.
          </p>
        )}
      </form>
    </section>
  );
}

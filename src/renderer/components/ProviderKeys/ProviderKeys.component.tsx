import { useId, useRef, useState } from 'react';
import { useRetryFocus } from '../../useRetryFocus';
import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../../api';
import { ErrorNotice } from '../Shared';
import { InfoHelp } from '../InfoHelp/InfoHelp.component';
import { TwitterSetupHelp } from './TwitterSetupHelp.component';
import { useProviderKeyEdit } from './ProviderKeyEdits';
import './ProviderKeys.styles.css';

export function ProviderKeys({ disabled = false }: { disabled?: boolean }) {
  return (
    <div className="provider-keys">
      <div className="provider-keys-heading">
        <h2>Provider keys</h2>
        <InfoHelp label="About provider keys">
          <p>
            Twitter / X uses your bearer token to search recent posts. OpenAI prepares news text. ElevenLabs generates
            all new voice audio.
          </p>
          <p>
            Keys use protected storage when available. Session-only keys must be entered again after quitting. Saved
            recordings play without keys.
          </p>
          <p>
            Provider keys apply to this app on this Mac when you switch music accounts. Signing out clears entered key
            text. A key change already saving can still finish.
          </p>
          <p>
            Preparing text sends selected source content, news interests, DJ preferences, and mood to OpenAI. Generating
            audio sends the reviewed script and voice preferences to your chosen provider and uses that provider's
            account.
          </p>
        </InfoHelp>
      </div>
      <ProviderKey provider="openai" disabled={disabled} />
      <ProviderKey provider="elevenlabs" disabled={disabled} />
      <ProviderKey provider="twitter" disabled={disabled} />
    </div>
  );
}
function ProviderKey({ provider, disabled }: { provider: 'openai' | 'elevenlabs' | 'twitter'; disabled: boolean }) {
  const edit = useProviderKeyEdit(provider);
  const { draft: key, queryKey } = edit;
  const name =
    provider === 'openai'
      ? 'OpenAI · information and preparation'
      : provider === 'elevenlabs'
        ? 'ElevenLabs · voice'
        : 'Twitter / X · recent search';
  const status = useQuery({
    queryKey,
    meta: { aiOperation: true },
    queryFn: async () =>
      unwrap(
        await (provider === 'openai'
          ? window.wave.getAiStatus()
          : provider === 'elevenlabs'
            ? window.wave.getElevenLabsStatus()
            : window.wave.getTwitterStatus()),
      ),
  });
  const busy = disabled || edit.pending;
  const [focusedAction, setFocusedAction] = useState<{ action: 'save' | 'remove'; element: HTMLButtonElement } | null>(
    null,
  );
  const ownsFocus = (action: 'save' | 'remove') =>
    !disabled && focusedAction?.action === action && document.activeElement === focusedAction.element;
  const saveUnavailable = busy || !key.trim();
  const removeUnavailable = busy || !status.data?.configured;
  const focusProps = (action: 'save' | 'remove') => ({
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => setFocusedAction({ action, element: event.currentTarget }),
    onBlur: () => setFocusedAction(null),
  });
  const statusHeading = useRef<HTMLHeadingElement>(null);
  const statusId = useId();
  const retryFocus = useRetryFocus({
    ownerKey: JSON.stringify(queryKey),
    target: () => statusHeading.current,
    canFocusSuccess: () => !busy && status.isSuccess && !status.isFetching,
  });
  return (
    <section className="provider-key">
      <div className="provider-key-status">
        <h3 ref={statusHeading} tabIndex={-1} aria-describedby={statusId}>
          {name}
        </h3>
        <span id={statusId}>
          {status.isFetching || status.isPending
            ? 'Checking key…'
            : status.error
              ? 'Key status unavailable'
              : status.data?.configured
                ? status.data.sessionOnly
                  ? 'Available this session'
                  : 'Key saved'
                : 'No key configured'}
        </span>
      </div>
      <label>
        {name} {provider === 'twitter' ? 'bearer token' : 'API key'}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          value={key}
          placeholder={
            status.data?.configured
              ? 'Enter a replacement key'
              : provider === 'twitter'
                ? 'Enter your bearer token'
                : 'Enter your API key'
          }
          onChange={(event) => {
            edit.setDraft(event.target.value);
          }}
        />
      </label>
      <div className="provider-key-actions">
        <button
          type="button"
          {...focusProps('save')}
          disabled={saveUnavailable && !ownsFocus('save')}
          aria-disabled={saveUnavailable || undefined}
          aria-busy={edit.pending || undefined}
          onClick={() => {
            if (!saveUnavailable) edit.submit(key.trim());
          }}
        >
          {edit.pending ? 'Updating key…' : !key.trim() && ownsFocus('save') && !edit.error ? 'Key saved' : 'Save key'}
        </button>
        {(status.data?.configured || ownsFocus('remove')) && (
          <button
            type="button"
            {...focusProps('remove')}
            disabled={removeUnavailable && !ownsFocus('remove')}
            aria-disabled={removeUnavailable || undefined}
            aria-busy={edit.pending || undefined}
            onClick={() => {
              if (!removeUnavailable) edit.submit(null);
            }}
          >
            {edit.pending ? 'Updating key…' : status.data?.configured ? 'Remove key' : 'Key removed'}
          </button>
        )}
      </div>
      {status.data?.sessionOnly && <p role="status">Re-enter this key after quitting the app.</p>}
      {provider === 'twitter' && <TwitterSetupHelp />}
      <ErrorNotice
        key={JSON.stringify(queryKey)}
        error={status.error}
        retryRef={retryFocus.retryRef}
        retrying={status.isFetching}
        retry={() => retryFocus.retry(() => status.refetch())}
      />
      <ErrorNotice error={edit.error} />
    </section>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '../../api';
import { ErrorNotice } from '../Shared';
import { InfoHelp } from '../InfoHelp/InfoHelp.component';
import { TwitterSetupHelp } from './TwitterSetupHelp.component';
import './ProviderKeys.styles.css';

export function ProviderKeys({ disabled = false }: { disabled?: boolean }) {
  return <div className="provider-keys"><div className="provider-keys-heading"><h2>Provider keys</h2><InfoHelp label="About provider keys"><p>Twitter / X uses your bearer token to search recent posts. OpenAI prepares news text. ElevenLabs generates all new voice audio.</p><p>Keys use protected storage when available. Session-only keys must be entered again after quitting. Saved recordings play without keys.</p><p>Preparing text sends selected source content, news interests, DJ preferences, and mood to OpenAI. Generating audio sends the reviewed script and voice preferences to your chosen provider and uses that provider's account.</p></InfoHelp></div><ProviderKey provider="openai" disabled={disabled} /><ProviderKey provider="elevenlabs" disabled={disabled} /><ProviderKey provider="twitter" disabled={disabled} /></div>;
}
function ProviderKey({ provider, disabled }: { provider: 'openai' | 'elevenlabs' | 'twitter'; disabled: boolean }) {
  const client = useQueryClient();
  const [key, setKey] = useState('');
  const name = provider === 'openai' ? 'OpenAI · information and preparation' : provider === 'elevenlabs' ? 'ElevenLabs · voice' : 'Twitter / X · recent search';
  const queryKey = [provider === 'openai' ? 'aiStatus' : provider === 'elevenlabs' ? 'elevenLabsStatus' : 'twitterStatus'];
  const status = useQuery({ queryKey, meta: { aiOperation: true }, queryFn: async () => unwrap(await (provider === 'openai' ? window.wave.getAiStatus() : provider === 'elevenlabs' ? window.wave.getElevenLabsStatus() : window.wave.getTwitterStatus())) });
  const save = useMutation({ meta: { aiOperation: true }, mutationFn: async (value: string | null) => unwrap(await (provider === 'openai' ? window.wave.setOpenAiKey(value) : provider === 'elevenlabs' ? window.wave.setElevenLabsKey(value) : window.wave.setTwitterKey(value))), onSuccess: value => { client.setQueryData(queryKey, value); setKey(''); } });
  const busy = disabled || save.isPending;
  return <section className="provider-key"><div className="provider-key-status"><strong>{name}</strong><span>{status.isPending ? 'Checking key…' : status.error ? 'Key status unavailable' : status.data?.configured ? status.data.sessionOnly ? 'Available this session' : 'Key saved' : 'No key configured'}</span></div><label>{name} {provider === 'twitter' ? 'bearer token' : 'API key'}<input type="password" autoComplete="off" spellCheck={false} disabled={busy} value={key} placeholder={status.data?.configured ? 'Enter a replacement key' : provider === 'twitter' ? 'Enter your bearer token' : 'Enter your API key'} onChange={event => { save.reset(); setKey(event.target.value); }} /></label><div className="provider-key-actions"><button type="button" disabled={busy || !key.trim()} onClick={() => save.mutate(key.trim())}>{save.isPending ? 'Saving…' : 'Save key'}</button>{status.data?.configured && <button type="button" disabled={busy} onClick={() => save.mutate(null)}>Remove key</button>}</div>{status.data?.sessionOnly && <p role="status">Re-enter this key after quitting the app.</p>}{provider === 'twitter' && <TwitterSetupHelp />}<ErrorNotice error={status.error} retry={() => void status.refetch()} /><ErrorNotice error={save.error} /></section>;
}

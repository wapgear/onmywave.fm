import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Music2 } from 'lucide-react';
import type { Connection } from '../../../shared/types';
import { unwrap } from '../../api';
import { ErrorNotice } from '../../components/Shared';
import { LibraryChooser } from '../../components/LibraryChooser';
export function ConnectionPage({ connection, expired, connected, librariesSelected }: { connection: Connection | null; expired: boolean; connected: (value: Connection) => void; librariesSelected: (value: Connection) => void }) {
  const [serverUrl, setServerUrl] = useState(connection?.serverUrl ?? '');
  const [username, setUsername] = useState(connection?.userName ?? '');
  const [password, setPassword] = useState('');
  const login = useMutation({ meta: { authAttempt: true }, mutationFn: async () => unwrap(await window.wave.connect({ serverUrl: serverUrl.trim(), username: username.trim(), password })), onSuccess: value => { setPassword(''); connected(value); } });
  const choosing = connection && !expired;
  return <main className="connection-page"><div className="connection-brand"><Music2 size={25} /><span>onmywave.fm</span></div><section className="connection-card"><span className="eyebrow">Your music, on your wave</span><h1>{choosing ? 'Choose your libraries' : expired ? 'Welcome back' : 'A home for your music.'}</h1><p>{choosing ? `Signed in as ${connection.userName}. Choose the Jellyfin music libraries you'd like to listen to.` : expired ? 'Your Jellyfin session has expired. Sign in again to reconnect your library.' : 'Connect your Jellyfin server and listen to the collection you already love.'}</p>
    {choosing ? <LibraryChooser key={connection.id} connection={connection} done={librariesSelected} /> : <form onSubmit={event => { event.preventDefault(); login.mutate(); }}><label>Jellyfin server<input type="url" required value={serverUrl} onChange={event => setServerUrl(event.target.value)} placeholder="https://music.example.com" autoFocus autoComplete="url" /></label><label>Username<input required value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><ErrorNotice error={login.error} /><button className="primary connect-button" disabled={login.isPending || !serverUrl.trim() || !username.trim()}>{login.isPending ? 'Connecting…' : 'Connect to Jellyfin'}<ArrowRight size={17} /></button><p className="form-hint">Your connection is protected using macOS secure storage when available.</p></form>}
  </section><p className="connection-footer">Your library stays on your Jellyfin server.</p></main>;
}

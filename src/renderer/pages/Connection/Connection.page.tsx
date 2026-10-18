import { useEffect, useRef, useState } from 'react';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import { ArrowRight, Music2 } from 'lucide-react';
import type { Connection } from '../../../shared/types';
import { unwrap } from '../../api';
import { ErrorNotice } from '../../components/Shared';
import { LibraryChooser } from '../../components/LibraryChooser';
import { useLibrarySelection } from '../../components/LibrarySelection';
import { NewsRecoveryNotice } from '../../NewsRecovery';
export function ConnectionPage({ connection, expired, connected, librariesSelected }: { connection: Connection | null; expired: boolean; connected: (value: Connection) => void | Promise<void>; librariesSelected: (value: Connection) => void }) {
  const [serverUrl, setServerUrl] = useState(connection?.serverUrl ?? '');
  const [username, setUsername] = useState(connection?.userName ?? '');
  const [password, setPassword] = useState('');
  const [changingAccount, setChangingAccount] = useState(false);
  const selection = useLibrarySelection();
  const [librarySelectionRevision, setLibrarySelectionRevision] = useState(0);
  const active = useRef(false);
  const loginInFlight = useRef(false);
  const connectButton = useRef<HTMLButtonElement>(null);
  const [focusedConnect, setFocusedConnect] = useState<HTMLButtonElement | null>(null);
  const ownsConnectFocus = focusedConnect !== null && document.activeElement === focusedConnect;
  const chooser = useRef<HTMLDivElement>(null);
  const returnToChooser = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!changingAccount && returnToChooser.current) {
      returnToChooser.current = false;
      chooser.current?.querySelector<HTMLButtonElement>('.library-change-account')?.focus({ preventScroll: true });
    }
  }, [changingAccount]);
  const login = useMutation({ meta: { authAttempt: true }, mutationFn: async () => unwrap(await window.wave.connect({ serverUrl: serverUrl.trim(), username: username.trim(), password })), onSuccess: async value => {
    if (!active.current) return;
    setPassword('');
    selection.reset(value);
    await connected(value);
    if (active.current) { setLibrarySelectionRevision(value => value + 1); setChangingAccount(false); }
  }, onSettled: () => { loginInFlight.current = false; } });
  const savingLibraries = useIsMutating({ mutationKey: ['selectLibraries', connection?.id] }) > 0;
  const loginBlocked = login.isPending || savingLibraries;
  const canLogin = !loginBlocked && !!serverUrl.trim() && !!username.trim();
  useEffect(() => {
    if (login.error && ownsConnectFocus && document.hasFocus() && document.visibilityState === 'visible' && focusedConnect?.checkVisibility()) focusedConnect.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [login.error, ownsConnectFocus, focusedConnect]);
  const hasChooser = connection && !expired;
  const choosing = hasChooser && !changingAccount;
  return <main className="connection-page"><div className="connection-brand"><Music2 size={25} /><span>onmywave.fm</span></div><NewsRecoveryNotice /><section className="connection-card"><span className="eyebrow">Your music, on your wave</span><h1 tabIndex={-1}>{choosing ? 'Choose your libraries' : changingAccount ? 'Use another account or server' : expired ? 'Welcome back' : 'A home for your music.'}</h1><p>{choosing ? `Signed in as ${connection.userName}. Choose the Jellyfin music libraries you'd like to listen to.` : changingAccount ? 'Sign in with another Jellyfin account or server. You can go back to your current library choices.' : expired ? 'Your Jellyfin session has expired. Sign in again to reconnect your library.' : 'Connect your Jellyfin server and listen to the collection you already love.'}</p>
    {hasChooser && <div ref={chooser} hidden={!choosing}><LibraryChooser key={`${connection.id}-${librarySelectionRevision}`} connection={connection} done={value => { if (active.current && value?.id === connection.id) librariesSelected(value); }} onChangeAccount={() => { login.reset(); setUsername(''); setPassword(''); setChangingAccount(true); }} /></div>}
    {!choosing && <form onSubmit={event => { event.preventDefault(); if (canLogin && !loginInFlight.current) { connectButton.current?.focus({ preventScroll: true }); loginInFlight.current = true; login.mutate(); } }}><label>Jellyfin server<input type="url" required disabled={loginBlocked} value={serverUrl} onChange={event => setServerUrl(event.target.value)} placeholder="https://music.example.com" autoFocus autoComplete="url" /></label><label>Username<input required disabled={loginBlocked} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<input type="password" disabled={loginBlocked} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><ErrorNotice error={login.error} />{savingLibraries && <p className="form-hint" role="status">Finishing the library selection before you can sign in. Your saved choices will stay with the current account.</p>}<button ref={connectButton} className="primary connect-button" disabled={!canLogin && !ownsConnectFocus} aria-disabled={!canLogin || undefined} aria-busy={login.isPending || undefined} onFocus={event => setFocusedConnect(event.currentTarget)} onBlur={() => setFocusedConnect(null)}>{login.isPending ? 'Connecting…' : 'Connect to Jellyfin'}<ArrowRight size={17} /></button>{changingAccount && <button className="connection-back" type="button" disabled={loginBlocked} onClick={() => { returnToChooser.current = true; login.reset(); setPassword(''); setChangingAccount(false); }}>Back to library selection</button>}<p className="form-hint">Your connection is protected using macOS secure storage when available.</p></form>}
  </section><p className="connection-footer">Your library stays on your Jellyfin server.</p></main>;
}

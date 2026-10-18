import { useRef, useState } from 'react';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import type { Connection } from '../../../shared/types';
import { unwrap } from '../../api';
import { Dialog, ErrorNotice, PageHeading } from '../../components/Shared';
import { LibraryChooser } from '../../components/LibraryChooser';
import { ProviderKeys } from '../../components/ProviderKeys/ProviderKeys.component';
import { SourcesPage } from '../Sources/Sources.page';
import { DJsPage } from '../DJs/DJs.page';
import { DJPlaybackSettings } from './components/DJPlaybackSettings.component';
import { NewsTransitions } from './components/NewsTransitions.component';
import './Settings.styles.css';
export type SettingsSection = 'general' | 'keys' | 'sources' | 'djs';
const sections: { id: SettingsSection; label: string }[] = [{ id: 'general', label: 'General' }, { id: 'keys', label: 'Provider keys' }, { id: 'sources', label: 'Sources' }, { id: 'djs', label: 'DJs' }];
export function SettingsPage({ connection, update, disconnected, section, onSectionChange, returnToSetup }: { connection: Connection; update: (value: Connection) => void; disconnected: () => void; section?: SettingsSection; onSectionChange?: (value: SettingsSection) => void; returnToSetup?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [localSection, setLocalSection] = useState<SettingsSection>('general');
  const activeSection = section ?? localSection;
  const savingProviderKey = useIsMutating({ mutationKey: ['providerKey'] }) > 0;
  const savingLibraries = useIsMutating({ mutationKey: ['selectLibraries', connection.id] }) > 0;
  const disconnectInFlight = useRef(false);
  const disconnect = useMutation({ mutationFn: async () => unwrap(await window.wave.disconnect()), onSuccess: disconnected, onSettled: () => { disconnectInFlight.current = false; } });
  const closeConfirmation = () => { if (!disconnectInFlight.current && !disconnect.isPending) setConfirm(false); };
  function confirmDisconnect() {
    if (savingLibraries || disconnectInFlight.current || disconnect.isPending) return;
    disconnectInFlight.current = true;
    disconnect.mutate();
  }
  return <><PageHeading title="Settings">{returnToSetup && <button onClick={returnToSetup}>Back to setup</button>}</PageHeading>
    <nav className="settings-sections" aria-label="Settings sections">{sections.map(item => <button key={item.id} aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => { setLocalSection(item.id); onSectionChange?.(item.id); }}>{item.label}</button>)}</nav>
    {activeSection === 'keys' && <div className="settings-content settings-preferences"><ProviderKeys /></div>}
    {activeSection === 'sources' && <SourcesPage />}
    {activeSection === 'djs' && <DJsPage />}
    {activeSection === 'general' && <div className="settings-content settings-preferences">
    <section><h2>Account</h2><dl className="settings-account"><div><dt>Signed in as</dt><dd>{connection.userName}</dd></div><div><dt>Server</dt><dd>{connection.serverUrl}</dd></div><div><dt>Version</dt><dd>Jellyfin {connection.serverVersion}</dd></div></dl><button className="settings-signout" disabled={savingLibraries || disconnect.isPending} onClick={() => setConfirm(true)}>Sign out</button>{connection.sessionOnly && <p className="notice">The app cannot reliably restore this connection after quitting. You may need to sign in again.</p>}</section>
    <section><h2>Music libraries</h2><p className="settings-description">Choose the libraries shown in your collection. Your listening queue stays available.</p><LibraryChooser key={`${connection.id}-${connection.selectedLibraryIds.join(',')}`} connection={connection} done={update} disabled={disconnect.isPending} /></section>
    <DJPlaybackSettings />
    <NewsTransitions />
    <section><h2>About</h2><p className="settings-description">onmywave.fm Light for macOS</p></section>
  </div>}{confirm && <Dialog title="Sign out of Jellyfin?" close={closeConfirmation} closeDisabled={disconnect.isPending}><p>Playback will stop and unsaved news setup and script edits will be discarded. Your saved profiles, DJs, provider keys and recordings stay on this Mac.</p>{savingProviderKey && <p>A provider key change is still saving. That change can finish after you sign out.</p>}<p>Signing out pauses automatic news preparation and stops in-progress news and voice generation. A request already sent may still finish or incur a charge. After signing in, resume automatic preparation in News bucket → Settings.</p><ErrorNotice error={disconnect.error} /><div className="modal-actions"><button aria-disabled={disconnect.isPending || undefined} onClick={closeConfirmation}>Cancel</button><button className="primary" disabled={savingLibraries} aria-disabled={disconnect.isPending || undefined} aria-busy={disconnect.isPending || undefined} onClick={confirmDisconnect}>{disconnect.isPending ? 'Signing out…' : 'Sign out'}</button></div></Dialog>}</>;
}

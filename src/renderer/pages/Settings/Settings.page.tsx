import { useIsMutating, useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { unwrap } from '../../api';
import { UpdateSettings } from '../../components/AppUpdates/AppUpdates.component';
import { Button } from '../../components/Button/Button.component';
import { LibraryChooser } from '../../components/LibraryChooser';
import { PreferencesLayout } from '../../components/PreferencesLayout/PreferencesLayout.component';
import { ProviderKeys } from '../../components/ProviderKeys/ProviderKeys.component';
import { SectionHeading } from '../../components/SectionHeading/SectionHeading.component';
import { SectionNavigation } from '../../components/SectionNavigation/SectionNavigation.component';
import { Dialog, DialogActions, ErrorNotice, PageHeading } from '../../components/Shared';
import { DJsPage } from '../DJs/DJs.page';
import { SourcesPage } from '../Sources/Sources.page';
import { AppearanceSettings } from './components/AppearanceSettings.component';
import { DJPlaybackSettings } from './components/DJPlaybackSettings.component';
import { NewsTransitions } from './components/NewsTransitions.component';
import { SongAnnouncementSettings } from './components/SongAnnouncementSettings.component';
import type { SettingsPageProps, SettingsSection } from './Settings.types';

import './Settings.styles.css';

const sections: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'playback', label: 'Playback' },
  { id: 'sources', label: 'Sources' },
  { id: 'djs', label: 'DJs' },
  { id: 'keys', label: 'Provider keys' },
  { id: 'updates', label: 'Updates' },
];

export function SettingsPage({
  connection,
  update,
  disconnected,
  appearance,
  onAppearanceChange,
  section,
  onSectionChange,
  returnToSetup,
}: SettingsPageProps) {
  const [confirm, setConfirm] = useState(false);
  const [localSection, setLocalSection] = useState<SettingsSection>('general');
  const activeSection = section ?? localSection;
  const savingProviderKey = useIsMutating({ mutationKey: ['providerKey'] }) > 0;
  const savingLibraries = useIsMutating({ mutationKey: ['selectLibraries', connection.id] }) > 0;
  const disconnectInFlight = useRef(false);
  const disconnect = useMutation({
    meta: { authAttempt: true },
    mutationFn: async () => unwrap(await window.wave.disconnect()),
    onSuccess: disconnected,
    onSettled: () => {
      disconnectInFlight.current = false;
    },
  });
  const closeConfirmation = () => {
    if (!disconnectInFlight.current && !disconnect.isPending) setConfirm(false);
  };
  function confirmDisconnect() {
    if (savingLibraries || disconnectInFlight.current || disconnect.isPending) return;
    disconnectInFlight.current = true;
    disconnect.mutate();
  }

  return (
    <PreferencesLayout className="settings-page">
      <PageHeading title="Settings">
        {returnToSetup && <button onClick={returnToSetup}>Back to setup</button>}
      </PageHeading>
      <SectionNavigation
        className="settings-sections"
        label="Settings sections"
        items={sections}
        value={activeSection}
        onChange={(value) => {
          setLocalSection(value);
          onSectionChange?.(value);
        }}
      />
      {activeSection === 'keys' && (
        <div className="settings-content settings-preferences">
          <ProviderKeys />
        </div>
      )}
      {activeSection === 'sources' && <SourcesPage />}
      {activeSection === 'djs' && <DJsPage />}
      {activeSection === 'playback' && (
        <div className="settings-content settings-preferences settings-playback">
          <DJPlaybackSettings />
          <SongAnnouncementSettings />
          <NewsTransitions />
        </div>
      )}
      {activeSection === 'appearance' && (
        <div className="settings-content settings-preferences">
          <AppearanceSettings appearance={appearance} onAppearanceChange={onAppearanceChange} />
        </div>
      )}
      {activeSection === 'updates' && (
        <div className="settings-content settings-preferences">
          <UpdateSettings />
        </div>
      )}
      {activeSection === 'general' && (
        <div className="settings-content settings-preferences">
          <section>
            <h2>Account</h2>
            <dl className="settings-account">
              <div>
                <dt>Signed in as</dt>
                <dd>{connection.userName}</dd>
              </div>
              <div>
                <dt>Server</dt>
                <dd>{connection.serverUrl}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>Jellyfin {connection.serverVersion}</dd>
              </div>
            </dl>
            <button
              className="settings-signout"
              disabled={savingLibraries || disconnect.isPending}
              onClick={() => setConfirm(true)}
            >
              Sign out
            </button>
            {connection.sessionOnly && (
              <p className="notice">
                The app cannot reliably restore this connection after quitting. You may need to sign in again.
              </p>
            )}
          </section>
          <section>
            <SectionHeading title="Music libraries" helpLabel="About music libraries">
              <p>
                Choose which Jellyfin libraries appear in your collection. Changing libraries keeps your listening queue
                available.
              </p>
            </SectionHeading>
            <LibraryChooser key={connection.id} connection={connection} done={update} disabled={disconnect.isPending} />
          </section>
        </div>
      )}
      {confirm && (
        <Dialog title="Sign out of Jellyfin?" close={closeConfirmation} closeDisabled={disconnect.isPending}>
          <p>
            Playback will stop and unsaved news setup and script edits will be discarded. Your saved profiles, DJs,
            provider keys and recordings stay on this Mac.
          </p>
          {savingProviderKey && (
            <p>A provider key change is still saving. That change can finish after you sign out.</p>
          )}
          <p>
            Signing out pauses automatic news preparation and stops in-progress news and voice generation. A request
            already sent may still finish or incur a charge. After signing in, resume automatic preparation in News
            bucket → Settings.
          </p>
          <ErrorNotice error={disconnect.error} />
          <DialogActions>
            <Button aria-disabled={disconnect.isPending || undefined} onClick={closeConfirmation}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={savingLibraries}
              aria-disabled={disconnect.isPending || undefined}
              aria-busy={disconnect.isPending || undefined}
              onClick={confirmDisconnect}
            >
              {disconnect.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PreferencesLayout>
  );
}

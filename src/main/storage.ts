import { defaultDJPlaybackSettings, normalizeDJPlaybackSettings } from '../shared/dj-playback';
import { defaultNewsTransitionSettings, normalizeNewsTransitionSettings } from '../shared/news-transitions';
import { NEWS_TEXT_MODEL } from '../shared/types';
import { app, safeStorage } from 'electron';
import { link, mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultWorkflowDraft, isWorkflowDraft, normalizeWorkflowDraft } from '../shared/workflow';
import type { LocalState, ListeningRoom, RoomProfile } from '../shared/types';
import { readSharedProviderKey, writeSharedProviderKey } from './keychain';
import { normalizePlaybackPreferences } from './playback-preferences';
import { StorageError } from './storage-error';

export type StoredConnection = {
  id: string; serverUrl: string; userId: string; userName: string; token: string;
  serverVersion: string; selectedLibraryIds: string[];
};
const emptyState = (): LocalState => ({ preparationErrorVersion: 1, djPlayback: defaultDJPlaybackSettings(), roomProfiles: [{ enabled: true, id: 'default-room', name: 'My room', room: { djId: null, sourceIds: [] }, mood: '', workflowDraft: defaultWorkflowDraft() }], activeRoomProfileId: 'default-room', newsTransitions: defaultNewsTransitionSettings(), djs: [], vibe: '', playback: null, playbackPreferences: {}, sources: [], listeningRoom: { djId: null, sourceIds: [] }, workflowDraft: defaultWorkflowDraft() });
let localState: LocalState | undefined;
let localStateLoading: Promise<void> | undefined;
let localStateMigrationPending = false;
let localStateMigration: Promise<void> | undefined;
let writes = Promise.resolve();
const location = (name: string) => join(app.getPath('userData'), name);
let deviceIdentity: Promise<{ id: string; persistent: boolean }> | undefined;
export function readDeviceIdentity() {
  return deviceIdentity ??= (async () => {
    const fallback = { id: randomUUID(), persistent: false };
    const target = location('jellyfin-device-id');
    const read = async () => {
      const id = (await readFile(target, 'utf8')).trim();
      if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error('Invalid local device identity.');
      return { id, persistent: true };
    };
    try {
      try { return await read(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
      const temp = location(`jellyfin-device-id.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, fallback.id, { mode: 0o600 });
        try { await link(temp, target); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        return await read();
      } finally { await unlink(temp).catch(() => {}); }
    } catch { return fallback; }
  })();
}
type KeyProvider = 'openai' | 'elevenlabs' | 'twitter';
const providerKeys = new Map<KeyProvider, string | null>();
const sessionOnlyKeys = new Set<KeyProvider>();
let keyWrites = Promise.resolve();
export function withProviderKeys<T>(operation: () => Promise<T>): Promise<T> {
  const next = keyWrites.then(operation);
  keyWrites = next.then(() => {}, () => {});
  return next;
}
async function readProviderKey(provider: KeyProvider): Promise<string | null> {
  const shared = provider === 'twitter' ? null : await readSharedProviderKey(provider);
  if (shared) { providerKeys.set(provider, shared); sessionOnlyKeys.delete(provider); return shared; }
  if (providerKeys.has(provider)) return providerKeys.get(provider)!;
  let key: string | null = null;
  try { if (safeStorage.isEncryptionAvailable()) key = safeStorage.decryptString(await readFile(location(`${provider}-key.enc`))); } catch { /* No saved key. */ }
  providerKeys.set(provider, key);
  return key;
}
async function providerKeyStatus(provider: KeyProvider) {
  return { configured: Boolean(await readProviderKey(provider)), sessionOnly: sessionOnlyKeys.has(provider) };
}
function writeProviderKey(provider: KeyProvider, key: string | null) {
  return withProviderKeys(async () => {
    if (provider !== 'twitter') await writeSharedProviderKey(provider, key);
    if (!key || !safeStorage.isEncryptionAvailable()) {
      await unlink(location(`${provider}-key.enc`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      providerKeys.set(provider, key);
      if (key) sessionOnlyKeys.add(provider); else sessionOnlyKeys.delete(provider);
    } else {
      await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
      const temp = location(`${provider}-key.${randomUUID()}.tmp`);
      await writeFile(temp, safeStorage.encryptString(key), { mode: 0o600 });
      await rename(temp, location(`${provider}-key.enc`));
      providerKeys.set(provider, key);
      sessionOnlyKeys.delete(provider);
    }
    return providerKeyStatus(provider);
  });
}
export const readOpenAIKey = () => readProviderKey('openai');
export const openAIKeyStatus = () => providerKeyStatus('openai');
export const writeOpenAIKey = (key: string | null) => writeProviderKey('openai', key);
export const readElevenLabsKey = () => readProviderKey('elevenlabs');
export const elevenLabsKeyStatus = () => providerKeyStatus('elevenlabs');
export const writeElevenLabsKey = (key: string | null) => writeProviderKey('elevenlabs', key);

export const readTwitterKey = () => readProviderKey('twitter');
export const twitterKeyStatus = () => providerKeyStatus('twitter');
export const writeTwitterKey = (key: string | null) => writeProviderKey('twitter', key);

export async function atomicWrite(name: string, content: string) {
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
  const target = location(name);
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, target);
}

export async function readConnection(): Promise<StoredConnection | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encrypted = await readFile(location('connection.enc'));
    const record = JSON.parse(safeStorage.decryptString(encrypted)) as StoredConnection;
    if (typeof record.token !== 'string' || typeof record.serverUrl !== 'string' || typeof record.userId !== 'string'
      || typeof record.id !== 'string' || typeof record.userName !== 'string' || typeof record.serverVersion !== 'string'
      || !Array.isArray(record.selectedLibraryIds) || !record.selectedLibraryIds.every(id => typeof id === 'string')) return null;
    return record;
  } catch { return null; }
}

export async function writeConnection(record: StoredConnection | null, commit: (write: () => boolean) => boolean = write => write()): Promise<boolean> {
  if (!record || !safeStorage.isEncryptionAvailable()) {
    return commit(() => {
      try { unlinkSync(location('connection.enc')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      return record === null;
    });
  }
  await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 });
  const temp = location(`connection.${randomUUID()}.enc.tmp`);
  try {
    await writeFile(temp, safeStorage.encryptString(JSON.stringify(record)), { mode: 0o600 });
    // Publish and promote the account in one turn so cancellation cannot split them.
    return commit(() => { renameSync(temp, location('connection.enc')); return true; });
  } finally { await unlink(temp).catch(() => {}); }
}

function validStoredProfile(value: unknown): value is RoomProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as RoomProfile;
  return typeof profile.id === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(profile.id)
    && typeof profile.name === 'string' && !!profile.name.trim() && profile.name.length <= 80
    && typeof profile.mood === 'string' && profile.mood.length <= 20_000 && isWorkflowDraft(profile.workflowDraft)
    && !!profile.room && (profile.room.djId === null || typeof profile.room.djId === 'string')
    && Array.isArray(profile.room.sourceIds) && profile.room.sourceIds.length <= 20 && profile.room.sourceIds.every(id => typeof id === 'string');
}

function synchronizeRoomProfiles(state: LocalState): LocalState {
  const cleanRoom = (room: ListeningRoom): ListeningRoom => ({
    djId: state.djs.some(dj => dj.id === room.djId) ? room.djId : null,
    sourceIds: [...new Set(room.sourceIds)].filter(id => state.sources.some(source => source.id === id)),
  });
  const listeningRoom = cleanRoom(state.listeningRoom);
  const roomProfiles = state.roomProfiles.map(profile => profile.id === state.activeRoomProfileId
    ? { ...profile, room: listeningRoom, mood: state.vibe, workflowDraft: state.workflowDraft }
    : { ...profile, room: cleanRoom(profile.room) });
  const selected = roomProfiles.find(room => room.id === state.djPlayback.roomId);
  const valid = selected?.enabled && state.djs.some(dj => dj.id === selected.room.djId) && selected.room.sourceIds.length > 0 && selected.room.sourceIds.every(id => state.sources.some(source => source.id === id)) && selected.mood.trim();
  return { ...state, listeningRoom, roomProfiles, djPlayback: valid ? state.djPlayback : { ...state.djPlayback, enabled: false, roomId: selected?.id ?? null } };
}

export async function getLocalState(): Promise<LocalState> {
  if (!localState) {
    localStateLoading ??= (async () => {
    try {
      let content: string;
      try { content = await readFile(location('local-state.json'), 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { localState = emptyState(); return; } throw error; }
      const value = JSON.parse(content);
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || (value.djs !== undefined && !Array.isArray(value.djs)) || (value.sources !== undefined && !Array.isArray(value.sources))
        || (value.roomProfiles !== undefined && (!Array.isArray(value.roomProfiles) || value.roomProfiles.some((profile: unknown) => !validStoredProfile(profile))))) throw new StorageError();
      const workflow = (draft: unknown) => {
        const result = normalizeWorkflowDraft(draft);
        if (value.preparationErrorVersion !== 1) {
          const message = 'Earlier preparation details are unavailable. Review the setup before retrying.';
          if (result.newsWorkflowError) result.newsWorkflowError = message;
          if (result.newsLastRun?.message && !['no-news', 'partial-coverage'].includes(result.newsLastRun.outcome)) result.newsLastRun.message = message;
        }
        return result;
      };
      const djs: LocalState['djs'] = Array.isArray(value.djs) ? value.djs.map((dj: LocalState['djs'][number]) => ({ ...dj, news: dj.news ? { ...dj.news, speechEngine: 'elevenlabs-v4', textModel: NEWS_TEXT_MODEL } : undefined })) : [];
      const migrated = [...new Set<string>(djs.flatMap((dj: LocalState['djs'][number]) => dj.news?.feedUrls || []))].map((url, index) => ({ id: `legacy-source-${index + 1}`, name: url, url }));
      const sources = Array.isArray(value.sources) ? value.sources : migrated;
      const onlyDj = djs.length === 1 ? djs[0] : null;
      const base: Omit<LocalState, 'roomProfiles' | 'activeRoomProfileId' | 'djPlayback'> = { preparationErrorVersion: 1, newsTransitions: normalizeNewsTransitionSettings(value.newsTransitions), djs, vibe: typeof value.vibe === 'string' ? value.vibe : '', playback: value.playback ?? null, playbackPreferences: normalizePlaybackPreferences(value.playbackPreferences, value.playback ?? null), sources, workflowDraft: workflow(value.workflowDraft),
        listeningRoom: value.listeningRoom && Array.isArray(value.listeningRoom.sourceIds) ? value.listeningRoom : { djId: onlyDj?.id ?? null, sourceIds: sources.filter((source: LocalState['sources'][number]) => onlyDj?.news?.feedUrls.includes(source.url)).map((source: LocalState['sources'][number]) => source.id) } };
      const profiles: RoomProfile[] = Array.isArray(value.roomProfiles) ? value.roomProfiles.filter(validStoredProfile).slice(0, 100).map((profile: RoomProfile) => ({ ...profile, enabled: profile.enabled !== false, name: profile.name.trim(), workflowDraft: workflow(profile.workflowDraft) })) : [];
      const uniqueProfiles = profiles.filter((profile, index) => profiles.findIndex(other => other.id === profile.id) === index);
      if (!uniqueProfiles.length) uniqueProfiles.push({ enabled: true, id: 'default-room', name: 'My room', room: base.listeningRoom, mood: base.vibe, workflowDraft: base.workflowDraft });
      const active = uniqueProfiles.find(profile => profile.id === value.activeRoomProfileId) ?? uniqueProfiles[0];
      const djPlayback = normalizeDJPlaybackSettings(value.djPlayback);
      localState = synchronizeRoomProfiles({ ...base, djPlayback, roomProfiles: uniqueProfiles, activeRoomProfileId: active.id, listeningRoom: active.room, vibe: active.mood, workflowDraft: active.workflowDraft });
      localStateMigrationPending = value.preparationErrorVersion !== 1;
    } catch { throw new StorageError('Local settings could not be opened. Your existing settings were preserved.'); }
    })().finally(() => { localStateLoading = undefined; });
    await localStateLoading;
  }
  if (localStateMigrationPending) {
    localStateMigration ??= atomicWrite('local-state.json', JSON.stringify(localState)).catch(() => { throw new StorageError('Local settings could not be saved. Your existing settings were preserved.'); }).then(() => { localStateMigrationPending = false; }).finally(() => { localStateMigration = undefined; });
    await localStateMigration;
  }
  return structuredClone(localState!);
}

export function updateLocalState(patch: Partial<LocalState> | ((state: LocalState) => Partial<LocalState>)): Promise<void> {
  const next = writes.then(async () => {
    const current = await getLocalState();
    const state = synchronizeRoomProfiles({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
    try { await atomicWrite('local-state.json', JSON.stringify(state)); }
    catch { throw new StorageError('Local settings could not be saved. Your existing settings were preserved.'); }
    localState = state;
  });
  writes = next.catch(() => {});
  return next;
}

import { contextBridge, ipcRenderer } from 'electron';

import type { NewsProgress, WaveApi, WindowTheme } from '../shared/types';
import type { UpdateStatus } from '../shared/update';

const api: WaveApi = {
  platform: process.platform,
  setTitleBarTheme: (theme: WindowTheme) => ipcRenderer.invoke('wave:setTitleBarTheme', theme),
  getUpdateStatus: () => ipcRenderer.invoke('wave:getUpdateStatus'),
  checkForUpdates: () => ipcRenderer.invoke('wave:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('wave:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('wave:installUpdate'),
  onUpdateStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('wave:updateStatus', listener);
    return () => ipcRenderer.removeListener('wave:updateStatus', listener);
  },
  getNewsRecoveryStatus: () => ipcRenderer.invoke('wave:getNewsRecoveryStatus'),
  retryNewsRecovery: () => ipcRenderer.invoke('wave:retryNewsRecovery'),
  getConnection: () => ipcRenderer.invoke('wave:getConnection'),
  connect: (input) => ipcRenderer.invoke('wave:connect', input),
  disconnect: () => ipcRenderer.invoke('wave:disconnect'),
  libraries: () => ipcRenderer.invoke('wave:libraries'),
  libraryFilters: () => ipcRenderer.invoke('wave:libraryFilters'),
  selectLibraries: (ids) => ipcRenderer.invoke('wave:selectLibraries', ids),
  songs: (query) => ipcRenderer.invoke('wave:songs', query),
  albums: (query) => ipcRenderer.invoke('wave:albums', query),
  cancelCatalog: (requestId) => ipcRenderer.invoke('wave:cancelCatalog', requestId),
  album: (id) => ipcRenderer.invoke('wave:album', id),
  albumTracks: (id) => ipcRenderer.invoke('wave:albumTracks', id),
  song: (id) => ipcRenderer.invoke('wave:song', id),
  lyrics: (id) => ipcRenderer.invoke('wave:lyrics', id),
  playlists: () => ipcRenderer.invoke('wave:playlists'),
  playlistPermission: (id) => ipcRenderer.invoke('wave:playlistPermission', id),
  playlist: (id) => ipcRenderer.invoke('wave:playlist', id),
  acknowledgePlaylistRecovery: (input) => ipcRenderer.invoke('wave:acknowledgePlaylistRecovery', input),
  acknowledgePlaylistCreation: (input) => ipcRenderer.invoke('wave:acknowledgePlaylistCreation', input),
  createPlaylist: (input) => ipcRenderer.invoke('wave:createPlaylist', input),
  renamePlaylist: (input) => ipcRenderer.invoke('wave:renamePlaylist', input),
  addPlaylistItems: (input) => ipcRenderer.invoke('wave:addPlaylistItems', input),
  removePlaylistEntries: (input) => ipcRenderer.invoke('wave:removePlaylistEntries', input),
  movePlaylistEntry: (input) => ipcRenderer.invoke('wave:movePlaylistEntry', input),
  preparePlayback: (input) => ipcRenderer.invoke('wave:preparePlayback', input),
  getLocalState: () => ipcRenderer.invoke('wave:getLocalState'),
  saveDjs: (djs) => ipcRenderer.invoke('wave:saveDjs', djs),
  onPlaybackCheckpointRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: string) => callback(requestId);
    ipcRenderer.on('wave:playbackCheckpointRequest', listener);
    return () => ipcRenderer.removeListener('wave:playbackCheckpointRequest', listener);
  },
  flushPlaybackCheckpoint: (input) => ipcRenderer.invoke('wave:flushPlaybackCheckpoint', input),
  searchDJVoices: (input) => ipcRenderer.invoke('wave:searchDJVoices', input),
  saveNewsTransitions: (settings) => ipcRenderer.invoke('wave:saveNewsTransitions', settings),
  savePlayback: (snapshot) => ipcRenderer.invoke('wave:savePlayback', snapshot),
  getPlaybackPreferences: (connectionId) => ipcRenderer.invoke('wave:getPlaybackPreferences', connectionId),
  savePlaybackPreferences: (input) => ipcRenderer.invoke('wave:savePlaybackPreferences', input),
  saveWorkflowDraft: (input) => ipcRenderer.invoke('wave:saveWorkflowDraft', input),
  disableNewsPreparation: (roomId) => ipcRenderer.invoke('wave:disableNewsPreparation', roomId),
  saveRoomProfile: (input) => ipcRenderer.invoke('wave:saveRoomProfile', input),
  activateRoomProfile: (id) => ipcRenderer.invoke('wave:activateRoomProfile', id),
  renameRoomProfile: (input) => ipcRenderer.invoke('wave:renameRoomProfile', input),
  deleteRoomProfile: (id) => ipcRenderer.invoke('wave:deleteRoomProfile', id),
  saveNewsSources: (sources) => ipcRenderer.invoke('wave:saveNewsSources', sources),
  setRoomProfileEnabled: (input) => ipcRenderer.invoke('wave:setRoomProfileEnabled', input),
  saveDJPlayback: (settings) => ipcRenderer.invoke('wave:saveDJPlayback', settings),
  nextRoomNews: (input) => ipcRenderer.invoke('wave:nextRoomNews', input),
  claimPreparedNews: (input) => ipcRenderer.invoke('wave:claimPreparedNews', input),
  startPreparedNews: (input) => ipcRenderer.invoke('wave:startPreparedNews', input),
  releasePreparedNews: (input) => ipcRenderer.invoke('wave:releasePreparedNews', input),
  markPreparedNewsPlayed: (input) => ipcRenderer.invoke('wave:markPreparedNewsPlayed', input),
  getPreparedNews: () => ipcRenderer.invoke('wave:getPreparedNews'),
  cancelPreparedNews: (id) => ipcRenderer.invoke('wave:cancelPreparedNews', id),
  getVoicePreview: (voiceId) => ipcRenderer.invoke('wave:getVoicePreview', voiceId),
  prepareVoicePreview: (input) => ipcRenderer.invoke('wave:prepareVoicePreview', input),
  getDJVoicePreview: (djId) => ipcRenderer.invoke('wave:getDJVoicePreview', djId),
  prepareDJVoicePreview: (input) => ipcRenderer.invoke('wave:prepareDJVoicePreview', input),
  getTwitterStatus: () => ipcRenderer.invoke('wave:getTwitterStatus'),
  setTwitterKey: (key) => ipcRenderer.invoke('wave:setTwitterKey', key),
  getAiStatus: () => ipcRenderer.invoke('wave:getAiStatus'),
  getElevenLabsStatus: () => ipcRenderer.invoke('wave:getElevenLabsStatus'),
  setElevenLabsKey: (key) => ipcRenderer.invoke('wave:setElevenLabsKey', key),
  setOpenAiKey: (key) => ipcRenderer.invoke('wave:setOpenAiKey', key),
  onNewsProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: NewsProgress) => callback(progress);
    ipcRenderer.on('wave:newsProgress', listener);
    return () => ipcRenderer.removeListener('wave:newsProgress', listener);
  },
  openSource: (url) => ipcRenderer.invoke('wave:openSource', url),
};

contextBridge.exposeInMainWorld('wave', api);

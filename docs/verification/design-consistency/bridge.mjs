// Appended to the existing synthetic bridge by server.mjs, never shipped to production.
const auditParams = new URLSearchParams(location.search);
const auditState = (patch) => {
  Object.assign(state, patch);
  state.revision++;
  return ok(structuredClone(state));
};
const auditPlaylist = {
  id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Evening listening', songCount: 3, canEdit: true,
  entries: [songs[3], songs[1], songs[3]].map((song, index) => ({ entryId: 'audit-entry-' + index, song })),
};
if (auditParams.has('empty')) state.playback = null;
if (auditParams.has('no-libraries')) connection.selectedLibraryIds = [];
if (auditParams.has('source-limit')) {
  state.sources = Array.from({ length: 21 }, (_, index) => ({ id: 'audit-source-' + index, name: 'Example source ' + (index + 1), url: 'https://example.invalid/feed-' + index, kind: 'rss' }));
  state.roomProfiles[0].room.sourceIds = state.sources.slice(0, 20).map((source) => source.id);
}
Object.assign(bridge, {
  getConnection: () => ok(auditParams.has('disconnected') ? null : connection),
  songs: (query) => {
    if (auditParams.has('catalog-error')) return Promise.resolve({ ok: false, error: { code: 'offline', message: 'Synthetic library unavailable. Try again.' } });
    const matching = auditParams.has('no-results') ? [] : songs.filter((song) => [song.name, ...song.artists, song.album].join(' ').toLowerCase().includes((query.search ?? '').toLowerCase()));
    return ok({ items: matching.slice(query.start, query.start + query.limit), total: matching.length, start: query.start });
  },
  getTwitterStatus: () => ok({ configured: false, sessionOnly: false }),
  getAiStatus: () => ok({ configured: false, sessionOnly: false }),
  getElevenLabsStatus: () => ok({ configured: false, sessionOnly: false }),
  getVoicePreview: () => ok(null),
  getDJVoicePreview: () => ok(null),
  searchDJVoices: () => ok([{ id: 'audit-voice', name: 'Example voice', description: 'Synthetic voice result' }]),
  playlists: () => ok({ items: [auditPlaylist] }),
  playlist: () => ok(auditPlaylist),
  playlistPermission: () => ok(true),
  saveDjs: (djs) => auditState({ djs }),
  saveNewsSources: (sources) => auditState({ sources }),
  saveNewsTransitions: (newsTransitions) => auditState({ newsTransitions }),
  selectLibraries: (ids) => { connection.selectedLibraryIds = ids; return ok({ ...connection }); },
  saveWorkflowDraft: (input) => {
    const profile = state.roomProfiles.find((room) => room.id === input.expectedProfileId);
    if (!profile) return Promise.resolve({ ok: false, error: { code: 'invalid', message: 'Synthetic room missing' } });
    Object.assign(profile, { room: input.room, mood: input.mood, workflowDraft: input.workflowDraft });
    return auditState({});
  },
  renamePlaylist: ({ name }) => { auditPlaylist.name = name; return ok(); },
  createPlaylist: ({ name }) => { auditPlaylist.name = name; return ok({ id: auditPlaylist.id }); },
  movePlaylistEntry: ({ entryId, index }) => {
    const current = auditPlaylist.entries.findIndex((entry) => entry.entryId === entryId);
    auditPlaylist.entries.splice(index, 0, ...auditPlaylist.entries.splice(current, 1));
    return ok();
  },
  removePlaylistEntries: ({ entryIds }) => {
    auditPlaylist.entries = auditPlaylist.entries.filter((entry) => !entryIds.includes(entry.entryId));
    auditPlaylist.songCount = auditPlaylist.entries.length;
    return ok();
  },
  setOpenAiKey: () => Promise.resolve({ ok: false, error: { code: 'invalid', message: 'Provider changes are disabled in this synthetic audit.' } }),
  setElevenLabsKey: () => Promise.resolve({ ok: false, error: { code: 'invalid', message: 'Provider changes are disabled in this synthetic audit.' } }),
  setTwitterKey: () => Promise.resolve({ ok: false, error: { code: 'invalid', message: 'Provider changes are disabled in this synthetic audit.' } }),
  openSource: () => ok(),
});

if (auditParams.has('news-library')) {
  const createdAt = '2026-11-02T00:00:00.000Z';
  const room = state.roomProfiles[0];
  const provenance = { dj: state.djs[0], mood: room.mood, sources: state.sources, roomId: room.id, roomName: room.name };
  const titles = ['New album announced for Friday', 'A new way to browse your library', 'Festival adds two evening sets'];
  const articles = titles.map((title, index) => ({ id: 'article-' + index, title, url: 'https://example.invalid/story-' + index, source: 'Example music news', publishedAt: createdAt }));
  const recordings = articles.map((article, index) => ({
    id: 'audit-take-' + index, requestId: 'audit-request-' + index, scriptId: 'audit-script-' + index,
    script: article.title + '. The source describes the announcement and the details available so far.',
    articles: [article], warnings: index === 0 ? ['One source could not refresh. Coverage is incomplete.'] : [],
    engine: 'elevenlabs-v4', createdAt, audioUrl: location.origin + '/fixture-speech-' + index,
    signature: 'audit-signature-' + index, provenance, renderingDJ: state.djs[0], available: true,
    byteLength: 100, model: 'fixture', voice: 'fixture', delivery: '',
    deliveryState: index === 2 ? { status: 'played', playedAt: createdAt } : { status: 'ready' },
  }));
  const library = {
    scripts: recordings.map((take) => ({ id: take.scriptId, requestId: take.requestId, script: take.script, articles: take.articles, warnings: take.warnings, provenance, createdAt })),
    takes: recordings, selectedTakeId: null, requests: [], favorites: [],
    reviewedArticles: articles.map((article, index) => ({ ...article, canonicalUrl: article.url, requestId: 'audit-request-' + index, reviewedAt: createdAt, status: 'reviewed', outcome: 'selected' })),
  };
  bridge.getPreparedNews = () => ok(structuredClone(library));
  bridge.setNewsFavorite = ({ article, favorite }) => {
    library.favorites = library.favorites.filter((value) => value.canonicalUrl !== article.url);
    if (favorite) library.favorites.push({ ...article, canonicalUrl: article.url, favoritedAt: createdAt });
    return ok(structuredClone(library));
  };
}

if (auditParams.has('audio-probe')) {
  const audioProbe = { created: 0, closed: 0 };
  const reportAudio = () => {
    let output = document.getElementById('audit-audio-status');
    if (!output) {
      output = document.createElement('output');
      output.id = 'audit-audio-status';
      output.hidden = true;
      document.body.append(output);
    }
    output.textContent = JSON.stringify(audioProbe);
  };
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
  window.AudioContext = class AuditAudioContext {
    constructor() {
      this.started = performance.now();
      this.closed = false;
      audioProbe.created++;
      reportAudio();
    }
    get currentTime() { return (performance.now() - this.started) / 1000; }
    get destination() { return {}; }
    createGain() { return { gain: parameter(), connect() {} }; }
    createOscillator() { return { frequency: parameter(), connect() {}, start() {}, stop() {} }; }
    createMediaElementSource() { return { connect() {} }; }
    resume() { return Promise.resolve(); }
    close() {
      if (!this.closed) { this.closed = true; audioProbe.closed++; reportAudio(); }
      return Promise.resolve();
    }
  };
}

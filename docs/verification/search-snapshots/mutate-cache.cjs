// Loaded only by the verification runner in a separate process.
const fs = require('node:fs');
const originalRead = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  const result = originalRead.call(this, file, ...args);
  if (typeof file !== 'string' || !file.endsWith('/src/main/jellyfin.ts')) return result;
  const source = String(result);
  const match = 'if (start > 0 && previous?.session === session) {';
  if (source.split(match).length !== 2) throw new Error('Search cache mutation anchor changed');
  return source.replace(match, 'if (false && start > 0 && previous?.session === session) {');
};

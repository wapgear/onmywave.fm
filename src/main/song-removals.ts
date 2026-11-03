import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RemovedSong } from '../shared/types';

type Record = RemovedSong & { connectionId: string };

export const songIdentity = (id: string) => id.replaceAll('-', '').toLowerCase();

export function isRemovedSong(value: unknown): value is RemovedSong {
  if (!value || typeof value !== 'object') return false;
  const item = value as RemovedSong;
  return (
    typeof item.songId === 'string' &&
    /^[a-f\d]{32}$/.test(item.songId) &&
    typeof item.removedAt === 'string' &&
    Number.isFinite(Date.parse(item.removedAt)) &&
    (item.purgeAfter === null || (typeof item.purgeAfter === 'string' && Number.isFinite(Date.parse(item.purgeAfter))))
  );
}

export class SongRemovalStore {
  private writes = Promise.resolve();
  private records: Record[] | undefined;
  private loading: Promise<Record[]> | undefined;
  constructor(private directory: string) {}
  private async read(): Promise<Record[]> {
    if (this.records) return this.records;
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      return await this.loading;
    } finally {
      this.loading = undefined;
    }
  }
  private async load(): Promise<Record[]> {
    try {
      const data: unknown = JSON.parse(await readFile(join(this.directory, 'removed-songs.json'), 'utf8'));
      if (
        !Array.isArray(data) ||
        !data.every((item: unknown) => isRemovedSong(item) && typeof (item as Record).connectionId === 'string')
      )
        throw new Error('Invalid removal records.');
      this.records = data as Record[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Removed songs could not be read. Your existing file was preserved.');
      this.records = [];
    }
    return this.records;
  }
  async list(connectionId: string): Promise<RemovedSong[]> {
    await this.writes;
    return (await this.read())
      .filter((record) => record.connectionId === connectionId)
      .map(({ songId, removedAt, purgeAfter }) => ({ songId, removedAt, purgeAfter }));
  }
  merge(connectionId: string, songs: RemovedSong[]): Promise<void> {
    const write = this.writes.then(async () => {
      const records = [...(await this.read())];
      let changed = false;
      for (const song of songs) {
        const index = records.findIndex((item) => item.connectionId === connectionId && item.songId === song.songId);
        if (index < 0) {
          records.push({ ...song, connectionId });
          changed = true;
        } else if (song.purgeAfter && !records[index].purgeAfter) {
          records[index] = { ...song, connectionId };
          changed = true;
        }
      }
      if (!changed) return;
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const target = join(this.directory, 'removed-songs.json');
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
        await rename(temporary, target);
        this.records = records;
      } finally {
        await unlink(temporary).catch(() => {});
      }
    });
    this.writes = write.catch(() => {});
    return write;
  }
}

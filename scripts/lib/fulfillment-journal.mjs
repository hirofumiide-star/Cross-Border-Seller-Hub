import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DemoError } from './demo-common.mjs';

export async function withShipmentJournal(directory, identifier, action) {
  if (!/^cbsh-[a-f0-9]{32}$/.test(identifier)) throw new DemoError('journal-error');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, identifier + '.json');
  const lockPath = join(directory, identifier + '.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new DemoError('journal-error'); }
  try {
    let current = null;
    try { current = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new DemoError('journal-error'); }
    if (current && (current.schemaVersion !== 1 || current.identifier !== identifier
      || !/^[a-f0-9]{64}$/.test(current.payloadHash ?? '')
      || !['submitting', 'submitted', 'uncertain', 'rejected'].includes(current.phase))) {
      throw new DemoError('journal-error');
    }
    const save = async value => {
      const temporary = path + '.' + randomUUID() + '.tmp';
      let file;
      try {
        file = await open(temporary, 'wx', 0o600);
        await file.writeFile(JSON.stringify({ schemaVersion: 1, identifier, ...value }, null, 2) + '\n');
        await file.sync();
        await file.close();
        file = null;
        await rename(temporary, path);
      } catch {
        if (file) await file.close().catch(() => {});
        await unlink(temporary).catch(() => {});
        throw new DemoError('journal-error');
      }
    };
    return await action({ current, save });
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

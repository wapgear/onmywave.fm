import { execFile } from 'node:child_process';
import { promisify } from 'node:util';


const run = promisify(execFile);

type Provider = 'openai' | 'elevenlabs';

const service = (provider: Provider) => `fm.onmywave.providers.${provider}`;

export async function readSharedProviderKey(provider: Provider): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  try {
    return (
      (
        await run('/usr/bin/security', ['find-generic-password', '-a', 'onmywave', '-s', service(provider), '-w'], {
          timeout: 10000,
        })
      ).stdout.trim() || null
    );
  } catch {
    return null;
  }
}

export async function writeSharedProviderKey(provider: Provider, key: string | null): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (key === null) {
    try {
      await run('/usr/bin/security', ['delete-generic-password', '-a', 'onmywave', '-s', service(provider)], {
        timeout: 10000,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 44) throw new Error('Could not remove the shared provider key.');
    }
    return;
  }
  if (!/^[a-zA-Z0-9_-]{8,1024}$/.test(key)) throw new Error('Enter a valid API key.');
  await new Promise<void>((resolve, reject) => {
    const child = execFile('/usr/bin/security', ['-i'], { timeout: 15000 }, (error) =>
      error ? reject(new Error('Could not save the shared provider key.')) : resolve(),
    );
    child.stdin?.end(`add-generic-password -U -a onmywave -s ${service(provider)} -w "${key}"\n`);
  });
  if ((await readSharedProviderKey(provider)) !== key) throw new Error('Keychain did not confirm the provider key.');
}

import { randomUUID } from 'node:crypto';

import type { TTSOptions, TTSResult } from '@tanstack/ai';
import { BaseTTSAdapter } from '@tanstack/ai/adapters';

// Keep cancellation and byte limits at our transport boundary; the stock adapter does not forward the abort signal.
export class NewsSpeechAdapter extends BaseTTSAdapter<'eleven_v4'> {
  readonly name = 'elevenlabs';
  constructor(private render: () => Promise<Buffer>) {
    super('eleven_v4');
  }
  async generateSpeech(options: TTSOptions): Promise<TTSResult> {
    options.abortSignal?.throwIfAborted();
    options.logger.request('activity=generateSpeech provider=elevenlabs model=eleven_v4');
    try {
      const audio = await this.render();
      options.abortSignal?.throwIfAborted();
      return {
        id: randomUUID(),
        model: this.model,
        audio: audio.toString('base64'),
        format: 'mp3',
        contentType: 'audio/mpeg',
      };
    } catch (error) {
      options.logger.errors('ElevenLabs news speech failed');
      throw error;
    }
  }
}

import type { WaveApi } from '../shared/types';

declare global {
  interface Window {
    wave: WaveApi;
  }
}

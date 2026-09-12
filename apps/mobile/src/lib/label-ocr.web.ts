/**
 * The web half of photo-label OCR (native half: label-ocr.ts; Metro resolves
 * one per platform, like db.ts / db.web.ts).
 *
 * There is no on-device OCR on the web preview and a cloud call would break
 * the app's privacy promise, so photo label scanning reports itself honestly
 * unavailable. Search and manual entry remain fully functional here.
 */

import type { OcrResult, OcrSource } from './label-ocr';

export async function labelOcrAvailable(): Promise<boolean> {
  return false;
}

export async function scanLabel(_source: OcrSource): Promise<OcrResult> {
  return {
    ok: false,
    message: 'Photo label scanning needs the phone app — search the food by name here.',
  };
}

/**
 * The native half of photo-label OCR (web half: label-ocr.web.ts; Metro
 * resolves one per platform, like db.ts / db.web.ts).
 *
 * The user picks or shoots a photo (expo-image-picker, cropped to the panel),
 * Google ML Kit reads the text entirely on device, and the pure parser
 * (src/lib/label-parse.ts) turns it into nutrients. No cloud, no upload —
 * the photo never leaves the phone.
 *
 * ML Kit's native module is absent under Expo Go and on web, so every entry
 * point is wrapped: the caller gets an honest message instead of a crash.
 */

import { parseLabelText, type ParsedLabel } from '@/lib/label-parse';

export type OcrSource = 'camera' | 'library';

export type OcrResult =
  | { ok: true; parsed: ParsedLabel }
  | { ok: false; cancelled: true }
  | { ok: false; message: string };

/** True when the native OCR module is present (dev client / prebuilt APK). */
export async function labelOcrAvailable(): Promise<boolean> {
  try {
    const mod = await import('@react-native-ml-kit/text-recognition');
    const { NativeModules } = await import('react-native');
    return Boolean(NativeModules.TextRecognition) && typeof mod.default.recognize === 'function';
  } catch {
    return false;
  }
}

export async function scanLabel(source: OcrSource): Promise<OcrResult> {
  let uri: string | null = null;
  try {
    const ImagePicker = await import('expo-image-picker');
    const options = {
      mediaTypes: ['images' as const],
      allowsEditing: true,
      quality: 0.8,
      exif: false,
      base64: false,
    };
    const picked =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets?.length) return { ok: false, cancelled: true };
    uri = picked.assets[0]?.uri ?? null;
    if (!uri) return { ok: false, cancelled: true };

    const mod = await import('@react-native-ml-kit/text-recognition');
    const recognition = await mod.default.recognize(uri);
    return { ok: true, parsed: parseLabelText(recognition.text) };
  } catch {
    if (uri) {
      // The module is missing (Expo Go / not prebuilt) — say so plainly.
      return {
        ok: false,
        message: 'On-device text reading needs the installed app. Use Search here.',
      };
    }
    return { ok: false, message: 'Could not read the label. Try again.' };
  }
}

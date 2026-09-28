/**
 * Native half of the share card: renders the hidden off-screen card view to a
 * PNG (react-native-view-shot) and hands it to the OS share sheet
 * (expo-sharing — the same pattern as export-share.ts).
 *
 * The card is laid out at a third of its final size and captured at the full
 * format resolution, so the text is real text (not a scaled screenshot) and the
 * PNG is exactly what Instagram / X / Facebook expect for that shape.
 *
 * No new permission is needed: the cache directory is app-private and the share
 * sheet is user-initiated. On web there is no capture — both callers hide the
 * Share control behind `Platform.OS !== 'web'` and rely on the OS share sheet
 * only on device.
 */

import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import type { ShareImageResult } from './share-card';
import { shareCardSize, shareFileName, type ShareFormatId, type ShareTemplateId } from './share-templates';

export type ShareCardCaptureOptions = {
  format: ShareFormatId;
  template: ShareTemplateId;
};

/**
 * Captures `cardRef` (a rendered ShareCard, kept off-screen by ShareCardStage)
 * and opens the share sheet.
 */
export async function shareCardImage(
  cardRef: RefObject<View | null>,
  options: ShareCardCaptureOptions,
): Promise<ShareImageResult> {
  const size = shareCardSize(options.format);
  let tmp: FileSystem.File | null = null;
  let named: FileSystem.File | null = null;
  try {
    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: size.outputWidth,
      height: size.outputHeight,
    });
    tmp = new FileSystem.File(uri);

    // Give the file a real name: some share targets display it, and "IMG_0421"
    // in someone's camera roll is a wasted impression. Best effort — if the
    // named copy fails, the share still happens from the capture's own file.
    let shareUri = tmp.uri;
    try {
      const target = new FileSystem.File(FileSystem.Paths.cache, shareFileName(options.format, options.template));
      if (target.exists) target.delete();
      tmp.copy(target);
      named = target;
      shareUri = target.uri;
    } catch {
      // Fall back to the unnamed capture file.
    }

    await Sharing.shareAsync(shareUri, {
      mimeType: 'image/png',
      dialogTitle: 'Share your week',
      UTI: 'public.png',
    });
    return { ok: true, method: 'share' };
  } catch {
    return { ok: false, method: 'error', message: 'Could not open the share sheet. Try again.' };
  } finally {
    // Best effort cleanup: the OS clears the cache directory anyway.
    for (const file of [named, tmp]) {
      try {
        if (file?.exists) file.delete();
      } catch {
        // Nothing more we can do.
      }
    }
  }
}

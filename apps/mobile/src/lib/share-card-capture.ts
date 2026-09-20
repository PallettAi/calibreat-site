/**
 * Native half of the weekly share card: renders the hidden off-screen card
 * view to a PNG in the cache directory (react-native-view-shot) and hands it
 * to the OS share sheet (expo-sharing — the same pattern as export-share.ts).
 * The web half (share-sheet-less) lives in share-card.web.ts.
 *
 * No new permission is needed: the cache directory is app-private and the
 * share sheet is user-initiated.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { View } from 'react-native';

import type { ShareImageResult } from './share-card';

/**
 * Captures `cardRef` (a rendered WeeklyShareCard, typically kept off-screen
 * inside a 0-opacity absolute wrapper) and opens the share sheet.
 */
export async function shareCardImage(cardRef: RefObject<View | null>): Promise<ShareImageResult> {
  let file: FileSystem.File | null = null;
  try {
    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    file = new FileSystem.File(uri);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share your calibrEAT week',
      UTI: 'public.png',
    });
    return { ok: true, method: 'share' };
  } catch {
    return { ok: false, method: 'error', message: 'Could not open the share sheet. Try again.' };
  } finally {
    // Best effort cleanup: the OS clears the cache directory anyway.
    try {
      if (file?.exists) file.delete();
    } catch {
      // Nothing more we can do.
    }
  }
}

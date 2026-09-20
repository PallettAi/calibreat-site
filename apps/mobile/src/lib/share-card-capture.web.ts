/**
 * Web half of the weekly share card. There is no OS share sheet on web, so
 * this returns an explicit "not available" and the button renders web
 * guidance (a screenshot works) instead of attempting a capture.
 */

import type { ShareImageResult } from '@/lib/share-card';

export async function shareCardImage(): Promise<ShareImageResult> {
  return { ok: false, method: 'error', message: 'Sharing is available in the mobile app.' };
}

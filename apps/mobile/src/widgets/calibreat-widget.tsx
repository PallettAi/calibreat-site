/**
 * Android home-screen widgets (spec §4). Rendered by the headless widget task
 * from the stored snapshot. Tapping opens the app's home screen via deep link.
 * Logging from the widget is out of scope for this cluster.
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { remainingLine, type WidgetSnapshot } from '@/lib/widget-snapshot';

const HOME_URI = 'calibreat://home';
const CARD = '#0E6B38';
const INK = '#FFFFFF';
const SOFT = '#D6F5E3';

function formatHours(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 3600)}h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m`;
}

/** Shown when no snapshot exists yet or it cannot be read. */
function OpenPrompt({ text }: { text: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: HOME_URI }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: CARD,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <TextWidget text={text} style={{ fontSize: 15, fontWeight: 'bold', color: INK }} />
    </FlexWidget>
  );
}

export function SmallWidget({ snap }: { snap: WidgetSnapshot | null }) {
  if (!snap) return <OpenPrompt text="Open calibrEAT" />;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: HOME_URI }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: CARD,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <TextWidget text={remainingLine(snap)} style={{ fontSize: 18, fontWeight: 'bold', color: INK }} />
      {snap.sourceLabel ? (
        <TextWidget text={snap.sourceLabel} style={{ fontSize: 11, color: SOFT }} />
      ) : null}
    </FlexWidget>
  );
}

export function MediumWidget({ snap }: { snap: WidgetSnapshot | null }) {
  if (!snap) return <OpenPrompt text="Open calibrEAT" />;
  const waterL = (Math.round(snap.waterMl / 100) / 10).toFixed(1);
  const goalL = (Math.round(snap.waterGoalMl / 100) / 10).toFixed(1);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: HOME_URI }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: CARD,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <TextWidget text={remainingLine(snap)} style={{ fontSize: 18, fontWeight: 'bold', color: INK }} />
      {/* Spacing comes from the separate rows; FlexWidget has no gap prop. */}
      <>
          <TextWidget
            text={`${snap.proteinG}/${snap.proteinGoalG} g protein · ${waterL}/${goalL} L water`}
            style={{ fontSize: 12, color: SOFT }}
          />
          {snap.fastElapsedSec != null ? (
            <TextWidget text={`Fasting ${formatHours(snap.fastElapsedSec)}`} style={{ fontSize: 12, color: SOFT }} />
          ) : null}
          {snap.sourceLabel ? <TextWidget text={snap.sourceLabel} style={{ fontSize: 11, color: SOFT }} /> : null}
      </>
    </FlexWidget>
  );
}

/**
 * Headless widget task. Runs when Android adds, updates or resizes a widget,
 * even when the app is closed. It only reads the stored snapshot and renders;
 * it never calls Health Connect or the database.
 */
import type { WidgetTaskHandler } from 'react-native-android-widget';

import { loadWidgetSnapshot } from '@/lib/widget-snapshot-store';

import { MediumWidget, SmallWidget } from './calibreat-widget';

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_CLICK' || widgetAction === 'WIDGET_DELETED') return;
  const snap = await loadWidgetSnapshot();
  renderWidget(widgetInfo.widgetName === 'CalibreatMedium' ? <MediumWidget snap={snap} /> : <SmallWidget snap={snap} />);
};

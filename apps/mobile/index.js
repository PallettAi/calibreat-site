import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widgets/widget-task-handler';

// Registered before the app entry so Android can run widget updates headlessly.
registerWidgetTaskHandler(widgetTaskHandler);

import 'expo-router/entry';

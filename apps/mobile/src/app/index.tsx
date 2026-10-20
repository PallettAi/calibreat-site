import { Redirect } from 'expo-router';

// The licence gate is gone, so the app opens straight onto Home. Home itself
// sends a brand-new install to setup.
export default function Index() {
  return <Redirect href="/home" />;
}

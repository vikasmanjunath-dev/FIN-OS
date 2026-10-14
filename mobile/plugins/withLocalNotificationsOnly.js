// FIN·OS only schedules reminders on the phone itself (lib/remindersNative.ts); it never registers for push and never
// asks for a push token (a guard test in __tests__/privacy.test.mts keeps it that way).
//
// The expo-notifications config plugin adds the iOS "Push Notifications" capability (the `aps-environment` entitlement)
// anyway. Local notifications do not need it, and declaring it would register the App ID with Apple's push service for
// nothing, so this plugin removes it again.
//
// Order matters: Expo runs the mods of the plugin listed LAST first, so this plugin is listed FIRST in app.json and
// therefore runs after expo-notifications has written its entitlement. mobile/__tests__/releaseConfig.test.mts checks
// that order, and `npx expo prebuild --platform ios` (see docs/RELEASE_RUNBOOK.md) shows the resulting entitlements file.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};

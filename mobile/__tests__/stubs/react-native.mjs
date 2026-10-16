// Minimal stand-in for react-native, used only by the Node test loader (corruptData.test.mts) so modules that touch Platform /
// AppState / Alert at import time can be loaded. Not a simulator: components are inert objects.
const comp = { displayName: 'stub' };
export const Platform = { OS: 'web', select: (o) => (o && (o.web ?? o.default)), Version: 0 };
export const Alert = { alert() {} };
export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
export const Linking = { openURL: async () => {}, canOpenURL: async () => false, openSettings: async () => {} };
export const NativeModules = {};
export const Appearance = { getColorScheme: () => 'dark', addChangeListener: () => ({ remove() {} }) };
export const StyleSheet = { create: (s) => s, flatten: (s) => s, hairlineWidth: 1, absoluteFill: {} };
export const Share = { share: async () => ({}) };
export const Dimensions = { get: () => ({ width: 390, height: 844 }) };
export const View = comp, Text = comp, TextInput = comp, ScrollView = comp, TouchableOpacity = comp, Pressable = comp, ActivityIndicator = comp, Switch = comp, RefreshControl = comp;
export default { Platform, Alert, AppState, Linking, NativeModules, Appearance, StyleSheet, Share, Dimensions };

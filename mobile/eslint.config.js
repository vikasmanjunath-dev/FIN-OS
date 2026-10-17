// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Native-only modules (expo-secure-store, expo-file-system, expo-notifications, ...) are loaded with require() INSIDE the functions
    // that need them, on purpose: the web preview and the node unit tests import these files and must never load a native module.
    // A top-level import would break both, so the rule that asks for `import` is off for the app's own source.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // lib/theme.ts and lib/i18nPatch.ts replace the render function of React Native's Text / View / TextInput. Hooks called there ARE
    // called from a component's render, which the rule cannot see.
    files: ["lib/theme.ts", "lib/i18nPatch.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    // eslint-config-expo 57 ships the React Compiler readiness checks (set-state-in-effect, purity, static-components, immutability,
    // refs). The app does not enable the React Compiler, and the flagged patterns (an effect that mirrors a prop into state, a clock
    // read at render) are valid React, so they stay off until the compiler is turned on deliberately.
    rules: {
      "react-hooks/set-state-in-effect": "off", "react-hooks/purity": "off", "react-hooks/static-components": "off",
      "react-hooks/immutability": "off", "react-hooks/refs": "off", "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/globals": "off", "react-hooks/use-memo": "off", "react-hooks/incompatible-library": "off",
    },
  },
  {
    // React Native <Text> renders ' and " as-is; the rule exists to protect HTML-entity parsing in web JSX and flagged 129 safe strings.
    rules: { "react/no-unescaped-entities": "off" },
  }
]);

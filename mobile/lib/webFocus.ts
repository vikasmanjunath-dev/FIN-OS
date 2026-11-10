import { Platform } from 'react-native';

/**
 * Visible keyboard focus on web. React Native Web removes the browser outline from its focusable views, which leaves keyboard users
 * with no idea where they are. `:focus-visible` shows the ring only for keyboard navigation (not for mouse or touch), so it never
 * appears on a normal tap. Installed once; harmless on native.
 */
export function installWebFocusRing() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('finos-focus-ring')) return;
  const el = document.createElement('style');
  el.id = 'finos-focus-ring';
  el.textContent = `
    [role="button"]:focus-visible, [role="tab"]:focus-visible, [role="switch"]:focus-visible, [role="link"]:focus-visible,
    [role="checkbox"]:focus-visible, [role="radio"]:focus-visible, [tabindex]:focus-visible, input:focus-visible, textarea:focus-visible {
      outline: 2px solid #38BDF8 !important; outline-offset: 2px !important; box-shadow: 0 0 0 5px rgba(56,189,248,0.28) !important;
    }`;
  document.head.appendChild(el);
}

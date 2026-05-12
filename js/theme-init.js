// js/theme-init.js

// 1. Check local storage immediately
const savedTheme = localStorage.getItem('finos-theme');

// 2. Apply the theme to the HTML tag before content loads
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
} else {
  // Default to dark if nothing is saved
  document.documentElement.setAttribute('data-theme', 'dark');
}
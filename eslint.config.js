// Catches real mistakes in the page scripts (an undefined name, a duplicated key, code that
// can't run). Style is left alone. Run: npx eslint onigiri_kitchen/web tests/*.js
const browser = ['window', 'document', 'navigator', 'location', 'localStorage', 'performance', 'requestAnimationFrame',
  'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', 'getComputedStyle',
  'matchMedia', 'AudioContext', 'webkitAudioContext', 'MutationObserver', 'ResizeObserver', 'URLSearchParams', 'Image',
  'Blob', 'URL', 'ClipboardItem', 'Audio', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'HTMLElement',
  'OffscreenCanvas', 'fetch', 'FileReader', 'DOMParser', 'XMLSerializer', 'Promise', 'IntersectionObserver', 'pycmd',
  'confirm', 'alert', 'screen', 'history', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'queueMicrotask',
  'structuredClone', 'TextEncoder', 'TextDecoder', 'btoa', 'atob', 'Intl', 'sessionStorage',
  // set by the page's other scripts (sound.js, the kitchen page, the stats page, chip.js)
  'OK', 'OKSound', 'OKS', 'OKChip', 'OKCelebrate'];
const node = ['require', 'module', 'process', '__dirname', 'console', 'Buffer', 'setTimeout'];

module.exports = [
  {
    files: ['onigiri_kitchen/web/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.fromEntries(browser.map((g) => [g, 'readonly'])) },
    rules: {
      'no-undef': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-unreachable': 'error', 'no-redeclare': 'error',
      'no-const-assign': 'error', 'no-self-assign': 'error', 'no-unsafe-finally': 'error',
      'use-isnan': 'error', 'valid-typeof': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error',
    },
  },
  {
    files: ['tests/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...Object.fromEntries(node.map((g) => [g, 'readonly'])), window: 'readonly', document: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
  },
];

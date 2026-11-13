import React from 'react';
import ReactDOM from 'react-dom/client';
import '../i18n';
// Fonts are bundled with the app instead of loaded from Google Fonts. A remote @import is
// render blocking: the first paint waited for a network round trip (and failed offline).
// Only the Latin subset and the weights actually used are included.
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

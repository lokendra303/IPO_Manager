import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import App from './App';
import { appTheme } from './theme';
import './index.css';

// After a new deploy, cached index.html may reference removed JS chunks — reload once.
function reloadOnceForStaleAssets() {
  const key = 'ipo-stale-asset-reload';
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  window.location.reload();
}

window.addEventListener('vite:preloadError', reloadOnceForStaleAssets);

window.addEventListener(
  'error',
  (event) => {
    const message = event.message || '';
    if (
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Loading chunk') ||
      message.includes('Importing a module script failed')
    ) {
      reloadOnceForStaleAssets();
    }
  },
  true
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={appTheme}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);

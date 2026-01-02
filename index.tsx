import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 全局未处理 Promise 拒绝处理器（捕获浏览器扩展等导致的错误）
window.addEventListener('unhandledrejection', (event) => {
  // 如果是浏览器扩展相关的错误，可以静默处理
  if (event.reason && event.reason.message && event.reason.message.includes('message port closed')) {
    event.preventDefault();
    return;
  }

  // 打印其他未处理的错误
  console.error('[Unhandled Promise Rejection]:', event.reason);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
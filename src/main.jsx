import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { CatalogProvider } from './lib/catalog.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Bọc ngoài App: chính App cũng cần totalSlots cho headline */}
    <CatalogProvider>
      <App />
    </CatalogProvider>
  </React.StrictMode>
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource/fredoka/700.css';
import { configureApi } from './api/client';
import { App } from './App';
import './styles.css';

configureApi(import.meta.env.VITE_API_URL || '/api');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

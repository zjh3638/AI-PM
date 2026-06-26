import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/design-tokens.css';
import './styles/global.css';
import './styles/panels.css';
import './styles/dashboard.css';
import './styles/workspace.css';
import './styles/pulse.css';
import './styles/login.css';
import './styles/personal.css';
import './styles/bigscreen.css';
import './styles/meeting.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

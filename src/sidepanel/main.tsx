import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

type Settings = {
  ollamaUrl: string;
  model: string;
  temperature: number;
  allowScriptInjection: boolean;
};

const defaultSettings: Settings = {
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3.1',
  temperature: 0.2,
  allowScriptInjection: false,
};

function App() {
  const [task, setTask] = useState('');
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    chrome.storage.local.get(defaultSettings).then((stored) => {
      setSettings(stored as Settings);
    });
  }, []);

  function updateSettings(next: Partial<Settings>) {
    const updated = { ...settings, ...next };
    setSettings(updated);
    chrome.storage.local.set(updated);
  }

  return (
    <main className="shell">
      <header className="header">
        <span className="eyebrow">Chrome + Ollama</span>
        <h1>NavigatorAI</h1>
      </header>

      <section className="panel task-panel" aria-labelledby="task-title">
        <div>
          <h2 id="task-title">Tarefa</h2>
          <p>Descreva o que o agente deve fazer na aba atual.</p>
        </div>
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Ex: leia esta pagina e encontre o botao de contato"
        />
        <button type="button" disabled={!task.trim()}>
          Iniciar tarefa
        </button>
      </section>

      <section className="panel" aria-labelledby="settings-title">
        <h2 id="settings-title">Configuracoes</h2>

        <label>
          Endpoint Ollama
          <input
            value={settings.ollamaUrl}
            onChange={(event) => updateSettings({ ollamaUrl: event.target.value })}
          />
        </label>

        <label>
          Modelo
          <input value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} />
        </label>

        <label>
          Temperatura
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(event) => updateSettings({ temperature: Number(event.target.value) })}
          />
        </label>

        <label className="switch-row">
          <span>
            <strong>Permitir inject_script</strong>
            <small>Quando desligado, scripts gerados pelo modelo sempre serao bloqueados.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.allowScriptInjection}
            onChange={(event) => updateSettings({ allowScriptInjection: event.target.checked })}
          />
        </label>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

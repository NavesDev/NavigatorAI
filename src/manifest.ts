const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: 'NavigatorAI',
  description: 'Agente local de navegador usando Ollama para tarefas na web.',
  version: '0.1.0',
  action: {
    default_title: 'NavigatorAI',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  permissions: ['activeTab', 'sidePanel', 'scripting', 'storage', 'tabs'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
};

export default manifest;

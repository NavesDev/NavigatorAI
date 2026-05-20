chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('Failed to configure side panel behavior', error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'navigatorai:get-page-summary') {
    return false;
  }

  chrome.tabs
    .sendMessage(sender.tab?.id ?? message.tabId, { type: 'navigatorai:read-page' })
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});

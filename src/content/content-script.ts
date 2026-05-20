type PageSummary = {
  title: string;
  url: string;
  visibleText: string;
  interactiveElements: Array<{
    tag: string;
    text: string;
    selector: string;
  }>;
};

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function selectorFor(element: Element): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const tag = element.tagName.toLowerCase();
  const name = element.getAttribute('name');
  const ariaLabel = element.getAttribute('aria-label');

  if (name) {
    return `${tag}[name="${CSS.escape(name)}"]`;
  }

  if (ariaLabel) {
    return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
  }

  return tag;
}

function readPage(): PageSummary {
  const interactive = Array.from(
    document.querySelectorAll('a, button, input, textarea, select, [role="button"], [contenteditable="true"]'),
  )
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .slice(0, 80)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: textOf(element),
      selector: selectorFor(element),
    }));

  return {
    title: document.title,
    url: location.href,
    visibleText: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000),
    interactiveElements: interactive,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'navigatorai:read-page') {
    return false;
  }

  sendResponse({ ok: true, page: readPage() });
  return false;
});

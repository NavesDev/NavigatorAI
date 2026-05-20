# Chatbot Sidepanel Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NavigatorAI side panel as a chatbot that can answer questions about the current page, start multi-step browser tasks, show model reasoning/status in real time, expose settings through a gear button with notification state, and execute structured page-reading/action loops through Ollama.

**Architecture:** Keep the extension split into shared contracts, background orchestration, content-page execution, and side panel UI. The service worker owns task state, Ollama calls, safety validation, multi-step task loops, and message routing; the content script owns DOM observation and action execution; the React side panel renders chat, page-answer messages, live reasoning, current action, history, and settings.

**Tech Stack:** Chrome Extension Manifest V3, Vite 8, React 19, TypeScript 6, `vite-plugin-web-extension`, Vitest, Testing Library, `lucide-react` icons. The frontend implementation must explicitly use the `frontend-design` skill before changing `src/sidepanel/*`.

---

## Current State

The repository already has:

- `src/manifest.ts`: MV3 extension manifest with `sidePanel`, service worker, content script, `host_permissions: ["<all_urls>"]`.
- `src/background/service-worker.ts`: minimal side panel behavior and a page summary relay.
- `src/content/content-script.ts`: minimal visible text and interactive element extraction.
- `src/sidepanel/main.tsx`: simple task/settings form.
- `src/sidepanel/styles.css`: initial styling.
- `docs/superpowers/specs/2026-05-19-chrome-ollama-web-agent-design.md`: product/architecture spec.

Ollama validation on 2026-05-20:

```text
ollama --version
Warning: could not connect to a running Ollama instance
Warning: client version is 0.20.2
```

The implementation should support Ollama being unavailable and show that clearly in the UI.

## Target File Structure

Create or modify these files:

- Modify: `package.json` - add test scripts and UI/test dependencies.
- Modify: `tsconfig.json` - include test globals if needed by Vitest.
- Create: `vitest.config.ts` - unit test configuration.
- Create: `src/shared/action-schema.ts` - model response union, action union, read-only answer response, validation, blocked-action result types.
- Create: `src/shared/config.ts` - persisted settings model and defaults.
- Create: `src/shared/messages.ts` - typed runtime message contracts.
- Create: `src/shared/task-types.ts` - task, chat, reasoning, step, and status types.
- Create: `src/shared/sensitive-fields.ts` - sensitive field detection helpers.
- Create: `src/background/ollama-client.ts` - Ollama API client with streaming support.
- Create: `src/background/prompt-builder.ts` - prompt construction from task, page, history, and policy.
- Create: `src/background/safety-policy.ts` - confirmation/blocking rules.
- Create: `src/background/task-runner.ts` - task state machine and action loop.
- Modify: `src/background/service-worker.ts` - route panel/task/content messages.
- Create: `src/content/dom-map.ts` - stable element IDs and compact DOM representation.
- Create: `src/content/page-analyzer.ts` - page summary with sensitive field filtering.
- Create: `src/content/action-executor.ts` - click/type/select/scroll/wait/navigate/extract/edit_dom/inject_script execution.
- Modify: `src/content/content-script.ts` - delegate to analyzer/executor.
- Replace: `src/sidepanel/main.tsx` - chatbot shell, task controls, reasoning feed, settings entry.
- Create: `src/sidepanel/App.tsx` - side panel app composition.
- Create: `src/sidepanel/components/ChatThread.tsx` - user/assistant/system messages.
- Create: `src/sidepanel/components/Composer.tsx` - task input and run controls.
- Create: `src/sidepanel/components/ReasoningStream.tsx` - live reasoning/status display.
- Create: `src/sidepanel/components/ActionTimeline.tsx` - current and previous actions.
- Create: `src/sidepanel/components/SettingsDrawer.tsx` - Ollama/model/safety settings.
- Create: `src/sidepanel/components/SettingsGear.tsx` - gear icon with notification badge.
- Create: `src/sidepanel/hooks/useExtensionStore.ts` - panel state and runtime messaging.
- Modify: `src/sidepanel/styles.css` - final chatbot layout and component states.

## Task 1: Add Test and UI Dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Test command: `npm run test -- --run`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install lucide-react
```

Expected: install succeeds and `npm audit --audit-level=high` reports no high vulnerabilities.

- [ ] **Step 2: Update scripts**

Modify `package.json` scripts to:

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest"
}
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 4: Add test setup**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- --run
npm run build
```

Expected: tests run with no test files or pass once later tests are added; build passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "chore: add test tooling"
```

## Task 2: Shared Contracts and Settings

**Files:**
- Create: `src/shared/action-schema.ts`
- Create: `src/shared/config.ts`
- Create: `src/shared/messages.ts`
- Create: `src/shared/task-types.ts`
- Create: `src/shared/action-schema.test.ts`
- Create: `src/shared/config.test.ts`

- [ ] **Step 1: Write failing action schema tests**

Create `src/shared/action-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseModelAction } from './action-schema';

describe('parseModelAction', () => {
  it('accepts a valid click action', () => {
    const result = parseModelAction({
      thought: 'Click login.',
      action: { type: 'click', target: { elementId: 'el_1' } },
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(true);
  });

  it('rejects unknown action types', () => {
    const result = parseModelAction({
      action: { type: 'run_shell', command: 'rm -rf .' },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Unknown action type: run_shell',
    });
  });

  it('accepts a direct read-only answer about the page', () => {
    const result = parseModelAction({
      thought: 'The user asked a question about the visible page.',
      response: {
        type: 'answer',
        message: 'O titulo da pagina e NavigatorAI.',
      },
    });

    expect(result.ok).toBe(true);
  });

  it('rejects inject_script without a script string', () => {
    const result = parseModelAction({
      action: { type: 'inject_script', reason: 'missing script' },
    });

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- --run src/shared/action-schema.test.ts
```

Expected: fails because `src/shared/action-schema.ts` does not exist.

- [ ] **Step 3: Implement action schema**

Create `src/shared/action-schema.ts` with:

```ts
export type ElementTarget = {
  elementId?: string;
  selector?: string;
};

export type AgentAction =
  | { type: 'read_page' }
  | { type: 'click'; target: ElementTarget }
  | { type: 'type'; target: ElementTarget; text: string }
  | { type: 'select'; target: ElementTarget; value: string }
  | { type: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount: number }
  | { type: 'wait'; milliseconds: number }
  | { type: 'navigate'; url: string }
  | { type: 'extract'; fields: string[] }
  | { type: 'edit_dom'; target: ElementTarget; operation: 'setText' | 'setAttribute' | 'setHtml'; value: string; attribute?: string }
  | { type: 'inject_script'; script: string; reason: string }
  | { type: 'finish'; status: 'success' | 'failure'; message: string };

export type AgentAnswer = {
  type: 'answer';
  message: string;
  citations?: string[];
};

export type ModelActionEnvelope = {
  thought?: string;
  action?: AgentAction;
  response?: AgentAnswer;
  requiresConfirmation?: boolean;
};

export type ParseResult =
  | { ok: true; value: ModelActionEnvelope }
  | { ok: false; error: string };

function hasObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasTarget(action: Record<string, unknown>): boolean {
  const target = action.target;
  return hasObject(target) && (typeof target.elementId === 'string' || typeof target.selector === 'string');
}

export function parseModelAction(input: unknown): ParseResult {
  if (!hasObject(input)) {
    return { ok: false, error: 'Model response must be an object' };
  }

  if (hasObject(input.response)) {
    if (input.response.type !== 'answer' || typeof input.response.message !== 'string') {
      return { ok: false, error: 'answer response requires message' };
    }

    return { ok: true, value: input as ModelActionEnvelope };
  }

  if (!hasObject(input.action)) {
    return { ok: false, error: 'Model response must contain an action object or answer response' };
  }

  const action = input.action;
  const type = action.type;

  if (typeof type !== 'string') {
    return { ok: false, error: 'Action type must be a string' };
  }

  switch (type) {
    case 'read_page':
      break;
    case 'click':
      if (!hasTarget(action)) return { ok: false, error: 'click requires target.elementId or target.selector' };
      break;
    case 'type':
      if (!hasTarget(action) || typeof action.text !== 'string') return { ok: false, error: 'type requires target and text' };
      break;
    case 'select':
      if (!hasTarget(action) || typeof action.value !== 'string') return { ok: false, error: 'select requires target and value' };
      break;
    case 'scroll':
      if (!['up', 'down', 'left', 'right'].includes(String(action.direction)) || typeof action.amount !== 'number') {
        return { ok: false, error: 'scroll requires direction and amount' };
      }
      break;
    case 'wait':
      if (typeof action.milliseconds !== 'number') return { ok: false, error: 'wait requires milliseconds' };
      break;
    case 'navigate':
      if (typeof action.url !== 'string') return { ok: false, error: 'navigate requires url' };
      break;
    case 'extract':
      if (!Array.isArray(action.fields)) return { ok: false, error: 'extract requires fields' };
      break;
    case 'edit_dom':
      if (!hasTarget(action) || typeof action.value !== 'string') return { ok: false, error: 'edit_dom requires target and value' };
      break;
    case 'inject_script':
      if (typeof action.script !== 'string' || typeof action.reason !== 'string') {
        return { ok: false, error: 'inject_script requires script and reason' };
      }
      break;
    case 'finish':
      if (!['success', 'failure'].includes(String(action.status)) || typeof action.message !== 'string') {
        return { ok: false, error: 'finish requires status and message' };
      }
      break;
    default:
      return { ok: false, error: `Unknown action type: ${type}` };
  }

  return { ok: true, value: input as ModelActionEnvelope };
}
```

- [ ] **Step 4: Write settings tests**

Create `src/shared/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultSettings, normalizeSettings } from './config';

describe('normalizeSettings', () => {
  it('keeps script injection disabled by default', () => {
    expect(defaultSettings.allowScriptInjection).toBe(false);
  });

  it('fills missing settings from defaults', () => {
    const settings = normalizeSettings({ model: 'qwen2.5' });

    expect(settings.model).toBe('qwen2.5');
    expect(settings.ollamaUrl).toBe('http://localhost:11434');
    expect(settings.allowScriptInjection).toBe(false);
  });
});
```

- [ ] **Step 5: Implement shared config and message types**

Create `src/shared/config.ts`:

```ts
export type ExecutionMode = 'confirm' | 'autonomous_task' | 'trusted_domains';

export type AppSettings = {
  ollamaUrl: string;
  model: string;
  temperature: number;
  maxContextCharacters: number;
  timeoutMs: number;
  maxStepsPerTask: number;
  executionMode: ExecutionMode;
  allowDomEditing: boolean;
  allowScriptInjection: boolean;
  blockedDomains: string[];
  trustedDomains: string[];
};

export const defaultSettings: AppSettings = {
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3.1',
  temperature: 0.2,
  maxContextCharacters: 12000,
  timeoutMs: 30000,
  maxStepsPerTask: 12,
  executionMode: 'confirm',
  allowDomEditing: true,
  allowScriptInjection: false,
  blockedDomains: [],
  trustedDomains: [],
};

export function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  return {
    ...defaultSettings,
    ...input,
    blockedDomains: input.blockedDomains ?? defaultSettings.blockedDomains,
    trustedDomains: input.trustedDomains ?? defaultSettings.trustedDomains,
  };
}
```

Create `src/shared/task-types.ts`:

```ts
import type { AgentAction } from './action-schema';

export type TaskStatus = 'idle' | 'running' | 'waiting_confirmation' | 'paused' | 'completed' | 'failed';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  source?: 'page_answer' | 'task_event';
};

export type ReasoningEvent = {
  id: string;
  text: string;
  createdAt: number;
};

export type ActionStep = {
  id: string;
  action: AgentAction;
  status: 'proposed' | 'approved' | 'running' | 'blocked' | 'completed' | 'failed';
  thought?: string;
  result?: string;
  createdAt: number;
};

export type TaskSnapshot = {
  status: TaskStatus;
  messages: ChatMessage[];
  reasoning: ReasoningEvent[];
  steps: ActionStep[];
  currentAction?: ActionStep;
};
```

Create `src/shared/messages.ts`:

```ts
import type { AgentAction } from './action-schema';
import type { AppSettings } from './config';
import type { TaskSnapshot } from './task-types';

export type RuntimeMessage =
  | { type: 'navigatorai:read-page' }
  | { type: 'navigatorai:get-page-summary'; tabId?: number }
  | { type: 'navigatorai:start-task'; task: string; settings: AppSettings }
  | { type: 'navigatorai:pause-task' }
  | { type: 'navigatorai:stop-task' }
  | { type: 'navigatorai:approve-action'; stepId: string }
  | { type: 'navigatorai:reject-action'; stepId: string; reason?: string }
  | { type: 'navigatorai:task-snapshot'; snapshot: TaskSnapshot }
  | { type: 'navigatorai:execute-action'; action: AgentAction };
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test -- --run src/shared/action-schema.test.ts src/shared/config.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared package.json package-lock.json vitest.config.ts src/test/setup.ts
git commit -m "feat: add shared agent contracts"
```

## Task 3: Page Analyzer and Content Action Executor

**Files:**
- Create: `src/content/dom-map.ts`
- Create: `src/content/page-analyzer.ts`
- Create: `src/content/action-executor.ts`
- Modify: `src/content/content-script.ts`
- Create: `src/content/page-analyzer.test.ts`
- Create: `src/content/action-executor.test.ts`

- [ ] **Step 1: Write page analyzer tests**

Create `src/content/page-analyzer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analyzePage } from './page-analyzer';

describe('analyzePage', () => {
  it('maps visible interactive elements with stable ids', () => {
    document.body.innerHTML = '<button id="save">Save</button><input name="email" value="a@example.com" />';

    const page = analyzePage();

    expect(page.interactiveElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ elementId: 'el_1', tag: 'button', text: 'Save', selector: '#save' }),
        expect.objectContaining({ elementId: 'el_2', tag: 'input', selector: 'input[name="email"]' }),
      ]),
    );
  });

  it('does not expose password field values', () => {
    document.body.innerHTML = '<input type="password" value="secret" />';

    const page = analyzePage();

    expect(JSON.stringify(page)).not.toContain('secret');
  });
});
```

- [ ] **Step 2: Run page analyzer test to verify failure**

Run:

```bash
npm run test -- --run src/content/page-analyzer.test.ts
```

Expected: fails because analyzer files do not exist.

- [ ] **Step 3: Implement DOM map and page analyzer**

Create `src/content/dom-map.ts`:

```ts
const elementIds = new WeakMap<Element, string>();

export function getElementId(element: Element, index: number): string {
  const existing = elementIds.get(element);
  if (existing) return existing;

  const id = `el_${index + 1}`;
  elementIds.set(element, id);
  return id;
}

export function findElementByTarget(target: { elementId?: string; selector?: string }): Element | null {
  if (target.elementId) {
    for (const element of document.querySelectorAll('*')) {
      if (elementIds.get(element) === target.elementId) return element;
    }
  }

  if (target.selector) {
    return document.querySelector(target.selector);
  }

  return null;
}
```

Create `src/content/page-analyzer.ts`:

```ts
import { getElementId } from './dom-map';

export type PageElement = {
  elementId: string;
  tag: string;
  text: string;
  selector: string;
  role?: string;
  inputType?: string;
};

export type PageSummary = {
  title: string;
  url: string;
  visibleText: string;
  interactiveElements: PageElement[];
};

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function textOf(element: Element): string {
  if (element instanceof HTMLInputElement && element.type === 'password') return '';
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return '';
  return compactText(element.textContent ?? '').slice(0, 160);
}

function selectorFor(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;

  const tag = element.tagName.toLowerCase();
  const name = element.getAttribute('name');
  const ariaLabel = element.getAttribute('aria-label');

  if (name) return `${tag}[name="${CSS.escape(name)}"]`;
  if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;

  return tag;
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

export function analyzePage(): PageSummary {
  const elements = Array.from(
    document.querySelectorAll('a, button, input, textarea, select, [role="button"], [contenteditable="true"]'),
  )
    .filter(isVisible)
    .slice(0, 120)
    .map((element, index) => ({
      elementId: getElementId(element, index),
      tag: element.tagName.toLowerCase(),
      text: textOf(element),
      selector: selectorFor(element),
      role: element.getAttribute('role') ?? undefined,
      inputType: element instanceof HTMLInputElement ? element.type : undefined,
    }));

  return {
    title: document.title,
    url: location.href,
    visibleText: compactText(document.body?.innerText ?? '').slice(0, 5000),
    interactiveElements: elements,
  };
}
```

- [ ] **Step 4: Write action executor tests**

Create `src/content/action-executor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { executeAction } from './action-executor';
import { analyzePage } from './page-analyzer';

describe('executeAction', () => {
  it('clicks a mapped element', async () => {
    const onClick = vi.fn();
    document.body.innerHTML = '<button id="save">Save</button>';
    document.querySelector('button')?.addEventListener('click', onClick);
    analyzePage();

    const result = await executeAction({ type: 'click', target: { elementId: 'el_1' } }, { allowScriptInjection: false, allowDomEditing: true });

    expect(result.ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('blocks script injection when disabled', async () => {
    const result = await executeAction(
      { type: 'inject_script', script: 'window.__ran = true', reason: 'test' },
      { allowScriptInjection: false, allowDomEditing: true },
    );

    expect(result).toEqual({ ok: false, error: 'Script injection is disabled' });
  });
});
```

- [ ] **Step 5: Implement action executor**

Create `src/content/action-executor.ts`:

```ts
import type { AgentAction } from '../shared/action-schema';
import { findElementByTarget } from './dom-map';

export type ExecutorPolicy = {
  allowScriptInjection: boolean;
  allowDomEditing: boolean;
};

export type ExecutionResult =
  | { ok: true; result: string; data?: unknown }
  | { ok: false; error: string };

function elementFrom(action: Extract<AgentAction, { target: unknown }>): Element | null {
  return findElementByTarget(action.target);
}

export async function executeAction(action: AgentAction, policy: ExecutorPolicy): Promise<ExecutionResult> {
  switch (action.type) {
    case 'read_page':
      return { ok: true, result: 'Page read requested' };
    case 'click': {
      const element = elementFrom(action);
      if (!(element instanceof HTMLElement)) return { ok: false, error: 'Element not found or not clickable' };
      element.click();
      return { ok: true, result: 'Clicked element' };
    }
    case 'type': {
      const element = elementFrom(action);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = action.text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, result: 'Typed text' };
      }
      if (element instanceof HTMLElement && element.isContentEditable) {
        element.textContent = action.text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, result: 'Typed text' };
      }
      return { ok: false, error: 'Element is not text editable' };
    }
    case 'select': {
      const element = elementFrom(action);
      if (!(element instanceof HTMLSelectElement)) return { ok: false, error: 'Element is not a select' };
      element.value = action.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, result: 'Selected option' };
    }
    case 'scroll':
      window.scrollBy({ top: action.direction === 'down' ? action.amount : -action.amount, behavior: 'smooth' });
      return { ok: true, result: 'Scrolled page' };
    case 'wait':
      await new Promise((resolve) => setTimeout(resolve, action.milliseconds));
      return { ok: true, result: 'Wait completed' };
    case 'navigate':
      location.assign(action.url);
      return { ok: true, result: 'Navigation started' };
    case 'extract':
      return { ok: true, result: 'Extracted fields', data: action.fields.reduce<Record<string, string>>((acc, field) => ({ ...acc, [field]: document.body.innerText }), {}) };
    case 'edit_dom': {
      if (!policy.allowDomEditing) return { ok: false, error: 'DOM editing is disabled' };
      const element = elementFrom(action);
      if (!(element instanceof HTMLElement)) return { ok: false, error: 'Element not found' };
      if (action.operation === 'setText') element.textContent = action.value;
      if (action.operation === 'setHtml') element.innerHTML = action.value;
      if (action.operation === 'setAttribute' && action.attribute) element.setAttribute(action.attribute, action.value);
      return { ok: true, result: 'DOM edited' };
    }
    case 'inject_script':
      if (!policy.allowScriptInjection) return { ok: false, error: 'Script injection is disabled' };
      Function(action.script)();
      return { ok: true, result: 'Script injected' };
    case 'finish':
      return { ok: true, result: action.message };
  }
}
```

- [ ] **Step 6: Wire content script**

Modify `src/content/content-script.ts` to import `analyzePage`, `executeAction`, and handle:

```ts
import { executeAction } from './action-executor';
import { analyzePage } from './page-analyzer';
import type { RuntimeMessage } from '../shared/messages';

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'navigatorai:read-page') {
    sendResponse({ ok: true, page: analyzePage() });
    return false;
  }

  if (message.type === 'navigatorai:execute-action') {
    chrome.storage.local.get({ allowScriptInjection: false, allowDomEditing: true }).then((settings) => {
      executeAction(message.action, {
        allowScriptInjection: Boolean(settings.allowScriptInjection),
        allowDomEditing: Boolean(settings.allowDomEditing),
      }).then(sendResponse);
    });
    return true;
  }

  return false;
});
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run test -- --run src/content/page-analyzer.test.ts src/content/action-executor.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 8: Commit**

```bash
git add src/content src/shared
git commit -m "feat: add page analysis and action execution"
```

## Task 4: Ollama Client, Prompt Builder, and Safety Policy

**Files:**
- Create: `src/background/ollama-client.ts`
- Create: `src/background/prompt-builder.ts`
- Create: `src/background/safety-policy.ts`
- Create: `src/background/ollama-client.test.ts`
- Create: `src/background/safety-policy.test.ts`

- [ ] **Step 1: Write safety tests**

Create `src/background/safety-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateActionSafety } from './safety-policy';
import { defaultSettings } from '../shared/config';

describe('evaluateActionSafety', () => {
  it('blocks inject_script when disabled', () => {
    const result = evaluateActionSafety(
      { type: 'inject_script', script: 'alert(1)', reason: 'test' },
      { ...defaultSettings, allowScriptInjection: false },
      'https://example.com',
    );

    expect(result).toEqual({ decision: 'blocked', reason: 'Script injection is disabled' });
  });

  it('requires confirmation for inject_script when enabled', () => {
    const result = evaluateActionSafety(
      { type: 'inject_script', script: 'alert(1)', reason: 'test' },
      { ...defaultSettings, allowScriptInjection: true },
      'https://example.com',
    );

    expect(result.decision).toBe('confirm');
  });
});
```

- [ ] **Step 2: Implement safety policy**

Create `src/background/safety-policy.ts`:

```ts
import type { AgentAction } from '../shared/action-schema';
import type { AppSettings } from '../shared/config';

export type SafetyDecision =
  | { decision: 'allow' }
  | { decision: 'confirm'; reason: string }
  | { decision: 'blocked'; reason: string };

export function evaluateActionSafety(action: AgentAction, settings: AppSettings, url: string): SafetyDecision {
  const host = new URL(url).hostname;

  if (settings.blockedDomains.includes(host)) {
    return { decision: 'blocked', reason: `Domain is blocked: ${host}` };
  }

  if (action.type === 'inject_script' && !settings.allowScriptInjection) {
    return { decision: 'blocked', reason: 'Script injection is disabled' };
  }

  if (action.type === 'edit_dom' && !settings.allowDomEditing) {
    return { decision: 'blocked', reason: 'DOM editing is disabled' };
  }

  if (['inject_script', 'edit_dom', 'navigate'].includes(action.type)) {
    return { decision: 'confirm', reason: `${action.type} requires confirmation` };
  }

  if (settings.executionMode === 'confirm') {
    return { decision: 'confirm', reason: 'Confirmation mode is enabled' };
  }

  return { decision: 'allow' };
}
```

- [ ] **Step 3: Write Ollama client tests**

Create `src/background/ollama-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { callOllama } from './ollama-client';

describe('callOllama', () => {
  it('posts to the configured Ollama chat endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: '{"action":{"type":"finish","status":"success","message":"ok"}}' } }),
    });

    const result = await callOllama({
      fetchImpl: fetchMock,
      ollamaUrl: 'http://localhost:11434',
      model: 'llama3.1',
      temperature: 0.2,
      prompt: 'Return JSON',
      timeoutMs: 30000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toContain('"finish"');
  });
});
```

- [ ] **Step 4: Implement Ollama client**

Create `src/background/ollama-client.ts`:

```ts
export type OllamaRequest = {
  fetchImpl?: typeof fetch;
  ollamaUrl: string;
  model: string;
  temperature: number;
  prompt: string;
  timeoutMs: number;
};

export async function callOllama(request: OllamaRequest): Promise<string> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await fetchImpl(`${request.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        stream: false,
        options: { temperature: request.temperature },
        messages: [{ role: 'user', content: request.prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 5: Implement prompt builder**

Create `src/background/prompt-builder.ts`:

```ts
import type { AppSettings } from '../shared/config';
import type { ActionStep } from '../shared/task-types';

type BuildPromptInput = {
  task: string;
  page: unknown;
  settings: AppSettings;
  history: ActionStep[];
};

export function buildPrompt(input: BuildPromptInput): string {
  const scriptPolicy = input.settings.allowScriptInjection
    ? 'A acao inject_script esta ATIVADA. Use apenas quando acoes estruturadas nao forem suficientes e sempre inclua reason e requiresConfirmation=true.'
    : 'A acao inject_script esta DESATIVADA. Nao proponha inject_script.';

  return [
    'Voce controla uma extensao Chrome local chamada NavigatorAI.',
    'Responda somente JSON valido no contrato ModelActionEnvelope.',
    'Se o usuario fizer uma pergunta sobre a pagina e nenhuma acao no navegador for necessaria, responda com response.type="answer" e response.message.',
    'Use action quando precisar clicar, digitar, navegar, editar DOM, injetar script, extrair dados estruturados, aguardar ou finalizar uma tarefa ativa.',
    'Para tarefas com varios passos, retorne somente a proxima melhor acao. Depois do resultado da acao, voce recebera a pagina atualizada e deve escolher a proxima acao. Continue ate concluir com action.type="finish".',
    `Limite maximo desta tarefa: ${input.settings.maxStepsPerTask} passos.`,
    scriptPolicy,
    `Tarefa do usuario: ${input.task}`,
    `Pagina atual: ${JSON.stringify(input.page).slice(0, input.settings.maxContextCharacters)}`,
    `Historico recente: ${JSON.stringify(input.history.slice(-8))}`,
  ].join('\n\n');
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test -- --run src/background/safety-policy.test.ts src/background/ollama-client.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 7: Commit**

```bash
git add src/background src/shared
git commit -m "feat: add ollama client and safety policy"
```

## Task 5: Task Runner and Runtime Messaging

**Files:**
- Create: `src/background/task-runner.ts`
- Modify: `src/background/service-worker.ts`
- Create: `src/background/task-runner.test.ts`

- [ ] **Step 1: Write task runner test**

Create `src/background/task-runner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTaskRunner } from './task-runner';
import { defaultSettings } from '../shared/config';

describe('createTaskRunner', () => {
  it('publishes a direct answer when the model responds read-only', async () => {
    const publish = vi.fn();
    const runner = createTaskRunner({
      publish,
      getActivePage: vi.fn().mockResolvedValue({ title: 'Test', url: 'https://example.com', interactiveElements: [] }),
      executeAction: vi.fn(),
      askModel: vi.fn().mockResolvedValue({
        thought: 'The user asked about page content.',
        response: { type: 'answer', message: 'O titulo da pagina e Test.' },
      }),
    });

    await runner.start('Qual e o titulo da pagina?', defaultSettings);

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: 'O titulo da pagina e Test.', source: 'page_answer' }),
        ]),
      }),
    );
  });

  it('publishes reasoning and waits for confirmation when policy requires it', async () => {
    const publish = vi.fn();
    const runner = createTaskRunner({
      publish,
      getActivePage: vi.fn().mockResolvedValue({ title: 'Test', url: 'https://example.com', interactiveElements: [] }),
      executeAction: vi.fn(),
      askModel: vi.fn().mockResolvedValue({
        thought: 'Need to click.',
        action: { type: 'click', target: { selector: 'button' } },
        requiresConfirmation: true,
      }),
    });

    await runner.start('Click the button', { ...defaultSettings, executionMode: 'confirm' });

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ status: 'waiting_confirmation' }));
  });

  it('executes multiple allowed actions until finish', async () => {
    const publish = vi.fn();
    const executeAction = vi.fn().mockResolvedValue({ ok: true, result: 'ok' });
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ thought: 'Click first.', action: { type: 'click', target: { selector: '#one' } } })
      .mockResolvedValueOnce({ thought: 'Click second.', action: { type: 'click', target: { selector: '#two' } } })
      .mockResolvedValueOnce({ action: { type: 'finish', status: 'success', message: 'Done.' } });

    const runner = createTaskRunner({
      publish,
      getActivePage: vi.fn().mockResolvedValue({ title: 'Test', url: 'https://example.com', interactiveElements: [] }),
      executeAction,
      askModel,
    });

    await runner.start('Clique em duas coisas', { ...defaultSettings, executionMode: 'autonomous_task', maxStepsPerTask: 4 });

    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
});
```

- [ ] **Step 2: Implement task runner**

Create `src/background/task-runner.ts`:

```ts
import type { ModelActionEnvelope } from '../shared/action-schema';
import { parseModelAction } from '../shared/action-schema';
import type { AppSettings } from '../shared/config';
import type { ActionStep, TaskSnapshot } from '../shared/task-types';
import { buildPrompt } from './prompt-builder';
import { evaluateActionSafety } from './safety-policy';

type Dependencies = {
  publish: (snapshot: TaskSnapshot) => void;
  getActivePage: () => Promise<unknown & { url?: string }>;
  executeAction: (action: NonNullable<ModelActionEnvelope['action']>) => Promise<{ ok: boolean; result?: string; error?: string }>;
  askModel: (prompt: string, settings: AppSettings) => Promise<unknown>;
};

export function createTaskRunner(deps: Dependencies) {
  let snapshot: TaskSnapshot = { status: 'idle', messages: [], reasoning: [], steps: [] };
  let pending: ActionStep | undefined;

  function publish() {
    deps.publish(snapshot);
  }

  async function runNextStep(task: string, settings: AppSettings): Promise<void> {
    if (snapshot.steps.length >= settings.maxStepsPerTask) {
      snapshot = { ...snapshot, status: 'failed', reasoning: [...snapshot.reasoning, { id: crypto.randomUUID(), text: `Step limit reached: ${settings.maxStepsPerTask}`, createdAt: Date.now() }] };
      publish();
      return;
    }

    const page = await deps.getActivePage();
    const prompt = buildPrompt({ task, page, settings, history: snapshot.steps });
    const modelResponse = await deps.askModel(prompt, settings);
    const parsed = parseModelAction(modelResponse);

    if (!parsed.ok) {
      snapshot = { ...snapshot, status: 'failed', reasoning: [...snapshot.reasoning, { id: crypto.randomUUID(), text: parsed.error, createdAt: Date.now() }] };
      publish();
      return;
    }

    if (parsed.value.response?.type === 'answer') {
      snapshot = {
        ...snapshot,
        status: 'completed',
        messages: [
          ...snapshot.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: parsed.value.response.message,
            source: 'page_answer',
            createdAt: Date.now(),
          },
        ],
        reasoning: parsed.value.thought
          ? [...snapshot.reasoning, { id: crypto.randomUUID(), text: parsed.value.thought, createdAt: Date.now() }]
          : snapshot.reasoning,
      };
      publish();
      return;
    }

    if (!parsed.value.action) {
      snapshot = { ...snapshot, status: 'failed', reasoning: [...snapshot.reasoning, { id: crypto.randomUUID(), text: 'Model response did not include an action or answer.', createdAt: Date.now() }] };
      publish();
      return;
    }

    if (parsed.value.action.type === 'finish') {
      snapshot = {
        ...snapshot,
        status: parsed.value.action.status === 'success' ? 'completed' : 'failed',
        messages: [...snapshot.messages, { id: crypto.randomUUID(), role: 'assistant', content: parsed.value.action.message, source: 'task_event', createdAt: Date.now() }],
      };
      publish();
      return;
    }

    const actionUrl = typeof page.url === 'string' ? page.url : 'https://example.com';
    const safety = evaluateActionSafety(parsed.value.action, settings, actionUrl);
    const step: ActionStep = {
      id: crypto.randomUUID(),
      action: parsed.value.action,
      status: safety.decision === 'allow' ? 'running' : safety.decision === 'confirm' ? 'proposed' : 'blocked',
      thought: parsed.value.thought,
      createdAt: Date.now(),
    };

    snapshot = {
      ...snapshot,
      status: safety.decision === 'confirm' ? 'waiting_confirmation' : safety.decision === 'blocked' ? 'failed' : 'running',
      reasoning: parsed.value.thought ? [...snapshot.reasoning, { id: crypto.randomUUID(), text: parsed.value.thought, createdAt: Date.now() }] : snapshot.reasoning,
      steps: [...snapshot.steps, step],
      currentAction: step,
    };
    pending = safety.decision === 'confirm' ? step : undefined;
    publish();

    if (safety.decision !== 'allow') return;

    const result = await deps.executeAction(parsed.value.action);
    const completedStep: ActionStep = { ...step, status: result.ok ? 'completed' : 'failed', result: result.result ?? result.error };
    snapshot = {
      ...snapshot,
      status: result.ok ? 'running' : 'failed',
      steps: snapshot.steps.map((item) => (item.id === step.id ? completedStep : item)),
      currentAction: completedStep,
    };
    publish();

    if (result.ok) {
      await runNextStep(task, settings);
    }
  }

  async function start(task: string, settings: AppSettings) {
    snapshot = {
      status: 'running',
      messages: [{ id: crypto.randomUUID(), role: 'user', content: task, createdAt: Date.now() }],
      reasoning: [],
      steps: [],
    };
    publish();
    await runNextStep(task, settings);
  }

  async function approve(stepId: string, task: string, settings: AppSettings) {
    if (!pending || pending.id !== stepId) return;
    snapshot = { ...snapshot, status: 'running', currentAction: { ...pending, status: 'running' } };
    publish();
    const approved = pending;
    pending = undefined;
    const result = await deps.executeAction(approved.action);
    const completedStep: ActionStep = { ...approved, status: result.ok ? 'completed' : 'failed', result: result.result ?? result.error };
    snapshot = {
      ...snapshot,
      status: result.ok ? 'running' : 'failed',
      steps: snapshot.steps.map((item) => (item.id === approved.id ? completedStep : item)),
      currentAction: completedStep,
    };
    publish();
    if (result.ok) {
      await runNextStep(task, settings);
    }
  }

  function stop() {
    snapshot = { ...snapshot, status: 'idle', currentAction: undefined };
    pending = undefined;
    publish();
  }

  return { start, approve, stop };
}
```

- [ ] **Step 3: Wire service worker routes**

Modify `src/background/service-worker.ts` to:

- initialize `createTaskRunner`;
- respond to `navigatorai:start-task`, `approve-action`, `reject-action`, `pause-task`, `stop-task`;
- broadcast `navigatorai:task-snapshot` to the side panel using `chrome.runtime.sendMessage`;
- fetch the active tab and request `navigatorai:read-page`;
- send `navigatorai:execute-action` to the active tab.

Use this integration shape:

```ts
import { callOllama } from './ollama-client';
import { createTaskRunner } from './task-runner';
import type { RuntimeMessage } from '../shared/messages';
import type { AppSettings } from '../shared/config';

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab;
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- --run src/background/task-runner.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add src/background src/shared
git commit -m "feat: add agent task runner"
```

## Task 6: Chatbot Side Panel UI

**Files:**
- Replace: `src/sidepanel/main.tsx`
- Create: `src/sidepanel/App.tsx`
- Create: `src/sidepanel/hooks/useExtensionStore.ts`
- Create: `src/sidepanel/components/ChatThread.tsx`
- Create: `src/sidepanel/components/Composer.tsx`
- Create: `src/sidepanel/components/ReasoningStream.tsx`
- Create: `src/sidepanel/components/ActionTimeline.tsx`
- Create: `src/sidepanel/components/SettingsGear.tsx`
- Create: `src/sidepanel/components/SettingsDrawer.tsx`
- Modify: `src/sidepanel/styles.css`
- Create: `src/sidepanel/App.test.tsx`

- [ ] **Step 1: Invoke frontend-design before UI work**

Before editing `src/sidepanel/*`, explicitly use the `frontend-design` skill.

Design direction to follow:

- Chatbot-first interface, not a form.
- The same chat accepts both commands and questions about the current page.
- Page-question answers appear as assistant messages with a subtle “resposta da pagina” label and do not create action timeline entries unless the model needs a read/extract action first.
- Dense operational side panel, suitable for repeated use.
- Current task and live agent activity visible at the same time.
- Multi-step requests must show each executed action as a separate timeline row, for example four clicks from one user request should appear as four completed click steps.
- Reasoning/status stream shown as live activity, with clear labeling such as “Raciocinio” and “Executando”.
- Gear icon button for settings, using `lucide-react` `Settings`.
- Notification badge on the gear when Ollama is disconnected, required settings are missing, or `inject_script` is disabled while the latest blocked action requested it.
- Use `lucide-react` icons for start, stop, pause, approve, reject, settings, alert, and activity states.

- [ ] **Step 2: Write UI smoke test**

Create `src/sidepanel/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
});

describe('App', () => {
  it('renders chatbot, live reasoning, timeline, and settings gear', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'NavigatorAI' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite uma tarefa ou pergunta sobre a aba atual')).toBeInTheDocument();
    expect(screen.getByText('Raciocinio')).toBeInTheDocument();
    expect(screen.getByText('Acoes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir configuracoes' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement side panel app composition**

Create `src/sidepanel/App.tsx`:

```tsx
import { ActionTimeline } from './components/ActionTimeline';
import { ChatThread } from './components/ChatThread';
import { Composer } from './components/Composer';
import { ReasoningStream } from './components/ReasoningStream';
import { SettingsDrawer } from './components/SettingsDrawer';
import { SettingsGear } from './components/SettingsGear';
import { useExtensionStore } from './hooks/useExtensionStore';

export function App() {
  const store = useExtensionStore();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Chrome + Ollama</span>
          <h1>NavigatorAI</h1>
        </div>
        <SettingsGear hasNotification={store.hasSettingsNotification} onClick={store.openSettings} />
      </header>

      <ChatThread messages={store.snapshot.messages} status={store.snapshot.status} />
      <ReasoningStream events={store.snapshot.reasoning} status={store.snapshot.status} />
      <ActionTimeline steps={store.snapshot.steps} currentAction={store.snapshot.currentAction} onApprove={store.approveAction} onReject={store.rejectAction} />
      <Composer value={store.taskDraft} onChange={store.setTaskDraft} onSubmit={store.startTask} onStop={store.stopTask} status={store.snapshot.status} />

      <SettingsDrawer open={store.settingsOpen} settings={store.settings} onChange={store.updateSettings} onClose={store.closeSettings} />
    </main>
  );
}
```

Modify `src/sidepanel/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Implement store hook**

Create `src/sidepanel/hooks/useExtensionStore.ts` with:

```ts
import { useEffect, useMemo, useState } from 'react';
import { defaultSettings, normalizeSettings, type AppSettings } from '../../shared/config';
import type { RuntimeMessage } from '../../shared/messages';
import type { TaskSnapshot } from '../../shared/task-types';

const idleSnapshot: TaskSnapshot = { status: 'idle', messages: [], reasoning: [], steps: [] };

export function useExtensionStore() {
  const [taskDraft, setTaskDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [snapshot, setSnapshot] = useState<TaskSnapshot>(idleSnapshot);

  useEffect(() => {
    chrome.storage.local.get(defaultSettings).then((stored) => setSettings(normalizeSettings(stored)));
  }, []);

  useEffect(() => {
    const listener = (message: RuntimeMessage) => {
      if (message.type === 'navigatorai:task-snapshot') {
        setSnapshot(message.snapshot);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const hasSettingsNotification = useMemo(() => {
    return !settings.ollamaUrl || !settings.model || snapshot.steps.some((step) => step.status === 'blocked' && step.result?.includes('Script injection'));
  }, [settings, snapshot.steps]);

  function updateSettings(next: Partial<AppSettings>) {
    const updated = normalizeSettings({ ...settings, ...next });
    setSettings(updated);
    chrome.storage.local.set(updated);
  }

  function startTask() {
    if (!taskDraft.trim()) return;
    chrome.runtime.sendMessage({ type: 'navigatorai:start-task', task: taskDraft.trim(), settings } satisfies RuntimeMessage);
    setTaskDraft('');
  }

  return {
    taskDraft,
    setTaskDraft,
    settings,
    updateSettings,
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    snapshot,
    hasSettingsNotification,
    startTask,
    stopTask: () => chrome.runtime.sendMessage({ type: 'navigatorai:stop-task' } satisfies RuntimeMessage),
    approveAction: (stepId: string) => chrome.runtime.sendMessage({ type: 'navigatorai:approve-action', stepId } satisfies RuntimeMessage),
    rejectAction: (stepId: string) => chrome.runtime.sendMessage({ type: 'navigatorai:reject-action', stepId } satisfies RuntimeMessage),
  };
}
```

- [ ] **Step 5: Implement components**

Create components with these responsibilities:

- `ChatThread.tsx`: render messages in chat bubbles, include empty state text “Pronto para receber uma tarefa ou pergunta”, and show page answers with a compact “resposta da pagina” label.
- `Composer.tsx`: textarea placeholder “Digite uma tarefa ou pergunta sobre a aba atual”, run/stop buttons with `Play` and `Square` icons.
- `ReasoningStream.tsx`: title “Raciocinio”, status pill, newest reasoning events.
- `ActionTimeline.tsx`: title “Acoes”, current action card, completed multi-step action history, approve/reject buttons with `Check` and `X` icons.
- `SettingsGear.tsx`: icon-only button with `Settings`, accessible label “Abrir configuracoes”, and badge dot when `hasNotification` is true.
- `SettingsDrawer.tsx`: drawer with Ollama URL, model, temperature, max context, timeout, execution mode, allow DOM editing, allow script injection, trusted and blocked domains.

- [ ] **Step 6: Implement final CSS**

Modify `src/sidepanel/styles.css` to support:

- full-height side panel layout;
- fixed topbar;
- scrollable chat/reasoning/timeline regions;
- composer pinned at bottom;
- drawer overlay;
- gear notification badge;
- responsive min width 320px;
- no text overflow in buttons or cards.

Use a restrained operational palette with at least three functional colors:

- base: warm paper or neutral;
- primary: deep green/teal;
- warning: amber;
- danger: red;
- text: near-black.

- [ ] **Step 7: Verify**

Run:

```bash
npm run test -- --run src/sidepanel/App.test.tsx
npm run build
```

Expected: UI test and build pass.

- [ ] **Step 8: Commit**

```bash
git add src/sidepanel src/shared package.json package-lock.json
git commit -m "feat: build chatbot side panel"
```

## Task 7: Manual Extension Validation

**Files:**
- No source files unless validation exposes defects.

- [ ] **Step 1: Build extension**

Run:

```bash
npm run build
```

Expected: `dist/manifest.json`, side panel bundle, service worker bundle, and content script bundle are generated.

- [ ] **Step 2: Load extension in Chrome**

Open `chrome://extensions`, enable Developer Mode, load unpacked extension from:

```text
/home/naves/Projetos/NavigatorAI/dist
```

Expected: NavigatorAI loads without manifest errors.

- [ ] **Step 3: Validate side panel UI**

Open a normal webpage and click the NavigatorAI extension icon.

Expected:

- side panel opens;
- title “NavigatorAI” is visible;
- chat composer is visible;
- “Raciocinio” and “Acoes” panels are visible;
- settings gear is visible;
- settings drawer opens and closes;
- `Permitir inject_script` is disabled by default.

- [ ] **Step 4: Validate Ollama unavailable state**

With Ollama daemon stopped, start a task.

Expected:

- task fails gracefully;
- chat/timeline shows Ollama unavailable or request failure;
- settings gear shows notification badge if endpoint/model needs attention.

- [ ] **Step 5: Validate Ollama running state**

Start Ollama manually outside this plan:

```bash
ollama serve
```

In another terminal, confirm model availability:

```bash
ollama list
```

If no model is installed, pull the configured model:

```bash
ollama pull llama3.1
```

Then start a read-only task:

```text
Leia esta pagina e diga qual e o titulo.
```

Expected: task produces reasoning/status, returns an assistant chat answer about the page, does not create a browser-changing action, and does not request `inject_script`.

- [ ] **Step 6: Validate multi-step task**

On a simple page with several visible buttons or links, start:

```text
Clique nos quatro primeiros botoes visiveis, um por vez.
```

Expected:

- the runner executes one proposed action at a time;
- the page is read again after each action;
- the action timeline shows four separate click steps;
- the task stops with `finish` or a clear failure before `maxStepsPerTask`;
- the user can stop the task while it is running.

- [ ] **Step 7: Validate script block**

Keep `Permitir inject_script` disabled and ask:

```text
Injete um script para clicar no primeiro botao da pagina.
```

Expected:

- `inject_script` is blocked;
- no script runs;
- UI explains that script injection is disabled;
- settings gear notification badge appears.

- [ ] **Step 8: Commit validation fixes only**

If source defects were fixed during validation:

```bash
git add <fixed-files>
git commit -m "fix: address extension validation issues"
```

If no fixes were needed, do not create an empty commit.

## Coverage Review

This plan covers the spec as follows:

- Side panel as primary UI: Task 6.
- Chatbot format: Task 6.
- Direct answers to questions about the current page: Task 2, Task 4, Task 5, Task 6, Task 7.
- Multi-step requests with several actions from one prompt: Task 2, Task 4, Task 5, Task 6, Task 7.
- Settings button/gear: Task 6.
- Gear notification badge: Task 6 and Task 7.
- Real-time reasoning/status display: Task 5 and Task 6.
- “What it is doing” action timeline: Task 5 and Task 6.
- Ollama configurable endpoint/model/temperature/timeouts: Task 2, Task 4, Task 6.
- Page reading: Task 3.
- Structured actions: Task 2 and Task 3.
- `inject_script` support and global disable option: Task 2, Task 3, Task 4, Task 6, Task 7.
- Safety policy and confirmations: Task 4 and Task 5.
- Build validation: every task includes `npm run build`.
- Ollama validation: Task 7, with current local state noted above.

## Execution Choice

Plan complete. Recommended execution mode: subagent-driven by task, with review after each task. The frontend task must explicitly start by using `frontend-design`.

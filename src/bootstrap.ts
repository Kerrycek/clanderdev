import { loadBffRuntimeSession, loadOptionalRuntimeScripts } from './app/runtimeBootstrap';


type BootstrapLanguage = 'en' | 'cs';

const BOOTSTRAP_STRINGS: Record<BootstrapLanguage, Record<string, string>> = {
  en: {
    'bootstrap.failure.title': 'App failed to start',
    'bootstrap.failure.body': 'The UI could not initialize correctly.',
    'common.reload': 'Reload',
    'common.technical_details': 'Technical details',
    'common.unknown_error': 'Unknown error',
  },
  cs: {
    'bootstrap.failure.title': 'Aplikaci se nepodařilo spustit',
    'bootstrap.failure.body': 'Uživatelské rozhraní se nepodařilo správně inicializovat.',
    'common.reload': 'Znovu načíst',
    'common.technical_details': 'Technické detaily',
    'common.unknown_error': 'Neznámá chyba',
  },
};

function detectBootstrapLanguage(doc?: Document): BootstrapLanguage {
  const docLang = doc?.documentElement?.lang;
  const primary = String(docLang || '').trim().toLowerCase().split('-')[0];
  return primary === 'cs' ? 'cs' : 'en';
}

function bootstrapTForDocument(doc: Document | undefined, key: string): string {
  const lang = detectBootstrapLanguage(doc);
  return BOOTSTRAP_STRINGS[lang][key] ?? BOOTSTRAP_STRINGS.en[key] ?? key;
}

function describeBootstrapError(error: unknown, doc?: Document): string {
  if (error instanceof Error) {
    return error.stack || error.message || error.name || bootstrapTForDocument(doc, 'common.unknown_error');
  }

  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function renderBootstrapFailure(error: unknown, doc: Document = document): void {
  const root = doc.getElementById('root');
  if (!root) return;

  const wrapper = doc.createElement('div');
  wrapper.style.cssText = [
    'min-height:100vh',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'background:#0f172a',
    'color:#e2e8f0',
    'font-family:Inter, ui-sans-serif, system-ui, sans-serif',
  ].join(';');

  const card = doc.createElement('div');
  card.style.cssText = [
    'width:min(720px,100%)',
    'border:1px solid rgba(148,163,184,0.25)',
    'border-radius:12px',
    'padding:20px',
    'background:rgba(15,23,42,0.92)',
    'box-shadow:0 18px 48px rgba(15,23,42,0.45)',
  ].join(';');

  const title = doc.createElement('h1');
  title.textContent = bootstrapTForDocument(doc, 'bootstrap.failure.title');
  title.style.cssText = 'margin:0;font-size:1.25rem;line-height:1.4;font-weight:700;';

  const body = doc.createElement('p');
  body.textContent = bootstrapTForDocument(doc, 'bootstrap.failure.body');
  body.style.cssText = 'margin:12px 0 0 0;font-size:0.95rem;line-height:1.6;color:#cbd5e1;';

  const actions = doc.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;';

  const reloadButton = doc.createElement('button');
  reloadButton.type = 'button';
  reloadButton.textContent = bootstrapTForDocument(doc, 'common.reload');
  reloadButton.style.cssText = [
    'border:0',
    'border-radius:10px',
    'padding:10px 14px',
    'background:#2563eb',
    'color:white',
    'cursor:pointer',
    'font:inherit',
  ].join(';');
  reloadButton.onclick = () => (doc.defaultView ?? window).location.reload();

  const details = doc.createElement('details');
  details.style.cssText = 'margin-top:16px;';

  const summary = doc.createElement('summary');
  summary.textContent = bootstrapTForDocument(doc, 'common.technical_details');
  summary.style.cssText = 'cursor:pointer;font-weight:600;';

  const pre = doc.createElement('pre');
  pre.textContent = describeBootstrapError(error, doc);
  pre.style.cssText = [
    'margin-top:12px',
    'max-height:320px',
    'overflow:auto',
    'border-radius:10px',
    'padding:12px',
    'background:#020617',
    'color:#e2e8f0',
    'font-size:0.8rem',
    'line-height:1.5',
    'white-space:pre-wrap',
    'word-break:break-word',
  ].join(';');

  actions.appendChild(reloadButton);
  details.appendChild(summary);
  details.appendChild(pre);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);
  card.appendChild(details);
  wrapper.appendChild(card);

  root.replaceChildren(wrapper);
}

async function bootstrap() {
  try {
    await loadOptionalRuntimeScripts();
    await loadBffRuntimeSession();
    await import('./main');
  } catch (error) {
    console.error('vpsAdmin UI bootstrap failed', error);
    renderBootstrapFailure(error);
  }
}

void bootstrap();

// Runs Vimov's content scripts as ordinary page scripts with a stand-in
// `browser` API, so they can be exercised in any browser. Serve the repo root
// (python3 -m http.server) and open dev/playground.html?harness.
//
// Don't add ?harness in Firefox with the extension loaded: keys would be
// handled twice.

(async () => {
  if (!new URLSearchParams(location.search).has('harness')) return;

  const report = (message) => {
    console.log('[background]', message);
    dispatchEvent(new CustomEvent('vimov-harness-message', { detail: message }));
  };
  const stored = () => JSON.parse(localStorage.getItem('vimov-harness-settings') || '{}');

  window.browser = {
    runtime: {
      sendMessage: async (message) => {
        report(message);
        return { ok: true };
      },
    },
    storage: {
      sync: {
        get: async (defaults) => ({ ...defaults, ...stored() }),
        set: async (values) => localStorage.setItem('vimov-harness-settings', JSON.stringify({ ...stored(), ...values })),
      },
      onChanged: { addListener() {} },
    },
  };

  const manifest = await (await fetch('../manifest.json')).json();
  const [scripts] = manifest.content_scripts;
  for (const href of scripts.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `../${href}`;
    document.head.append(link);
  }
  for (const src of scripts.js) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `../${src}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Couldn't load ${src}`));
      document.head.append(script);
    });
  }
  document.documentElement.dataset.harness = 'ready';
})();

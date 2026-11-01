// Settings for `npx web-ext run|build|lint`. Keeps development files out of
// the package uploaded to addons.mozilla.org.

export default {
  ignoreFiles: [
    '.claude',
    'dev',
    'store',
    'web-ext-config.mjs',
    'AGENTS.md',
    'TODO.md',
  ],
};

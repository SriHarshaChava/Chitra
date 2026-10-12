/**
 * On-page debug console for devices without developer tools.
 *
 * Safari's Web Inspector for iPad only works from a Mac. Instead, opening Chitra with
 * `?debug=1` in the URL loads Eruda (MIT licence), a small console that runs inside
 * the page and shows logs, errors and network requests.
 *
 * Eruda is loaded with a dynamic `import()`, so normal visitors never download it.
 */

export function isDebugRequested(search: string): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

export async function enableDebugConsoleIfRequested(search = window.location.search) {
  if (!isDebugRequested(search)) return false;
  const { default: eruda } = await import('eruda');
  eruda.init();
  return true;
}

// Suppress upstream browser/DevTools VM instrumentation bug (Chromium #543499029)
// where Chrome's auto-injected soft navigation tracker crashes on undefined entry.startTime.
// A same-origin classic script so the production CSP (`script-src 'self'`) lets it run
// before the app module loads; an inline <script> would be refused.
window.addEventListener('error', function (event) {
  if (
    event.message &&
    event.message.includes("reading 'startTime'") &&
    (!event.filename || event.filename.includes('VM') || event.filename.includes('<anonymous>'))
  ) {
    event.preventDefault();
  }
});

// GH issue #2 Phase 8: an assets-only Workers project (no "main" script)
// serves both http and https on *.workers.dev with no redirect - Fly's
// backend/ysocket already force_https, this closes the same gap for the
// frontend so https is enforced end-to-end.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};

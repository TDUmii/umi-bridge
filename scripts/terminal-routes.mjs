import express from 'express';

const loopbackAddress = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

// Read the real socket and Host, never Express's proxy-derived hostname/protocol.
export function directTerminalRequest(req, res, next) {
  let url;
  try { url = new URL(`${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`); } catch { return res.sendStatus(404); }
  const proxyHeader = Object.keys(req.headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-') || name.startsWith('cf-') || ['true-client-ip', 'x-real-ip', 'via'].includes(name));
  if (!loopbackAddress(req.socket.remoteAddress) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash || proxyHeader) return res.sendStatus(404);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== url.origin) return res.status(403).json({ error: 'terminal_origin_required' });
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return res.status(403).json({ error: 'terminal_same_origin_required' });
  res.set('Cache-Control', 'no-store');
  next();
}

export function mountTerminalRoutes(app, { runtime, localAdmin, adminWrite }) {
  const router = express.Router();
  router.use(directTerminalRequest, localAdmin);
  const handle = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (cause) { res.status(Number.isInteger(cause.status) ? cause.status : 500).json({ error: cause.status ? cause.message : 'terminal_operation_failed' }); }
  };
  const json = express.json({ limit: '128kb', strict: true });
  const write = (path, fn) => router.post(path, adminWrite, json, handle(fn));
  router.get('/', handle(() => runtime.list()));
  router.get('/:id/output', handle(req => {
    const raw = req.query.after ?? '0';
    const after = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
    return runtime.output(req.params.id, after);
  }));
  write('/', req => ({ session: runtime.create(req.body) }));
  write('/:id/input', req => runtime.input(req.params.id, req.body?.data));
  write('/:id/resize', req => runtime.resize(req.params.id, req.body?.cols, req.body?.rows));
  write('/:id/rename', req => runtime.rename(req.params.id, req.body?.name));
  write('/:id/close', req => runtime.closeSession(req.params.id));
  router.use((cause, _req, res, _next) => res.status(cause.type === 'entity.too.large' ? 413 : 400).json({ error: cause.type === 'entity.too.large' ? 'terminal_payload_too_large' : 'invalid_terminal_json' }));
  app.use('/admin/api/terminal', router);
}

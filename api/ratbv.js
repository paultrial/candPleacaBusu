const ALLOWED_PATHS = new Set([
  '/afisaje/50-dus/line_50_9_cl2_ro.html',
  '/afisaje/4-intors/line_4_3_cl1_ro.html',
  '/afisaje/52-intors/line_52_3_cl1_ro.html',
  '/afisaje/4-dus/line_4_5_cl2_ro.html',
  '/afisaje/50-intors/line_50_1_cl1_ro.html',
  '/afisaje/4-dus/line_4_6_cl2_ro.html',
  '/afisaje/50-intors/line_50_2_cl1_ro.html',
  '/afisaje/52-dus/line_52_13_cl2_ro.html'
]);

module.exports = async (req, res) => {
  const path = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;

  if (!path || !ALLOWED_PATHS.has(path)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }

  const targetUrl = `https://www.ratbv.ro${path}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'cand-pleaca-busu/1.0'
      }
    });

    if (!response.ok) {
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Upstream error' }));
      return;
    }

    const html = await response.text();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Fetch failed' }));
  }
};

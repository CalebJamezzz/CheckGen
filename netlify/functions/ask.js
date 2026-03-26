const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: { message: 'API key not configured' } }) };
  }

  return new Promise((resolve) => {
    let body = '';
    const parsed = JSON.parse(event.body || '{}');

    // Ensure we use a supported model
    if (!parsed.model) parsed.model = 'claude-sonnet-4-6';

    const data = JSON.stringify(parsed);

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body,
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: { message: e.message } }),
      });
    });

    req.write(data);
    req.end();
  });
};

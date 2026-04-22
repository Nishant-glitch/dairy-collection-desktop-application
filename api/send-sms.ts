import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, mobile, message } = req.body;

  if (!apiKey || !mobile || !message) {
    return res.status(400).json({ error: 'Missing required fields: apiKey, mobile, message' });
  }

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        message: message,
        language: 'unicode',
        flash: 0,
        numbers: mobile,
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Fast2SMS Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send SMS' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { authKey, templateId, mobile, name, qty, fat, amount } = req.body;

  if (!authKey || !templateId || !mobile) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: '0',
        mobiles: '91' + mobile,
        name: name || '',
        qty: qty || '',
        fat: fat || '',
        amount: amount || '',
      }),
    });

    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { 
        type: 'error', 
        message: `Non-JSON response from MSG91 (Status ${response.status}): ${text.substring(0, 100)}...` 
      };
    }

    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ 
      type: 'error', 
      message: error.message || 'Internal Server Error' 
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { authKey, templateId, mobile, name, qty, fat, amount } = req.body;

    if (!authKey || !templateId || !mobile) {
      res.status(400).json({ error: 'Missing: authKey, templateId, mobile' });
      return;
    }

    const msg91Response = await fetch('https://api.msg91.com/api/v5/flow/', {
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
        name: name || 'Farmer',
        qty: qty || '0',
        fat: fat || '0',
        amount: amount || '0',
      }),
    });

    const responseText = await msg91Response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      type: 'error'
    });
  }
}

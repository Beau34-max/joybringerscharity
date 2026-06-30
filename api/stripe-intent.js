/* Creates a Stripe Payment Intent for the donate page.
   Uses the REST API directly so no npm install is needed. */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Stripe not configured.' });

  const { amount, donation_type, gift_aid } = req.body || {};
  const pence = Math.round(parseFloat(amount) * 100);
  if (!pence || pence < 100) return res.status(400).json({ error: 'Minimum donation is £1.' });

  const params = new URLSearchParams({
    amount:                              String(pence),
    currency:                            'gbp',
    'automatic_payment_methods[enabled]':'true',
    'metadata[donation_type]':           donation_type || 'one-off',
    'metadata[gift_aid]':                gift_aid ? 'yes' : 'no',
    'metadata[source]':                  'donate_page'
  });

  try {
    const r    = await fetch('https://api.stripe.com/v1/payment_intents', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ clientSecret: data.client_secret });
  } catch (err) {
    console.error('[Stripe]', err);
    return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
  }
};

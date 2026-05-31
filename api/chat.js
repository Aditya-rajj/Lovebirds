export default async function handler(req, res) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  if (req.method === 'GET') {
    const { offset } = req.query;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=5`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch' });
    }
  }

  if (req.method === 'POST') {
    const { text, sender, isMeta } = req.body;
    const formattedText = isMeta ? `[META_${isMeta}_${sender}]` : `[${sender}] ${text}`;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: CHAT_ID, 
          text: formattedText,
          disable_notification: isMeta ? true : false 
        })
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to send' });
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  const { imageBase64, sender } = req.body;

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Using standard Blob for form-data parsing
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    
    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append('caption', `[${sender}] Photo`);
    formData.append('photo', blob, 'photo.jpg');

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    await fetch(url, { method: 'POST', body: formData });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Upload failed' });
  }
}

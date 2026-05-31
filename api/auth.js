export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { code } = req.body;
  if (code === process.env.SECRET_KEY) {
    return res.status(200).json({ success: true });
  }
  return res.status(401).json({ success: false });
}

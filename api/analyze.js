export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { imageBase64, imageMime } = req.body;
 
  if (!imageBase64 || !imageMime) {
    return res.status(400).json({ error: 'Missing image data' });
  }
 
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a dental health AI assistant. You analyze photos of teeth and provide general, non-diagnostic observations. You are NOT a dentist and do NOT diagnose conditions. You only highlight visible general observations and give basic hygiene tips. Always respond ONLY with a valid JSON object — no markdown, no extra text. Use this exact structure:
{"score": 0-100, "scoreLabel": "Good / Fair / Needs Attention", "scoreColor": "#1D9E75 or #EF9F27 or #E24B4A", "findings": [{"status": "ok/warn/bad", "text": "short observation"}], "advice": "2-3 sentence general tip", "doctorNeeded": true/false}`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMime, data: imageBase64 } },
            { type: 'text', text: 'Please analyze this photo of teeth. If the image does not clearly show teeth, mention that in findings. Keep all text in English.' }
          ]
        }]
      })
    });
 
    const data = await response.json();
    const text = data.content.map(i => i.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { imageBase64, imageMime, previousScan, analysisType } = req.body;
 
  if (!imageBase64 || !imageMime) {
    return res.status(400).json({ error: 'Missing image data' });
  }
 
  // Determine if this is a toothbrush analysis
  const isToothbrushAnalysis = analysisType === 'toothbrush';
 
  // Build system prompt based on analysis type
  let systemPrompt, userPrompt;
  
  if (isToothbrushAnalysis) {
    systemPrompt = `You are a toothbrush condition analyzer. You examine photos of toothbrushes to assess bristle wear and recommend replacement timing. Analyze the bristle condition, spread pattern, discoloration, and overall wear. Always respond ONLY with a valid JSON object — no markdown, no extra text. Use this exact structure:
{
  "condition": 0-100 (100 = brand new, 0 = completely worn),
  "findings": [
    {"status": "ok/warn/bad", "text": "short observation about bristle condition"}
  ],
  "recommendation": "1-2 sentence recommendation about usage or replacement",
  "daysLeft": estimated days until replacement needed (0-90, 0 means replace now)
}

Bristle assessment guide:
- 90-100%: Bristles straight, uniform, no fraying - like new
- 70-89%: Minimal wear, slight bending at tips - still effective
- 50-69%: Moderate splay, some bristles bent outward - reduced effectiveness
- 30-49%: Significant wear, bristles flattened or splayed outward - poor cleaning
- 0-29%: Severe wear, bristles matted/bent/discolored - replace immediately

Consider: bristle alignment, tip fraying, color fading, base condition, visible debris between bristles.`;
    
    userPrompt = 'Please analyze this toothbrush photo. Assess the bristle condition and estimate how worn it is. If the image does not clearly show a toothbrush or bristles, mention that in findings. Keep all text in English.';
  } else {
    // Original teeth analysis
    systemPrompt = `You are a dental health AI assistant. You analyze photos of teeth and provide general, non-diagnostic observations. You are NOT a dentist and do NOT diagnose conditions. You only highlight visible general observations and give basic hygiene tips. Always respond ONLY with a valid JSON object — no markdown, no extra text. Use this exact structure:
{"score": 0-100, "scoreLabel": "Good / Fair / Needs Attention", "scoreColor": "#1D9E75 or #EF9F27 or #E24B4A", "findings": [{"status": "ok/warn/bad", "text": "short observation"}], "advice": "2-3 sentence general tip", "doctorNeeded": true/false}`;
    
    // Build comparison context for premium users
    let comparisonContext = '';
    if (previousScan && previousScan.findings && previousScan.findings.length > 0) {
      comparisonContext = `\n\nIMPORTANT - Previous scan comparison (${previousScan.daysSince} days ago, score: ${previousScan.score}/100):
Previous observations: ${previousScan.findings.join('; ')}
Please compare current image with these previous observations. If you notice any CHANGES (improvement or worsening), mention them specifically in findings. For example: "Gum line appears improved since last scan" or "More visible plaque buildup compared to previous scan". Focus on trackable changes over time.`;
    }
    
    userPrompt = `Please analyze this photo of teeth. If the image does not clearly show teeth, mention that in findings. Keep all text in English.${comparisonContext}`;
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
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: userPrompt }
          ]
        }]
      })
    });
 
    const raw = await response.text();
 
    let data;
    try { data = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Unexpected response from AI. Please try again.' }); }
 
    if (!data.content) {
      return res.status(500).json({ error: data.error?.message || 'AI error. Please try again.' });
    }
 
    const text = data.content.map(i => i.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
 
    let result;
    try { result = JSON.parse(clean); }
    catch { return res.status(500).json({ error: 'Could not parse AI response. Please try again.' }); }
 
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}

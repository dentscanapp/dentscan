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
    systemPrompt = `You are a toothbrush condition analyzer. You examine photos of toothbrushes to assess bristle wear and recommend replacement timing.

IMPORTANT: Many toothbrushes have INTENTIONALLY varied bristle patterns - some bristles are angled, different lengths, or have special tips for gum massage. This is BY DESIGN, not wear damage. 

Signs of ACTUAL WEAR (reduce condition score):
- Bristle tips that are frayed, split, or mushroomed (fuzzy ends)
- Bristles bent permanently in one direction from use
- Visible discoloration from toothpaste/food buildup
- Matted or clumped bristles that stick together
- Missing bristles or bald spots
- Visible debris trapped at bristle base

Signs of a NEW or GOOD condition brush:
- Clean, defined bristle tips (even if angled by design)
- Bristles spring back when touched
- No discoloration or buildup
- Multi-directional bristles are often INTENTIONAL design features
- Rubber/silicone gum massagers between bristles are normal

Always respond ONLY with a valid JSON object — no markdown, no extra text. Use this exact structure:
{
  "condition": 0-100 (100 = brand new, 0 = completely worn),
  "findings": [
    {"status": "ok/warn/bad", "text": "short observation about bristle condition"}
  ],
  "recommendation": "1-2 sentence recommendation about usage or replacement",
  "daysLeft": estimated days until replacement needed (0-90, 0 means replace now)
}

Condition guide:
- 90-100%: New or like-new, clean defined tips, no wear signs
- 70-89%: Light use, minimal tip fraying, still very effective
- 50-69%: Moderate use, some fraying visible, still functional
- 30-49%: Heavy wear, significant fraying, reduced effectiveness
- 0-29%: Severely worn, matted/bent bristles, replace immediately

Be careful not to confuse intentional design features with wear damage!`;
    
    userPrompt = 'Please analyze this toothbrush photo. Assess the bristle condition carefully - remember that many modern toothbrushes have multi-directional or angled bristles BY DESIGN. Look for actual wear signs like frayed tips, discoloration, or matted bristles. If the image does not clearly show a toothbrush, mention that in findings. Keep all text in English.';
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

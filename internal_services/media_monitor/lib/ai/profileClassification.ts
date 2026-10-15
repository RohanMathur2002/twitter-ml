import "server-only";

function normalizeTweet(t: any) {
  return {
    tweet_id: t.tweet_id,
    text: t.text,
    created_at: t.created_at,
    likes: t.likes ?? t.metrics?.likes ?? null,
    reposts: t.reposts ?? t.metrics?.reposts ?? null,
    replies: t.replies ?? t.metrics?.replies ?? null,
    views: t.views ?? t.metrics?.views ?? null,
    url: t.url ?? null,
  };
}

function formatProfileContext(username: string, tweets: any[] = [], bio: string = "") {
  const tweetsToUse = tweets && tweets.length > 0
    ? tweets.map(normalizeTweet)
    : [];

  return `
X Profile Info:
Username: ${username}
Bio: ${bio || "Not provided"}

Recent X Post Objects:
${JSON.stringify(tweetsToUse, null, 2)}
`.trim();
}

export function buildProfileClassificationPrompt(username: string, tweets: any[] = [], bio: string = "") {
  return `
You are a careful political-intelligence analyst evaluating an Indian Twitter/X profile.

Base your answer only on the structured data provided. Do not invent facts, do not claim certainty, and do not mention hidden reasoning.

Interpret ideology using Indian political categories, not US or European shortcuts.

Recognize sarcasm, satire, exaggeration, and rhetorical language, and ensure these do not influence or distort the overall interpretation of the actual beliefs or intent.

When reasoning, consider signals such as:
- welfare statism vs market reform
- labour rights vs deregulation
- social justice and caste equity
- secular constitutionalism vs cultural majoritarian language
- federalism and regional autonomy
- nationalism, borders, defence, and law-and-order emphasis
- issue-based civic activism that may not map neatly to party ideology

Return plain text with exactly these sections and labels:
Classification:
Indian Spectrum:
Left-Right Score:
Confidence:
Summary:
Key Signals:
Caveats:

Rules:
- "Classification" must be a concise label such as "Centre-Right Developmentalist", "Left Welfare-Statist", "Centre Technocratic Reformer", "Centre-Left Federalist", "Right National-Conservative", or "Issue-Based Civic Green".
- "Indian Spectrum" must be one of: Left, Centre-Left, Centre, Centre-Right, Right, Regional/State-Centred, Issue-Based/Non-Aligned.
- "Left-Right Score" must be an integer from 0 to 100 where:
  - 0 = furthest left
  - 50 = ideological centre
  - 100 = furthest right
- "Left-Right Score" must be numerically consistent with "Indian Spectrum".
- "Confidence" must be a percentage from 0 to 100 plus a one-line reason.
- "Summary" must be exactly 2 short sentences.
- "Key Signals" must contain exactly 3 bullet lines prefixed with "-".
- "Caveats" must contain exactly 2 bullet lines prefixed with "-".
- Keep the tone analytical, neutral, and concise.
- Confidence calibration matters:
  - Use 55-70 when the evidence is mixed or mostly thematic.
  - Use 71-85 when the evidence is strong and repeated across the profile.
  - Use above 85 only when the ideology is explicitly and repeatedly self-declared in the provided data.
- Do not say "explicit self-description", "self-identifies", or equivalent unless the provided bio or posts literally contain that ideological label.
- Prefer slightly conservative confidence over overstated certainty.
- Distinguish between a policy-oriented centre-right/centre-left profile and a hard ideological partisan profile.

Structured profile data:
${formatProfileContext(username, tweets, bio)}
`.trim();
}

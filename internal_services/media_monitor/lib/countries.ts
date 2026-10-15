export function getFlagEmoji(countryName: string) {
  const flags: Record<string, string> = {
    "India": "🇮🇳",
    "United States": "🇺🇸",
    "United Kingdom": "🇬🇧",
    "Canada": "🇨🇦",
    "Australia": "🇦🇺",
    "Germany": "🇩🇪",
    "France": "🇫🇷",
    "Japan": "🇯🇵",
    "China": "🇨🇳",
    "Brazil": "🇧🇷",
    "Russia": "🇷🇺",
    "South Africa": "🇿🇦",
    "Mexico": "🇲🇽",
    "Italy": "🇮🇹",
    "Spain": "🇪🇸",
    "Netherlands": "🇳🇱",
    "Singapore": "🇸🇬",
    "United Arab Emirates": "🇦🇪",
  };
  return flags[countryName] || "🌍";
}

export function mapLocationToCountry(location: string | null): string | null {
  if (!location) return null;
  const loc = location.toLowerCase();
  
  // Custom dictionary for fuzzy matching common locations to a standard country name
  if (loc.includes("india") || loc.includes("delhi") || loc.includes("mumbai") || loc.includes("भारत") || loc.includes("bharat") || loc.includes("bengaluru") || loc.includes("chennai") || loc.includes("kolkata")) return "India";
  if (loc.includes("usa") || loc.includes("united states") || loc.includes("new york") || loc.includes("california") || loc.includes("texas") || loc.includes("washington")) return "United States";
  if (loc.includes("uk") || loc.includes("united kingdom") || loc.includes("london") || loc.includes("england")) return "United Kingdom";
  if (loc.includes("canada") || loc.includes("toronto") || loc.includes("vancouver")) return "Canada";
  if (loc.includes("australia") || loc.includes("sydney") || loc.includes("melbourne")) return "Australia";
  
  // Fallback: take the last part of a comma-separated string
  const parts = location.split(',');
  let fallback = parts[parts.length - 1].trim();
  
  // Clean up common prefixes like "IN " before "India" (e.g. "IN India")
  fallback = fallback.replace(/^[A-Z]{2}\s+/, "");
  
  return fallback;
}

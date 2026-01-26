const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "Bodya Daily",
    subtitle: "30-second cat tap rush",
    description: "Tap the cat for 30 seconds and lock your score on-chain.",
    screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`, `${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#20182c",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["game", "cats", "tap", "daily", "base"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Fast daily tap game",
    ogTitle: "Bodya Daily",
    ogDescription: "Tap the cat for 30 seconds and save your score on Base.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;


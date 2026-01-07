export type Platform = 'twitter' | 'linkedin' | 'facebook'

export interface PlatformConfig {
  id: Platform
  name: string
  icon: string
  color: string
  urlPatterns: string[]
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  twitter: {
    id: 'twitter',
    name: 'Twitter/X',
    icon: 'twitter',
    color: 'sky',
    urlPatterns: ['twitter.com', 'x.com']
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin',
    color: 'blue',
    urlPatterns: ['linkedin.com']
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    color: 'indigo',
    urlPatterns: ['facebook.com']
  }
}

export const DEFAULT_PROMPT = `You are a social media expert. Generate 3 different engaging reply comments for the following post. Each comment should be:
- Natural and conversational
- Between 20-150 characters
- Appropriate for the platform
- Varied in tone (one supportive, one thoughtful/questioning, one witty/humorous)

Post: "{{postText}}"

Return ONLY a JSON array with exactly 3 strings, no other text. Example format:
["Comment 1", "Comment 2", "Comment 3"]`

export function getPlatformFromUrl(url: string): Platform | null {
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    if (config.urlPatterns.some(pattern => url.includes(pattern))) {
      return platform as Platform
    }
  }
  return null
}

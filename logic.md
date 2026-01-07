# Social Commenter - Logic

## Overview

Browser extension that generates AI-powered reply comments for Twitter/X, LinkedIn, and Facebook posts using Gemini API.

## Architecture

```
User opens post -> Content script auto-detects -> Sends text to sidepanel
                                                         |
                                                         v
                        Click "Generate" -> Gemini API generates 3 comments
                                                         |
                                                         v
                        Click "Insert" -> Content script inserts into reply box
```

## Key Files

### Types & Configuration

- [lib/types.ts](lib/types.ts) - Platform types and configuration
  - `Platform` type: 'twitter' | 'linkedin' | 'facebook'
  - `PLATFORMS` config with URL patterns, colors, names
  - `DEFAULT_PROMPT` - default Gemini prompt template
  - `getPlatformFromUrl()` - detect platform from URL

### UI Layer

- [entrypoints/sidepanel/App.tsx](entrypoints/sidepanel/App.tsx) - Main sidepanel UI
  - Platform switcher (Twitter/X, LinkedIn, Facebook)
  - Two tabs: Generate & Settings
  - Listens for `POST_TEXT_UPDATE` messages from content scripts
  - Auto-detects platform from active tab URL
  - Custom prompt setting with `{{postText}}` variable
  - Stores settings in browser storage:
    - `local:geminiApiKey` - API key
    - `local:customPrompt` - custom prompt template
    - `local:activePlatform` - selected platform

### Content Scripts

- [entrypoints/content.ts](entrypoints/content.ts) - Twitter/X
  - Matches: `*://twitter.com/*`, `*://x.com/*`
  - `getTweetText()` - extracts tweet using `[data-testid="tweetText"]`
  - `insertComment()` - inserts into `[data-testid="tweetTextarea_0"]`

- [entrypoints/content-linkedin.ts](entrypoints/content-linkedin.ts) - LinkedIn
  - Matches: `*://linkedin.com/*`, `*://www.linkedin.com/*`
  - `getPostText()` - extracts from `.feed-shared-update-v2__description`, `.update-components-text`
  - `insertComment()` - inserts into `.ql-editor` comment box

- [entrypoints/content-facebook.ts](entrypoints/content-facebook.ts) - Facebook
  - Matches: `*://facebook.com/*`, `*://www.facebook.com/*`
  - `getPostText()` - extracts from `[data-ad-comet-preview="message"]`, `[role="article"]`
  - `insertComment()` - inserts into contenteditable comment box

### API Integration

- [lib/gemini.ts](lib/gemini.ts) - Gemini API client
  - `generateComments(apiKey, postText, platform, customPrompt?)` - Returns 3 comment variants
  - Uses `gemini-2.0-flash` model
  - Supports custom prompts with `{{postText}}` variable
  - Platform-aware prompt generation

### Background

- [entrypoints/background.ts](entrypoints/background.ts) - Extension lifecycle
  - Opens sidepanel on extension icon click
  - Configures sidepanel behavior

## Data Flow

1. **Auto-detect Post**: Content script detects URL/DOM change -> `POST_TEXT_UPDATE` message -> Sidepanel updates UI
2. **Platform Detection**: Sidepanel detects platform from URL -> auto-switches platform tab
3. **Manual Refresh**: Sidepanel -> `GET_POST_TEXT` message -> Content script -> Returns post text
4. **Generate**: Sidepanel -> Gemini API (with custom prompt if set) -> Returns 3 comments
5. **Insert**: Sidepanel -> `INSERT_COMMENT` message -> Content script -> Inserts into DOM

## Message Types

| Message | Direction | Description |
|---------|-----------|-------------|
| `POST_TEXT_UPDATE` | Content -> Sidepanel | Post text detected (with platform) |
| `REQUEST_POST_TEXT` | Sidepanel -> Content | Request current post on open |
| `GET_POST_TEXT` | Sidepanel -> Content | Manual refresh request |
| `INSERT_COMMENT` | Sidepanel -> Content | Insert comment into reply box |

## Storage

- `local:geminiApiKey` - Gemini API key
- `local:customPrompt` - Custom prompt template (empty = use default)
- `local:activePlatform` - Last selected platform

## Custom Prompt

Users can customize the Gemini prompt in Settings. Use `{{postText}}` variable to insert the post content:

```
Generate 3 funny comments for this post:
"{{postText}}"

Return as JSON array: ["comment1", "comment2", "comment3"]
```

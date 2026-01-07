# Twitter Commenter - Logic

## Overview

Browser extension that generates AI-powered reply comments for Twitter/X tweets using Gemini API.

## Architecture

```
User opens tweet -> Content script auto-detects -> Sends text to sidepanel
                                                          |
                                                          v
                         Click "Generate" -> Gemini API generates 3 comments
                                                          |
                                                          v
                         Click "Insert" -> Content script inserts into reply box
```

## Key Files

### UI Layer

- [entrypoints/sidepanel/App.tsx](entrypoints/sidepanel/App.tsx) - Main sidepanel UI
  - Two tabs: Generate & Settings
  - Listens for `TWEET_TEXT_UPDATE` messages from content script (auto-detection)
  - Requests current tweet on sidepanel open via `REQUEST_TWEET_TEXT`
  - Stores Gemini API key in browser storage
  - Communicates with content script via `browser.tabs.sendMessage()`

### Content Script

- [entrypoints/content.ts](entrypoints/content.ts) - Runs on twitter.com/x.com
  - Auto-detects URL changes and tweet content via MutationObserver
  - Sends `TWEET_TEXT_UPDATE` message to sidepanel when tweet detected
  - `getTweetText()` - Extracts tweet text using `[data-testid="tweetText"]` selector
  - `insertComment()` - Inserts text into reply box `[data-testid="tweetTextarea_0"]`
  - Listens for messages: `GET_TWEET_TEXT`, `INSERT_COMMENT`, `REQUEST_TWEET_TEXT`

### API Integration

- [lib/gemini.ts](lib/gemini.ts) - Gemini API client
  - `generateComments(apiKey, tweetText)` - Returns 3 comment variants
  - Uses `gemini-2.0-flash` model
  - Parses JSON array from response

### Background

- [entrypoints/background.ts](entrypoints/background.ts) - Extension lifecycle
  - Opens sidepanel on extension icon click
  - Configures sidepanel behavior

## Data Flow

1. **Auto-detect Tweet**: Content script detects URL change/DOM update -> `TWEET_TEXT_UPDATE` message -> Sidepanel updates UI
2. **On Sidepanel Open**: Sidepanel -> `REQUEST_TWEET_TEXT` message -> Content script -> Returns current tweet
3. **Manual Refresh**: Sidepanel -> `GET_TWEET_TEXT` message -> Content script -> Returns tweet text
4. **Generate**: Sidepanel -> Gemini API -> Returns 3 comments
5. **Insert**: Sidepanel -> `INSERT_COMMENT` message -> Content script -> Inserts into DOM

## Storage

- `local:geminiApiKey` - Gemini API key (persisted in browser storage)

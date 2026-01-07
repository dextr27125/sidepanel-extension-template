export default defineContentScript({
  matches: ['*://twitter.com/*', '*://x.com/*'],
  main() {
    console.log('Twitter Commenter: Content script loaded');

    let lastUrl = location.href;
    let lastTweetText: string | null = null;

    // Send tweet text to sidepanel
    const sendTweetUpdate = (text: string | null) => {
      if (text !== lastTweetText) {
        lastTweetText = text;
        browser.runtime.sendMessage({ type: 'TWEET_TEXT_UPDATE', text }).catch(() => {
          // Sidepanel might not be open, ignore error
        });
      }
    };

    // Check for tweet and send update
    const checkAndSendTweet = () => {
      const tweetText = getTweetText();
      sendTweetUpdate(tweetText);
    };

    // Watch for URL changes (Twitter uses SPA navigation)
    const watchUrlChanges = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Small delay to let DOM update after navigation
        setTimeout(checkAndSendTweet, 500);
      }
    };

    // Watch for DOM changes (tweet content loading)
    const observer = new MutationObserver(() => {
      watchUrlChanges();
      // Also check if tweet appeared on current page
      if (location.href.includes('/status/') && !lastTweetText) {
        checkAndSendTweet();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also poll URL changes as backup
    setInterval(watchUrlChanges, 1000);

    // Initial check
    setTimeout(checkAndSendTweet, 500);

    // Listen for messages from sidepanel
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_TWEET_TEXT') {
        const tweetText = getTweetText();
        sendResponse({ success: true, text: tweetText });
        return true;
      }

      if (message.type === 'INSERT_COMMENT') {
        const success = insertComment(message.text);
        sendResponse({ success });
        return true;
      }

      // Sidepanel requesting current tweet (on open)
      if (message.type === 'REQUEST_TWEET_TEXT') {
        const tweetText = getTweetText();
        sendResponse({ success: true, text: tweetText });
        return true;
      }

      return false;
    });
  },
});

function getTweetText(): string | null {
  // First, check if we're on a tweet page (URL contains /status/)
  if (!window.location.href.includes('/status/')) {
    return null;
  }

  // Try to find the main tweet text
  const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');

  if (tweetArticles.length === 0) {
    return null;
  }

  // The first article is usually the main tweet on a tweet page
  const mainTweet = tweetArticles[0];

  // Find the tweet text container
  const tweetTextElement = mainTweet.querySelector('[data-testid="tweetText"]');

  if (tweetTextElement) {
    return tweetTextElement.textContent?.trim() || null;
  }

  // Fallback: try to find any text content in the tweet
  const textElements = mainTweet.querySelectorAll('span');
  let longestText = '';

  textElements.forEach((el) => {
    const text = el.textContent?.trim() || '';
    if (text.length > longestText.length && text.length > 20) {
      longestText = text;
    }
  });

  return longestText || null;
}

function insertComment(text: string): boolean {
  try {
    // Find the reply/comment input field
    const replyBox = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement;

    if (replyBox) {
      replyBox.focus();
      replyBox.textContent = text;

      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      });
      replyBox.dispatchEvent(inputEvent);

      const changeEvent = new Event('change', { bubbles: true });
      replyBox.dispatchEvent(changeEvent);

      return true;
    }

    // Alternative: try to find the reply button first and click it
    const replyButton = document.querySelector('[data-testid="reply"]') as HTMLElement;
    if (replyButton) {
      replyButton.click();

      setTimeout(() => {
        const newReplyBox = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement;
        if (newReplyBox) {
          newReplyBox.focus();
          newReplyBox.textContent = text;

          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
          });
          newReplyBox.dispatchEvent(inputEvent);
        }
      }, 500);

      return true;
    }

    return false;
  } catch (error) {
    console.error('Twitter Commenter: Failed to insert comment', error);
    return false;
  }
}

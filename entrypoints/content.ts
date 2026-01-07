export default defineContentScript({
  matches: ['*://twitter.com/*', '*://x.com/*'],
  main() {
    console.log('Social Commenter: Twitter content script loaded');

    let lastUrl = location.href;
    let lastPostText: string | null = null;

    // Send post text to sidepanel
    const sendPostUpdate = (text: string | null) => {
      if (text !== lastPostText) {
        lastPostText = text;
        browser.runtime.sendMessage({
          type: 'POST_TEXT_UPDATE',
          text,
          platform: 'twitter'
        }).catch(() => {
          // Sidepanel might not be open, ignore error
        });
        // Also send legacy message for backward compatibility
        browser.runtime.sendMessage({
          type: 'TWEET_TEXT_UPDATE',
          text
        }).catch(() => {});
      }
    };

    // Check for post and send update
    const checkAndSendPost = () => {
      const postText = getPostText();
      sendPostUpdate(postText);
    };

    // Watch for URL changes (Twitter uses SPA navigation)
    const watchUrlChanges = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(checkAndSendPost, 500);
      }
    };

    // Watch for DOM changes
    const observer = new MutationObserver(() => {
      watchUrlChanges();
      if (location.href.includes('/status/') && !lastPostText) {
        checkAndSendPost();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Poll URL changes as backup
    setInterval(watchUrlChanges, 1000);

    // Initial check
    setTimeout(checkAndSendPost, 500);

    // Listen for messages from sidepanel
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // New unified message format
      if (message.type === 'GET_POST_TEXT' && message.platform === 'twitter') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      if (message.type === 'INSERT_COMMENT' && message.platform === 'twitter') {
        const success = insertComment(message.text);
        sendResponse({ success });
        return true;
      }

      if (message.type === 'REQUEST_POST_TEXT' && message.platform === 'twitter') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      // Legacy message format (backward compatibility)
      if (message.type === 'GET_TWEET_TEXT') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      if (message.type === 'INSERT_COMMENT' && !message.platform) {
        const success = insertComment(message.text);
        sendResponse({ success });
        return true;
      }

      if (message.type === 'REQUEST_TWEET_TEXT') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      return false;
    });
  },
});

function getPostText(): string | null {
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
    console.error('Social Commenter: Failed to insert comment', error);
    return false;
  }
}

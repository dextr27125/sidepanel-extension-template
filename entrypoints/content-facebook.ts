export default defineContentScript({
  matches: ['*://www.facebook.com/*', '*://facebook.com/*', '*://web.facebook.com/*'],
  main() {
    console.log('Social Commenter: Facebook content script loaded');

    let lastUrl = location.href;
    let lastPostText: string | null = null;

    // Send post text to sidepanel
    const sendPostUpdate = (text: string | null) => {
      if (text !== lastPostText) {
        lastPostText = text;
        browser.runtime.sendMessage({
          type: 'POST_TEXT_UPDATE',
          text,
          platform: 'facebook'
        }).catch(() => {
          // Sidepanel might not be open, ignore error
        });
      }
    };

    // Check for post and send update
    const checkAndSendPost = () => {
      const postText = getPostText();
      sendPostUpdate(postText);
    };

    // Watch for URL changes (Facebook uses SPA navigation)
    const watchUrlChanges = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(checkAndSendPost, 500);
      }
    };

    // Watch for DOM changes
    const observer = new MutationObserver(() => {
      watchUrlChanges();
      if (isPostPage() && !lastPostText) {
        checkAndSendPost();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Poll URL changes as backup
    setInterval(watchUrlChanges, 1000);

    // Initial check
    setTimeout(checkAndSendPost, 500);

    // Listen for messages from sidepanel
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_POST_TEXT' && message.platform === 'facebook') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      if (message.type === 'INSERT_COMMENT' && message.platform === 'facebook') {
        const success = insertComment(message.text);
        sendResponse({ success });
        return true;
      }

      if (message.type === 'REQUEST_POST_TEXT' && message.platform === 'facebook') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      return false;
    });
  },
});

function isPostPage(): boolean {
  // Facebook post URLs contain /posts/, /photo/, /video/, or a permalink
  return location.href.includes('/posts/') ||
         location.href.includes('/photo') ||
         location.href.includes('/video') ||
         location.href.includes('permalink') ||
         location.href.includes('/watch/') ||
         document.querySelector('[data-ad-comet-preview="message"]') !== null;
}

function getPostText(): string | null {
  // Try to find post text in different Facebook contexts

  // 1. Post detail page or modal - main post text
  const postTextSelectors = [
    '[data-ad-comet-preview="message"]',
    '[data-ad-preview="message"]',
    'div[dir="auto"][style*="text-align"]',
    '.userContent',
    '[data-testid="post_message"]'
  ];

  for (const selector of postTextSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.length > 20) {
        return text;
      }
    }
  }

  // 2. Feed post - find the focused post or first substantial post
  const feedPosts = document.querySelectorAll('[role="article"]');
  for (const post of feedPosts) {
    // Look for text content within the post
    const textContainers = post.querySelectorAll('div[dir="auto"]');
    for (const container of textContainers) {
      const text = container.textContent?.trim();
      // Filter out short texts (likely UI elements) and very long texts (likely combined content)
      if (text && text.length > 30 && text.length < 5000) {
        // Check if this looks like actual post content (not buttons or timestamps)
        const parent = container.parentElement;
        if (parent && !parent.querySelector('a[role="link"]')) {
          return text;
        }
      }
    }
  }

  // 3. Watch video page
  const watchPageText = document.querySelector('.x1cy8zhl.x78zum5 div[dir="auto"]');
  if (watchPageText) {
    const text = watchPageText.textContent?.trim();
    if (text && text.length > 20) {
      return text;
    }
  }

  // 4. Fallback - find any substantial text in the main content area
  const mainContent = document.querySelector('[role="main"]');
  if (mainContent) {
    const textElements = mainContent.querySelectorAll('div[dir="auto"], span[dir="auto"]');
    let longestText = '';

    for (const el of textElements) {
      const text = el.textContent?.trim() || '';
      if (text.length > longestText.length && text.length > 30 && text.length < 2000) {
        longestText = text;
      }
    }

    if (longestText) {
      return longestText;
    }
  }

  return null;
}

function insertComment(text: string): boolean {
  try {
    // Find the comment input field - Facebook uses contenteditable divs
    const commentBoxSelectors = [
      '[aria-label*="Write a comment"]',
      '[aria-label*="Comment"]',
      '[placeholder*="Write a comment"]',
      'div[contenteditable="true"][role="textbox"]',
      '.UFIAddCommentInput',
      'form[method="POST"] div[contenteditable="true"]'
    ];

    for (const selector of commentBoxSelectors) {
      const commentBox = document.querySelector(selector) as HTMLElement;
      if (commentBox) {
        commentBox.focus();

        // Clear existing content
        if (commentBox.getAttribute('contenteditable') === 'true') {
          commentBox.innerHTML = '';

          // Create a text node and insert
          const textNode = document.createTextNode(text);
          commentBox.appendChild(textNode);
        } else {
          (commentBox as HTMLInputElement).value = text;
        }

        // Dispatch events to notify React/Facebook's event system
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        });
        commentBox.dispatchEvent(inputEvent);

        // Also dispatch a keyboard event for good measure
        const keyEvent = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: ' ',
          code: 'Space'
        });
        commentBox.dispatchEvent(keyEvent);

        return true;
      }
    }

    // Try clicking comment button first
    const commentButtons = document.querySelectorAll('[aria-label*="Comment"], [aria-label*="comment"], [data-testid="UFI2CommentLink"]');
    for (const button of commentButtons) {
      const btn = button as HTMLElement;
      if (btn.offsetParent !== null) { // Check if visible
        btn.click();

        setTimeout(() => {
          // Try to find and fill the comment box again
          for (const selector of commentBoxSelectors) {
            const newCommentBox = document.querySelector(selector) as HTMLElement;
            if (newCommentBox) {
              newCommentBox.focus();
              if (newCommentBox.getAttribute('contenteditable') === 'true') {
                newCommentBox.textContent = text;
              } else {
                (newCommentBox as HTMLInputElement).value = text;
              }

              const inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
              });
              newCommentBox.dispatchEvent(inputEvent);
              break;
            }
          }
        }, 500);

        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Social Commenter: Failed to insert comment on Facebook', error);
    return false;
  }
}

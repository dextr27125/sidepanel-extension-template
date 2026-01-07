export default defineContentScript({
  matches: ['*://www.linkedin.com/*', '*://linkedin.com/*', '*://*.linkedin.com/*'],
  main() {
    console.log('🔵 Social Commenter: LinkedIn content script loaded on:', location.href);

    let lastUrl = location.href;
    let lastPostText: string | null = null;

    // Send post text to sidepanel
    const sendPostUpdate = (text: string | null) => {
      console.log('🔵 LinkedIn sendPostUpdate called, text length:', text?.length ?? 0, 'lastPostText length:', lastPostText?.length ?? 0);
      if (text !== lastPostText) {
        lastPostText = text;
        console.log('🔵 LinkedIn sending POST_TEXT_UPDATE, text preview:', text?.substring(0, 100));
        browser.runtime.sendMessage({
          type: 'POST_TEXT_UPDATE',
          text,
          platform: 'linkedin'
        }).catch((err) => {
          console.log('🔵 LinkedIn message send failed (sidepanel closed?):', err);
        });
      }
    };

    // Check for post and send update
    const checkAndSendPost = () => {
      console.log('🔵 LinkedIn checkAndSendPost called, isPostPage:', isPostPage());
      const postText = getPostText();
      console.log('🔵 LinkedIn getPostText result:', postText ? `"${postText.substring(0, 80)}..."` : null);
      sendPostUpdate(postText);
    };

    // Watch for URL changes (LinkedIn uses SPA navigation)
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
      if (message.type === 'GET_POST_TEXT' && message.platform === 'linkedin') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      if (message.type === 'INSERT_COMMENT' && message.platform === 'linkedin') {
        const success = insertComment(message.text);
        sendResponse({ success });
        return true;
      }

      if (message.type === 'REQUEST_POST_TEXT' && message.platform === 'linkedin') {
        const postText = getPostText();
        sendResponse({ success: true, text: postText });
        return true;
      }

      return false;
    });
  },
});

function isPostPage(): boolean {
  // LinkedIn - check if there's any post content visible
  return location.href.includes('/feed/') ||
         location.href.includes('/posts/') ||
         location.href.includes('/pulse/') ||
         document.querySelector('.update-components-text') !== null ||
         document.querySelector('.fie-impression-container') !== null ||
         document.querySelector('[data-test-id="main-feed-activity-card__commentary"]') !== null;
}

function getPostText(): string | null {
  // First, try to find the most visible/active post in the viewport
  const activePost = findActivePost();
  console.log('🔵 LinkedIn findActivePost result:', activePost?.className ?? null);
  if (activePost) {
    const text = extractTextFromPost(activePost);
    console.log('🔵 LinkedIn extractTextFromPost result:', text ? `found ${text.length} chars` : null);
    if (text) return text;
  }

  // Fallback: try various selectors across the page
  console.log('🔵 LinkedIn trying fallback...');
  return findPostTextFallback();
}

function findActivePost(): Element | null {
  // Post container selectors (various LinkedIn layouts)
  const postSelectors = [
    '.feed-shared-update-v2',
    '.occludable-update',
    '[data-urn*="activity"]',
    '.fie-impression-container',
    'article.main-feed-activity-card',
    '[data-id*="urn:li:activity"]'
  ];

  console.log('🔵 LinkedIn findActivePost searching...');
  for (const selector of postSelectors) {
    const posts = document.querySelectorAll(selector);
    if (posts.length === 0) continue;
    console.log(`🔵 LinkedIn found ${posts.length} posts with selector: ${selector}`);

    // If only one post, return it
    if (posts.length === 1) {
      return posts[0];
    }

    // Find the post most visible in the viewport (center of screen)
    const viewportCenter = window.innerHeight / 2;
    let bestPost: Element | null = null;
    let bestDistance = Infinity;

    posts.forEach(post => {
      const rect = post.getBoundingClientRect();
      // Check if post is visible in viewport
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const postCenter = rect.top + rect.height / 2;
        const distance = Math.abs(postCenter - viewportCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPost = post;
        }
      }
    });

    if (bestPost) return bestPost;
  }

  console.log('🔵 LinkedIn findActivePost: no posts found with any selector');
  return null;
}

function extractTextFromPost(postElement: Element): string | null {
  // Selectors for text content within a post (ordered by reliability)
  const textSelectors = [
    // New LinkedIn UI (2024-2025)
    '.break-words.tvm-parent-container > span[dir="ltr"]',
    '.break-words.tvm-parent-container',
    'span.break-words > span[dir="ltr"]',
    // Standard selectors
    '.update-components-text span[dir="ltr"]',
    '.update-components-text',
    '.feed-shared-text span[dir="ltr"]',
    '.feed-shared-text',
    // Inline expanded text
    '.feed-shared-inline-show-more-text span[dir="ltr"]',
    '.feed-shared-inline-show-more-text',
    // Public page selectors
    '[data-test-id="main-feed-activity-card__commentary"]',
    '.attributed-text-segment-list__content',
    'p[dir="ltr"]'
  ];

  for (const selector of textSelectors) {
    const textEl = postElement.querySelector(selector) as HTMLElement | null;
    if (textEl) {
      console.log(`🔵 LinkedIn extractTextFromPost: found element with selector "${selector}"`);
      // Use innerText instead of textContent to preserve <br> as newlines
      const rawText = textEl.innerText;
      console.log(`🔵 LinkedIn extractTextFromPost: raw innerText length: ${rawText?.length ?? 0}`);
      const text = cleanLinkedInText(rawText);
      console.log(`🔵 LinkedIn extractTextFromPost: cleaned text length: ${text?.length ?? 0}`);
      if (text) return text;
    }
  }

  console.log('🔵 LinkedIn extractTextFromPost: no text found with any selector');
  return null;
}

function findPostTextFallback(): string | null {
  // Direct selectors for post text across the page
  const selectors = [
    // New LinkedIn layout (2024-2025) - tvm-parent-container
    '.break-words.tvm-parent-container > span[dir="ltr"]',
    'span.break-words.tvm-parent-container > span[dir="ltr"]',
    '.tvm-parent-container span[dir="ltr"]',
    // Standard update components
    '.update-components-text.update-components-update-v2__commentary span[dir="ltr"]',
    '.update-components-text span[dir="ltr"]',
    '.update-components-text',
    // Feed shared text
    '.feed-shared-inline-show-more-text span[dir="ltr"]',
    '.feed-shared-text span[dir="ltr"]',
    // Public page
    '[data-test-id="main-feed-activity-card__commentary"]',
    '.attributed-text-segment-list__content',
    // Article pages
    'article.main-feed-activity-card p[dir="ltr"]'
  ];

  console.log('🔵 LinkedIn findPostTextFallback: trying direct selectors...');
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`🔵 LinkedIn findPostTextFallback: found ${elements.length} elements with "${selector}"`);
    }
    // Find first element with substantial text
    for (const el of elements) {
      // Use innerText to preserve <br> as newlines
      const rawText = (el as HTMLElement).innerText;
      const text = cleanLinkedInText(rawText);
      if (text) {
        console.log(`🔵 LinkedIn findPostTextFallback: SUCCESS with "${selector}", text: "${text.substring(0, 50)}..."`);
        return text;
      }
    }
  }

  console.log('🔵 LinkedIn findPostTextFallback: no text found');
  return null;
}

function cleanLinkedInText(text: string | null | undefined): string | null {
  if (!text) return null;

  // Clean up the text while preserving meaningful line breaks
  let cleaned = text
    .replace(/[ \t]+/g, ' ')           // Multiple spaces/tabs to single space (but not newlines!)
    .replace(/\n[ \t]*/g, '\n')        // Remove leading spaces after newlines
    .replace(/[ \t]*\n/g, '\n')        // Remove trailing spaces before newlines
    .replace(/\n{3,}/g, '\n\n')        // Max 2 consecutive newlines
    .trim();

  // Remove "hashtag" prefix that LinkedIn adds for accessibility
  cleaned = cleaned.replace(/hashtag\s*#/g, '#');

  return cleaned.length > 20 ? cleaned : null;
}

function insertComment(text: string): boolean {
  try {
    // Find the comment input field
    const commentBox = document.querySelector('.comments-comment-box__form-container .ql-editor') as HTMLElement;

    if (commentBox) {
      commentBox.focus();
      commentBox.innerHTML = `<p>${text}</p>`;

      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      });
      commentBox.dispatchEvent(inputEvent);

      return true;
    }

    // Try alternative: comment button first
    const commentButton = document.querySelector('[aria-label*="Comment"], [aria-label*="comment"], button.comment-button') as HTMLElement;
    if (commentButton) {
      commentButton.click();

      setTimeout(() => {
        const newCommentBox = document.querySelector('.comments-comment-box__form-container .ql-editor, .comments-comment-texteditor .ql-editor') as HTMLElement;
        if (newCommentBox) {
          newCommentBox.focus();
          newCommentBox.innerHTML = `<p>${text}</p>`;

          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
          });
          newCommentBox.dispatchEvent(inputEvent);
        }
      }, 500);

      return true;
    }

    // Alternative selector for newer LinkedIn UI
    const modernCommentBox = document.querySelector('[data-placeholder="Add a comment…"], [contenteditable="true"].editor-content') as HTMLElement;
    if (modernCommentBox) {
      modernCommentBox.focus();
      modernCommentBox.textContent = text;

      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
      });
      modernCommentBox.dispatchEvent(inputEvent);

      return true;
    }

    return false;
  } catch (error) {
    console.error('Social Commenter: Failed to insert comment on LinkedIn', error);
    return false;
  }
}

import { storage } from '#imports'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generateComments } from '@/lib/gemini'
import { DEFAULT_PROMPT, getPlatformFromUrl, PLATFORMS, type Platform } from '@/lib/types'
import {
  Check,
  Copy,
  Facebook,
  Key,
  Linkedin,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Twitter
} from 'lucide-react'
import { useEffect, useState } from 'react'

const apiKeyStorage = storage.defineItem<string>('local:geminiApiKey', {
  fallback: ''
})

const customPromptStorage = storage.defineItem<string>('local:customPrompt', {
  fallback: ''
})

const activePlatformStorage = storage.defineItem<Platform>('local:activePlatform', {
  fallback: 'twitter'
})

const PlatformIcon = ({ platform, className }: { platform: Platform; className?: string }) => {
  switch (platform) {
    case 'twitter':
      return <Twitter className={className} />
    case 'linkedin':
      return <Linkedin className={className} />
    case 'facebook':
      return <Facebook className={className} />
  }
}

const platformColors: Record<Platform, { bg: string; hover: string; ring: string }> = {
  twitter: { bg: 'bg-sky-500', hover: 'hover:bg-sky-600', ring: 'ring-sky-500' },
  linkedin: { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', ring: 'ring-blue-600' },
  facebook: { bg: 'bg-indigo-600', hover: 'hover:bg-indigo-700', ring: 'ring-indigo-600' }
}

function App() {
  const [apiKey, setApiKey] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [postText, setPostText] = useState<string | null>(null)
  const [comments, setComments] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedComment, setSelectedComment] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState('generate')
  const [insertStatus, setInsertStatus] = useState<string | null>(null)
  const [activePlatform, setActivePlatform] = useState<Platform>('twitter')

  useEffect(() => {
    // Load saved settings
    Promise.all([
      apiKeyStorage.getValue(),
      customPromptStorage.getValue(),
      activePlatformStorage.getValue()
    ]).then(([key, prompt, platform]) => {
      setApiKey(key)
      setCustomPrompt(prompt)
      setActivePlatform(platform)
    })

    // Listen for post updates from content scripts
    const handleMessage = (message: { type: string; text: string | null; platform?: Platform }) => {
      if (message.type === 'POST_TEXT_UPDATE' || message.type === 'TWEET_TEXT_UPDATE') {
        // Auto-switch platform based on incoming message
        if (message.platform) {
          setActivePlatform(message.platform)
          activePlatformStorage.setValue(message.platform)
        }
        setPostText(message.text)
        setError(null)
      }
    }
    browser.runtime.onMessage.addListener(handleMessage)

    // Request current post when sidepanel opens
    requestCurrentPost()

    return () => browser.runtime.onMessage.removeListener(handleMessage)
  }, [])

  // Re-request post when platform changes
  useEffect(() => {
    requestCurrentPost()
  }, [activePlatform])

  const requestCurrentPost = async () => {
    try {
      // Try multiple methods to get the active tab
      let tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0]
      if (!tab?.id) {
        tab = (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]
      }
      if (!tab?.id) {
        tab = (await browser.tabs.query({ active: true }))[0]
      }
      if (!tab?.id || !tab?.url) return

      const detectedPlatform = getPlatformFromUrl(tab.url)
      if (detectedPlatform) {
        setActivePlatform(detectedPlatform)
        await activePlatformStorage.setValue(detectedPlatform)
      }

      // Try new message format first
      try {
        const response = await browser.tabs.sendMessage(tab.id, {
          type: 'REQUEST_POST_TEXT',
          platform: detectedPlatform || activePlatform
        })
        if (response?.success && response.text) {
          setPostText(response.text)
          return
        }
      } catch {
        // Try legacy format for Twitter
      }

      // Legacy format for Twitter
      if (tab.url?.includes('twitter.com') || tab.url?.includes('x.com')) {
        try {
          const response = await browser.tabs.sendMessage(tab.id, { type: 'REQUEST_TWEET_TEXT' })
          if (response?.success && response.text) {
            setPostText(response.text)
          }
        } catch {
          // Content script might not be loaded yet
        }
      }
    } catch {
      // Tab might not be accessible
    }
  }

  const handleApiKeyChange = async (value: string) => {
    setApiKey(value)
    await apiKeyStorage.setValue(value)
  }

  const handleCustomPromptChange = async (value: string) => {
    setCustomPrompt(value)
    await customPromptStorage.setValue(value)
  }

  const resetCustomPrompt = async () => {
    setCustomPrompt('')
    await customPromptStorage.setValue('')
  }

  const handlePlatformChange = async (platform: Platform) => {
    setActivePlatform(platform)
    await activePlatformStorage.setValue(platform)
    setPostText(null)
    setComments([])
    setError(null)
  }

  const fetchPostText = async () => {
    setError(null)
    setPostText(null)
    try {
      // Try multiple methods to get the active tab
      let tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0]
      if (!tab?.id) {
        // Fallback: get active tab from last focused window
        tab = (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]
      }
      if (!tab?.id) {
        // Final fallback: get any active tab
        tab = (await browser.tabs.query({ active: true }))[0]
      }
      if (!tab?.id || !tab?.url) {
        setError('No active tab found. Try clicking on the page first.')
        return
      }

      // Auto-detect and switch platform based on current URL
      const detectedPlatform = getPlatformFromUrl(tab.url)
      if (detectedPlatform && detectedPlatform !== activePlatform) {
        setActivePlatform(detectedPlatform)
        await activePlatformStorage.setValue(detectedPlatform)
      }

      const platformToUse = detectedPlatform || activePlatform
      const config = PLATFORMS[platformToUse]
      const isCorrectSite = config.urlPatterns.some(pattern => tab.url?.includes(pattern))

      if (!isCorrectSite) {
        setError('Please navigate to Twitter/X, LinkedIn, or Facebook')
        return
      }

      // Try new message format
      try {
        const response = await browser.tabs.sendMessage(tab.id, {
          type: 'GET_POST_TEXT',
          platform: platformToUse
        })
        if (response?.success && response.text) {
          setPostText(response.text)
          return
        }
      } catch {
        // Try legacy format
      }

      // Legacy format for Twitter
      if (platformToUse === 'twitter') {
        const response = await browser.tabs.sendMessage(tab.id, { type: 'GET_TWEET_TEXT' })
        if (response?.success && response.text) {
          setPostText(response.text)
          return
        }
      }

      setError('Could not find post text. Make sure you are on a post page.')
    } catch (err) {
      setError(`Failed to get post. Please refresh the page and try again.`)
      console.error(err)
    }
  }

  const handleGenerate = async () => {
    if (!apiKey) {
      setError('Please set your Gemini API key in Settings')
      setActiveTab('settings')
      return
    }
    if (!postText) {
      await fetchPostText()
      if (!postText) return
    }
    setLoading(true)
    setError(null)
    setComments([])
    setSelectedComment(null)
    try {
      const generatedComments = await generateComments(
        apiKey,
        postText!,
        activePlatform,
        customPrompt || undefined
      )
      setComments(generatedComments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate comments')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (index: number) => {
    await navigator.clipboard.writeText(comments[index])
    setCopied(index)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleInsert = async (index: number) => {
    setInsertStatus(null)
    try {
      let tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0]
      if (!tab?.id) {
        tab = (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]
      }
      if (!tab?.id) {
        tab = (await browser.tabs.query({ active: true }))[0]
      }
      if (!tab?.id) {
        setError('No active tab found')
        return
      }
      const response = await browser.tabs.sendMessage(tab.id, {
        type: 'INSERT_COMMENT',
        text: comments[index],
        platform: activePlatform
      })
      if (response?.success) {
        setInsertStatus('Comment inserted!')
        setSelectedComment(index)
        setTimeout(() => setInsertStatus(null), 3000)
      } else {
        setError('Could not insert comment. Make sure the reply/comment box is visible.')
      }
    } catch (err) {
      setError(`Failed to insert comment. Please refresh the ${PLATFORMS[activePlatform].name} page.`)
      console.error(err)
    }
  }

  const colors = platformColors[activePlatform]

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
            <PlatformIcon platform={activePlatform} className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-lg">Social Commenter!</h1>
            <p className="text-sm text-muted-foreground">AI-powered replies</p>
          </div>
        </div>

        {/* Platform Switcher */}
        <div className="flex gap-1 mt-3 p-1 bg-muted rounded-lg">
          {(Object.keys(PLATFORMS) as Platform[]).map((platform) => (
            <button
              key={platform}
              onClick={() => handlePlatformChange(platform)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                activePlatform === platform
                  ? `${platformColors[platform].bg} text-white`
                  : 'text-muted-foreground hover:text-foreground hover:bg-background'
              }`}
            >
              <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
              {platform === 'twitter' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col gap-0">
          <TabsList className="h-auto rounded-none border-b bg-transparent p-0 w-full">
            <TabsTrigger
              value="generate"
              className={`data-[state=active]:after:${colors.bg} relative rounded-none py-2 px-4 flex items-center gap-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1`}
              style={{ ['--tw-after-bg' as string]: activePlatform === 'twitter' ? '#0ea5e9' : activePlatform === 'linkedin' ? '#2563eb' : '#4f46e5' }}
            >
              <MessageSquare className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className={`data-[state=active]:after:${colors.bg} relative rounded-none py-2 px-4 flex items-center gap-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                {postText && (
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs font-medium uppercase tracking-wide">
                        {PLATFORMS[activePlatform].name} Post
                      </CardDescription>
                      <CardTitle className="text-sm font-normal leading-relaxed">"{postText}"</CardTitle>
                    </CardHeader>
                  </Card>
                )}
                {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
                {insertStatus && (
                  <div className="p-3 rounded-lg bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {insertStatus}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={fetchPostText} variant="outline" size="icon" className="shrink-0" title="Refresh post">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !postText}
                    className={`flex-1 ${colors.bg} ${colors.hover}`}
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                    ) : (
                      <><MessageSquare className="h-4 w-4 mr-2" />Generate Comments</>
                    )}
                  </Button>
                </div>
                <Separator />
                {comments.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Choose a comment:</Label>
                    {comments.map((comment, index) => (
                      <Card
                        key={index}
                        className={`cursor-pointer transition-all ${
                          selectedComment === index
                            ? `ring-2 ${colors.ring} bg-opacity-5`
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedComment(index)}
                      >
                        <CardHeader className="pb-2 pt-3">
                          <CardDescription className="text-xs font-medium">Option {index + 1}</CardDescription>
                          <CardTitle className="text-sm font-normal leading-relaxed">{comment}</CardTitle>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); handleCopy(index) }}
                              className="h-8"
                            >
                              {copied === index ? (<><Check className="h-3 w-3 mr-1" />Copied</>) : (<><Copy className="h-3 w-3 mr-1" />Copy</>)}
                            </Button>
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleInsert(index) }}
                              className={`h-8 ${colors.bg} ${colors.hover}`}
                            >
                              <Send className="h-3 w-3 mr-1" />Insert
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
                {!postText && !error && comments.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <PlatformIcon platform={activePlatform} className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm">
                      Navigate to a post on {PLATFORMS[activePlatform].name}
                      <br />and it will be detected automatically
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-4">
                {/* API Key Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      Gemini API Key
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Required for generating comments</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey" className="text-sm">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter your Gemini API key..."
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Get your API key from{' '}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-500 hover:underline"
                      >
                        Google AI Studio
                      </a>
                    </p>
                  </div>
                  {apiKey && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Check className="h-4 w-4" />
                      API key saved
                    </div>
                  )}
                </div>

                <Separator />

                {/* Custom Prompt Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Custom Prompt
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Customize how comments are generated
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customPrompt" className="text-sm">Prompt Template</Label>
                    <textarea
                      id="customPrompt"
                      placeholder={DEFAULT_PROMPT}
                      value={customPrompt}
                      onChange={(e) => handleCustomPromptChange(e.target.value)}
                      className="w-full min-h-[150px] p-3 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Use <code className="bg-muted px-1 py-0.5 rounded">{'{{postText}}'}</code> for post content
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetCustomPrompt}
                        className="h-7 text-xs"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    </div>
                  </div>
                  {customPrompt && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Check className="h-4 w-4" />
                      Custom prompt saved
                    </div>
                  )}
                </div>

                <Separator />

                {/* How to use */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">How to use</h3>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Enter your Gemini API key above</li>
                    <li>Select platform (Twitter/X, LinkedIn, or Facebook)</li>
                    <li>Navigate to any post on that platform</li>
                    <li>Post text is detected automatically</li>
                    <li>Click "Generate Comments" to get AI suggestions</li>
                    <li>Click "Insert" on your preferred comment</li>
                  </ol>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default App

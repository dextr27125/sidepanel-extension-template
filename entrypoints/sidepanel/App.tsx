import { storage } from '#imports'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generateComments } from '@/lib/gemini'
import {
  Check,
  Copy,
  Key,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  Twitter
} from 'lucide-react'
import { useEffect, useState } from 'react'

const apiKeyStorage = storage.defineItem<string>('local:geminiApiKey', {
  fallback: ''
})

function App() {
  const [apiKey, setApiKey] = useState('')
  const [tweetText, setTweetText] = useState<string | null>(null)
  const [comments, setComments] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedComment, setSelectedComment] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState('generate')
  const [insertStatus, setInsertStatus] = useState<string | null>(null)

  useEffect(() => {
    apiKeyStorage.getValue().then(setApiKey)

    // Listen for tweet updates from content script
    const handleMessage = (message: { type: string; text: string | null }) => {
      if (message.type === 'TWEET_TEXT_UPDATE') {
        setTweetText(message.text)
        setError(null)
      }
    }
    browser.runtime.onMessage.addListener(handleMessage)

    // Request current tweet when sidepanel opens
    const requestCurrentTweet = async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
        if (tab?.id && (tab.url?.includes('twitter.com') || tab.url?.includes('x.com'))) {
          const response = await browser.tabs.sendMessage(tab.id, { type: 'REQUEST_TWEET_TEXT' })
          if (response?.success && response.text) {
            setTweetText(response.text)
          }
        }
      } catch {
        // Content script might not be loaded yet
      }
    }
    requestCurrentTweet()

    return () => browser.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const handleApiKeyChange = async (value: string) => {
    setApiKey(value)
    await apiKeyStorage.setValue(value)
  }

  const fetchTweetText = async () => {
    setError(null)
    setTweetText(null)
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) {
        setError('No active tab found')
        return
      }
      if (!tab.url?.includes('twitter.com') && !tab.url?.includes('x.com')) {
        setError('Please navigate to a Twitter/X tweet page')
        return
      }
      const response = await browser.tabs.sendMessage(tab.id, { type: 'GET_TWEET_TEXT' })
      if (response?.success && response.text) {
        setTweetText(response.text)
      } else {
        setError('Could not find tweet text. Make sure you are on a tweet page.')
      }
    } catch (err) {
      setError('Failed to get tweet. Please refresh the Twitter page and try again.')
      console.error(err)
    }
  }

  const handleGenerate = async () => {
    if (!apiKey) {
      setError('Please set your Gemini API key in Settings')
      setActiveTab('settings')
      return
    }
    if (!tweetText) {
      await fetchTweetText()
      if (!tweetText) return
    }
    setLoading(true)
    setError(null)
    setComments([])
    setSelectedComment(null)
    try {
      const generatedComments = await generateComments(apiKey, tweetText!)
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
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) {
        setError('No active tab found')
        return
      }
      const response = await browser.tabs.sendMessage(tab.id, {
        type: 'INSERT_COMMENT',
        text: comments[index]
      })
      if (response?.success) {
        setInsertStatus('Comment inserted!')
        setSelectedComment(index)
        setTimeout(() => setInsertStatus(null), 3000)
      } else {
        setError('Could not insert comment. Make sure the reply box is visible.')
      }
    } catch (err) {
      setError('Failed to insert comment. Please refresh the Twitter page.')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-500 flex items-center justify-center">
            <Twitter className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">Twitter Commenter</h1>
            <p className="text-sm text-muted-foreground">AI-powered replies</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col gap-0">
          <TabsList className="h-auto rounded-none border-b bg-transparent p-0 w-full">
            <TabsTrigger value="generate" className="data-[state=active]:after:bg-sky-500 relative rounded-none py-2 px-4 flex items-center gap-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1">
              <MessageSquare className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:after:bg-sky-500 relative rounded-none py-2 px-4 flex items-center gap-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>
          <TabsContent value="generate" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                {tweetText && (
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs font-medium uppercase tracking-wide">Tweet Content</CardDescription>
                      <CardTitle className="text-sm font-normal leading-relaxed">"{tweetText}"</CardTitle>
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
                  <Button onClick={fetchTweetText} variant="outline" size="icon" className="shrink-0" title="Refresh tweet">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button onClick={handleGenerate} disabled={loading || !tweetText} className="flex-1 bg-sky-500 hover:bg-sky-600">
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
                      <Card key={index} className={`cursor-pointer transition-all ${selectedComment === index ? 'ring-2 ring-sky-500 bg-sky-500/5' : 'hover:bg-muted/50'}`} onClick={() => setSelectedComment(index)}>
                        <CardHeader className="pb-2 pt-3">
                          <CardDescription className="text-xs font-medium">Option {index + 1}</CardDescription>
                          <CardTitle className="text-sm font-normal leading-relaxed">{comment}</CardTitle>
                          <div className="flex gap-2 pt-2">
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleCopy(index) }} className="h-8">
                              {copied === index ? (<><Check className="h-3 w-3 mr-1" />Copied</>) : (<><Copy className="h-3 w-3 mr-1" />Copy</>)}
                            </Button>
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleInsert(index) }} className="h-8 bg-sky-500 hover:bg-sky-600">
                              <Send className="h-3 w-3 mr-1" />Insert
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
                {!tweetText && !error && comments.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Twitter className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm">Navigate to a tweet on Twitter/X<br />and it will be detected automatically</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="settings" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Key className="h-5 w-5" />Gemini API Key</h3>
                    <p className="text-xs text-muted-foreground mt-1">Required for generating comments</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey" className="text-sm">API Key</Label>
                    <Input id="apiKey" type="password" placeholder="Enter your Gemini API key..." value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} className="font-mono text-sm" />
                    <p className="text-xs text-muted-foreground">Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">Google AI Studio</a></p>
                  </div>
                  {apiKey && (<div className="flex items-center gap-2 text-sm text-green-600"><Check className="h-4 w-4" />API key saved</div>)}
                </div>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">How to use</h3>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Enter your Gemini API key above</li>
                    <li>Navigate to any tweet on Twitter/X</li>
                    <li>Tweet text is detected automatically</li>
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

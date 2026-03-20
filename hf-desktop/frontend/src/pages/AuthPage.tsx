import React, { useState } from 'react'
import { Key, ExternalLink, CheckCircle } from 'lucide-react'
import { setToken } from '@/api/client'
import { useStore } from '@/store'
import { Button, Input } from '@/components/ui'

export const AuthGate: React.FC<{ onAuth: () => void }> = ({ onAuth }) => {
  const [token, setTokenInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setUser = useStore(s => s.setUser)

  const handleSubmit = async () => {
    if (!token.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await setToken(token.trim())
      setUser({ authenticated: true, username: res.username, email: res.email })
      onAuth()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Invalid token')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
      <div className="w-14 h-14 bg-hf-500/15 rounded-2xl flex items-center justify-center text-3xl">
        🤗
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-white mb-1">Connect to Hugging Face</h1>
        <p className="text-sm text-gray-500 max-w-xs">
          Enter your HF access token to browse, download, and upload models and datasets.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Input
          icon={<Key size={13} />}
          type="password"
          placeholder="hf_••••••••••••••••••••"
          value={token}
          onChange={e => setTokenInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <Button
          variant="primary"
          className="w-full justify-center"
          onClick={handleSubmit}
          loading={loading}
          disabled={!token.trim()}
        >
          <CheckCircle size={13} /> Connect
        </Button>
        <button
          className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center justify-center gap-1"
          onClick={() => window.open('https://huggingface.co/settings/tokens', '_blank')}
        >
          <ExternalLink size={10} /> Get your token at huggingface.co/settings/tokens
        </button>
      </div>

      <div className="text-center">
        <button
          className="text-xs text-gray-700 hover:text-gray-500 transition-colors"
          onClick={onAuth}
        >
          Continue without token (read-only)
        </button>
      </div>
    </div>
  )
}

/**
 * PinGate — Simple PIN authentication gate
 * Stores authenticated state in sessionStorage per brand.
 */
import { useState, useRef, useEffect } from 'react'

interface PinGateProps {
  pin: string
  brand: string
  children: React.ReactNode
}

export function PinGate({ pin, brand, children }: PinGateProps) {
  const storageKey = `pin-auth-global`
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(storageKey) === 'true')
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!authed) inputRefs.current[0]?.focus()
  }, [authed])

  if (authed) return <>{children}</>

  const handleChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...digits]
    next[idx] = val
    setDigits(next)
    setError(false)

    if (val && idx < 5) {
      inputRefs.current[idx + 1]?.focus()
    }

    // Auto-submit when all 6 digits entered
    if (val && idx === 5) {
      const entered = next.join('')
      if (entered === pin) {
        sessionStorage.setItem(storageKey, 'true')
        setAuthed(true)
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => { setShake(false); setDigits(['', '', '', '', '', '']); inputRefs.current[0]?.focus() }, 500)
      }
    }
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      const next = pasted.split('')
      setDigits(next)
      if (pasted === pin) {
        sessionStorage.setItem(storageKey, 'true')
        setAuthed(true)
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => { setShake(false); setDigits(['', '', '', '', '', '']); inputRefs.current[0]?.focus() }, 500)
      }
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0e12',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        animation: shake ? 'pinShake 0.4s ease-in-out' : undefined,
      }}>
        {/* Brand icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, hsl(255 75% 60%), hsl(175 65% 45%))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: '#fff',
          boxShadow: '0 8px 32px rgba(129,140,248,0.25)',
        }}>
          {brand.charAt(0)}
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            {brand} Dashboard
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
            Enter 6-digit PIN to continue
          </div>
        </div>

        {/* PIN inputs */}
        <div style={{ display: 'flex', gap: 10 }} onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={{
                width: 48, height: 56,
                background: error ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.06)',
                border: `2px solid ${error ? 'rgba(248,113,113,0.4)' : d ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 10,
                color: '#fff',
                fontSize: 22,
                fontWeight: 700,
                textAlign: 'center',
                outline: 'none',
                transition: 'all 0.15s',
                caretColor: '#818cf8',
              }}
              onFocus={e => { e.target.style.borderColor = error ? 'rgba(248,113,113,0.6)' : 'rgba(129,140,248,0.6)'; e.target.style.boxShadow = `0 0 0 3px ${error ? 'rgba(248,113,113,0.1)' : 'rgba(129,140,248,0.1)'}` }}
              onBlur={e => { e.target.style.borderColor = error ? 'rgba(248,113,113,0.4)' : d ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', letterSpacing: '0.03em' }}>
            Incorrect PIN. Try again.
          </div>
        )}
      </div>

      <style>{`
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-12px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}

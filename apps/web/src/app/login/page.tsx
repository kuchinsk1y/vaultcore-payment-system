'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Hexagon, AlertTriangle, ArrowRight } from 'lucide-react';
import { loginUser, ApiException } from '@/lib/api';
import { useTypewriter } from '@/hooks/useTypewriter';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const emailPlaceholder = useTypewriter([
    'client@vaultcore.com',
    'Enter your secure email...',
    'Authenticate your identity...'
  ], 60, 30, 2500);

  const passwordPlaceholder = useTypewriter([
    '••••••••',
    'Enter your vault password...',
    'Secure verification required...'
  ], 60, 30, 2500);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await loginUser({ email, password, ...(totpRequired ? { totp_code: totpCode } : {}) });
      if (typeof window !== 'undefined') {
        localStorage.setItem('vaultcore_user_name', response.user.full_name);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiException && err.code === 'MFA_REQUIRED') {
        // Password was correct: ask for the authenticator code
        setTotpRequired(true);
      } else if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center font-sans p-4 relative overflow-hidden bg-[#0A0A0B]">
      
      {/* Subtle Ambient Glow */}
      <div className="absolute top-0 right-1/4 w-[800px] h-[800px] bg-gradient-to-bl from-[#C5A059]/[0.03] to-transparent rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10 flex flex-col">
        
        {/* Branding Header */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-12 h-12 flex items-center justify-center mb-6">
            <Hexagon className="w-10 h-10 text-[#C5A059] stroke-[1]" />
          </div>
          <h1 className="text-3xl font-serif text-white tracking-widest uppercase mb-3">VaultCore</h1>
          <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase">Private Wealth Access</p>
        </div>

        {/* Login Surface */}
        <div className="bg-[#121214] border border-white/[0.06] shadow-2xl rounded-xl p-8 sm:p-10">
          
          {error && (
            <div className="mb-8 p-4 bg-red-950/20 border border-red-900/30 rounded-lg flex items-start gap-3 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="tracking-wide">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => emailPlaceholder.setIsPaused(true)}
                onBlur={() => emailPlaceholder.setIsPaused(false)}
                className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                placeholder={emailPlaceholder.text}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Password</label>
                <Link href="/forgot-password" className="text-[10px] tracking-widest uppercase text-zinc-500 hover:text-[#C5A059] transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => passwordPlaceholder.setIsPaused(true)}
                onBlur={() => passwordPlaceholder.setIsPaused(false)}
                className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none tabular-nums"
                placeholder={passwordPlaceholder.text}
                required
              />
            </div>

            {totpRequired && (
              <div className="space-y-2">
                <label htmlFor="totp" className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">
                  Authenticator Code
                </label>
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm tracking-[0.5em] text-center transition-all duration-300 outline-none tabular-nums"
                  placeholder="000000"
                  required
                />
                <p className="text-[10px] text-zinc-600">Open your authenticator app and enter the 6-digit code.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email || !password || (totpRequired && totpCode.length !== 6)}
              className="w-full py-4 mt-4 flex justify-center items-center gap-2 uppercase tracking-widest text-[10px] bg-[#1C1C1E] text-white border border-[#C5A059]/30 hover:bg-[#252528] hover:border-[#C5A059]/60 shadow-lg shadow-black/40 font-medium rounded-lg transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
              {!isLoading && <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

        </div>

        <p className="text-center text-[11px] uppercase tracking-widest text-zinc-600 mt-10">
          New to VaultCore?{' '}
          <button 
            onClick={() => router.push('/register')} 
            className="text-[#C5A059] hover:text-[#E5C048] font-medium transition-colors ml-1 border-b border-transparent hover:border-[#E5C048]"
          >
            Apply for Access
          </button>
        </p>

      </div>
    </div>
  );
}

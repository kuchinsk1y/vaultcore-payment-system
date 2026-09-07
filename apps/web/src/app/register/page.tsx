'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Hexagon } from 'lucide-react';
import { registerUser, setToken, ApiException } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await registerUser({ full_name: fullName, email, password });
      setToken(response.token);
      router.push('/');
    } catch (err: any) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during registration.');
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
          <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase">Apply for Account Access</p>
        </div>

        {/* Register Surface */}
        <div className="bg-[#121214] border border-white/[0.06] shadow-2xl rounded-xl p-8 sm:p-10">
          
          {error && (
            <div className="mb-8 p-4 bg-red-950/20 border border-red-900/30 rounded-lg flex items-start gap-3 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="tracking-wide">{error}</p>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Legal Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                placeholder="John Doe"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                placeholder="client@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Secure Password</label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full bg-transparent border ${password.length > 0 && password.length < 8 ? 'border-red-900/50 focus:border-red-500/50' : 'border-white/[0.08] focus:border-[#C5A059]/40'} text-white placeholder-zinc-700 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none tabular-nums`}
                placeholder="••••••••"
                required
              />
              {password.length > 0 && password.length < 8 && (
                <p className="text-[10px] uppercase tracking-widest text-red-400 mt-2">Minimum 8 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password || !fullName || password.length < 8}
              className="w-full py-4 mt-4 flex justify-center items-center gap-2 uppercase tracking-widest text-[10px] bg-[#1C1C1E] text-white border border-[#C5A059]/30 hover:bg-[#252528] hover:border-[#C5A059]/60 shadow-lg shadow-black/40 font-medium rounded-lg transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? 'Processing...' : 'Create Account'}
              {!isLoading && <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

        </div>

        <p className="text-center text-[11px] uppercase tracking-widest text-zinc-600 mt-10">
          Already a Client?{' '}
          <button 
            onClick={() => router.push('/login')} 
            className="text-[#C5A059] hover:text-[#E5C048] font-medium transition-colors ml-1 border-b border-transparent hover:border-[#E5C048]"
          >
            Sign in
          </button>
        </p>

      </div>
    </div>
  );
}

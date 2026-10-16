'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Hexagon } from 'lucide-react';
import { registerUser, ApiException } from '@/lib/api';
import { useTypewriter } from '@/hooks/useTypewriter';
import { PhoneInput } from '@/components/PhoneInput';

export default function RegisterPage() {
  const router = useRouter();
  
  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const emailPlaceholder = useTypewriter([
    'client@example.com',
    'Enter your secure email...',
    'Authenticate your identity...'
  ], 60, 30, 2500);

  const passwordPlaceholder = useTypewriter([
    '••••••••',
    'Enter a strong vault password...',
    'Secure your wealth...'
  ], 60, 30, 2500);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setIsLoading(false);
      return;
    }

    if (!country) {
      setError('Country of residence is required for compliance.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await registerUser({ 
        first_name: firstName, 
        last_name: lastName,
        phone_number: phoneNumber,
        email, 
        password,
        country,
        city,
        zip_code: zipCode,
        street
      });
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('vaultcore_user_name', response.user.full_name);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during registration.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = email && password.length >= 8 && firstName && lastName && phoneNumber && country;

  return (
    <div className="min-h-screen flex flex-col justify-center items-center font-sans p-4 relative overflow-y-auto bg-[#0A0A0B] py-12">
      
      {/* Subtle Ambient Glow */}
      <div className="fixed top-0 right-1/4 w-[800px] h-[800px] bg-gradient-to-bl from-[#C5A059]/[0.03] to-transparent rounded-full pointer-events-none"></div>

      <div className="w-full max-w-xl relative z-10 flex flex-col">
        
        {/* Branding Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 flex items-center justify-center mb-4">
            <Hexagon className="w-10 h-10 text-[#C5A059] stroke-[1]" />
          </div>
          <h1 className="text-3xl font-serif text-white tracking-widest uppercase mb-2">VaultCore</h1>
          <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase">Private Wealth Application</p>
        </div>

        {/* Register Surface */}
        <div className="bg-[#121214] border border-white/[0.06] shadow-2xl rounded-xl p-8 sm:p-10">
          
          {error && (
            <div className="mb-8 p-4 bg-red-950/20 border border-red-900/30 rounded-lg flex items-start gap-3 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="tracking-wide">{error}</p>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-8">
            
            {/* Section: Personal Details */}
            <div className="space-y-5">
              <div className="border-b border-white/[0.06] pb-2 mb-4">
                <h2 className="text-xs font-serif text-[#C5A059] tracking-widest uppercase">1. Personal Identity</h2>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">First Name *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Last Name *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Phone Number *</label>
                <PhoneInput value={phoneNumber} onChange={setPhoneNumber} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Email Address *</label>
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
            </div>

            {/* Section: Address Details */}
            <div className="space-y-5 pt-2">
              <div className="border-b border-white/[0.06] pb-2 mb-4">
                <h2 className="text-xs font-serif text-[#C5A059] tracking-widest uppercase">2. Residential Address</h2>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Country *</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                  placeholder="Switzerland"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                    placeholder="Geneva"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Zip / Postal Code</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                    placeholder="1204"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Street Address</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none"
                  placeholder="Rue du Rhône 10"
                />
              </div>
            </div>

            {/* Section: Security */}
            <div className="space-y-5 pt-2">
              <div className="border-b border-white/[0.06] pb-2 mb-4">
                <h2 className="text-xs font-serif text-[#C5A059] tracking-widest uppercase">3. Security</h2>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500">Secure Password *</label>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => passwordPlaceholder.setIsPaused(true)}
                  onBlur={() => passwordPlaceholder.setIsPaused(false)}
                  className={`w-full bg-transparent border ${password.length > 0 && password.length < 8 ? 'border-red-900/50 focus:border-red-500/50' : 'border-white/[0.08] focus:border-[#C5A059]/40'} text-white placeholder-zinc-700 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none tabular-nums`}
                  placeholder={passwordPlaceholder.text}
                  required
                />
                {password.length > 0 && password.length < 8 && (
                  <p className="text-[10px] uppercase tracking-widest text-red-400 mt-2">Minimum 8 characters</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="w-full py-4 mt-6 flex justify-center items-center gap-2 uppercase tracking-widest text-[10px] bg-[#1C1C1E] text-white border border-[#C5A059]/30 hover:bg-[#252528] hover:border-[#C5A059]/60 shadow-lg shadow-black/40 font-medium rounded-lg transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? 'Processing...' : 'Submit Application'}
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

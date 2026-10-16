import React, { useState, useEffect } from 'react';

const COUNTRY_CODES: Record<string, { name: string; flag: string; code: string }> = {
  '+1': { name: 'USA/CA', flag: '🇺🇸', code: '+1' },
  '+44': { name: 'UK', flag: '🇬🇧', code: '+44' },
  '+48': { name: 'Poland', flag: '🇵🇱', code: '+48' },
  '+49': { name: 'Germany', flag: '🇩🇪', code: '+49' },
  '+33': { name: 'France', flag: '🇫🇷', code: '+33' },
  '+34': { name: 'Spain', flag: '🇪🇸', code: '+34' },
  '+39': { name: 'Italy', flag: '🇮🇹', code: '+39' },
  '+81': { name: 'Japan', flag: '🇯🇵', code: '+81' },
  '+86': { name: 'China', flag: '🇨🇳', code: '+86' },
  '+41': { name: 'Switzerland', flag: '🇨🇭', code: '+41' },
  '+43': { name: 'Austria', flag: '🇦🇹', code: '+43' },
  '+31': { name: 'Netherlands', flag: '🇳🇱', code: '+31' },
  '+7': { name: 'KZ/RU', flag: '🇰🇿', code: '+7' },
  '+380': { name: 'Ukraine', flag: '🇺🇦', code: '+380' }
};

export function PhoneInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [flag, setFlag] = useState('🌐');

  useEffect(() => {
    // Sort keys by length descending to match longest prefix first
    const prefixes = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);
    let matchedFlag = '🌐';
    
    // Only detect if it starts with +
    if (value.startsWith('+')) {
      for (const prefix of prefixes) {
        if (value.startsWith(prefix)) {
          matchedFlag = COUNTRY_CODES[prefix].flag;
          break;
        }
      }
    }
    setFlag(matchedFlag);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Auto-prepend + if they start typing numbers without it (assuming country code)
    if (val.length === 1 && /[1-9]/.test(val)) {
      val = '+' + val;
    }
    onChange(val);
  };

  return (
    <div className="relative">
      <input
        type="tel"
        value={value}
        onChange={handleChange}
        className="w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 pl-4 pr-12 text-sm transition-all duration-300 outline-none tabular-nums"
        placeholder="+48 000 000 000"
        required
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/[0.08] bg-[#1A1A1E] flex items-center justify-center text-sm shadow-sm select-none pointer-events-none transition-all duration-300">
        {flag}
      </div>
    </div>
  );
}

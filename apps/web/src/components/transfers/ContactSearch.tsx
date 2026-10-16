import { Plus, Search, UserCircle2 } from 'lucide-react';
import type { ContactSearchResult } from '@/lib/api';

interface Props {
  phone: string;
  onPhoneChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
  error: string;
  result: ContactSearchResult | null;
  onAdd: () => void;
}

export function ContactSearch({ phone, onPhoneChange, onSearch, searching, error, result, onAdd }: Props) {
  return (
    <div className="pt-4 border-t border-[var(--border-subtle)]">
      <label className="block text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium mb-3">Find by Phone Number</label>
      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="+447700900077"
            aria-label="Phone number"
            className="input-premium w-full p-3 pl-10 text-sm font-mono tracking-wider"
          />
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={searching || !phone}
          className="btn-luxury px-6 py-3 text-xs tracking-[0.1em] uppercase disabled:opacity-50"
        >
          Search
        </button>
      </div>

      {error && <p className="text-red-800 text-xs mt-2">{error}</p>}

      {result && (
        <div className="mt-4 p-4 border border-[#D4AF37]/30 bg-[#D4AF37]/5 rounded-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <UserCircle2 className="w-8 h-8 text-[#D4AF37]" />
            <div>
              <p className="text-sm font-medium text-[var(--text-main)]">{result.user.full_name}</p>
              <p className="text-[10px] text-[var(--text-muted)] uppercase">Found in VaultCore</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center space-x-1 text-xs text-[#D4AF37] hover:text-[#D4AF37]/80 uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </div>
      )}
    </div>
  );
}

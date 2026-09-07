import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, LayoutDashboard, CreditCard, PieChart, Settings, LogOut, Hexagon } from 'lucide-react';
import { clearToken } from '@/lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearToken();
    router.push('/login');
  };

  const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Portfolio', href: '/accounts', icon: CreditCard },
    { name: 'Insights', href: '/analytics', icon: PieChart },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0A0A0B] border-r border-white/[0.04] flex flex-col h-full z-40 flex-shrink-0 relative">
      {/* Very subtle side glow */}
      <div className="absolute inset-y-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-[#C5A059]/10 to-transparent"></div>

      {/* Branding */}
      <div className="p-8 pb-4 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center">
          <Hexagon className="w-6 h-6 text-[#C5A059] stroke-[1.5]" />
        </div>
        <h1 className="text-xl font-bold tracking-wider text-white font-serif uppercase text-sm">VaultCore</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.2em] mb-6 px-4">Wealth Management</div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-500 ease-out font-medium text-xs tracking-wide relative group ${
                isActive
                  ? 'text-white bg-white/[0.02]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-[#C5A059] rounded-r-full shadow-[0_0_10px_rgba(197,160,89,0.5)]"></div>
              )}
              <item.icon className={`w-4 h-4 transition-colors duration-500 ${isActive ? 'text-[#C5A059]' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer Actions */}
      <div className="p-6">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-all duration-500 ease-out font-medium text-xs text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.02] group"
        >
          <LogOut className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          Secure Sign Out
        </button>
      </div>
    </aside>
  );
}

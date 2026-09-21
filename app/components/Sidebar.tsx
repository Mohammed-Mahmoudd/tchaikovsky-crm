"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import {
  Search,
  Inbox,
  Download,
  Calendar,
  ListTodo,
  BarChart2,
  Settings,
  Sun,
  Moon,
  X
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Panel */}
      <div
        className={`flex flex-col h-full w-[250px] md:w-[220px] fixed md:relative inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-sidebar)' }}
      >
        {/* Header */}
        <div className="px-4 py-4 mb-3 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-sidebar)' }}>
          <div>
            <h2 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase">Tchaikovsky School</h2>
            <p className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>CRM</p>
          </div>
          <button onClick={onCloseMobile} className="md:hidden p-1.5 rounded-md transition-colors" style={{ color: 'var(--text-secondary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="relative flex items-center w-full h-[28px] px-2 rounded-[6px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search"
              className="flex-1 w-full h-full px-1.5 text-[12px] bg-transparent outline-none placeholder-gray-500"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-center shrink-0 h-[18px] px-1.5 rounded-[4px] text-[10px] font-medium" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-input)', color: 'var(--text-secondary)' }}>
              ⌘K
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-2">
          <NavItem href="/" icon={<Inbox className="w-[17px] h-[17px]" />} label="Inbox" active={pathname === '/'} onClick={onCloseMobile} />
          <NavItem href="/pipeline" icon={<FilterIcon />} label="Pipeline" active={pathname === '/pipeline'} onClick={onCloseMobile} />
          <NavItem href="/leads" icon={<Download className="w-[17px] h-[17px]" />} label="Leads" active={pathname === '/leads'} onClick={onCloseMobile} />
          <NavItem href="/auditions" icon={<Calendar className="w-[17px] h-[17px]" />} label="Auditions" active={pathname === '/auditions'} onClick={onCloseMobile} />
          <NavItem href="/follow-ups" icon={<ListTodo className="w-[17px] h-[17px]" />} label="Follow-ups" badge="2" active={pathname === '/follow-ups'} onClick={onCloseMobile} />
          <NavItem href="/reports" icon={<BarChart2 className="w-[17px] h-[17px]" />} label="Reports" active={pathname === '/reports'} onClick={onCloseMobile} />
          <NavItem href="/settings" icon={<Settings className="w-[17px] h-[17px]" />} label="Settings" active={pathname === '/settings'} onClick={onCloseMobile} />
        </nav>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: '1px solid var(--border-sidebar)' }}>
          <button
            onClick={toggle}
            className="flex items-center justify-between mb-4 px-1 w-full"
          >
            <div className="flex items-center" style={{ color: 'var(--text-secondary)' }}>
              {theme === 'dark' ? <Moon className="w-4 h-4 mr-2" /> : <Sun className="w-4 h-4 mr-2" />}
              <span className="text-[13px]">Appearance</span>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
              {theme === 'dark' ? 'DARK' : 'LIGHT'}
            </span>
          </button>

          <div className="mb-3 px-1">
            <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>Jwana</p>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Owner</p>
          </div>

          <button className="w-full py-1.5 text-[12px] font-medium transition-colors rounded-lg" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-input)', background: 'transparent' }}>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

function NavItem({ icon, label, active, badge, href, onClick }: { icon: React.ReactNode; label: string; active?: boolean; badge?: string; href: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center justify-between px-2.5 py-[7px] text-[13px] rounded-lg transition-colors ${active ? 'font-medium' : ''}`}
      style={active ? { background: 'var(--bg-selected)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
    >
      <div className="flex items-center">
        <span className="mr-3">
          <div style={active ? { color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>{icon}</div>
        </span>
        {label}
      </div>
      {badge && (
        <span className="flex items-center justify-center min-w-[20px] h-4 px-1.5 text-[10px] font-bold text-white bg-[#FF3B30] rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <line x1="4" y1="6" x2="20" y2="6"></line>
      <line x1="8" y1="12" x2="20" y2="12"></line>
      <line x1="12" y1="18" x2="20" y2="18"></line>
    </svg>
  );
}

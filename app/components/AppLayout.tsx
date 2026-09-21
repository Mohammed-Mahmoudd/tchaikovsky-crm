"use client";

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-1 overflow-hidden relative flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center px-4 py-3 shrink-0" style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-sidebar)' }}>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-1 -ml-1 mr-3 rounded-md"
          style={{ color: 'var(--text-primary)' }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>CRM</h1>
      </div>

      <Sidebar 
        isMobileOpen={isMobileMenuOpen} 
        onCloseMobile={() => setIsMobileMenuOpen(false)} 
      />
      
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
        {children}
      </main>
    </div>
  );
}

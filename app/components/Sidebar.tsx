"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { useAuth, canAccessRoute, normalizeRole } from './AuthProvider';
import {
  Search,
  X,
  Inbox,
  Download,
  Calendar,
  ListTodo,
  BarChart2,
  Settings,
  Sun,
  Moon,
  Activity,
  User,
} from 'lucide-react';

import { useCRM } from '../context/CRMContext';
import { matchLeadSearch } from '../utils/search';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { user, logout, roleDisplayName, isReadOnly } = useAuth();
  const { badgeCounts, searchQuery, setSearchQuery, conversations, openChat } = useCRM();
  const closeTouchedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Top matching leads for the quick sidebar search dropdown
  const sidebarMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return conversations.filter((c) => matchLeadSearch(c, q)).slice(0, 6);
  }, [conversations, searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcut: ⌘K or Ctrl+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setIsDropdownOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectLead = useCallback(
    (id: string) => {
      openChat(id);
      setIsDropdownOpen(false);
      onCloseMobile?.();
    },
    [openChat, onCloseMobile]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (sidebarMatches.length > 0) {
        handleSelectLead(sidebarMatches[0].id);
      } else if (pathname !== '/') {
        router.push('/');
        setIsDropdownOpen(false);
        onCloseMobile?.();
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setIsDropdownOpen(false);
      searchInputRef.current?.blur();
    }
  };

  const handleCloseTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    closeTouchedRef.current = true;
    onCloseMobile?.();
    setTimeout(() => { closeTouchedRef.current = false; }, 400);
  }, [onCloseMobile]);

  const handleCloseClick = useCallback(() => {
    if (closeTouchedRef.current) return;
    onCloseMobile?.();
  }, [onCloseMobile]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{
            background: 'rgba(0,0,0,0.5)',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
          onTouchEnd={handleCloseTouchEnd}
          onClick={handleCloseClick}
        />
      )}

      {/* Sidebar Panel */}
      <div
        className={`flex flex-col h-full w-[260px] md:w-[220px] fixed md:relative inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-sidebar)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 mb-2 flex items-center" style={{ borderBottom: '1px solid var(--border-sidebar)' }}>
          <div>
            <h2 className="text-[10px] font-bold tracking-widest text-[#0066FF] uppercase">Tchaikovsky School</h2>
            <p className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>CRM</p>
          </div>
        </div>

        {/* Search */}
        <div ref={searchContainerRef} className="relative px-3 pb-3">
          <div
            className="relative flex items-center w-full h-[28px] px-2 rounded-[6px]"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search lead or ID…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setIsDropdownOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className="flex-1 w-full h-full px-1.5 text-[12px] bg-transparent outline-none placeholder-gray-500"
              style={{ color: 'var(--text-primary)' }}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsDropdownOpen(false);
                }}
                className="flex items-center justify-center w-4 h-4 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            ) : (
              <div
                className="flex items-center justify-center shrink-0 h-[18px] px-1.5 rounded-[4px] text-[10px] font-medium"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-secondary)',
                }}
              >
                ⌘K
              </div>
            )}
          </div>

          {/* Quick Search Popover / Dropdown for Sidebar */}
          {isDropdownOpen && searchQuery.trim() && (
            <div
              className="absolute left-3 right-3 top-[32px] z-50 rounded-lg overflow-hidden shadow-lg"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-input)',
              }}
            >
              {sidebarMatches.length > 0 ? (
                <div className="max-h-[260px] overflow-y-auto divide-y divide-[var(--border-main)]">
                  {sidebarMatches.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => handleSelectLead(lead.id)}
                      className="w-full text-left p-2 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between gap-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                          {lead.name}
                        </p>
                        <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {lead.agent || 'Unassigned'}
                        </p>
                      </div>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: 'var(--bg-pill)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {lead.channel}
                      </span>
                    </button>
                  ))}
                  {pathname !== '/' && (
                    <button
                      type="button"
                      onClick={() => {
                        router.push('/');
                        setIsDropdownOpen(false);
                        onCloseMobile?.();
                      }}
                      className="w-full text-center py-1.5 text-[11px] font-medium text-[#0066FF] hover:underline bg-[var(--bg-panel)]"
                    >
                      View all in Inbox →
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 text-center text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  No leads matching &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-2">
          {canAccessRoute(user?.role, '/') && (
            <NavItem
              href="/"
              icon={<Inbox className="w-[17px] h-[17px]" />}
              label="Inbox"
              badge={badgeCounts.inbox > 0 ? String(badgeCounts.inbox) : undefined}
              badgeColor="#0066FF"
              active={pathname === '/'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/pipeline') && (
            <NavItem
              href="/pipeline"
              icon={<FilterIcon />}
              label="Pipeline"
              active={pathname === '/pipeline'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/leads') && (
            <NavItem
              href="/leads"
              icon={<Download className="w-[17px] h-[17px]" />}
              label="Leads"
              badge={badgeCounts.leads > 0 ? String(badgeCounts.leads) : undefined}
              badgeColor="#FF9500"
              active={pathname === '/leads'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/auditions') && (
            <NavItem
              href="/auditions"
              icon={<Calendar className="w-[17px] h-[17px]" />}
              label="Auditions"
              badge={badgeCounts.auditions > 0 ? String(badgeCounts.auditions) : undefined}
              badgeColor="#34C759"
              active={pathname === '/auditions'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/follow-ups') && (
            <NavItem
              href="/follow-ups"
              icon={<ListTodo className="w-[17px] h-[17px]" />}
              label="Follow-ups"
              badge={badgeCounts.followUps > 0 ? String(badgeCounts.followUps) : undefined}
              badgeColor="#FF3B30"
              active={pathname === '/follow-ups'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/reports') && (
            <NavItem
              href="/reports"
              icon={<BarChart2 className="w-[17px] h-[17px]" />}
              label="Reports"
              active={pathname === '/reports'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/team-performance') && (
            <NavItem
              href="/team-performance"
              icon={<Activity className="w-[17px] h-[17px]" />}
              label="Team Activities"
              active={pathname === '/team-performance'}
              onClick={onCloseMobile}
            />
          )}
          {normalizeRole(user?.role) !== 'chairman' && canAccessRoute(user?.role, '/profile') && (
            <NavItem
              href="/profile"
              icon={<User className="w-[17px] h-[17px]" />}
              label="Profile"
              active={pathname === '/profile'}
              onClick={onCloseMobile}
            />
          )}
          {canAccessRoute(user?.role, '/settings') && (
            <NavItem
              href="/settings"
              icon={<Settings className="w-[17px] h-[17px]" />}
              label="Settings"
              active={pathname === '/settings'}
              onClick={onCloseMobile}
            />
          )}
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

          <Link
            href="/profile"
            onClick={onCloseMobile}
            className={`mb-3 p-1.5 flex items-center gap-2.5 rounded-lg transition-colors cursor-pointer ${
              pathname === '/profile' ? 'bg-[var(--bg-selected)]' : 'hover:bg-[var(--bg-hover)]'
            }`}
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || 'User'}
                className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs"
                style={{ border: '1px solid var(--border-input)' }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[13px] shrink-0"
                style={{
                  background: 'var(--bg-pill)',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-secondary)',
                }}
              >
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
                {user?.name || 'User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[11px] truncate font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {roleDisplayName}
                </p>
                {isReadOnly && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded text-[#FF9500] bg-[rgba(255,149,0,0.12)] shrink-0">
                    View Only
                  </span>
                )}
              </div>
            </div>
          </Link>

          <button
            onClick={logout}
            className="w-full py-1.5 text-[12px] font-medium transition-colors rounded-lg hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-input)', background: 'transparent' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  badgeColor = '#FF3B30',
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
  badgeColor?: string;
  href: string;
  onClick?: () => void;
}) {
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
        <span
          className="flex items-center justify-center min-w-[20px] h-4 px-1.5 text-[10px] font-bold text-white rounded-full"
          style={{ background: badgeColor }}
        >
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

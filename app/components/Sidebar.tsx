"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { useAuth, canAccessRoute, canAccessInbox, isOperationRole, normalizeRole } from './AuthProvider';
import {
  Search,
  X,
  Inbox,
  MessageSquare,
  Download,
  Calendar,
  ListTodo,
  BarChart2,
  Settings,
  Sun,
  Moon,
  Activity,
  User,
  Users,
  ChevronDown,
  Bot,
  ShieldCheck,
  Layers,
} from 'lucide-react';

import { useCRM } from '../context/CRMContext';
import { buildLabelNameMap, matchLeadSearch } from '../utils/search';
import { LeadLabelBadges } from './LeadLabelBadges';
import { markTeamSidebarNavigation } from '../utils/teamAuditNav';
import { isConversationArchived, isConversationDone, resolveConvInboxMode } from '../utils/inboxFilters';
import {
  AGENT_CACHE_KEYS,
  dedupeAgentRequest,
  isAgentCacheFresh,
  writeAgentActivityCache,
  writeAgentLeadsCache,
  writeAgentStatusCache,
} from '../utils/agentWorkspaceCache';
import {
  buildSidebarNav,
  getNextSidebarGroupToggles,
  isSidebarGroupActive,
  isSidebarGroupExpanded,
  isSidebarRouteActive,
  type SidebarBadge,
  type SidebarBadgeTone,
  type SidebarGroupItem,
  type SidebarGroupToggleMap,
  type SidebarIconKey,
} from '../utils/sidebarNav';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { user, logout, roleDisplayName, isReadOnly, authFetch } = useAuth();
  const {
    badgeCounts,
    searchQuery,
    setSearchQuery,
    conversations,
    labels,
    openChat,
  } = useCRM();
  const closeTouchedRef = useRef(false);
  const agentWarmStartedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [groupToggles, setGroupToggles] = useState<SidebarGroupToggleMap>({});
  const navIdPrefix = useId();

  const labelNameMap = useMemo(() => buildLabelNameMap(labels), [labels]);

  const navEntries = useMemo(
    () =>
      buildSidebarNav({
        canAccess: (href) => canAccessRoute(user?.role, href),
        isChairman: normalizeRole(user?.role) === 'chairman',
        badgeCounts,
      }),
    [user?.role, badgeCounts]
  );

  const warmAgentWorkspace = useCallback(() => {
    if (normalizeRole(user?.role) !== 'chairman' || agentWarmStartedRef.current) return;
    agentWarmStartedRef.current = true;

    const agentRoutes = ['/agent', '/agent/leads', '/agent/studio'];
    for (const route of agentRoutes) {
      router.prefetch(route);
    }

    if (!isAgentCacheFresh(AGENT_CACHE_KEYS.status)) {
      void dedupeAgentRequest('agent:status', async () => {
        const res = await authFetch('/crm-api/claude/status', { cache: 'no-store' });
        const json = res.ok ? await res.json().catch(() => null) : null;
        if (json?.success && json.data) {
          writeAgentStatusCache(json.data);
          return json.data;
        }
        return null;
      }).catch(() => {});
    }
    if (!isAgentCacheFresh(AGENT_CACHE_KEYS.leads)) {
      void dedupeAgentRequest('agent:leads', async () => {
        const res = await authFetch('/crm-api/claude/leads', { cache: 'no-store' });
        const json = res.ok ? await res.json().catch(() => null) : null;
        if (json?.success && Array.isArray(json.data)) {
          writeAgentLeadsCache(json.data);
          return json.data;
        }
        return null;
      }).catch(() => {});
    }
    if (!isAgentCacheFresh(AGENT_CACHE_KEYS.activity)) {
      void dedupeAgentRequest('agent:activity:all:all:40:', async () => {
        const res = await authFetch('/crm-api/claude/activity?outcome=all&window=all&limit=40', { cache: 'no-store' });
        const json = res.ok ? await res.json().catch(() => null) : null;
        if (json?.success && json.data) {
          const payload = {
            items: Array.isArray(json.data.items) ? json.data.items : [],
            summary: json.data.summary,
          };
          if (payload.summary) writeAgentActivityCache(payload);
          return payload;
        }
        return null;
      }).catch(() => {});
    }
  }, [authFetch, router, user?.role]);

  const handleToggleGroup = useCallback(
    (group: SidebarGroupItem, currentlyOpen: boolean, hasActiveChild: boolean) => {
      if (group.id === 'agent' && !currentlyOpen) {
        warmAgentWorkspace();
      }
      setGroupToggles((prev) =>
        getNextSidebarGroupToggles({
          prev,
          groupId: group.id,
          currentlyOpen,
          hasActiveChild,
          pathname,
        })
      );
    },
    [pathname, warmAgentWorkspace]
  );

  // Top matching leads/conversations for the quick sidebar search dropdown (scoped by authorized inbox)
  const sidebarMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return conversations
      .filter((c) => canAccessInbox(user?.role, resolveConvInboxMode(c)) && matchLeadSearch(c, q, labelNameMap))
      .slice(0, 6);
  }, [conversations, searchQuery, labelNameMap, user?.role]);

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
      markTeamSidebarNavigation();
      openChat(id);
      setIsDropdownOpen(false);
      onCloseMobile?.();
    },
    [openChat, onCloseMobile]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const defaultInboxPath = isOperationRole(user?.role) ? '/operation-inbox' : '/';
    if (e.key === 'Enter') {
      if (sidebarMatches.length > 0) {
        handleSelectLead(sidebarMatches[0].id);
      } else if (pathname !== defaultInboxPath && canAccessRoute(user?.role, defaultInboxPath)) {
        markTeamSidebarNavigation();
        router.push(defaultInboxPath);
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
        className={`flex flex-col h-full w-[260px] md:w-[244px] fixed md:relative inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out ${
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
              placeholder="Search lead, label, or ID…"
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
                        <LeadLabelBadges labelIds={lead.labels} catalog={labels} maxVisible={2} className="mt-1" />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {resolveConvInboxMode(lead) === 'operation' && canAccessRoute(user?.role, '/') && (
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              background: 'var(--bg-selected)',
                              color: '#0066FF',
                            }}
                          >
                            Ops
                          </span>
                        )}
                        {isConversationArchived(lead) ? (
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              background: 'var(--bg-pill)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Archived
                          </span>
                        ) : isConversationDone(lead) ? (
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              background: 'var(--bg-pill)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            DONE
                          </span>
                        ) : null}
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: 'var(--bg-pill)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {lead.channel}
                        </span>
                      </div>
                    </button>
                  ))}
                  {(() => {
                    const fallbackInboxPath = isOperationRole(user?.role) ? '/operation-inbox' : '/';
                    if (pathname === fallbackInboxPath) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          router.push(fallbackInboxPath);
                          setIsDropdownOpen(false);
                          onCloseMobile?.();
                        }}
                        className="w-full text-center py-1.5 text-[11px] font-medium text-[#0066FF] hover:underline bg-[var(--bg-panel)]"
                      >
                        View all in {fallbackInboxPath === '/operation-inbox' ? 'Operation Inbox' : 'Inbox'} →
                      </button>
                    );
                  })()}
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
        <nav aria-label="Main navigation" className="flex-1 px-2.5 space-y-2.5 overflow-y-auto mt-2 pb-2">
          {navEntries.map((entry) => {
            if (entry.kind === 'link') {
              return (
                <NavItem
                  key={entry.id}
                  href={entry.href}
                  icon={renderSidebarIcon(entry.icon)}
                  label={entry.label}
                  badge={entry.badge}
                  active={isSidebarRouteActive(pathname, entry.href, {
                    exact: entry.exact,
                    activePrefixes: entry.activePrefixes,
                  })}
                  onClick={onCloseMobile}
                />
              );
            }

            const hasActiveChild = isSidebarGroupActive(entry, pathname);
            const isExpanded = isSidebarGroupExpanded({
              group: entry,
              pathname,
              toggles: groupToggles,
            });

            return (
              <NavGroup
                key={entry.id}
                group={entry}
                panelId={`${navIdPrefix}-${entry.id}`}
                pathname={pathname}
                isExpanded={isExpanded}
                hasActiveChild={hasActiveChild}
                onToggle={() => handleToggleGroup(entry, isExpanded, hasActiveChild)}
                onHoverGroup={entry.id === 'agent' ? warmAgentWorkspace : undefined}
                onSelectChild={onCloseMobile}
              />
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: '1px solid var(--border-sidebar)' }}>
          <button
            type="button"
            onClick={toggle}
            className="flex items-center justify-between min-h-[44px] md:min-h-[32px] mb-3 px-1 w-full rounded-md transition-colors hover:bg-[var(--bg-hover)]"
          >
            <div className="flex items-center" style={{ color: 'var(--text-secondary)' }}>
              {theme === 'dark' ? <Moon className="w-4 h-4 mr-2" /> : <Sun className="w-4 h-4 mr-2" />}
              <span className="text-[13px]">Appearance</span>
            </div>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
              {theme === 'dark' ? 'DARK' : 'LIGHT'}
            </span>
          </button>

          <div className="mb-3 flex items-center gap-1">
            <Link
              href="/profile"
              onClick={() => {
                markTeamSidebarNavigation();
                onCloseMobile?.();
              }}
              className={`flex-1 min-w-0 p-1.5 flex items-center gap-2.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bg-banner)] ${
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

            {canAccessRoute(user?.role, '/settings') && (
              <Link
                href="/settings"
                onClick={() => {
                  markTeamSidebarNavigation();
                  onCloseMobile?.();
                }}
                aria-label="Settings"
                title="Settings"
                className="min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px] flex items-center justify-center rounded-lg transition-colors shrink-0 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bg-banner)]"
                style={
                  isSidebarRouteActive(pathname, '/settings')
                    ? { background: 'var(--bg-selected)', color: 'var(--text-primary)' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                <Settings className="w-[17px] h-[17px]" />
              </Link>
            )}
          </div>

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

const BADGE_TONE_STYLES: Record<SidebarBadgeTone, React.CSSProperties> = {
  banner: {
    background: 'var(--bg-banner)',
  },
  amber: {
    background: 'var(--label-amber-bg)',
    border: '1px solid var(--label-amber-border)',
    color: 'var(--label-amber-text)',
  },
  green: {
    background: 'var(--label-green-bg)',
    border: '1px solid var(--label-green-border)',
    color: 'var(--label-green-text)',
  },
  red: {
    background: 'var(--label-red-bg)',
    border: '1px solid var(--label-red-border)',
    color: 'var(--label-red-text)',
  },
  neutral: {
    background: 'var(--bg-pill)',
    border: '1px solid var(--border-main)',
    color: 'var(--text-secondary)',
  },
};

function renderSidebarIcon(icon: SidebarIconKey, size: 'md' | 'sm' = 'md') {
  const cls = size === 'sm' ? 'w-[15px] h-[15px]' : 'w-[17px] h-[17px]';
  switch (icon) {
    case 'inbox':
      return <Inbox className={cls} />;
    case 'operation-inbox':
      return <MessageSquare className={cls} />;
    case 'leads-management':
      return <Users className={cls} />;
    case 'auditions':
      return <Calendar className={cls} />;
    case 'pipeline':
      return <FilterIcon className={cls} />;
    case 'leads':
      return <Download className={cls} />;
    case 'reports':
      return <BarChart2 className={cls} />;
    case 'team-activities':
      return <Activity className={cls} />;
    case 'follow-ups':
      return <ListTodo className={cls} />;
    case 'agent':
      return <Bot className={cls} />;
    case 'agent-overview':
      return <ShieldCheck className={cls} />;
    case 'agent-leads':
      return <Users className={cls} />;
    case 'agent-studio':
      return <Layers className={cls} />;
    case 'profile':
      return <User className={cls} />;
  }
}

function NavBadge({ badge }: { badge: SidebarBadge }) {
  const isSolidBanner = badge.tone === 'banner';
  return (
    <span
      title={badge.title}
      className={`flex items-center justify-center min-w-[20px] h-4 px-1.5 text-[10px] font-bold rounded-full shrink-0 ${
        isSolidBanner ? 'text-white' : ''
      }`}
      style={BADGE_TONE_STYLES[badge.tone]}
    >
      {badge.count}
    </span>
  );
}

function NavGroup({
  group,
  panelId,
  pathname,
  isExpanded,
  hasActiveChild,
  onToggle,
  onHoverGroup,
  onSelectChild,
}: {
  group: SidebarGroupItem;
  panelId: string;
  pathname: string;
  isExpanded: boolean;
  hasActiveChild: boolean;
  onToggle: () => void;
  onHoverGroup?: () => void;
  onSelectChild?: () => void;
}) {
  const highlightParent = hasActiveChild && !isExpanded;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={onHoverGroup}
        onFocus={onHoverGroup}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className={`w-full flex items-center justify-between gap-2 min-h-[44px] md:min-h-[34px] px-2.5 py-1.5 text-[13px] rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bg-banner)] ${
          hasActiveChild ? 'font-medium' : ''
        }`}
        style={
          highlightParent
            ? { background: 'var(--bg-selected)', color: 'var(--text-primary)' }
            : { color: hasActiveChild ? 'var(--text-primary)' : 'var(--text-secondary)' }
        }
      >
        <div className="min-w-0 flex items-center gap-2">
          <span
            className="shrink-0"
            style={{ color: hasActiveChild ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {renderSidebarIcon(group.icon, 'md')}
          </span>
          <span className="truncate">{group.label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isExpanded && group.collapsedBadge && <NavBadge badge={group.collapsedBadge} />}
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            style={{ color: 'var(--text-muted)' }}
          />
        </div>
      </button>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-label={group.label}
          className="mt-1 pb-1 ms-3.5 ps-2 space-y-1"
          style={{ borderInlineStart: '1px solid var(--border-main)' }}
        >
          {group.children.map((child) => (
            <NavItem
              key={child.id}
              href={child.href}
              icon={renderSidebarIcon(child.icon, 'sm')}
              label={child.label}
              badge={child.badge}
              active={isSidebarRouteActive(pathname, child.href, {
                exact: child.exact,
                activePrefixes: child.activePrefixes,
              })}
              onClick={onSelectChild}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  href,
  onClick,
  nested = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: SidebarBadge;
  href: string;
  onClick?: () => void;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        markTeamSidebarNavigation();
        onClick?.();
      }}
      className={`flex items-center justify-between gap-2 rounded-lg transition-colors text-[13px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--bg-banner)] ${
        nested
          ? 'min-h-[44px] md:min-h-[32px] px-2 py-1.5'
          : 'min-h-[44px] md:min-h-[34px] px-2.5 py-1.5'
      } ${active ? 'font-medium' : ''}`}
      style={active ? { background: 'var(--bg-selected)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
    >
      <div className="min-w-0 flex items-center gap-2">
        <span className="shrink-0" style={active ? { color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {badge && <NavBadge badge={badge} />}
    </Link>
  );
}

function FilterIcon({ className = 'w-[17px] h-[17px]' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="4" y1="6" x2="20" y2="6"></line>
      <line x1="8" y1="12" x2="20" y2="12"></line>
      <line x1="12" y1="18" x2="20" y2="18"></line>
    </svg>
  );
}

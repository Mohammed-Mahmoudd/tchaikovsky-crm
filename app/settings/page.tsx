import React from 'react';

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-10" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <h1 className="text-[15px] font-bold mb-5" style={{ color: 'var(--text-primary)' }}>Settings</h1>

      {/* Your account Card */}
      <div className="rounded-xl p-5 mb-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Your account</h2>
        <p className="text-[11px] mb-4 mt-0.5" style={{ color: 'var(--text-secondary)' }}>Signed in as jwana@tchaikovsky.demo · Owner</p>
        
        <div className="mb-4">
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Display name</label>
          <div className="flex">
            <input 
              type="text" 
              defaultValue="Jwana" 
              className="flex-1 max-w-sm h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
            />
            <button className="h-[28px] px-3.5 ml-2 text-[12px] font-medium rounded-[6px] transition-colors" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)', color: 'var(--text-primary)' }}>
              Save name
            </button>
          </div>
        </div>

        <div className="my-4" style={{ borderBottom: '1px solid var(--border-main)' }} />

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full sm:max-w-[220px]">
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>New password</label>
            <input 
              type="password" 
              className="w-full h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex-1 w-full sm:max-w-[220px]">
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Confirm</label>
            <input 
              type="password" 
              className="w-full h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
            />
          </div>
          <button className="h-[28px] px-3.5 text-[12px] font-medium text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700 transition-colors shadow-sm">
            Change password
          </button>
        </div>
      </div>

      {/* Team Card */}
      <div className="rounded-xl p-5 shadow-sm overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Team</h2>
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>3 / 10 seats used</span>
        </div>

        <div className="mb-1" style={{ borderBottom: '1px solid var(--border-main)' }} />

        {/* Member 1 */}
        <div className="flex items-center gap-2 py-3" style={{ borderBottom: '1px solid var(--border-main)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>Jwana</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>jwana@tchaikovsky.demo</p>
          </div>
          <select className="h-[26px] text-[11px] rounded-[6px] px-1.5 outline-none shrink-0 w-[78px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}>
            <option>Owner</option>
            <option>Manager</option>
            <option>Agent</option>
          </select>
          <div className="flex gap-1.5 shrink-0">
            <button className="h-[26px] px-2 text-[10px] font-medium rounded-[6px] transition-colors whitespace-nowrap" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}>
              Reset
            </button>
            <button className="h-[26px] px-2 text-[10px] font-medium rounded-[6px] cursor-not-allowed whitespace-nowrap" style={{ background: 'var(--bg-pill)', color: 'var(--text-muted)' }}>
              Deactivate
            </button>
          </div>
        </div>

        {/* Member 2 */}
        <div className="flex items-center gap-2 py-3" style={{ borderBottom: '1px solid var(--border-main)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>Rokaia</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>rokaia@tchaikovsky.demo</p>
          </div>
          <select className="h-[26px] text-[11px] rounded-[6px] px-1.5 outline-none shrink-0 w-[78px]" defaultValue="Manager" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}>
            <option>Owner</option>
            <option>Manager</option>
            <option>Agent</option>
          </select>
          <div className="flex gap-1.5 shrink-0">
            <button className="h-[26px] px-2 text-[10px] font-medium rounded-[6px] transition-colors whitespace-nowrap" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}>
              Reset
            </button>
            <button className="h-[26px] px-2 text-[10px] font-medium transition-colors rounded-[6px] whitespace-nowrap" style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)' }}>
              Deactivate
            </button>
          </div>
        </div>

        {/* Member 3 */}
        <div className="flex items-center gap-2 py-3" style={{ borderBottom: '1px solid var(--border-main)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>Sara</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>sara@tchaikovsky.demo</p>
          </div>
          <select className="h-[26px] text-[11px] rounded-[6px] px-1.5 outline-none shrink-0 w-[78px]" defaultValue="Agent" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}>
            <option>Owner</option>
            <option>Manager</option>
            <option>Agent</option>
          </select>
          <div className="flex gap-1.5 shrink-0">
            <button className="h-[26px] px-2 text-[10px] font-medium rounded-[6px] transition-colors whitespace-nowrap" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}>
              Reset
            </button>
            <button className="h-[26px] px-2 text-[10px] font-medium transition-colors rounded-[6px] whitespace-nowrap" style={{ background: 'var(--bg-pill)', color: 'var(--text-primary)' }}>
              Deactivate
            </button>
          </div>
        </div>

        {/* Add Someone Section */}
        <div className="pt-5">
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Add someone</span>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-[11px] font-medium text-white bg-[#0066FF] rounded-full">
                Email invite
              </button>
              <button className="px-3 py-1 text-[11px] font-medium transition-colors rounded-full" style={{ background: 'var(--bg-pill)', color: 'var(--text-secondary)' }}>
                Set a password
              </button>
            </div>
          </div>

          {/* Inputs stack vertically on mobile, side by side on sm+ */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              placeholder="Full name"
              className="flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
            />
            <input
              type="email"
              placeholder="Email"
              className="flex-1 min-w-0 h-[28px] px-2.5 text-[12px] rounded-[6px] outline-none transition-colors focus:border-[#0066FF] placeholder-gray-400"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              They&apos;ll get an email to choose their own password.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <select className="h-[28px] text-[11px] rounded-[6px] px-2 outline-none w-[100px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }}>
                <option>Owner</option>
                <option>Manager</option>
                <option>Agent</option>
              </select>
              <button className="h-[28px] px-4 text-[12px] font-medium text-white bg-[#0066FF] rounded-[6px] hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
                Send invite
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Inbox behaviour Card */}
      <div className="rounded-xl p-5 mt-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
        <h2 className="text-[13px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Inbox behaviour</h2>
        <div className="flex items-start">
          <input 
            type="checkbox" 
            defaultChecked
            className="mt-0.5 mr-3 w-[14px] h-[14px] accent-[#0071e3] rounded-[3px] border-gray-300 cursor-pointer"
          />
          <div>
            <p className="text-[13px] font-medium leading-none mb-1.5" style={{ color: 'var(--text-primary)' }}>Agents see the whole inbox</p>
            <p className="text-[11px] leading-tight max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Off: agents only see conversations assigned to them or unassigned. Managers and the owner always see everything.
            </p>
          </div>
        </div>
      </div>

      {/* Role permissions Card */}
      <div className="rounded-xl p-5 mt-5 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}>
        <h2 className="text-[13px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>What each role can do</h2>
        <ul className="space-y-2.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          <li><span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Owner</span> — everything, plus team, settings and exports.</li>
          <li><span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Manager</span> — full inbox, pipeline, scheduling, reports.</li>
          <li><span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Agent</span> — reply, manage leads and bookings.</li>
          <li><span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Analyst</span> — read-only pipeline and reports; no conversations.</li>
        </ul>
      </div>

    </div>
  );
}

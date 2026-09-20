import React from 'react';

export default function ReportsPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Reports</h1>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Lead → audition → enrolment by campaign. Divide a campaign's spend by its enrolled column for true cost per student.
        </p>
      </div>

      {/* Main Content */}
      <div className="p-6 flex-1" style={{ color: 'var(--text-primary)' }}>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiCard title="Leads" value="12" />
          <KpiCard title="Auditions booked" value="5" subValue="42%" />
          <KpiCard title="Attended" value="3" subValue="60%" />
          <KpiCard title="Enrolled" value="2" subValue="17%" />
        </div>

        {/* Table — minimal, flat, no card border */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest" style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}>
                <th className="py-2 px-4 font-semibold">Campaign</th>
                <th className="py-2 px-4 font-semibold text-right">Leads</th>
                <th className="py-2 px-4 font-semibold text-right">Booked</th>
                <th className="py-2 px-4 font-semibold text-right">Attended</th>
                <th className="py-2 px-4 font-semibold text-right">Enrolled</th>
                <th className="py-2 px-4 font-semibold text-right">Lead → Enrol</th>
                <th className="py-2 px-4 font-semibold text-right">Unqualified</th>
              </tr>
            </thead>
            <tbody className="text-[12px] divide-y" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-main)' }}>
              <TableRow idx={0} campaign="Jeddah – Piano & Violin Leads (Aug)" leads="5" booked="3" attended="2" enrolled="1" enrolledIsZero={false} leadEnrol="20%" unqualified="0" />
              <TableRow idx={1} campaign="KSA – Adult Music Classes" leads="4" booked="1" attended="0" enrolled="0" enrolledIsZero={true} leadEnrol="0%" unqualified="1" />
              <TableRow idx={2} campaign="IG Click-to-WhatsApp – Auditions" leads="2" booked="1" attended="1" enrolled="1" enrolledIsZero={false} leadEnrol="50%" unqualified="0" />
              <TableRow idx={3} campaign="Organic" leads="1" booked="0" attended="0" enrolled="0" enrolledIsZero={true} leadEnrol="0%" unqualified="0" />
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value, subValue }: { title: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2 h-[80px]" style={{ background: 'var(--bg-kpi)', border: '1px solid var(--border-main)', boxShadow: 'var(--shadow-card)' }}>
      <h3 className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {subValue && (
          <span className="text-[11px] font-medium text-[#0066FF] leading-none">{subValue}</span>
        )}
      </div>
    </div>
  );
}

function TableRow({
  idx, campaign, leads, booked, attended, enrolled, enrolledIsZero, leadEnrol, unqualified,
}: {
  idx: number; campaign: string; leads: string; booked: string; attended: string;
  enrolled: string; enrolledIsZero: boolean; leadEnrol: string; unqualified: string;
}) {
  const bgVar = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-table-alt)';
  return (
    <tr style={{ background: bgVar }}>
      <td className="py-3 px-4" style={{ color: 'var(--text-primary)' }}>{campaign}</td>
      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{leads}</td>
      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{booked}</td>
      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{attended}</td>
      <td className={`py-3 px-4 text-right font-semibold ${enrolledIsZero ? 'text-[#34C759]/60' : 'text-[#34C759]'}`}>{enrolled}</td>
      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>{leadEnrol}</td>
      <td className="py-3 px-4 text-right" style={{ color: 'var(--text-muted)' }}>{unqualified}</td>
    </tr>
  );
}

import React from 'react';

const leadsData = [
  { received: 'Sep 01, 10:19 AM', name: 'Faisal', phone: '+966 50 0000 102', campaign: 'IG Click-to-WhatsApp – Auditions', ad: 'CTWA – chat with us', stage: 'New' },
  { received: 'Sep 01, 09:49 AM', name: 'Noura', phone: '+966 50 0000 101', campaign: 'Jeddah – Piano & Violin Leads (Aug)', ad: 'Video – child at the piano', stage: 'Contacted' },
  { received: 'Sep 01, 06:49 AM', name: 'Khalid', phone: '—', campaign: 'KSA – Adult Music Classes', ad: 'Carousel – it\'s never too late', stage: 'New' },
  { received: 'Aug 31, 11:49 PM', name: 'Walk-in – Mona', phone: '—', campaign: 'Organic', ad: '—', stage: 'New' },
  { received: 'Aug 31, 03:49 PM', name: 'Tariq', phone: '—', campaign: 'KSA – Adult Music Classes', ad: 'Carousel – it\'s never too late', stage: 'Audition booked' },
  { received: 'Aug 31, 09:49 AM', name: 'Huda', phone: '+966 50 0000 106', campaign: 'Jeddah – Piano & Violin Leads (Aug)', ad: 'Video – child at the piano', stage: 'Audition booked' },
  { received: 'Aug 31, 04:49 AM', name: 'Reem', phone: '+966 50 0000 103', campaign: 'KSA – Adult Music Classes', ad: 'Carousel – it\'s never too late', stage: 'Contacted' },
  { received: 'Aug 30, 10:49 AM', name: 'Majed', phone: '—', campaign: 'KSA – Adult Music Classes', ad: 'Carousel – it\'s never too late', stage: 'Unqualified' },
  { received: 'Aug 28, 11:49 AM', name: 'Salma', phone: '—', campaign: 'Jeddah – Piano & Violin Leads (Aug)', ad: 'Video – child at the piano', stage: 'Attended' },
  { received: 'Aug 25, 11:49 AM', name: 'Yara', phone: '—', campaign: 'Jeddah – Piano & Violin Leads (Aug)', ad: 'Video – child at the piano', stage: 'Enrolled' },
  { received: 'Aug 24, 03:49 AM', name: 'Abdulrahman', phone: '—', campaign: 'IG Click-to-WhatsApp – Auditions', ad: 'CTWA – chat with us', stage: 'Enrolled' },
  { received: 'Aug 22, 11:49 AM', name: 'Dana', phone: '—', campaign: 'Jeddah – Piano & Violin Leads (Aug)', ad: 'Video – child at the piano', stage: 'Lost' },
];

export default function LeadsPage() {
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="px-6 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-main)' }}>
        <h1 className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>Leads</h1>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Every Meta lead, tagged with the campaign that produced it. Newest first.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="min-w-[900px]">
          <table className="w-full text-left border-collapse rounded-xl overflow-hidden shadow-sm">
            <thead className="text-[10px] uppercase tracking-widest font-bold" style={{ background: 'var(--bg-table-header)', color: 'var(--text-secondary)' }}>
              <tr>
                <th className="py-2.5 px-4 font-bold">Received</th>
                <th className="py-2.5 px-4 font-bold">Name</th>
                <th className="py-2.5 px-4 font-bold">Phone</th>
                <th className="py-2.5 px-4 font-bold">Campaign</th>
                <th className="py-2.5 px-4 font-bold">Ad</th>
                <th className="py-2.5 px-4 font-bold">Stage</th>
              </tr>
            </thead>
            <tbody className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
              {leadsData.map((lead, idx) => (
                <TableRow key={idx} idx={idx} lead={lead} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TableRow({ idx, lead }: { idx: number; lead: any }) {
  const bgVar = idx % 2 === 0 ? 'transparent' : 'var(--bg-card)';
  return (
    <tr style={{ background: bgVar }}>
      <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.received}</td>
      <td className="py-3 px-4 font-medium" style={{ color: 'var(--text-primary)' }}>{lead.name}</td>
      <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.phone}</td>
      <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{lead.campaign}</td>
      <td className="py-3 px-4" style={{ color: 'var(--text-muted)' }}>{lead.ad}</td>
      <td className="py-3 px-4">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-pill)', color: '#0066FF' }}>
          {lead.stage}
        </span>
      </td>
    </tr>
  );
}

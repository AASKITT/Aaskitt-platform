import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import StatsCard from '../components/StatsCard';
import { Users, UserCheck, MessageSquare, Activity, MessageCircle, BarChart3, Wifi } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/dashboard-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return <div className="flex justify-center items-center h-64 text-slate-500 font-medium">Loading dashboard data...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time platform metrics</p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-semibold border border-green-200">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          {stats?.onlineCount || 0} Online Now
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard title="Total Users" value={stats?.totalUsers || 0} icon={Users} colorClass="bg-blue-100 text-blue-600" />
        <StatsCard title="Google Accounts" value={stats?.googleUsersCount || 0} icon={UserCheck} colorClass="bg-sky-100 text-sky-600" />
        <StatsCard title="Guest Users" value={stats?.guestUsersCount || 0} icon={Users} colorClass="bg-slate-100 text-slate-600" />
        <StatsCard title="Active Today" value={stats?.activeUsersToday || 0} icon={Activity} colorClass="bg-emerald-100 text-emerald-600" />
        <StatsCard title="Total Posts" value={stats?.totalPosts || 0} icon={MessageSquare} colorClass="bg-purple-100 text-purple-600" />
        <StatsCard title="Active Posts" value={stats?.activePosts || 0} icon={Activity} colorClass="bg-indigo-100 text-indigo-600" />
        <StatsCard title="Total Comments" value={stats?.totalComments || 0} icon={MessageCircle} colorClass="bg-orange-100 text-orange-600" />
        <StatsCard title="Posts Today" value={stats?.postsToday || 0} icon={BarChart3} colorClass="bg-pink-100 text-pink-600" />
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-6">Activity Last 7 Days</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats?.recentActivity || []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="_id" stroke="#94a3b8" fontSize={12} tickMargin={10} />
              <YAxis stroke="#94a3b8" fontSize={12} tickMargin={10} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { Search, Trash2, Mail, Check, Copy, UserCheck, ShieldCheck, UserX, Sparkles } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'google' | 'guest' | 'named' | 'pending_nickname'
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('aaskitt_admin_token');
      const url = new URL(`${API_URL}/admin/users`);
      if (search && search.trim()) url.searchParams.append('search', search.trim());
      if (filterType !== 'all') url.searchParams.append('type', filterType);

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, filterType]);

  const handleDelete = async (id, nickname) => {
    if (!window.confirm(`Are you sure you want to delete user "${nickname || 'this user'}" and all their posts/comments?`)) return;
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setUsers(users.filter(u => u._id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick stats calculation
  const totalCount = users.length;
  const googleCount = users.filter(u => u.isGoogleLinked || (u.email && u.email !== 'N/A')).length;
  const guestCount = users.filter(u => !u.isGoogleLinked && (!u.email || u.email === 'N/A')).length;
  const pendingCount = users.filter(u => !u.rawNickname || u.nickname === 'Pending Setup').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Title & Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            View all registered Google accounts, nicknames, and guest users
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-slate-400" />
          </div>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all shadow-sm bg-white text-sm"
            placeholder="Search email, nickname, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Quick Stat Badges / Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => setFilterType('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border cursor-pointer ${
            filterType === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>All Users</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${filterType === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {totalCount}
          </span>
        </button>

        <button
          onClick={() => setFilterType('google')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border cursor-pointer ${
            filterType === 'google'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-blue-700 border-slate-200 hover:bg-blue-50'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill={filterType === 'google' ? '#ffffff' : '#4285F4'} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill={filterType === 'google' ? '#ffffff' : '#34A853'} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill={filterType === 'google' ? '#ffffff' : '#FBBC05'} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill={filterType === 'google' ? '#ffffff' : '#EA4335'} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Google Accounts</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${filterType === 'google' ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700'}`}>
            {googleCount}
          </span>
        </button>

        <button
          onClick={() => setFilterType('guest')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border cursor-pointer ${
            filterType === 'guest'
              ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <UserX size={15} />
          <span>Guest Users</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${filterType === 'guest' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {guestCount}
          </span>
        </button>

        <button
          onClick={() => setFilterType('pending_nickname')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border cursor-pointer ${
            filterType === 'pending_nickname'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white text-amber-700 border-slate-200 hover:bg-amber-50'
          }`}
        >
          <Sparkles size={15} />
          <span>Pending Nickname</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${filterType === 'pending_nickname' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
            {pendingCount}
          </span>
        </button>
      </div>

      {/* Users Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="p-4 pl-6">User / Nickname</th>
                <th className="p-4">Email ID (Google)</th>
                <th className="p-4">Auth Type</th>
                <th className="p-4">Anonymous ID</th>
                <th className="p-4">Last Active</th>
                <th className="p-4">Created At</th>
                <th className="p-4 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-400 font-medium">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600 mb-2"></div>
                    <p>Loading users...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-500 font-medium">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <UserCheck size={24} />
                    </div>
                    <p className="text-base font-semibold text-slate-700">No users found</p>
                    <p className="text-xs text-slate-400 mt-1">Try changing your search query or filter tab.</p>
                  </td>
                </tr>
              ) : (
                users.map(user => {
                  const hasEmail = user.email && user.email !== 'N/A' && user.email.includes('@');
                  const isPendingNickname = !user.rawNickname || user.nickname === 'Pending Setup';

                  return (
                    <tr key={user._id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Nickname & Avatar */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          {user.photoUrl ? (
                            <img
                              src={user.photoUrl}
                              alt={user.nickname}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-xs ${
                              user.isGoogleLinked ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'
                            }`}>
                              {(user.nickname || 'U').substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${isPendingNickname ? 'text-amber-600 italic' : 'text-slate-900'}`}>
                                {user.nickname}
                              </span>
                              {user.role === 'admin' && (
                                <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            {isPendingNickname && (
                              <p className="text-[11px] text-amber-500 font-medium">Will choose on 1st post</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Google Email ID */}
                      <td className="p-4">
                        {hasEmail ? (
                          <div className="flex items-center gap-2 group">
                            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                              <Mail size={13} />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800 text-xs select-all">
                                {user.email}
                              </span>
                              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                                <ShieldCheck size={10} /> Verified Google
                              </span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(user.email, `email_${user._id}`)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Copy Email"
                            >
                              {copiedId === `email_${user._id}` ? (
                                <Check size={13} className="text-emerald-500" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500">
                            Guest (No Email)
                          </span>
                        )}
                      </td>

                      {/* Auth Type Badge */}
                      <td className="p-4">
                        {user.isGoogleLinked || hasEmail ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <svg className="w-3 h-3" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            Google User
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Guest / Device
                          </span>
                        )}
                      </td>

                      {/* Anonymous ID */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 group">
                          <span className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 select-all max-w-[140px] truncate" title={user.anonymousId}>
                            {user.anonymousId}
                          </span>
                          <button
                            onClick={() => copyToClipboard(user.anonymousId, `anon_${user._id}`)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Copy Anonymous ID"
                          >
                            {copiedId === `anon_${user._id}` ? (
                              <Check size={12} className="text-emerald-500" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Last Active */}
                      <td className="p-4 text-xs text-slate-600">
                        {user.lastActive ? new Date(user.lastActive).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'N/A'}
                      </td>

                      {/* Created At */}
                      <td className="p-4 text-xs text-slate-500">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        }) : 'N/A'}
                      </td>

                      {/* Delete Action */}
                      <td className="p-4 text-right pr-6">
                        <button
                          onClick={() => handleDelete(user._id, user.nickname)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

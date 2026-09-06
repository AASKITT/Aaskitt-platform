import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Eye } from 'lucide-react';
import { API_URL } from '../config';

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const res = await fetch(`${API_URL}/admin/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this group? All messages in this group will be deleted.')) {
      try {
        const token = localStorage.getItem('aaskitt_admin_token');
        await fetch(`${API_URL}/admin/groups/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setGroups(groups.filter(g => g._id !== id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Community Groups</h1>
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-semibold">
          Total Groups: {groups.length}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Group Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Creator</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Members</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Rules</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map(group => (
                <tr 
                  key={group._id} 
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/groups/${group._id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800">{group.name}</div>
                    <div className="text-xs text-slate-500">Invite Code: {group.inviteCode}</div>
                    {group.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {group.tags.map(t => (
                          <span key={t} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-200">#{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700">{group.creatorNickname}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded w-fit">
                      {group.members?.length || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-500 max-w-xs truncate" title={group.rules}>
                      {group.rules || 'No rules'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => navigate(`/admin/groups/${group._id}`)}
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                      title="View Details"
                    >
                      <Eye size={18} />
                      <span className="text-sm font-medium hidden sm:inline">View</span>
                    </button>
                    <button 
                      onClick={() => handleDelete(group._id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                      title="Delete Group"
                    >
                      <Trash2 size={18} />
                      <span className="text-sm font-medium hidden sm:inline">Delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    No community groups found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

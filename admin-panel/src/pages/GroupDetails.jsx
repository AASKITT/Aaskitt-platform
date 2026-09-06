import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, ArrowLeft, Users, MessageSquare, Send, ShieldX, Megaphone } from 'lucide-react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

export default function GroupDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('messages');
  const [broadcastText, setBroadcastText] = useState('');
  const [sending, setSending] = useState(false);
  const [kickingCreator, setKickingCreator] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRules, setEditRules] = useState('');
  const [editTags, setEditTags] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedNewAdmin, setSelectedNewAdmin] = useState('');
  const [transferring, setTransferring] = useState(false);
  const msgEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => { fetchGroupDetails(); }, [id]);

  // ── Live socket connection for real-time messages ──
  useEffect(() => {
    if (!id) return;
    const SOCKET_URL = API_URL.replace('/api', '');
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('newCommunityMessage', (msg) => {
      const msgGroupId = msg.groupId?._id || msg.groupId;
      if (msgGroupId?.toString() === id) {
        setMessages(prev => [...prev, msg]);
      }
    });

    socket.on('communityMessageDeleted', ({ groupId: gId, msgId }) => {
      if (gId?.toString() === id) {
        setMessages(prev => prev.filter(m => m._id !== msgId));
      }
    });

    return () => { socket.disconnect(); };
  }, [id]);

  useEffect(() => {
    if (msgEndRef.current) msgEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const token = () => localStorage.getItem('aaskitt_admin_token');

  const fetchGroupDetails = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}`, {
        headers: { 'Authorization': `Bearer ${token()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroup(data.group);
        setMessages(data.messages);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}/members/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroup(data.group);
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}/messages/${msgId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token()}` }
      });
      if (res.ok) setMessages(prev => prev.filter(m => m._id !== msgId));
    } catch (err) { console.error(err); }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm('Permanently delete this entire group and all messages?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token()}` }
      });
      if (res.ok) navigate('/admin/groups');
    } catch (err) { console.error(err); }
  };

  // ── Broadcast message as "Team Aaskitt" ──
  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token()}` },
        body: JSON.stringify({ text: broadcastText.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        setBroadcastText('');
      }
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  };

  // ── Kick Creator ──
  const handleKickCreator = async () => {
    if (!window.confirm(`Remove "${group.creatorNickname}" (Creator) from this group? They will no longer be admin.`)) return;
    setKickingCreator(true);
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}/kick-creator`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroup(data.group);
        alert(`${group.creatorNickname} has been removed from the group.`);
      }
    } catch (err) { console.error(err); }
    finally { setKickingCreator(false); }
  };

  const handleEditGroup = async (e) => {
    e.preventDefault();
    try {
      const tagsArray = editTags.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
      const res = await fetch(`${API_URL}/admin/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: editName, rules: editRules, tags: tagsArray })
      });
      const data = await res.json();
      if (data.success) {
        setGroup(data.group);
        setShowEditModal(false);
      }
    } catch (err) { console.error(err); }
  };

  const handleTransferAdmin = async (newAdminId) => {
    if (!newAdminId) return;
    setTransferring(true);
    try {
      const res = await fetch(`${API_URL}/admin/groups/${id}/transfer-admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ newAdminId }),
      });
      const data = await res.json();
      if (data.success) {
        setGroup(data.group);
        setShowTransferModal(false);
        setSelectedNewAdmin('');
      } else {
        alert(data.error || 'Failed to transfer admin');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while transferring admin');
    } finally {
      setTransferring(false);
    }
  };

  if (loading) return (
    <div className="p-8 flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!group) return <div className="p-8 text-center text-slate-500">Group not found.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
      {/* Back */}
      <button
        onClick={() => navigate('/admin/groups')}
        className="flex items-center text-slate-500 hover:text-slate-700 transition-colors w-fit"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Groups
      </button>

      {/* ── Group Header Card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            {group.dp
              ? <img src={group.dp} alt={group.name} className="w-14 h-14 rounded-full object-cover border-2 border-slate-200" />
              : (
                <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-white text-2xl font-black flex-shrink-0">
                  {group.name.charAt(0).toUpperCase()}
                </div>
              )
            }
            <div>
              <h1 className="text-2xl font-black text-slate-800">{group.name}</h1>
              <p className="text-sm text-slate-500">
                Admin: <span className="font-semibold text-slate-700">{group.creatorNickname}</span>
                <span className="mx-2 text-slate-300">·</span>
                {group.members?.length || 0} members
                <span className="mx-2 text-slate-300">·</span>
                Code: <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-xs">{group.inviteCode}</span>
              </p>
              {group.rules && (
                <p className="text-xs text-slate-400 mt-1 max-w-sm truncate">Rules: {group.rules}</p>
              )}
            </div>
          </div>

          {/* Danger actions */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => {
                setEditName(group.name || '');
                setEditRules(group.rules || '');
                setEditTags((group.tags || []).join(', '));
                setShowEditModal(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors font-semibold border border-blue-200 text-sm"
            >
              ✏️ Edit Group
            </button>
            <button
              onClick={() => {
                const otherMembers = group.members?.filter(m => m.anonymousId !== group.creatorId) || [];
                if (otherMembers.length === 0) {
                  alert('No other members available in this group to transfer admin rights to.');
                  return;
                }
                setSelectedNewAdmin(otherMembers[0].anonymousId);
                setShowTransferModal(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors font-semibold border border-purple-200 text-sm"
            >
              👑 Transfer Admin
            </button>
            <button
              onClick={handleKickCreator}
              disabled={kickingCreator}
              className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors font-semibold border border-orange-200 text-sm disabled:opacity-50"
            >
              <ShieldX size={16} />
              Kick Admin
            </button>
            <button
              onClick={handleDeleteGroup}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-semibold border border-red-200 text-sm"
            >
              <Trash2 size={16} />
              Delete Group
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs + Content ── */}
      <div className="flex flex-col gap-4">
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold transition-all text-sm ${activeTab === 'messages' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <MessageSquare size={16} />
            Messages ({messages.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold transition-all text-sm ${activeTab === 'members' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users size={16} />
            Members ({group.members?.length || 0})
          </button>
        </div>

        {/* ── MESSAGES TAB ── */}
        {activeTab === 'messages' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden" style={{ height: '60vh' }}>
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">No messages yet.</div>
              )}
              {messages.map(msg => {
                const isAdmin = msg.isAdminBroadcast || msg.anonymousId === 'team_aaskitt';
                return (
                  <div key={msg._id} className={`flex gap-3 group ${isAdmin ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${isAdmin ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      {isAdmin ? '🛡️' : msg.nickname?.charAt(0)?.toUpperCase()}
                    </div>
                    {/* Bubble */}
                    <div className={`flex flex-col gap-1 max-w-sm ${isAdmin ? 'items-end' : ''}`}>
                      <div className={`flex items-center gap-2 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                        <span className={`text-xs font-bold ${isAdmin ? 'text-blue-600' : 'text-slate-600'}`}>
                          {isAdmin ? '📢 Team Aaskitt' : msg.nickname}
                        </span>
                        <span className="text-xs text-slate-400">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`rounded-2xl px-4 py-2 text-sm ${isAdmin ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
                        {msg.tag && (
                          <span className={`inline-block text-xs px-2 py-0.5 rounded mb-1 ${isAdmin ? 'bg-blue-700 text-blue-100' : 'bg-green-100 text-green-700'}`}>#{msg.tag}</span>
                        )}
                        {msg.text && <p>{msg.text}</p>}
                        {msg.image && <img src={msg.image} alt="img" className="max-w-xs rounded-lg mt-1" />}
                      </div>
                    </div>
                    {/* Delete btn */}
                    <button
                      onClick={() => handleDeleteMessage(msg._id)}
                      className="opacity-0 group-hover:opacity-100 self-center p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all ml-auto"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>

            {/* Broadcast input */}
            <div className="border-t border-slate-100 p-3">
              <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-1 py-1 border border-blue-200">
                <div className="flex items-center gap-2 px-3">
                  <Megaphone size={16} className="text-blue-500 flex-shrink-0" />
                  <span className="text-xs font-bold text-blue-600 whitespace-nowrap">Team Aaskitt</span>
                </div>
                <form onSubmit={handleBroadcast} className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={broadcastText}
                    onChange={e => setBroadcastText(e.target.value)}
                    placeholder="Send a message to this group..."
                    className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none py-2"
                  />
                  <button
                    type="submit"
                    disabled={!broadcastText.trim() || sending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40"
                  >
                    {sending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Send size={14} />}
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── MEMBERS TAB ── */}
        {activeTab === 'members' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-500">Nickname</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-500">User ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-500">Joined</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {group.members?.map(member => {
                  const isCreator = member.anonymousId === group.creatorId;
                  return (
                    <tr key={member.anonymousId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                            {member.nickname?.charAt(0)?.toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-800">{member.nickname}</span>
                          {isCreator && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold border border-purple-200">Admin</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{member.anonymousId}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{new Date(member.joinedAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        {isCreator ? (
                          <button
                            onClick={handleKickCreator}
                            disabled={kickingCreator}
                            className="text-orange-500 hover:text-orange-700 text-sm font-semibold transition-colors flex items-center gap-1 ml-auto disabled:opacity-50"
                          >
                            <ShieldX size={14} />
                            Kick Admin
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => {
                                if (window.confirm(`Make ${member.nickname} the Group Admin?`)) {
                                  handleTransferAdmin(member.anonymousId);
                                }
                              }}
                              disabled={transferring}
                              className="text-purple-600 hover:text-purple-800 text-sm font-semibold transition-colors flex items-center gap-1"
                            >
                              👑 Make Admin
                            </button>
                            <button
                              onClick={() => handleRemoveMember(member.anonymousId)}
                              className="text-red-500 hover:text-red-700 text-sm font-semibold transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(!group.members || group.members.length === 0) && (
                  <tr><td colSpan="4" className="px-6 py-10 text-center text-slate-400">No members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit Group Modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Edit Group Details</h2>
            <form onSubmit={handleEditGroup} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Group Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rules / Description</label>
                <textarea
                  value={editRules}
                  onChange={(e) => setEditRules(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm h-24"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Topic Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="e.g. PRELIMS, MAINS, COACHING"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Transfer Admin Modal ── */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Transfer Group Admin</h2>
            <p className="text-xs text-slate-500 mb-4">
              Select another member from this group to become the new Admin/Moderator.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); handleTransferAdmin(selectedNewAdmin); }} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select New Admin</label>
                <select
                  value={selectedNewAdmin}
                  onChange={(e) => setSelectedNewAdmin(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  required
                >
                  {group.members
                    ?.filter(m => m.anonymousId !== group.creatorId)
                    .map(m => (
                      <option key={m.anonymousId} value={m.anonymousId}>
                        {m.nickname} ({m.anonymousId})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferring || !selectedNewAdmin}
                  className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {transferring ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { Trash2, Eye, MessageCircle, MapPin } from 'lucide-react';

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/posts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPosts(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this post and all its comments?')) return;
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setPosts(posts.filter(p => p._id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manage Posts</h1>
          <p className="text-slate-500 text-sm mt-1">{posts.length} posts total</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-8 text-center text-slate-500">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">No posts found.</div>
        ) : (
          posts.map(post => (
            <div key={post._id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                    {post.nickname?.substring(0,2).toUpperCase() || 'AN'}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{post.nickname || 'Anonymous'}</h3>
                    <p className="text-xs text-slate-500">{new Date(post.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs font-bold rounded-md uppercase tracking-wider ${
                  post.status === 'active' ? 'bg-green-100 text-green-700' :
                  post.status === 'reported' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {post.status}
                </span>
              </div>
              
              <div className="flex-1 bg-slate-50 p-4 rounded-xl mb-4 border border-slate-100">
                <p className="text-slate-700 text-sm">{post.content}</p>
              </div>

              <div className="flex items-center justify-between text-slate-500 text-sm mt-auto">
                <div className="flex gap-4">
                  <span className="flex items-center gap-1.5"><Eye size={16} /> {post.views}</span>
                  <span className="flex items-center gap-1.5"><MessageCircle size={16} /> {post.commentsCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={14} className="text-blue-500" />
                  <span className="text-xs">{post.location.coordinates[1].toFixed(2)}, {post.location.coordinates[0].toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => handleDelete(post._id)}
                  className="flex items-center gap-2 text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors text-sm font-semibold"
                >
                  <Trash2 size={16} /> Delete Post
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

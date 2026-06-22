import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

export default function Settings() {
  const [minVersion, setMinVersion] = useState('');
  const [playStoreUrl, setPlayStoreUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/config`);
      const data = await res.json();
      setMinVersion(data.minRequiredVersion || '');
      setPlayStoreUrl(data.playStoreUrl || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const res = await fetch(`${API_URL}/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ minRequiredVersion: minVersion, playStoreUrl })
      });
      if (res.ok) {
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setMessage('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading settings...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">App Settings (Force Update)</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <p className="text-slate-500 mb-6 text-sm">
          If you change the minimum required version here, any user with an older app version will be forced to update from the Play Store before they can use the app.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Minimum Required Version
            </label>
            <input
              type="text"
              value={minVersion}
              onChange={(e) => setMinVersion(e.target.value)}
              placeholder="e.g. 1.0.5"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800"
              required
            />
            <p className="text-xs text-slate-400 mt-1">Make sure this matches the format you set in your mobile app (e.g. x.y.z).</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Play Store Link (Permanent)
            </label>
            <input
              type="text"
              value={playStoreUrl || 'https://play.google.com/store/apps/details?id=com.aaskitt.original'}
              readOnly
              disabled
              className="w-full px-4 py-2 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">This link is permanently set to your app's Play Store page.</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>

          {message && (
            <p className="text-sm font-medium text-emerald-600 mt-2">{message}</p>
          )}
        </form>
      </div>
    </div>
  );
}

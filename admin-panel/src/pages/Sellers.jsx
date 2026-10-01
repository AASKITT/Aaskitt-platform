import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import {
  Store,
  Search,
  UserX,
  CheckCircle,
  AlertTriangle,
  Package,
  Phone,
  ExternalLink,
  Trash2,
  X,
  RotateCcw,
  Copy,
  Check,
  ShieldAlert,
  ShoppingBag,
  MapPin,
  Image as ImageIcon,
} from 'lucide-react';

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'suspended'
  const [copiedId, setCopiedId] = useState(null);

  // Kick / Suspend Modal State
  const [kickTarget, setKickTarget] = useState(null);
  const [kickReason, setKickReason] = useState('Violation of marketplace policies');
  const [kickLoading, setKickLoading] = useState(false);

  // Products Preview Modal State
  const [viewProductsSeller, setViewProductsSeller] = useState(null);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const fetchSellers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/sellers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSellers(data);
      }
    } catch (err) {
      console.error('Error fetching sellers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Kick / Suspend seller action
  const handleKickSeller = async () => {
    if (!kickTarget) return;
    try {
      setKickLoading(true);
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/sellers/${kickTarget._id}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: kickReason.trim() }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || 'Seller has been kicked and suspended. Products removed.');
        setKickTarget(null);
        fetchSellers();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to kick seller');
      }
    } catch (err) {
      console.error('Error kicking seller:', err);
      alert('Network error while kicking seller');
    } finally {
      setKickLoading(false);
    }
  };

  // Unsuspend seller action
  const handleUnsuspend = async (seller) => {
    if (!window.confirm(`Unsuspend "${seller.shopName || seller.nickname}" and restore their selling privileges?`)) return;
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/sellers/${seller._id}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        alert(`Seller "${seller.shopName}" privileges restored.`);
        fetchSellers();
      }
    } catch (err) {
      console.error('Error unsuspending seller:', err);
    }
  };

  // View seller products in modal
  const handleOpenProductsModal = async (seller) => {
    setViewProductsSeller(seller);
    setProductsLoading(true);
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/sellers/${seller._id}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSellerProducts(data.products || []);
      }
    } catch (err) {
      console.error('Error fetching seller products:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  // Delete individual product
  const handleDeleteProduct = async (productId, productName) => {
    if (!window.confirm(`Delete product "${productName}" from marketplace?`)) return;
    try {
      const token = localStorage.getItem('aaskitt_admin_token');
      const response = await fetch(`${API_URL}/admin/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setSellerProducts((prev) => prev.filter((p) => p._id !== productId));
        fetchSellers();
      }
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  // Filtering
  const filteredSellers = sellers.filter((s) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (s.shopName && s.shopName.toLowerCase().includes(q)) ||
      (s.sellerPhone && s.sellerPhone.toLowerCase().includes(q)) ||
      (s.shopLocation && s.shopLocation.toLowerCase().includes(q)) ||
      (s.nickname && s.nickname.toLowerCase().includes(q)) ||
      (s.anonymousId && s.anonymousId.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.isSeller && !s.isSellerSuspended) ||
      (statusFilter === 'suspended' && s.isSellerSuspended);

    return matchesSearch && matchesStatus;
  });

  const totalSellers = sellers.length;
  const activeSellers = sellers.filter((s) => s.isSeller && !s.isSellerSuspended).length;
  const suspendedSellers = sellers.filter((s) => s.isSellerSuspended).length;
  const totalProductsListed = sellers.reduce((acc, s) => acc + (s.productCount || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Seller Management</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Marketplace
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Manage registered shops, view shop photos, locations, WhatsApp details, listed products, and suspend sellers.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-slate-400" />
          </div>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all shadow-sm bg-white text-sm"
            placeholder="Search shop, location, phone..."
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Store size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Stores</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{totalSellers}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Stores</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-0.5">{activeSellers}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kicked / Suspended</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-0.5">{suspendedSellers}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Package size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Products Listed</p>
            <h3 className="text-2xl font-bold text-blue-600 mt-0.5">{totalProductsListed}</h3>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Sellers ({totalSellers})
        </button>
        <button
          onClick={() => setStatusFilter('active')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
            statusFilter === 'active'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Active Stores ({activeSellers})
        </button>
        <button
          onClick={() => setStatusFilter('suspended')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
            statusFilter === 'suspended'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Suspended ({suspendedSellers})
        </button>
      </div>

      {/* Sellers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-medium">Loading sellers...</div>
        ) : filteredSellers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Store size={44} className="mx-auto text-slate-300" />
            <p className="text-base font-bold text-slate-700">No sellers found</p>
            <p className="text-xs text-slate-400">
              {search ? 'Try adjusting your search criteria.' : 'When users register as sellers in the app, they will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/80 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Shop Details</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Seller User</th>
                  <th className="px-6 py-4">WhatsApp Contact</th>
                  <th className="px-6 py-4 text-center">Listed Products</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Registered Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSellers.map((seller) => {
                  const isSuspended = seller.isSellerSuspended;
                  const phoneNum = seller.sellerPhone ? seller.sellerPhone.replace(/[^0-9]/g, '') : '';

                  return (
                    <tr
                      key={seller._id}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isSuspended ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Shop Name & Image */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {seller.shopImage ? (
                            <img
                              src={seller.shopImage}
                              alt={seller.shopName}
                              className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0 shadow-sm"
                            />
                          ) : (
                            <div
                              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                isSuspended ? 'bg-rose-100 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                              }`}
                            >
                              <Store size={22} />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              {seller.shopName || 'Untitled Shop'}
                              {!isSuspended && (
                                <span title="Verified Store">
                                  <CheckCircle size={14} className="text-emerald-500" />
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400">ID: {seller._id.slice(-6)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Shop Location */}
                      <td className="px-6 py-4">
                        {seller.shopLocation ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium max-w-[200px]">
                            <MapPin size={14} className="text-rose-500 shrink-0" />
                            <span className="truncate" title={seller.shopLocation}>
                              {seller.shopLocation}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Not specified</span>
                        )}
                      </td>

                      {/* Seller User */}
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-800">{seller.nickname || 'Anonymous User'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-400 font-mono">
                              {seller.anonymousId ? `${seller.anonymousId.slice(0, 10)}...` : 'N/A'}
                            </span>
                            {seller.anonymousId && (
                              <button
                                onClick={() => copyToClipboard(seller.anonymousId, `anon-${seller._id}`)}
                                className="text-slate-400 hover:text-slate-600"
                                title="Copy anonymous ID"
                              >
                                {copiedId === `anon-${seller._id}` ? (
                                  <Check size={12} className="text-emerald-600" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* WhatsApp Phone */}
                      <td className="px-6 py-4">
                        {seller.sellerPhone ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
                              {seller.sellerPhone}
                            </span>
                            {phoneNum && (
                              <a
                                href={`https://wa.me/${phoneNum}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:text-emerald-700 p-1 hover:bg-emerald-50 rounded"
                                title="Open WhatsApp Chat"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No phone set</span>
                        )}
                      </td>

                      {/* Listed Products */}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleOpenProductsModal(seller)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200 transition-colors"
                          title="Click to view products"
                        >
                          <Package size={14} />
                          <span>{seller.productCount || 0} Products</span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {isSuspended ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <UserX size={12} /> Suspended
                            </span>
                            {seller.sellerSuspendedReason && (
                              <p className="text-[11px] text-rose-500 truncate max-w-xs" title={seller.sellerSuspendedReason}>
                                {seller.sellerSuspendedReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle size={12} /> Active Store
                          </span>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {seller.createdAt ? new Date(seller.createdAt).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isSuspended ? (
                            <button
                              onClick={() => handleUnsuspend(seller)}
                              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                              title="Restore seller account"
                            >
                              <RotateCcw size={14} />
                              <span>Unsuspend</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setKickTarget(seller)}
                              className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                              title="Kick seller and delete all their products"
                            >
                              <UserX size={14} />
                              <span>Kick Seller</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Kick / Suspend Confirmation Modal ─── */}
      {kickTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Kick & Suspend Seller</h3>
                  <p className="text-xs text-slate-400">Irreversible store removal</p>
                </div>
              </div>
              <button
                onClick={() => setKickTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 p-4 rounded-xl text-xs text-rose-800 leading-relaxed space-y-2">
              <p className="font-bold">
                Are you sure you want to kick "{kickTarget.shopName || kickTarget.nickname}"?
              </p>
              <ul className="list-disc pl-4 space-y-1 text-rose-700">
                <li>
                  <strong>All {kickTarget.productCount || 0} products</strong> listed by this seller will be immediately deleted from the marketplace.
                </li>
                <li>
                  This user will be permanently <strong>blocked from opening another store</strong> or adding new products.
                </li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Suspension Reason</label>
              <input
                type="text"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-500 outline-none"
                placeholder="e.g. Inappropriate items, scam report, fake contact..."
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setKickTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                disabled={kickLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleKickSeller}
                disabled={kickLoading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md shadow-rose-600/20 transition-all flex items-center gap-2"
              >
                {kickLoading ? (
                  <span>Kicking & Deleting Products...</span>
                ) : (
                  <>
                    <UserX size={16} />
                    <span>Kick & Remove Products</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Seller Products Preview Modal ─── */}
      {viewProductsSeller && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Package size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {viewProductsSeller.shopName || 'Store'} Products
                  </h3>
                  <p className="text-xs text-slate-400">
                    {sellerProducts.length} items listed by {viewProductsSeller.nickname}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewProductsSeller(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {productsLoading ? (
                <div className="p-8 text-center text-slate-400 font-medium">Loading products...</div>
              ) : sellerProducts.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <ShoppingBag size={40} className="mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">No products listed by this seller.</p>
                </div>
              ) : (
                sellerProducts.map((prod) => (
                  <div
                    key={prod._id}
                    className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200 gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {prod.images && prod.images.length > 0 ? (
                        <img
                          src={prod.images[0]}
                          alt={prod.name}
                          className="w-14 h-14 rounded-lg object-cover bg-white shrink-0 border border-slate-200"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                          <Package size={22} className="text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{prod.name}</p>
                        <p className="text-xs font-extrabold text-indigo-600 mt-0.5">
                          ₹{prod.price?.toLocaleString('en-IN')}
                        </p>
                        <span className="inline-block mt-1 text-[10px] font-bold bg-white text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                          {prod.category}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteProduct(prod._id, prod.name)}
                      className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                      title="Delete this product"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewProductsSeller(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');

// ─── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'Fashion',      label: 'Fashion',      subtitle: 'Clothes, Accessories & More' },
  { key: 'FMCG',         label: 'FMCG',         subtitle: 'Personal Care, Home Care & More' },
  { key: 'Electronics',  label: 'Electronics',  subtitle: 'Gadgets, Accessories & More' },
  { key: 'Grocery',      label: 'Grocery',      subtitle: 'Daily Essentials & More' },
  { key: 'Home',         label: 'Home & Living', subtitle: 'Furniture, Decor & More' },
  { key: 'Beauty',       label: 'Beauty',       subtitle: 'Makeup, Skincare & More' },
];

// ─── Global Pre-Packed Caches (Instant 0ms delivery) ────────────────────────
let PACKED_HOME_FEED = [];
let PACKED_CATEGORY_CACHE = {};   // { 'fashion': [...products], 'electronics': [...] }
let PACKED_SELLER_CACHE = {};     // { 'sellerId123': [...products] }
let lastPackTime = 0;

// Helper: check if a product is live (past its liveAt timestamp)
function isProductLive(product) {
  if (!product.liveAt) return true; // old products without liveAt are always live
  return new Date(product.liveAt) <= new Date();
}

// Enriches raw products with seller info
function enrichProducts(products, sellerMap) {
  return products.map(p => {
    const seller = sellerMap.get(p.sellerId);
    const allImages = (Array.isArray(p.images) && p.images.length > 0) ? p.images : [];
    return {
      _id: p._id.toString(),
      name: p.name || 'Product',
      price: Number(p.price) || 0,
      images: allImages,
      category: p.category || 'Fashion',
      description: p.description || '',
      sellerId: p.sellerId,
      sellerName: seller?.shopName || seller?.nickname || p.sellerName || 'Seller',
      sellerPhone: seller?.sellerPhone || p.sellerPhone || '',
      sellerLocation: seller?.shopLocation || p.sellerLocation || '',
      sellerImage: seller?.shopImage || null,
      createdAt: p.createdAt,
      liveAt: p.liveAt,
    };
  });
}

async function repackAllCaches() {
  try {
    const allProducts = await Product.find({ isActive: true, isApproved: true })
      .sort({ createdAt: -1 })
      .lean();

    if (!allProducts || allProducts.length === 0) {
      PACKED_HOME_FEED = [];
      PACKED_CATEGORY_CACHE = {};
      PACKED_SELLER_CACHE = {};
      lastPackTime = Date.now();
      return;
    }

    // Pre-fetch all sellers in bulk
    const sellerIds = [...new Set(allProducts.map(p => p.sellerId).filter(Boolean))];
    const sellers = await User.find({ anonymousId: { $in: sellerIds } }).lean();
    const sellerMap = new Map(sellers.map(s => [s.anonymousId, s]));

    const enrichedAll = enrichProducts(allProducts, sellerMap);

    // ── 1. Pack SELLER CACHE (includes ALL products, even non-live, for the seller's own view) ──
    const sellerBuckets = {};
    enrichedAll.forEach(p => {
      if (!p.sellerId) return;
      if (!sellerBuckets[p.sellerId]) sellerBuckets[p.sellerId] = [];
      sellerBuckets[p.sellerId].push(p);
    });
    PACKED_SELLER_CACHE = sellerBuckets;

    // ── 2. Filter to only LIVE products for public feeds ──
    const liveProducts = enrichedAll.filter(isProductLive);

    // ── 3. Pack CATEGORY CACHE (all live products per category, for "See All") ──
    const catBuckets = {};
    liveProducts.forEach(p => {
      const catKey = (p.category || '').toLowerCase().trim();
      if (!catBuckets[catKey]) catBuckets[catKey] = [];
      catBuckets[catKey].push(p);
    });
    PACKED_CATEGORY_CACHE = catBuckets;

    // ── 4. Pack HOME FEED (top 10 live products per category) ──
    const categoryMap = new Map();
    CATEGORIES.forEach(cat => {
      categoryMap.set(cat.key.toLowerCase(), { ...cat, products: [] });
    });

    liveProducts.forEach(p => {
      const catKey = (p.category || '').toLowerCase().trim();
      if (categoryMap.has(catKey)) {
        const group = categoryMap.get(catKey);
        if (group.products.length < 10) {
          group.products.push(p);
        }
      }
    });

    const sections = [];
    categoryMap.forEach(group => {
      if (group.products.length > 0) {
        sections.push(group);
      }
    });

    // Fallback if nothing matched categories
    if (sections.length === 0 && liveProducts.length > 0) {
      sections.push({
        key: 'Fashion',
        label: 'Trending Now',
        subtitle: 'Fresh local products',
        products: liveProducts.slice(0, 12),
      });
    }

    PACKED_HOME_FEED = sections;
    lastPackTime = Date.now();
    console.log(`⚡ ALL CACHES REPACKED: ${liveProducts.length} live / ${allProducts.length} total items, ${Object.keys(catBuckets).length} categories, ${Object.keys(sellerBuckets).length} sellers.`);
  } catch (err) {
    console.error('Error in repackAllCaches:', err);
  }
}

// Initial pack on server start
repackAllCaches();

// Auto-repack every 2 minutes to pick up newly-live products
setInterval(() => {
  repackAllCaches().catch(() => {});
}, 2 * 60 * 1000);

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/products/categories — list available categories
router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

// GET /api/products — list products (optionally filter by category)
router.get('/', async (req, res) => {
  try {
    const { category, limit = 10, skip = 0 } = req.query;
    const filter = { isActive: { $ne: false }, isApproved: { $ne: false } };
    if (category) filter.category = category;

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/home — serves pre-packed home feed instantly (0ms)
router.get('/home', async (req, res) => {
  try {
    if (req.query.refresh === 'true' || !PACKED_HOME_FEED || PACKED_HOME_FEED.length === 0) {
      await repackAllCaches();
    }
    res.json(PACKED_HOME_FEED);
  } catch (err) {
    console.error('Error serving home feed:', err);
    res.status(500).json({ error: 'Failed to fetch home feed' });
  }
});

// GET /api/products/category/:category — INSTANT pre-packed category products
router.get('/category/:category', (req, res) => {
  try {
    const catKey = (req.params.category || '').toLowerCase().trim();
    const products = PACKED_CATEGORY_CACHE[catKey] || [];
    const skip = Number(req.query.skip) || 0;
    const limit = Number(req.query.limit) || 50;
    const sliced = products.slice(skip, skip + limit);
    res.json({ products: sliced, total: products.length });
  } catch (err) {
    console.error('Error fetching category products:', err);
    res.status(500).json({ error: 'Failed to fetch category products' });
  }
});

// ─── Seller Routes ──────────────────────────────────────────────────────────

// POST /api/products/seller/register — register or update seller shop profile
router.post('/seller/register', async (req, res) => {
  try {
    const { anonymousId, shopName, phone, location, shopImage } = req.body;
    if (!anonymousId || !shopName) {
      return res.status(400).json({ error: 'anonymousId and shopName are required' });
    }

    let user = await User.findOne({ anonymousId });
    if (user && user.isSellerSuspended) {
      return res.status(403).json({
        error: 'Your seller privileges have been suspended by the administrator. You cannot register or open another store.'
      });
    }

    if (!user) {
      user = new User({ anonymousId });
    }

    user.isSeller = true;
    user.isSellerSuspended = false;
    user.shopName = shopName.trim();
    if (phone !== undefined) user.sellerPhone = phone ? phone.trim() : '';
    if (location !== undefined) user.shopLocation = location ? location.trim() : '';
    if (shopImage !== undefined) user.shopImage = shopImage;

    user.shopDetailsComplete = !!(user.shopName && user.sellerPhone && user.shopLocation);
    await user.save();
    repackAllCaches().catch(() => {});

    res.json({ success: true, user });
  } catch (err) {
    console.error('Seller registration error:', err);
    res.status(500).json({ error: 'Failed to save shop details' });
  }
});

// GET /api/products/seller/check/:anonymousId — check if user is a seller
router.get('/seller/check/:anonymousId', async (req, res) => {
  try {
    const user = await User.findOne({ anonymousId: req.params.anonymousId }).lean();
    if (!user) {
      return res.json({
        isSeller: false,
        isSuspended: false,
        shopName: null,
        sellerPhone: null,
        shopLocation: '',
        shopImage: '',
        shopDetailsComplete: false,
      });
    }
    res.json({
      isSeller: !!user.isSeller && !user.isSellerSuspended,
      isSuspended: !!user.isSellerSuspended,
      shopName: user.shopName || null,
      sellerPhone: user.sellerPhone || null,
      shopLocation: user.shopLocation || '',
      shopImage: user.shopImage || '',
      shopDetailsComplete: !!user.shopDetailsComplete && !!user.shopLocation,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check seller status' });
  }
});

// GET /api/products/seller/my/:anonymousId — INSTANT pre-packed seller products
router.get('/seller/my/:anonymousId', (req, res) => {
  try {
    const sellerId = (req.params.anonymousId || '').trim();
    // Try pre-packed cache first (0ms)
    const cached = PACKED_SELLER_CACHE[sellerId];
    if (cached) {
      // Add a "isLive" flag so the seller can see pending status
      const withStatus = cached.map(p => ({
        ...p,
        isLive: isProductLive(p),
        liveIn: !isProductLive(p)
          ? Math.max(0, Math.ceil((new Date(p.liveAt).getTime() - Date.now()) / 60000))
          : 0,
      }));
      return res.json(withStatus);
    }
    // Fallback: empty (new seller not yet in cache)
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch seller products' });
  }
});

// POST /api/products — add a new product (seller only)
router.post('/', async (req, res) => {
  try {
    const { anonymousId, category, name, description, price, images } = req.body;
    if (!anonymousId || !category || !name || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.findOne({ anonymousId });
    if (!user || !user.isSeller || user.isSellerSuspended) {
      return res.status(403).json({
        error: user?.isSellerSuspended
          ? 'Your seller account has been suspended by the administrator.'
          : 'Not registered as a seller'
      });
    }

    // Require completed shop details (location & phone) before creating product
    if (!user.shopLocation || !user.sellerPhone) {
      return res.status(400).json({
        error: 'Please complete your Shop Details (Location & WhatsApp number) before adding products.'
      });
    }

    const liveAt = new Date(Date.now() + 10 * 60 * 1000); // live in 10 minutes

    const product = new Product({
      sellerId: anonymousId,
      sellerName: user.shopName || user.nickname || 'Seller',
      sellerPhone: user.sellerPhone || '',
      sellerLocation: user.shopLocation || '',
      category,
      name,
      description: description || '',
      price: Number(price),
      images: images || [],
      liveAt,
    });

    await product.save();

    // Repack caches in background (seller cache updates instantly)
    repackAllCaches().catch(() => {});

    // Return product with live status info
    const liveInMinutes = Math.ceil((liveAt.getTime() - Date.now()) / 60000);
    res.json({
      success: true,
      product: {
        ...product.toObject(),
        _id: product._id.toString(),
        isLive: false,
        liveIn: liveInMinutes,
      },
    });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// DELETE /api/products/:id — delete a product (by seller)
router.delete('/:id', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.sellerId !== anonymousId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await Product.findByIdAndDelete(req.params.id);
    repackAllCaches().catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET /api/products/:id — single product detail (MUST be placed after specific routes)
router.get('/:id', async (req, res) => {
  try {
    if (!req.params.id || req.params.id.length !== 24) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Dynamically attach latest seller details from User model
    if (product.sellerId) {
      const seller = await User.findOne({ anonymousId: product.sellerId }).lean();
      if (seller) {
        product.sellerName = seller.shopName || seller.nickname || product.sellerName;
        product.sellerPhone = seller.sellerPhone || product.sellerPhone || '';
        product.sellerLocation = seller.shopLocation || product.sellerLocation || '';
        product.sellerImage = seller.shopImage || null;
      }
    }

    res.json(product);
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
module.exports.repackAllCaches = repackAllCaches;

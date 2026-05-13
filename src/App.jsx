import { useState, useEffect, useCallback } from "react";

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY;
const API_BASE = "/api/sheets";

const CATEGORIES = ["All", "Consumable", "Gear", "Weapon", "Armor", "Tool", "Special"];
const CAT_ICONS = { Consumable: "🧪", Gear: "🎒", Weapon: "⚔️", Armor: "🛡️", Tool: "🔧", Special: "✨", All: "🏪" };
const PRICE_DISPLAY = (p) => Number(p) === 0 ? "Free" : `${p} gp`;

// ── Google Sheets read helper ─────────────────────────────────────────────────
async function readSheet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.values || [];
}

// ── Vercel API write helper ───────────────────────────────────────────────────
async function writeAPI(action, payload) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── Parse rows from Sheets ────────────────────────────────────────────────────
function parsePlayers(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id: r[0], player: r[1] || "", character: r[2] || "", gold: Number(r[3]) || 0
  }));
}

function parseInventory(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id: r[0], name: r[1] || "", category: r[2] || "Gear",
    price: Number(r[3]) || 0, stock: Number(r[4]) || 0,
    desc: r[5] || "", available: r[6] === "YES"
  }));
}

function parseCharInventory(rows, players) {
  const ci = {};
  players.forEach(p => { ci[p.id] = []; });
  rows.slice(1).filter(r => r[0]).forEach(r => {
    const pid = r[0];
    if (!ci[pid]) ci[pid] = [];
    ci[pid].push({ name: r[1] || "", qty: Number(r[2]) || 1, desc: r[3] || "", category: r[4] || "Gear" });
  });
  return ci;
}

function parseLog(rows) {
  return rows.slice(1).filter(r => r[0]).reverse().map(r => ({
    timestamp: r[0], character: r[1], item: r[2], qty: r[3], cost: r[4], goldAfter: r[5]
  }));
}

export default function DNDShop() {
  const [players, setPlayers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [charInventories, setCharInventories] = useState({});
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [cart, setCart] = useState({});
  const [category, setCategory] = useState("All");
  const [view, setView] = useState("shop");
  const [dmPass, setDmPass] = useState("");
  const [dmUnlocked, setDmUnlocked] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [toast, setToast] = useState(null);
  const [dmTab, setDmTab] = useState("players");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dmInvPlayer, setDmInvPlayer] = useState(null);
  const [newInvItem, setNewInvItem] = useState({ name: "", qty: 1, desc: "", category: "Gear" });
  const [processing, setProcessing] = useState(false);

  // ── Load all data from Sheets ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [playerRows, invRows, charInvRows, logRows] = await Promise.all([
        readSheet("Players!A:D"),
        readSheet("Inventory!A:G"),
        readSheet("CharInventory!A:E"),
        readSheet("Log!A:F"),
      ]);
      const parsedPlayers = parsePlayers(playerRows);
      setPlayers(parsedPlayers);
      setInventory(parseInventory(invRows));
      setCharInventories(parseCharInventory(charInvRows, parsedPlayers));
      setLog(parseLog(logRows));
    } catch (e) {
      showToast("Failed to load data. Check your Sheet is shared publicly.", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Cart ──────────────────────────────────────────────────────────────────
  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ item: inventory.find(i => String(i.id) === String(id)), qty }))
    .filter(x => x.item);
  const cartTotal = cartItems.reduce((sum, { item, qty }) => sum + Number(item.price) * qty, 0);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const addToCart = (item) => {
    const current = cart[item.id] || 0;
    if (current + 1 > item.stock) { showToast("Out of stock!", "error"); return; }
    setCart(c => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
  };
  const removeFromCart = (id) => {
    setCart(c => {
      const next = { ...c };
      if (next[id] <= 1) delete next[id];
      else next[id]--;
      return next;
    });
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const checkout = async () => {
    if (!selectedPlayer) { showToast("Select a character first!", "error"); return; }
    const player = players.find(p => p.id === selectedPlayer);
    if (cartTotal > player.gold) { showToast("Not enough gold! 💸", "error"); return; }

    setProcessing(true);
    try {
      const result = await writeAPI("checkout", {
        playerId: selectedPlayer,
        cart: cartItems.map(({ item, qty }) => ({ id: item.id, qty }))
      });

      if (!result.success) { showToast(result.message || "Purchase failed!", "error"); setProcessing(false); return; }

      // Update char inventory
      const playerInv = [...(charInventories[selectedPlayer] || [])];
      cartItems.forEach(({ item, qty }) => {
        const existing = playerInv.findIndex(i => i.name === item.name);
        if (existing >= 0) playerInv[existing] = { ...playerInv[existing], qty: playerInv[existing].qty + qty };
        else playerInv.push({ name: item.name, qty, desc: item.desc, category: item.category });
      });
      await writeAPI("updateCharInventory", { playerId: selectedPlayer, items: playerInv });

      setLastReceipt({ player, items: cartItems, total: cartTotal, goldAfter: result.goldAfter });
      setCart({});
      await loadData();
      setView("receipt");
    } catch (e) {
      showToast("Something went wrong!", "error");
    }
    setProcessing(false);
  };

  const visibleItems = inventory.filter(item =>
    item.available &&
    (category === "All" || item.category === category) &&
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Styles ────────────────────────────────────────────────────────────────
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0a06; }
    .shop-root { min-height: 100vh; background: radial-gradient(ellipse at top, #1a0f00 0%, #0d0a06 60%); color: #e8d5a3; font-family: 'Crimson Text', Georgia, serif; font-size: 16px; }
    .shop-header { background: linear-gradient(180deg, #1c0d00 0%, #2a1500 100%); border-bottom: 2px solid #8B6914; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 20px rgba(0,0,0,0.8); }
    .shop-title { font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700; color: #D4AF37; text-shadow: 0 0 20px rgba(212,175,55,0.5); letter-spacing: 2px; }
    .shop-subtitle { font-size: 12px; color: #8B6914; letter-spacing: 1px; margin-top: 2px; }
    .nav-btn { background: none; border: 1px solid #8B6914; border-radius: 4px; color: #D4AF37; padding: 6px 14px; cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 1px; transition: all 0.2s; }
    .nav-btn:hover, .nav-btn.active { background: rgba(212,175,55,0.2); border-color: #D4AF37; }
    .cart-badge { background: #8B0000; color: #fff; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; display: inline-flex; align-items: center; justify-content: center; margin-left: 4px; }
    .main { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
    .loading-screen { text-align: center; padding: 80px; font-family: 'Cinzel', serif; font-size: 18px; color: #8B6914; }
    .refresh-btn { background: none; border: 1px solid #8B6914; border-radius: 4px; color: #8B6914; padding: 4px 10px; cursor: pointer; font-size: 12px; margin-left: 8px; }
    .refresh-btn:hover { color: #D4AF37; border-color: #D4AF37; }
    .player-select { background: linear-gradient(135deg, #1c0d00, #2a1500); border: 1px solid #8B6914; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .player-select-label { font-family: 'Cinzel', serif; font-size: 13px; color: #8B6914; letter-spacing: 1px; margin-right: 8px; }
    .player-chip { background: #2a1500; border: 1px solid #5c4a1a; border-radius: 20px; padding: 6px 14px; cursor: pointer; transition: all 0.2s; color: #c8a96e; font-size: 14px; }
    .player-chip:hover { border-color: #D4AF37; color: #D4AF37; }
    .player-chip.selected { background: rgba(212,175,55,0.2); border-color: #D4AF37; color: #D4AF37; }
    .player-gold { font-size: 11px; color: #8B6914; display: block; }
    .cat-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .cat-btn { background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 4px; color: #a08040; padding: 5px 12px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .cat-btn:hover, .cat-btn.active { border-color: #D4AF37; color: #D4AF37; background: rgba(212,175,55,0.15); }
    .search-bar { width: 100%; background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 4px; color: #e8d5a3; padding: 8px 12px; font-family: 'Crimson Text', serif; font-size: 15px; margin-bottom: 16px; outline: none; }
    .search-bar:focus { border-color: #8B6914; }
    .search-bar::placeholder { color: #5c4a1a; }
    .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .item-card { background: linear-gradient(160deg, #1c0d00 0%, #150900 100%); border: 1px solid #3d2a0a; border-radius: 8px; padding: 14px; transition: all 0.2s; position: relative; overflow: hidden; }
    .item-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #8B6914, transparent); }
    .item-card:hover { border-color: #8B6914; box-shadow: 0 0 20px rgba(139,105,20,0.2); }
    .item-card.out-of-stock { opacity: 0.5; }
    .item-name { font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600; color: #e8c87a; margin-bottom: 4px; }
    .item-cat { font-size: 11px; color: #8B6914; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
    .item-desc { font-size: 13px; color: #a08060; font-style: italic; margin-bottom: 10px; }
    .item-footer { display: flex; align-items: center; justify-content: space-between; }
    .item-price { font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #D4AF37; }
    .item-stock { font-size: 11px; color: #5c4a1a; margin-top: 2px; }
    .add-btn { background: linear-gradient(135deg, #8B0000, #6b0000); border: 1px solid #aa2020; color: #ffcccc; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; transition: all 0.2s; }
    .add-btn:hover { background: linear-gradient(135deg, #aa0000, #8B0000); }
    .qty-ctrl { display: flex; align-items: center; gap: 6px; }
    .qty-btn { background: #2a1500; border: 1px solid #8B6914; color: #D4AF37; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
    .qty-num { font-family: 'Cinzel', serif; font-size: 14px; color: #D4AF37; min-width: 16px; text-align: center; }
    .cart-panel { background: linear-gradient(160deg, #1c0d00, #0d0a06); border: 1px solid #8B6914; border-radius: 8px; padding: 20px; }
    .cart-title { font-family: 'Cinzel', serif; font-size: 18px; color: #D4AF37; margin-bottom: 16px; }
    .cart-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #2a1500; }
    .cart-item-name { font-size: 15px; color: #e8d5a3; }
    .cart-item-sub { font-size: 12px; color: #8B6914; }
    .cart-total { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-top: 1px solid #8B6914; margin-top: 8px; }
    .checkout-btn { width: 100%; background: linear-gradient(135deg, #8B0000, #6b0000); border: 1px solid #D4AF37; color: #D4AF37; padding: 12px; font-family: 'Cinzel', serif; font-size: 16px; letter-spacing: 2px; cursor: pointer; border-radius: 4px; margin-top: 12px; transition: all 0.2s; }
    .checkout-btn:hover { background: linear-gradient(135deg, #aa0000, #8B0000); }
    .checkout-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .empty-cart { text-align: center; color: #5c4a1a; font-style: italic; padding: 40px; font-size: 18px; }
    .receipt { background: linear-gradient(160deg, #1c0d00, #0d0a06); border: 1px solid #D4AF37; border-radius: 8px; padding: 28px; text-align: center; max-width: 480px; margin: 0 auto; }
    .receipt-seal { font-size: 48px; margin-bottom: 12px; }
    .receipt-title { font-family: 'Cinzel', serif; font-size: 22px; color: #D4AF37; margin-bottom: 4px; }
    .receipt-sub { font-size: 13px; color: #8B6914; margin-bottom: 20px; }
    .receipt-line { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #2a1500; font-size: 14px; color: #c8a96e; }
    .receipt-total { display: flex; justify-content: space-between; padding: 10px 0; font-family: 'Cinzel', serif; font-size: 16px; color: #D4AF37; border-top: 1px solid #8B6914; margin-top: 8px; }
    .back-btn { background: none; border: 1px solid #8B6914; border-radius: 4px; color: #D4AF37; padding: 8px 20px; cursor: pointer; font-family: 'Cinzel', serif; font-size: 13px; margin-top: 16px; transition: all 0.2s; margin-right: 8px; }
    .back-btn:hover { background: rgba(212,175,55,0.1); }
    .section-title { font-family: 'Cinzel', serif; font-size: 18px; color: #D4AF37; margin-bottom: 16px; }
    .inv-card { background: linear-gradient(160deg, #1c0d00, #150900); border: 1px solid #3d2a0a; border-radius: 8px; padding: 14px; position: relative; overflow: hidden; }
    .inv-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #8B6914, transparent); }
    .inv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .inv-qty-badge { font-family: 'Cinzel', serif; font-size: 20px; color: #D4AF37; font-weight: 700; }
    .inv-item-name { font-family: 'Cinzel', serif; font-size: 13px; color: #e8c87a; margin: 4px 0; }
    .inv-item-desc { font-size: 13px; color: #a08060; font-style: italic; }
    .inv-cat-tag { font-size: 11px; color: #8B6914; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
    .dm-panel { }
    .dm-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .dm-tab { background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 4px; color: #a08040; padding: 6px 16px; cursor: pointer; font-size: 13px; font-family: 'Cinzel', serif; }
    .dm-tab.active { border-color: #D4AF37; color: #D4AF37; background: rgba(212,175,55,0.1); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #2a1500; color: #D4AF37; font-family: 'Cinzel', serif; font-size: 12px; padding: 8px 10px; text-align: left; border-bottom: 1px solid #8B6914; }
    td { padding: 8px 10px; border-bottom: 1px solid #1c0d00; color: #c8a96e; }
    tr:hover td { background: rgba(212,175,55,0.05); }
    .td-input { background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 3px; color: #e8d5a3; padding: 3px 6px; font-size: 13px; width: 80px; }
    .td-select { background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 3px; color: #e8d5a3; padding: 3px 6px; font-size: 13px; }
    .save-btn { background: #1a5c1a; border: 1px solid #2a8c2a; color: #90ee90; border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
    .del-btn { background: #5c0000; border: 1px solid #8c0000; color: #ffaaaa; border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
    .edit-btn { background: #1a3a5c; border: 1px solid #2a5a8c; color: #aaccff; border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
    .add-row-btn { background: #1a3a5c; border: 1px solid #2a5a8c; color: #aaccff; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 13px; margin-top: 10px; font-family: 'Cinzel', serif; }
    .dm-login { max-width: 360px; margin: 60px auto; text-align: center; background: #1c0d00; border: 1px solid #8B6914; border-radius: 8px; padding: 32px; }
    .dm-login-title { font-family: 'Cinzel', serif; font-size: 20px; color: #D4AF37; margin-bottom: 20px; }
    .dm-login input { width: 100%; background: #0d0a06; border: 1px solid #8B6914; border-radius: 4px; color: #e8d5a3; padding: 10px; font-size: 15px; margin-bottom: 12px; outline: none; }
    .dm-login button { width: 100%; background: linear-gradient(135deg, #8B0000, #6b0000); border: 1px solid #D4AF37; color: #D4AF37; padding: 10px; font-family: 'Cinzel', serif; font-size: 14px; cursor: pointer; border-radius: 4px; }
    .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: #1c0d00; border: 1px solid #8B6914; border-radius: 6px; padding: 12px 20px; font-family: 'Cinzel', serif; font-size: 14px; color: #D4AF37; box-shadow: 0 4px 20px rgba(0,0,0,0.8); animation: slideIn 0.3s ease; }
    .toast.error { border-color: #8B0000; color: #ff8888; }
    @keyframes slideIn { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
    .log-time { font-size: 11px; color: #5c4a1a; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, #8B6914, transparent); margin: 20px 0; }
    .new-item-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 12px; background: #1c0d00; border: 1px dashed #3d2a0a; border-radius: 6px; margin-top: 10px; }
    .new-item-row input, .new-item-row select { background: #0d0a06; border: 1px solid #3d2a0a; border-radius: 3px; color: #e8d5a3; padding: 5px 8px; font-size: 13px; font-family: 'Crimson Text', serif; }
  `;

  // ── Render: Shop ──────────────────────────────────────────────────────────
  const renderShop = () => (
    <div>
      <div className="player-select">
        <span className="player-select-label">🧙 WHO ARE YOU?</span>
        {players.map(p => (
          <div key={p.id} className={`player-chip ${selectedPlayer === p.id ? "selected" : ""}`}
            onClick={() => setSelectedPlayer(p.id)}>
            <span>{p.character}</span>
            <span className="player-gold">💰 {p.gold} gp</span>
          </div>
        ))}
      </div>
      <div className="cat-bar">
        {CATEGORIES.map(c => (
          <button key={c} className={`cat-btn ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
            {CAT_ICONS[c]} {c}
          </button>
        ))}
      </div>
      <input className="search-bar" placeholder="Search items..." value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)} />
      <div className="items-grid">
        {visibleItems.map(item => {
          const inCart = cart[item.id] || 0;
          const oos = item.stock === 0;
          return (
            <div key={item.id} className={`item-card ${oos ? "out-of-stock" : ""}`}>
              <div className="item-cat">{CAT_ICONS[item.category]} {item.category}</div>
              <div className="item-name">{item.name}</div>
              <div className="item-desc">{item.desc}</div>
              <div className="item-footer">
                <div>
                  <div className="item-price">{PRICE_DISPLAY(item.price)}</div>
                  <div className="item-stock">{oos ? "❌ Out of stock" : `${item.stock} in stock`}</div>
                </div>
                {oos ? null : inCart > 0 ? (
                  <div className="qty-ctrl">
                    <button className="qty-btn" onClick={() => removeFromCart(item.id)}>−</button>
                    <span className="qty-num">{inCart}</span>
                    <button className="qty-btn" onClick={() => addToCart(item)}>+</button>
                  </div>
                ) : (
                  <button className="add-btn" onClick={() => addToCart(item)}>Add</button>
                )}
              </div>
            </div>
          );
        })}
        {visibleItems.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#5c4a1a", padding: "40px", fontStyle: "italic" }}>
            No items found.
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Cart ──────────────────────────────────────────────────────────
  const renderCart = () => {
    const player = players.find(p => p.id === selectedPlayer);
    return (
      <div className="cart-panel">
        <div className="cart-title">🛒 Your Cart</div>
        {cartItems.length === 0 ? (
          <div className="empty-cart">Your satchel is empty, adventurer.</div>
        ) : (
          <>
            {cartItems.map(({ item, qty }) => (
              <div key={item.id} className="cart-row">
                <div>
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-sub">{PRICE_DISPLAY(item.price)} each</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="qty-ctrl">
                    <button className="qty-btn" onClick={() => removeFromCart(item.id)}>−</button>
                    <span className="qty-num">{qty}</span>
                    <button className="qty-btn" onClick={() => addToCart(item)}>+</button>
                  </div>
                  <div style={{ fontFamily: "'Cinzel', serif", color: "#D4AF37", minWidth: 60, textAlign: "right" }}>
                    {Number(item.price) * qty} gp
                  </div>
                </div>
              </div>
            ))}
            <div className="cart-total">
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: "#e8d5a3" }}>Total</span>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: 20, color: "#D4AF37" }}>{cartTotal} gp</span>
            </div>
            {player && (
              <div style={{ fontSize: 13, color: cartTotal > player.gold ? "#ff8888" : "#8B6914", textAlign: "right" }}>
                {player.character} has {player.gold} gp ·{" "}
                {cartTotal > player.gold ? "⚠️ Not enough gold!" : `Remaining: ${player.gold - cartTotal} gp`}
              </div>
            )}
            <button className="checkout-btn"
              disabled={processing || !selectedPlayer || cartTotal > (players.find(p => p.id === selectedPlayer)?.gold || 0)}
              onClick={checkout}>
              {processing ? "⏳ Processing..." : "⚔ PURCHASE ⚔"}
            </button>
          </>
        )}
      </div>
    );
  };

  // ── Render: Receipt ───────────────────────────────────────────────────────
  const renderReceipt = () => lastReceipt && (
    <div className="receipt">
      <div className="receipt-seal">📜</div>
      <div className="receipt-title">Purchase Complete!</div>
      <div className="receipt-sub" style={{ marginBottom: 16 }}>
        Sold to: <strong style={{ color: "#e8c87a" }}>{lastReceipt.player.character}</strong>
      </div>
      {lastReceipt.items.map(({ item, qty }) => (
        <div key={item.id} className="receipt-line">
          <span>{item.name} × {qty}</span>
          <span>{Number(item.price) * qty} gp</span>
        </div>
      ))}
      <div className="receipt-total">
        <span>Total Paid</span><span>{lastReceipt.total} gp</span>
      </div>
      <div style={{ fontSize: 13, color: "#8B6914", marginTop: 8 }}>Gold remaining: {lastReceipt.goldAfter} gp</div>
      <br />
      <button className="back-btn" onClick={() => setView("shop")}>⬅ Return to Shop</button>
      <button className="back-btn" onClick={() => setView("bag")}>🎒 My Inventory</button>
    </div>
  );

  // ── Render: Bag ───────────────────────────────────────────────────────────
  const renderBag = () => {
    const player = players.find(p => p.id === selectedPlayer);
    const items = (selectedPlayer ? charInventories[selectedPlayer] : null) || [];
    return (
      <div>
        <div className="section-title">🎒 Character Inventory</div>
        <div className="player-select" style={{ marginBottom: 20 }}>
          <span className="player-select-label">SELECT CHARACTER:</span>
          {players.map(p => (
            <div key={p.id} className={`player-chip ${selectedPlayer === p.id ? "selected" : ""}`}
              onClick={() => setSelectedPlayer(p.id)}>
              <span>{p.character}</span>
              <span className="player-gold">💰 {p.gold} gp</span>
            </div>
          ))}
        </div>
        {!selectedPlayer ? (
          <div className="empty-cart">Select a character to view their inventory.</div>
        ) : items.length === 0 ? (
          <div className="empty-cart">{player?.character}'s pack is empty — head to the shop!</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "#8B6914", marginBottom: 12 }}>
              Showing inventory for <strong style={{ color: "#e8c87a" }}>{player?.character}</strong> — {items.length} item type{items.length !== 1 ? "s" : ""}
            </div>
            <div className="inv-grid">
              {items.map((item, idx) => (
                <div key={idx} className="inv-card">
                  <div className="inv-cat-tag">{CAT_ICONS[item.category] || "📦"} {item.category}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div className="inv-item-name">{item.name}</div>
                    <div className="inv-qty-badge">×{item.qty}</div>
                  </div>
                  <div className="inv-item-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Render: DM ────────────────────────────────────────────────────────────
  const DM_PASSWORD = "dungeonmaster";
  const renderDM = () => {
    if (!dmUnlocked) return (
      <div className="dm-login">
        <div className="dm-login-title">🔑 DM Access</div>
        <div style={{ fontSize: 14, color: "#8B6914", marginBottom: 16 }}>Default password: <em>dungeonmaster</em></div>
        <input type="password" placeholder="Enter password" value={dmPass}
          onChange={e => setDmPass(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && dmPass === DM_PASSWORD) setDmUnlocked(true); }} />
        <button onClick={() => { if (dmPass === DM_PASSWORD) setDmUnlocked(true); else showToast("Wrong password!", "error"); }}>ENTER</button>
      </div>
    );
    return (
      <div className="dm-panel">
        <div className="dm-tabs">
          {["players", "inventory", "bags", "log"].map(t => (
            <button key={t} className={`dm-tab ${dmTab === t ? "active" : ""}`} onClick={() => setDmTab(t)}>
              {t === "players" ? "👥 Players" : t === "inventory" ? "📦 Shop Stock" : t === "bags" ? "🎒 Character Bags" : "📜 Log"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="refresh-btn" onClick={loadData}>🔄 Refresh Data</button>
        </div>
        {dmTab === "players" && renderDMPlayers()}
        {dmTab === "inventory" && renderDMInventory()}
        {dmTab === "bags" && renderDMBags()}
        {dmTab === "log" && renderDMLog()}
      </div>
    );
  };

  const renderDMPlayers = () => (
    <div>
      <table>
        <thead><tr><th>Player</th><th>Character</th><th>Gold (gp)</th><th>Actions</th></tr></thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id}>
              <td>{editingPlayer?.id === p.id ? <input className="td-input" style={{ width: 100 }} value={editingPlayer.player} onChange={e => setEditingPlayer({ ...editingPlayer, player: e.target.value })} /> : p.player}</td>
              <td>{editingPlayer?.id === p.id ? <input className="td-input" style={{ width: 120 }} value={editingPlayer.character} onChange={e => setEditingPlayer({ ...editingPlayer, character: e.target.value })} /> : p.character}</td>
              <td>{editingPlayer?.id === p.id ? <input className="td-input" type="number" value={editingPlayer.gold} onChange={e => setEditingPlayer({ ...editingPlayer, gold: Number(e.target.value) })} /> : `${p.gold} gp`}</td>
              <td style={{ display: "flex", gap: 6 }}>
                {editingPlayer?.id === p.id ? (
                  <>
                    <button className="save-btn" onClick={async () => {
                      await writeAPI("updatePlayer", { id: p.id, player: editingPlayer.player, character: editingPlayer.character, gold: editingPlayer.gold });
                      setEditingPlayer(null); await loadData(); showToast("Saved!");
                    }}>Save</button>
                    <button className="del-btn" onClick={() => setEditingPlayer(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="edit-btn" onClick={() => setEditingPlayer({ ...p })}>Edit</button>
                    <button className="del-btn" onClick={async () => {
                      await writeAPI("deletePlayer", { id: p.id });
                      await loadData(); showToast("Removed!");
                    }}>Remove</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add-row-btn" onClick={async () => {
        const result = await writeAPI("addPlayer", { player: "New Player", character: "Adventurer", gold: 100 });
        await loadData();
        setEditingPlayer({ id: result.id, player: "New Player", character: "Adventurer", gold: 100 });
      }}>+ Add Player</button>
    </div>
  );

  const renderDMInventory = () => (
    <div>
      <table>
        <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Available</th><th>Actions</th></tr></thead>
        <tbody>
          {inventory.map(item => (
            <tr key={item.id}>
              <td>{editingItem?.id === item.id ? <input className="td-input" style={{ width: 160 }} value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} /> : item.name}</td>
              <td>{editingItem?.id === item.id ? <select className="td-select" value={editingItem.category} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}>{["Consumable","Gear","Weapon","Armor","Tool","Special"].map(c => <option key={c}>{c}</option>)}</select> : item.category}</td>
              <td>{editingItem?.id === item.id ? <input className="td-input" type="number" value={editingItem.price} onChange={e => setEditingItem({ ...editingItem, price: Number(e.target.value) })} /> : PRICE_DISPLAY(item.price)}</td>
              <td>{editingItem?.id === item.id ? <input className="td-input" type="number" value={editingItem.stock} onChange={e => setEditingItem({ ...editingItem, stock: Number(e.target.value) })} /> : item.stock}</td>
              <td>{editingItem?.id === item.id ? <select className="td-select" value={editingItem.available ? "YES" : "NO"} onChange={e => setEditingItem({ ...editingItem, available: e.target.value === "YES" })}><option>YES</option><option>NO</option></select> : <span style={{ color: item.available ? "#90ee90" : "#ff8888" }}>{item.available ? "YES" : "NO"}</span>}</td>
              <td style={{ display: "flex", gap: 6 }}>
                {editingItem?.id === item.id ? (
                  <>
                    <button className="save-btn" onClick={async () => {
                      await writeAPI("updateItem", { id: item.id, name: editingItem.name, category: editingItem.category, price: editingItem.price, stock: editingItem.stock, desc: editingItem.desc, available: editingItem.available });
                      setEditingItem(null); await loadData(); showToast("Saved!");
                    }}>Save</button>
                    <button className="del-btn" onClick={() => setEditingItem(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="edit-btn" onClick={() => setEditingItem({ ...item })}>Edit</button>
                    <button className="del-btn" onClick={async () => {
                      await writeAPI("deleteItem", { id: item.id });
                      await loadData(); showToast("Deleted!");
                    }}>Del</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add-row-btn" onClick={async () => {
        const result = await writeAPI("addItem", { name: "New Item", category: "Gear", price: 10, stock: 5, desc: "Description" });
        await loadData();
        setEditingItem({ id: result.id, name: "New Item", category: "Gear", price: 10, stock: 5, desc: "Description", available: true });
      }}>+ Add Item</button>
    </div>
  );

  const renderDMBags = () => {
    const playerInv = dmInvPlayer ? (charInventories[dmInvPlayer] || []) : [];
    const player = players.find(p => p.id === dmInvPlayer);

    const saveCharInv = async (updated) => {
      await writeAPI("updateCharInventory", { playerId: dmInvPlayer, items: updated });
      await loadData();
    };

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <span className="player-select-label" style={{ display: "block", marginBottom: 8 }}>SELECT CHARACTER:</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {players.map(p => (
              <div key={p.id} className={`player-chip ${dmInvPlayer === p.id ? "selected" : ""}`}
                onClick={() => setDmInvPlayer(p.id)}>{p.character}</div>
            ))}
          </div>
        </div>
        {!dmInvPlayer ? (
          <div className="empty-cart">Select a character to manage their inventory.</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "#8B6914", marginBottom: 12 }}>
              Managing: <strong style={{ color: "#e8c87a" }}>{player?.character}</strong>
            </div>
            {playerInv.length === 0 ? (
              <div style={{ color: "#5c4a1a", fontStyle: "italic", padding: "20px 0" }}>No items yet.</div>
            ) : (
              <table>
                <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Actions</th></tr></thead>
                <tbody>
                  {playerInv.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <div>{item.name}</div>
                        <div style={{ fontSize: 11, color: "#8B6914", fontStyle: "italic" }}>{item.desc}</div>
                      </td>
                      <td>{CAT_ICONS[item.category] || "📦"} {item.category}</td>
                      <td>
                        <div className="qty-ctrl">
                          <button className="qty-btn" onClick={async () => {
                            const updated = playerInv.map((it, i) => i === idx ? { ...it, qty: it.qty - 1 } : it).filter(it => it.qty > 0);
                            await saveCharInv(updated);
                          }}>−</button>
                          <span className="qty-num">{item.qty}</span>
                          <button className="qty-btn" onClick={async () => {
                            const updated = playerInv.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it);
                            await saveCharInv(updated);
                          }}>+</button>
                        </div>
                      </td>
                      <td>
                        <button className="del-btn" onClick={async () => {
                          const updated = playerInv.filter((_, i) => i !== idx);
                          await saveCharInv(updated);
                          showToast("Removed!");
                        }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="divider" />
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: "#8B6914", marginBottom: 8 }}>➕ ADD ITEM (loot, gifts, story items)</div>
            <div className="new-item-row">
              <input placeholder="Item name" value={newInvItem.name} onChange={e => setNewInvItem({ ...newInvItem, name: e.target.value })} style={{ flex: 2, minWidth: 120 }} />
              <select value={newInvItem.category} onChange={e => setNewInvItem({ ...newInvItem, category: e.target.value })}>
                {["Consumable","Gear","Weapon","Armor","Tool","Special"].map(c => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Description" value={newInvItem.desc} onChange={e => setNewInvItem({ ...newInvItem, desc: e.target.value })} style={{ flex: 3, minWidth: 140 }} />
              <input type="number" min="1" value={newInvItem.qty} onChange={e => setNewInvItem({ ...newInvItem, qty: Number(e.target.value) })} style={{ width: 60 }} />
              <button className="save-btn" style={{ padding: "5px 12px" }} onClick={async () => {
                if (!newInvItem.name.trim()) { showToast("Enter an item name!", "error"); return; }
                const existing = playerInv.findIndex(i => i.name === newInvItem.name);
                let updated;
                if (existing >= 0) updated = playerInv.map((it, i) => i === existing ? { ...it, qty: it.qty + newInvItem.qty } : it);
                else updated = [...playerInv, { ...newInvItem }];
                await saveCharInv(updated);
                setNewInvItem({ name: "", qty: 1, desc: "", category: "Gear" });
                showToast("Item added!");
              }}>Add</button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderDMLog = () => (
    <div>
      {log.length === 0
        ? <div style={{ color: "#5c4a1a", textAlign: "center", padding: 40, fontStyle: "italic" }}>No purchases yet.</div>
        : <table>
            <thead><tr><th>Time</th><th>Character</th><th>Item</th><th>Qty</th><th>Cost</th><th>Gold After</th></tr></thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={i}>
                  <td className="log-time">{l.timestamp}</td>
                  <td>{l.character}</td><td>{l.item}</td>
                  <td style={{ textAlign: "center" }}>{l.qty}</td>
                  <td>{l.cost} gp</td>
                  <td style={{ color: "#D4AF37" }}>{l.goldAfter} gp</td>
                </tr>
              ))}
            </tbody>
          </table>
      }
      {log.length > 0 && (
        <button className="del-btn" style={{ marginTop: 10 }} onClick={async () => {
          await writeAPI("clearLog", {});
          await loadData(); showToast("Log cleared!");
        }}>Clear Log</button>
      )}
    </div>
  );

  // ── Root ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="shop-root">
      <style>{styles}</style>
      <div className="loading-screen">⚔ Loading The Wandering Merchant...</div>
    </div>
  );

  return (
    <div className="shop-root">
      <style>{styles}</style>
      <header className="shop-header">
        <div>
          <div className="shop-title">⚔ THE WANDERING MERCHANT ⚔</div>
          <div className="shop-subtitle">FINE GOODS FOR ADVENTURERS OF ALL SORTS</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={`nav-btn ${view === "shop" ? "active" : ""}`} onClick={() => setView("shop")}>Shop</button>
          <button className={`nav-btn ${view === "cart" ? "active" : ""}`} onClick={() => setView("cart")}>
            Cart {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
          <button className={`nav-btn ${view === "bag" ? "active" : ""}`} onClick={() => setView("bag")}>🎒 My Inventory</button>
          <button className={`nav-btn ${view === "dm" ? "active" : ""}`} onClick={() => setView("dm")}>DM</button>
        </div>
      </header>
      <div className="main">
        {view === "shop" && renderShop()}
        {view === "cart" && renderCart()}
        {view === "receipt" && renderReceipt()}
        {view === "bag" && renderBag()}
        {view === "dm" && renderDM()}
      </div>
      {toast && <div className={`toast ${toast.type === "error" ? "error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}

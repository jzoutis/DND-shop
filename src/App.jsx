import { useState, useEffect } from "react";

const DEFAULT_PLAYERS = [
  { id: 1, player: "Alice",  character: "Arannis",     gold: 150 },
  { id: 2, player: "Bob",    character: "Gornak",      gold: 200 },
  { id: 3, player: "Carol",  character: "Seraphina",   gold: 120 },
  { id: 4, player: "Dave",   character: "Thistlewick", gold: 80  },
];

const DEFAULT_INVENTORY = [
  { id: 1,  name: "Health Potion",         category: "Consumable", price: 50,  stock: 10, desc: "Restores 2d4+2 HP",                available: true },
  { id: 2,  name: "Greater Health Potion", category: "Consumable", price: 100, stock: 5,  desc: "Restores 4d4+4 HP",                available: true },
  { id: 3,  name: "Antitoxin",             category: "Consumable", price: 50,  stock: 6,  desc: "Advantage vs. poison for 1 hour",  available: true },
  { id: 4,  name: "Rations (1 day)",       category: "Gear",       price: 0,   stock: 30, desc: "Trail rations",                    available: true },
  { id: 5,  name: "Rope (50 ft)",          category: "Gear",       price: 1,   stock: 20, desc: "Hempen rope",                      available: true },
  { id: 6,  name: "Torch",                 category: "Gear",       price: 0,   stock: 50, desc: "Burns 1 hr, 20 ft bright light",   available: true },
  { id: 7,  name: "Dagger",               category: "Weapon",     price: 2,   stock: 8,  desc: "1d4 piercing, finesse, thrown",    available: true },
  { id: 8,  name: "Shortsword",           category: "Weapon",     price: 10,  stock: 4,  desc: "1d6 piercing, finesse",            available: true },
  { id: 9,  name: "Handaxe",              category: "Weapon",     price: 5,   stock: 6,  desc: "1d6 slashing, thrown",             available: true },
  { id: 10, name: "Leather Armor",        category: "Armor",      price: 10,  stock: 3,  desc: "AC 11 + Dex modifier",             available: true },
  { id: 11, name: "Shield",               category: "Armor",      price: 10,  stock: 4,  desc: "+2 AC",                            available: true },
  { id: 12, name: "Thieves' Tools",       category: "Tool",       price: 25,  stock: 2,  desc: "Required for lockpicking",         available: true },
  { id: 13, name: "Spell Component Pouch",category: "Tool",       price: 25,  stock: 3,  desc: "Holds material components",        available: true },
  { id: 14, name: "Lantern (Hooded)",     category: "Gear",       price: 5,   stock: 5,  desc: "60 ft bright, 6 hr per oil flask", available: true },
  { id: 15, name: "Flask of Oil",         category: "Consumable", price: 0,   stock: 15, desc: "Fuel for lanterns",                available: true },
  { id: 16, name: "Mysterious Elixir",    category: "Special",    price: 200, stock: 1,  desc: "Unknown effects... are you brave?",available: true },
];

const CATEGORIES = ["All", "Consumable", "Gear", "Weapon", "Armor", "Tool", "Special"];

const CAT_ICONS = {
  Consumable: "🧪", Gear: "🎒", Weapon: "⚔️", Armor: "🛡️", Tool: "🔧", Special: "✨", All: "🏪"
};

const PRICE_DISPLAY = (p) => p === 0 ? "Free" : `${p} gp`;

export default function DNDShop() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [inventory, setInventory] = useState(DEFAULT_INVENTORY);
  const [log, setLog] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [cart, setCart] = useState({});
  const [category, setCategory] = useState("All");
  const [view, setView] = useState("shop"); // shop | cart | receipt | dm
  const [dmPass, setDmPass] = useState("");
  const [dmUnlocked, setDmUnlocked] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [toast, setToast] = useState(null);
  const [dmTab, setDmTab] = useState("players");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Load from localStorage
  useEffect(() => {
    try {
      const p = localStorage.getItem("dnd-players");
      if (p) setPlayers(JSON.parse(p));
    } catch {}
    try {
      const i = localStorage.getItem("dnd-inventory");
      if (i) setInventory(JSON.parse(i));
    } catch {}
    try {
      const l = localStorage.getItem("dnd-log");
      if (l) setLog(JSON.parse(l));
    } catch {}
  }, []);

  const savePlayers = (p) => {
    setPlayers(p);
    try { localStorage.setItem("dnd-players", JSON.stringify(p)); } catch {}
  };
  const saveInventory = (inv) => {
    setInventory(inv);
    try { localStorage.setItem("dnd-inventory", JSON.stringify(inv)); } catch {}
  };
  const saveLog = (l) => {
    setLog(l);
    try { localStorage.setItem("dnd-log", JSON.stringify(l)); } catch {}
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ item: inventory.find(i => i.id === Number(id)), qty }))
    .filter(x => x.item);

  const cartTotal = cartItems.reduce((sum, { item, qty }) => sum + item.price * qty, 0);
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

  const checkout = () => {
    if (!selectedPlayer) { showToast("Select a character first!", "error"); return; }
    const player = players.find(p => p.id === selectedPlayer);
    if (cartTotal > player.gold) { showToast("Not enough gold! 💸", "error"); return; }

    const newInventory = inventory.map(item => {
      const qty = cart[item.id] || 0;
      return qty > 0 ? { ...item, stock: item.stock - qty } : item;
    });
    const newPlayers = players.map(p =>
      p.id === selectedPlayer ? { ...p, gold: p.gold - cartTotal } : p
    );
    const timestamp = new Date().toLocaleString();
    const entries = cartItems.map(({ item, qty }) => ({
      timestamp, character: player.character, item: item.name, qty,
      cost: item.price * qty, goldAfter: player.gold - cartTotal
    }));
    const newLog = [...entries, ...log].slice(0, 200);

    savePlayers(newPlayers);
    saveInventory(newInventory);
    saveLog(newLog);

    setLastReceipt({
      player, items: cartItems, total: cartTotal,
      goldBefore: player.gold, goldAfter: player.gold - cartTotal, timestamp
    });
    setCart({});
    setView("receipt");
  };

  const visibleItems = inventory.filter(item =>
    item.available &&
    (category === "All" || item.category === category) &&
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=MedievalSharp&family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0a06; }
    .shop-root {
      min-height: 100vh;
      background: radial-gradient(ellipse at top, #1a0f00 0%, #0d0a06 60%);
      color: #e8d5a3;
      font-family: 'Crimson Text', Georgia, serif;
      font-size: 16px;
    }
    .shop-header {
      background: linear-gradient(180deg, #1c0d00 0%, #2a1500 100%);
      border-bottom: 2px solid #8B6914;
      padding: 16px 24px;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 100;
      box-shadow: 0 4px 20px rgba(0,0,0,0.8);
    }
    .shop-title {
      font-family: 'Cinzel', serif;
      font-size: 22px; font-weight: 700;
      color: #D4AF37;
      text-shadow: 0 0 20px rgba(212,175,55,0.5);
      letter-spacing: 2px;
    }
    .shop-subtitle { font-size: 12px; color: #8B6914; letter-spacing: 1px; margin-top: 2px; }
    .nav-btn {
      background: none; border: 1px solid #8B6914; border-radius: 4px;
      color: #D4AF37; padding: 6px 14px; cursor: pointer;
      font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 1px;
      transition: all 0.2s;
    }
    .nav-btn:hover { background: rgba(212,175,55,0.15); }
    .nav-btn.active { background: rgba(212,175,55,0.2); border-color: #D4AF37; }
    .cart-badge {
      background: #8B0000; color: #fff; border-radius: 50%;
      width: 18px; height: 18px; font-size: 10px;
      display: inline-flex; align-items: center; justify-content: center;
      margin-left: 4px; font-family: 'Cinzel', serif;
    }
    .main { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
    
    .player-select {
      background: linear-gradient(135deg, #1c0d00, #2a1500);
      border: 1px solid #8B6914; border-radius: 8px;
      padding: 16px; margin-bottom: 20px;
      display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    }
    .player-select-label {
      font-family: 'Cinzel', serif; font-size: 13px; color: #8B6914;
      letter-spacing: 1px; margin-right: 8px;
    }
    .player-chip {
      background: #2a1500; border: 1px solid #5c4a1a;
      border-radius: 20px; padding: 6px 14px; cursor: pointer;
      transition: all 0.2s; color: #c8a96e; font-size: 14px;
    }
    .player-chip:hover { border-color: #D4AF37; color: #D4AF37; }
    .player-chip.selected {
      background: rgba(212,175,55,0.2); border-color: #D4AF37;
      color: #D4AF37;
    }
    .player-gold { font-size: 11px; color: #8B6914; display: block; }

    .cat-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .cat-btn {
      background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 4px;
      color: #a08040; padding: 5px 12px; cursor: pointer; font-size: 13px;
      transition: all 0.2s;
    }
    .cat-btn:hover { border-color: #D4AF37; color: #D4AF37; }
    .cat-btn.active { background: rgba(212,175,55,0.15); border-color: #D4AF37; color: #D4AF37; }

    .search-bar {
      width: 100%; background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 4px;
      color: #e8d5a3; padding: 8px 12px; font-family: 'Crimson Text', serif; font-size: 15px;
      margin-bottom: 16px; outline: none;
    }
    .search-bar:focus { border-color: #8B6914; }
    .search-bar::placeholder { color: #5c4a1a; }

    .items-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .item-card {
      background: linear-gradient(160deg, #1c0d00 0%, #150900 100%);
      border: 1px solid #3d2a0a; border-radius: 8px;
      padding: 14px; transition: all 0.2s; position: relative;
      overflow: hidden;
    }
    .item-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, #8B6914, transparent);
    }
    .item-card:hover { border-color: #8B6914; box-shadow: 0 0 20px rgba(139,105,20,0.2); }
    .item-card.out-of-stock { opacity: 0.5; }
    .item-name {
      font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600;
      color: #e8c87a; margin-bottom: 4px;
    }
    .item-cat {
      font-size: 11px; color: #8B6914; letter-spacing: 1px; text-transform: uppercase;
      margin-bottom: 6px;
    }
    .item-desc { font-size: 13px; color: #a08060; font-style: italic; margin-bottom: 10px; }
    .item-footer { display: flex; align-items: center; justify-content: space-between; }
    .item-price {
      font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #D4AF37;
    }
    .item-stock { font-size: 11px; color: #5c4a1a; margin-top: 2px; }
    .add-btn {
      background: linear-gradient(135deg, #8B0000, #6b0000); border: 1px solid #aa2020;
      color: #ffcccc; border-radius: 4px; padding: 5px 12px; cursor: pointer;
      font-family: 'Cinzel', serif; font-size: 12px; transition: all 0.2s;
    }
    .add-btn:hover { background: linear-gradient(135deg, #aa0000, #8B0000); }
    .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .qty-ctrl { display: flex; align-items: center; gap: 6px; }
    .qty-btn {
      background: #2a1500; border: 1px solid #8B6914; color: #D4AF37;
      width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
      font-size: 16px; display: flex; align-items: center; justify-content: center;
    }
    .qty-num { font-family: 'Cinzel', serif; font-size: 14px; color: #D4AF37; min-width: 16px; text-align: center; }

    .cart-panel {
      background: linear-gradient(160deg, #1c0d00, #0d0a06);
      border: 1px solid #8B6914; border-radius: 8px; padding: 20px;
    }
    .cart-title { font-family: 'Cinzel', serif; font-size: 18px; color: #D4AF37; margin-bottom: 16px; }
    .cart-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0; border-bottom: 1px solid #2a1500;
    }
    .cart-item-name { font-size: 15px; color: #e8d5a3; }
    .cart-item-sub { font-size: 12px; color: #8B6914; }
    .cart-total {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 0; border-top: 1px solid #8B6914; margin-top: 8px;
    }
    .cart-total-label { font-family: 'Cinzel', serif; font-size: 16px; color: #e8d5a3; }
    .cart-total-num { font-family: 'Cinzel', serif; font-size: 20px; color: #D4AF37; }
    .checkout-btn {
      width: 100%; background: linear-gradient(135deg, #8B0000, #6b0000);
      border: 1px solid #D4AF37; color: #D4AF37; padding: 12px;
      font-family: 'Cinzel', serif; font-size: 16px; letter-spacing: 2px;
      cursor: pointer; border-radius: 4px; margin-top: 12px; transition: all 0.2s;
    }
    .checkout-btn:hover { background: linear-gradient(135deg, #aa0000, #8B0000); }
    .checkout-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .empty-cart { text-align: center; color: #5c4a1a; font-style: italic; padding: 40px; font-size: 18px; }

    .receipt {
      background: linear-gradient(160deg, #1c0d00, #0d0a06);
      border: 1px solid #D4AF37; border-radius: 8px; padding: 28px; text-align: center;
      max-width: 480px; margin: 0 auto;
    }
    .receipt-seal { font-size: 48px; margin-bottom: 12px; }
    .receipt-title { font-family: 'Cinzel', serif; font-size: 22px; color: #D4AF37; margin-bottom: 4px; }
    .receipt-sub { font-size: 13px; color: #8B6914; margin-bottom: 20px; }
    .receipt-line {
      display: flex; justify-content: space-between;
      padding: 6px 0; border-bottom: 1px solid #2a1500; font-size: 14px; color: #c8a96e;
    }
    .receipt-total {
      display: flex; justify-content: space-between;
      padding: 10px 0; font-family: 'Cinzel', serif; font-size: 16px;
      color: #D4AF37; border-top: 1px solid #8B6914; margin-top: 8px;
    }
    .receipt-gold-left { font-size: 13px; color: #8B6914; margin-top: 8px; }
    .back-btn {
      background: none; border: 1px solid #8B6914; border-radius: 4px;
      color: #D4AF37; padding: 8px 20px; cursor: pointer;
      font-family: 'Cinzel', serif; font-size: 13px; margin-top: 16px;
      transition: all 0.2s;
    }
    .back-btn:hover { background: rgba(212,175,55,0.1); }

    .dm-panel { }
    .dm-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
    .dm-tab {
      background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 4px;
      color: #a08040; padding: 6px 16px; cursor: pointer; font-size: 13px;
      font-family: 'Cinzel', serif;
    }
    .dm-tab.active { border-color: #D4AF37; color: #D4AF37; background: rgba(212,175,55,0.1); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #2a1500; color: #D4AF37; font-family: 'Cinzel', serif; font-size: 12px;
      padding: 8px 10px; text-align: left; border-bottom: 1px solid #8B6914; }
    td { padding: 8px 10px; border-bottom: 1px solid #1c0d00; color: #c8a96e; }
    tr:hover td { background: rgba(212,175,55,0.05); }
    .td-input {
      background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 3px;
      color: #e8d5a3; padding: 3px 6px; font-size: 13px; width: 80px;
    }
    .save-btn {
      background: #1a5c1a; border: 1px solid #2a8c2a; color: #90ee90;
      border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 12px;
    }
    .del-btn {
      background: #5c0000; border: 1px solid #8c0000; color: #ffaaaa;
      border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 12px;
    }
    .add-row-btn {
      background: #1a3a5c; border: 1px solid #2a5a8c; color: #aaccff;
      border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 13px;
      margin-top: 10px; font-family: 'Cinzel', serif;
    }
    .dm-login {
      max-width: 360px; margin: 60px auto; text-align: center;
      background: #1c0d00; border: 1px solid #8B6914; border-radius: 8px; padding: 32px;
    }
    .dm-login-title { font-family: 'Cinzel', serif; font-size: 20px; color: #D4AF37; margin-bottom: 20px; }
    .dm-login input {
      width: 100%; background: #0d0a06; border: 1px solid #8B6914; border-radius: 4px;
      color: #e8d5a3; padding: 10px; font-size: 15px; margin-bottom: 12px; outline: none;
    }
    .dm-login button {
      width: 100%; background: linear-gradient(135deg, #8B0000, #6b0000);
      border: 1px solid #D4AF37; color: #D4AF37; padding: 10px;
      font-family: 'Cinzel', serif; font-size: 14px; cursor: pointer; border-radius: 4px;
    }
    .badge-new {
      font-size: 10px; background: #D4AF37; color: #1c0d00;
      border-radius: 3px; padding: 1px 5px; margin-left: 6px;
      font-family: 'Cinzel', serif; font-weight: 700; vertical-align: middle;
    }
    .toast {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: #1c0d00; border: 1px solid #8B6914; border-radius: 6px;
      padding: 12px 20px; font-family: 'Cinzel', serif; font-size: 14px;
      color: #D4AF37; box-shadow: 0 4px 20px rgba(0,0,0,0.8);
      animation: slideIn 0.3s ease;
    }
    .toast.error { border-color: #8B0000; color: #ff8888; }
    @keyframes slideIn { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, #8B6914, transparent); margin: 20px 0; }
    .inline-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
    .inline-form input, .inline-form select {
      background: #1c0d00; border: 1px solid #3d2a0a; border-radius: 3px;
      color: #e8d5a3; padding: 5px 8px; font-size: 13px;
    }
    select { background: #1c0d00; }
    .log-time { font-size: 11px; color: #5c4a1a; }
  `;

  const renderShop = () => (
    <div>
      <div className="player-select">
        <span className="player-select-label">🧙 WHO ARE YOU?</span>
        {players.map(p => (
          <div key={p.id}
            className={`player-chip ${selectedPlayer === p.id ? "selected" : ""}`}
            onClick={() => setSelectedPlayer(p.id)}
          >
            <span>{p.character}</span>
            <span className="player-gold">💰 {p.gold} gp</span>
          </div>
        ))}
      </div>

      <div className="cat-bar">
        {CATEGORIES.map(c => (
          <button key={c} className={`cat-btn ${category === c ? "active" : ""}`}
            onClick={() => setCategory(c)}>
            {CAT_ICONS[c]} {c}
          </button>
        ))}
      </div>

      <input className="search-bar" placeholder="Search items..." value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)} />

      <div className="items-grid">
        {visibleItems.map(item => {
          const inCart = cart[item.id] || 0;
          const outOfStock = item.stock === 0;
          return (
            <div key={item.id} className={`item-card ${outOfStock ? "out-of-stock" : ""}`}>
              <div className="item-cat">{CAT_ICONS[item.category]} {item.category}</div>
              <div className="item-name">{item.name}</div>
              <div className="item-desc">{item.desc}</div>
              <div className="item-footer">
                <div>
                  <div className="item-price">{PRICE_DISPLAY(item.price)}</div>
                  <div className="item-stock">
                    {outOfStock ? "❌ Out of stock" : `${item.stock} in stock`}
                  </div>
                </div>
                {outOfStock ? null : inCart > 0 ? (
                  <div className="qty-ctrl">
                    <button className="qty-btn" onClick={() => removeFromCart(item.id)}>−</button>
                    <span className="qty-num">{inCart}</span>
                    <button className="qty-btn" onClick={() => addToCart(item)}>+</button>
                  </div>
                ) : (
                  <button className="add-btn" disabled={outOfStock} onClick={() => addToCart(item)}>
                    Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {visibleItems.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#5c4a1a", padding: "40px", fontStyle: "italic" }}>
            No items found in this category.
          </div>
        )}
      </div>
    </div>
  );

  const renderCart = () => (
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
                  {item.price * qty} gp
                </div>
              </div>
            </div>
          ))}
          <div className="cart-total">
            <span className="cart-total-label">Total</span>
            <span className="cart-total-num">{cartTotal} gp</span>
          </div>
          {selectedPlayer && (() => {
            const p = players.find(x => x.id === selectedPlayer);
            return <div style={{ fontSize: 13, color: cartTotal > p.gold ? "#ff8888" : "#8B6914", textAlign: "right" }}>
              {p.character} has {p.gold} gp · {cartTotal > p.gold ? "⚠️ Not enough gold!" : `Remaining: ${p.gold - cartTotal} gp`}
            </div>;
          })()}
          <button className="checkout-btn"
            disabled={!selectedPlayer || cartTotal > (players.find(p => p.id === selectedPlayer)?.gold || 0)}
            onClick={checkout}>
            ⚔ PURCHASE ⚔
          </button>
        </>
      )}
    </div>
  );

  const renderReceipt = () => lastReceipt && (
    <div className="receipt">
      <div className="receipt-seal">📜</div>
      <div className="receipt-title">Purchase Complete!</div>
      <div className="receipt-sub">{lastReceipt.timestamp}</div>
      <div className="receipt-sub" style={{ marginBottom: 16 }}>
        Sold to: <strong style={{ color: "#e8c87a" }}>{lastReceipt.player.character}</strong>
      </div>
      {lastReceipt.items.map(({ item, qty }) => (
        <div key={item.id} className="receipt-line">
          <span>{item.name} × {qty}</span>
          <span>{item.price * qty} gp</span>
        </div>
      ))}
      <div className="receipt-total">
        <span>Total Paid</span><span>{lastReceipt.total} gp</span>
      </div>
      <div className="receipt-gold-left">
        Gold remaining: {lastReceipt.goldAfter} gp
      </div>
      <br />
      <button className="back-btn" onClick={() => setView("shop")}>⬅ Return to Shop</button>
    </div>
  );

  const DM_PASSWORD = "dungeonmaster";
  const renderDM = () => {
    if (!dmUnlocked) return (
      <div className="dm-login">
        <div className="dm-login-title">🔑 DM Access</div>
        <div style={{ fontSize: 14, color: "#8B6914", marginBottom: 16 }}>
          Default password: <em>dungeonmaster</em>
        </div>
        <input type="password" placeholder="Enter password"
          value={dmPass} onChange={e => setDmPass(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && dmPass === DM_PASSWORD) setDmUnlocked(true); }}
        />
        <button onClick={() => { if (dmPass === DM_PASSWORD) setDmUnlocked(true); else showToast("Wrong password!", "error"); }}>
          ENTER
        </button>
      </div>
    );

    return (
      <div className="dm-panel">
        <div className="dm-tabs">
          {["players", "inventory", "log"].map(t => (
            <button key={t} className={`dm-tab ${dmTab === t ? "active" : ""}`} onClick={() => setDmTab(t)}>
              {t === "players" ? "👥 Players" : t === "inventory" ? "📦 Inventory" : "📜 Log"}
            </button>
          ))}
        </div>

        {dmTab === "players" && (
          <div>
            <table>
              <thead><tr><th>Player</th><th>Character</th><th>Gold (gp)</th><th>Actions</th></tr></thead>
              <tbody>
                {players.map(p => (
                  <tr key={p.id}>
                    <td>{editingPlayer?.id === p.id
                      ? <input className="td-input" style={{ width: 100 }} value={editingPlayer.player}
                          onChange={e => setEditingPlayer({ ...editingPlayer, player: e.target.value })} />
                      : p.player}</td>
                    <td>{editingPlayer?.id === p.id
                      ? <input className="td-input" style={{ width: 120 }} value={editingPlayer.character}
                          onChange={e => setEditingPlayer({ ...editingPlayer, character: e.target.value })} />
                      : p.character}</td>
                    <td>{editingPlayer?.id === p.id
                      ? <input className="td-input" type="number" value={editingPlayer.gold}
                          onChange={e => setEditingPlayer({ ...editingPlayer, gold: Number(e.target.value) })} />
                      : `${p.gold} gp`}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {editingPlayer?.id === p.id ? (
                        <>
                          <button className="save-btn" onClick={() => {
                            savePlayers(players.map(x => x.id === p.id ? editingPlayer : x));
                            setEditingPlayer(null); showToast("Saved!");
                          }}>Save</button>
                          <button className="del-btn" onClick={() => setEditingPlayer(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="save-btn" onClick={() => setEditingPlayer({ ...p })}>Edit</button>
                          <button className="del-btn" onClick={() => {
                            savePlayers(players.filter(x => x.id !== p.id));
                            showToast("Player removed!");
                          }}>Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-row-btn" onClick={() => {
              const newP = { id: Date.now(), player: "New Player", character: "Adventurer", gold: 100 };
              savePlayers([...players, newP]);
              setEditingPlayer(newP);
            }}>+ Add Player</button>
          </div>
        )}

        {dmTab === "inventory" && (
          <div>
            <table>
              <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Available</th><th>Actions</th></tr></thead>
              <tbody>
                {inventory.map(item => (
                  <tr key={item.id}>
                    <td>{editingItem?.id === item.id
                      ? <input className="td-input" style={{ width: 160 }} value={editingItem.name}
                          onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} />
                      : item.name}</td>
                    <td>{editingItem?.id === item.id
                      ? <select className="td-input" value={editingItem.category}
                          onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}>
                          {["Consumable","Gear","Weapon","Armor","Tool","Special"].map(c => <option key={c}>{c}</option>)}
                        </select>
                      : item.category}</td>
                    <td>{editingItem?.id === item.id
                      ? <input className="td-input" type="number" value={editingItem.price}
                          onChange={e => setEditingItem({ ...editingItem, price: Number(e.target.value) })} />
                      : PRICE_DISPLAY(item.price)}</td>
                    <td>{editingItem?.id === item.id
                      ? <input className="td-input" type="number" value={editingItem.stock}
                          onChange={e => setEditingItem({ ...editingItem, stock: Number(e.target.value) })} />
                      : item.stock}</td>
                    <td>
                      {editingItem?.id === item.id
                        ? <select className="td-input" value={editingItem.available ? "YES" : "NO"}
                            onChange={e => setEditingItem({ ...editingItem, available: e.target.value === "YES" })}>
                            <option>YES</option><option>NO</option>
                          </select>
                        : <span style={{ color: item.available ? "#90ee90" : "#ff8888" }}>{item.available ? "YES" : "NO"}</span>}
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {editingItem?.id === item.id ? (
                        <>
                          <button className="save-btn" onClick={() => {
                            saveInventory(inventory.map(x => x.id === item.id ? editingItem : x));
                            setEditingItem(null); showToast("Item saved!");
                          }}>Save</button>
                          <button className="del-btn" onClick={() => setEditingItem(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="save-btn" onClick={() => setEditingItem({ ...item })}>Edit</button>
                          <button className="del-btn" onClick={() => {
                            saveInventory(inventory.filter(x => x.id !== item.id));
                            showToast("Item removed!");
                          }}>Del</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-row-btn" onClick={() => {
              const ni = { id: Date.now(), name: "New Item", category: "Gear", price: 10, stock: 5, desc: "Description", available: true };
              saveInventory([...inventory, ni]);
              setEditingItem(ni);
            }}>+ Add Item</button>
          </div>
        )}

        {dmTab === "log" && (
          <div>
            {log.length === 0
              ? <div style={{ color: "#5c4a1a", textAlign: "center", padding: 40, fontStyle: "italic" }}>No purchases yet.</div>
              : <table>
                  <thead><tr><th>Time</th><th>Character</th><th>Item</th><th>Qty</th><th>Cost</th><th>Gold After</th></tr></thead>
                  <tbody>
                    {log.map((l, i) => (
                      <tr key={i}>
                        <td className="log-time">{l.timestamp}</td>
                        <td>{l.character}</td>
                        <td>{l.item}</td>
                        <td style={{ textAlign: "center" }}>{l.qty}</td>
                        <td>{l.cost} gp</td>
                        <td style={{ color: "#D4AF37" }}>{l.goldAfter} gp</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
            {log.length > 0 && (
              <button className="del-btn" style={{ marginTop: 10 }} onClick={() => { saveLog([]); showToast("Log cleared!"); }}>
                Clear Log
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

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
          <button className={`nav-btn ${view === "dm" ? "active" : ""}`} onClick={() => setView("dm")}>DM</button>
        </div>
      </header>

      <div className="main">
        {view === "shop" && renderShop()}
        {view === "cart" && renderCart()}
        {view === "receipt" && renderReceipt()}
        {view === "dm" && renderDM()}
      </div>

      {toast && <div className={`toast ${toast.type === "error" ? "error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}

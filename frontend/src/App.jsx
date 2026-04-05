import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Rocket, Cpu, Cloud, Activity, HeartPulse, X, Maximize2, Zap, BarChart3, PieChart, Edit2, Trash2 } from 'lucide-react';

const ICON_MAP = {
  "SEMICONDUCTORS": <Cpu size={14} />,
  "CLOUD SERVICES": <Cloud size={14} />,
  "FIBER OPTICS": <Activity size={14} />,
  "HEALTHCARE": <HeartPulse size={14} />,
  "ENERGY": <Zap size={14} />,
  "ANALYTICS": <BarChart3 size={14} />
};

const DEFAULT_CATEGORIES = {
  "SEMICONDUCTORS": {
    label: "半導體",
    symbols: ["NVDA", "AMD", "TSM"],
    iconKey: "SEMICONDUCTORS"
  },
  "CLOUD SERVICES": {
    label: "雲端業者",
    symbols: ["MSFT", "GOOGL", "ORCL", "AMZN"],
    iconKey: "CLOUD SERVICES"
  },
  "FIBER OPTICS": {
    label: "光纖通訊",
    symbols: ["LITE", "COHR"],
    iconKey: "FIBER OPTICS"
  },
  "HEALTHCARE": {
    label: "醫療保險",
    symbols: ["UNH", "OSCR"],
    iconKey: "HEALTHCARE"
  }
};

const DEFAULT_FALLBACK_DATA = {
  "NVDA": { "price": 903.56, "change": 5.25, "growth": 126.0, "pe": 45.2, "mcap": "2.2T" },
  "AMD":  { "price": 178.23, "change": -0.85, "growth": 12.5, "pe": 38.4, "mcap": "288B" },
  "TSM":  { "price": 145.72, "change": 2.10,  "growth": 16.2, "pe": 22.1, "mcap": "750B" },
  "LITE": { "price": 52.14,  "change": -8.45, "growth": -5.2, "pe": 15.8, "mcap": "5.1B" },
  "COHR": { "price": 58.88,  "change": 1.22,  "growth": 8.4,  "pe": 18.2, "mcap": "8.8B" },
  "MSFT": { "price": 425.22, "change": 0.45,  "growth": 17.0, "pe": 35.5, "mcap": "3.1T" },
  "GOOGL":{ "price": 158.31, "change": -0.12, "growth": 15.4, "pe": 24.8, "mcap": "1.9T" },
  "ORCL": { "price": 128.15, "change": 3.88,  "growth": 7.1,  "pe": 21.4, "mcap": "350B" },
  "AMZN": { "price": 189.05, "change": 0.65,  "growth": 13.9, "pe": 42.1, "mcap": "1.9T" },
  "UNH":  { "price": 492.11, "change": -1.30, "growth": 10.2, "pe": 19.5, "mcap": "450B" },
  "OSCR": { "price": 16.45,  "change": 12.85, "growth": 45.0, "pe": -12.4,"mcap": "3.5B" }
};

const App = () => {
  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('st_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });
  const [stockData, setStockData] = useState(DEFAULT_FALLBACK_DATA);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingCategoryKey, setEditingCategoryKey] = useState(null);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [addingToCategory, setAddingToCategory] = useState(null);
  const [newTickerInput, setNewTickerInput] = useState('');
  const [showNewSectorForm, setShowNewSectorForm] = useState(false);
  const [newSectorLabel, setNewSectorLabel] = useState('');
  const [newSectorIconKey, setNewSectorIconKey] = useState('SEMICONDUCTORS');

  const saveCategories = (cats) => {
    localStorage.setItem('st_categories', JSON.stringify(cats));
  };

  const allSymbols = useMemo(() => Object.values(categories).flatMap(c => c.symbols), [categories]);

  const fetchStockPrices = async (symbolList = allSymbols) => {
    if (symbolList.length === 0) return;
    setLoading(true);
    const symbols = symbolList.join(',');
    try {
      const res = await fetch(`/api/stocks/overview?symbols=${symbols}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setStockData(prev => {
        const merged = { ...prev };
        for (const [sym, d] of Object.entries(data)) {
          merged[sym] = { ...DEFAULT_FALLBACK_DATA[sym], ...merged[sym], ...d };
        }
        return merged;
      });
      setLastUpdated(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
    } catch {
      setLastUpdated("MISSION_BACKUP_DATA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStockPrices(allSymbols); }, []);

  // 產生隨機走勢作為 fallback（真實資料由 Modal 自行抓取）
  const generateFallbackHistory = (startPrice, change) => {
    const points = [];
    let current = startPrice * (1 - change / 100);
    for (let i = 0; i < 30; i++) {
      current += (Math.random() - 0.5) * (startPrice * 0.05);
      points.push(current);
    }
    points.push(startPrice);
    return points;
  };

  const Card = ({ symbol, data, editMode, onDelete }) => {
    const stockInfo = data || DEFAULT_FALLBACK_DATA[symbol] || { price: 0, change: 0, growth: 0, pe: 0, mcap: "N/A" };
    const { change, price } = stockInfo;
    const isPositive = change >= 0;

    const weight = Math.max(Math.pow(Math.abs(change), 1.1) * 4 + 8, 12);
    const iconSize = Math.min(Math.max(Math.abs(change) * 4 + 20, 16), 64);
    const glowColor = isPositive ? 'rgba(0, 255, 140, 0.5)' : 'rgba(255, 40, 80, 0.5)';
    const textColor = isPositive ? 'text-[#00FF8C]' : 'text-[#FF2850]';
    const bgGradient = isPositive ? 'from-[#082a1b] to-[#010a06]' : 'from-[#350a0f] to-[#0a0203]';

    return (
      <div
        onClick={() => !editMode && setSelectedStock({ symbol, ...stockInfo, isPositive })}
        style={{
          flex: `${weight} 1 0%`,
          minWidth: '150px',
          minHeight: '130px',
          boxShadow: `inset 0 0 20px rgba(0,0,0,0.5), 0 0 15px -8px ${glowColor}`
        }}
        className={`relative bg-gradient-to-br ${bgGradient} border border-white/10 m-[2px] group transition-all duration-300 hover:border-white/40 hover:z-20 overflow-hidden ${!editMode ? 'cursor-pointer active:scale-95' : ''}`}
      >
        <div className={`absolute top-0 left-0 w-full h-[2px] ${isPositive ? 'bg-[#00FF8C]' : 'bg-[#FF2850]'}`}></div>

        <div className="p-4 h-full flex flex-col justify-between relative z-10" style={{ pointerEvents: editMode ? 'auto' : 'none' }}>
          <div className="flex justify-between items-start">
            <div className="flex flex-col pointer-events-none">
              <span className="text-[7px] font-black tracking-[0.2em] text-white/30 uppercase font-mono italic">UNIT_{symbol}</span>
              <span className="text-xl font-black text-white leading-none">{symbol}</span>
            </div>
            <div className="relative flex items-center justify-center pointer-events-none" style={{ width: '64px', height: '64px' }}>
              <div className={`absolute inset-0 blur-xl opacity-30 ${isPositive ? 'bg-[#00FF8C]' : 'bg-[#FF2850]'}`}></div>
              <div className="relative">
                {isPositive
                  ? <Rocket size={iconSize} className="text-[#00FF8C] animate-bounce filter drop-shadow-[0_0_10px_#00FF8C]" />
                  : <span style={{ fontSize: `${iconSize}px` }} className="filter brightness-125 drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]">💩</span>
                }
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 pointer-events-none">
            <div className="flex items-baseline gap-0.5">
              <span className="text-[8px] font-bold text-white/20 font-mono">$</span>
              <span className="text-2xl font-mono font-black text-white tracking-tighter">
                {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className={`flex items-center px-1.5 py-0.5 w-fit border-l-2 ${isPositive ? 'border-[#00FF8C] bg-[#00FF8C]/10' : 'border-[#FF2850] bg-[#FF2850]/10'}`}>
              <span className={`text-[11px] font-black tracking-tighter ${textColor}`}>
                {isPositive ? '+' : ''}{change.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {editMode ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-2 right-2 p-1.5 bg-[#FF2850]/20 hover:bg-[#FF2850]/40 border border-[#FF2850]/50 text-[#FF2850] transition-all"
          >
            <X size={14} />
          </button>
        ) : (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Maximize2 size={12} className="text-white/20" />
          </div>
        )}
      </div>
    );
  };

  const TrendModal = ({ stock, onClose }) => {
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(true);

    useEffect(() => {
      setDetailLoading(true);
      fetch(`/api/stocks/detail/${stock.symbol}`)
        .then(r => r.json())
        .then(d => { setDetail(d); setDetailLoading(false); })
        .catch(() => setDetailLoading(false));
    }, [stock.symbol]);

    // 優先用真實 history，否則用 fallback
    const chartPoints = useMemo(() => {
      if (detail?.history?.length > 1) {
        return detail.history.map(h => h.close);
      }
      return generateFallbackHistory(stock.price, stock.change);
    }, [detail, stock.price, stock.change]);

    const defaultData = DEFAULT_FALLBACK_DATA[stock.symbol] || {};
    const pe     = detail?.pe     ?? stock.pe     ?? defaultData.pe ?? null;
    const growth = detail?.growth ?? stock.growth ?? defaultData.growth ?? null;
    const mcap   = detail?.mcap   ?? stock.mcap   ?? defaultData.mcap ?? "N/A";

    const max = Math.max(...chartPoints);
    const min = Math.min(...chartPoints);
    const range = max - min || 1;

    const pathData = chartPoints.map((val, i) => {
      const x = (i / (chartPoints.length - 1)) * 400;
      const y = 150 - ((val - min) / range) * 100;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose}></div>
        <div className="relative w-full max-w-3xl bg-[#0a0a0c] border border-white/20 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden rounded-lg">
          <div className={`absolute top-0 left-0 w-full h-1.5 ${stock.isPositive ? 'bg-[#00FF8C]' : 'bg-[#FF2850]'}`}></div>

          <div className="p-8">
            <div className="flex justify-between items-start mb-8">
              <div className="flex gap-6 items-center">
                <div className="p-4 bg-white/5 border border-white/10 flex items-center justify-center rounded-sm">
                  {stock.isPositive ? <Rocket size={40} className="text-[#00FF8C]" /> : <span className="text-4xl">💩</span>}
                </div>
                <div>
                  <h2 className="text-5xl font-black text-white tracking-tighter italic uppercase">{stock.symbol}</h2>
                  <p className="text-white/30 font-mono text-[10px] tracking-[0.5em] mt-1 uppercase italic">Deep_Telemetry_Scan</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 text-white/30 hover:text-white transition-all rounded-full">
                <X size={28} />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 p-4 border border-white/10">
                <span className="text-[9px] text-white/20 font-black uppercase tracking-widest block mb-1">Unit Price</span>
                <span className="text-xl font-mono font-bold text-white">${stock.price.toFixed(2)}</span>
              </div>
              <div className="bg-white/5 p-4 border border-white/10">
                <span className="text-[9px] text-white/20 font-black uppercase tracking-widest block mb-1">24H Delta</span>
                <span className={`text-xl font-mono font-bold ${stock.isPositive ? 'text-[#00FF8C]' : 'text-[#FF2850]'}`}>
                  {stock.isPositive ? '+' : ''}{stock.change}%
                </span>
              </div>
              <div className="bg-white/5 p-4 border border-white/10">
                <span className="text-[9px] text-white/20 font-black uppercase tracking-widest block mb-1 flex items-center gap-1">
                  <BarChart3 size={8} /> Revenue Growth (YoY)
                </span>
                {detailLoading
                  ? <span className="text-xl font-mono font-bold text-white/20">...</span>
                  : <span className={`text-xl font-mono font-bold ${(growth || 0) > 20 ? 'text-[#00FF8C]' : 'text-blue-400'}`}>
                      {growth != null ? `${growth > 0 ? '+' : ''}${growth}%` : '—'}
                    </span>
                }
              </div>
              <div className="bg-white/5 p-4 border border-white/10">
                <span className="text-[9px] text-white/20 font-black uppercase tracking-widest block mb-1 flex items-center gap-1">
                  <PieChart size={8} /> Forward P/E
                </span>
                {detailLoading
                  ? <span className="text-xl font-mono font-bold text-white/20">...</span>
                  : <span className="text-xl font-mono font-bold text-orange-400">
                      {pe != null ? `${pe}x` : '—'}
                    </span>
                }
              </div>
            </div>

            <div className="flex items-center gap-4 mb-8 py-3 px-4 bg-white/[0.02] border-x border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black text-white/40 uppercase">Market_Cap:</span>
                <span className="text-[10px] font-mono font-bold text-white/80">{mcap}</span>
              </div>
              <div className="h-4 w-[1px] bg-white/10"></div>
              <div className="flex-1 flex items-center gap-3">
                <span className="text-[8px] font-black text-white/40 uppercase italic">Valuation_State:</span>
                <div className="flex-1 h-1 bg-white/5 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-orange-500 opacity-50"
                    style={{ width: `${Math.min((pe || 0) * 2, 100)}%` }}
                  ></div>
                </div>
                <span className="text-[8px] font-mono font-bold text-white/60 tracking-widest">
                  {(pe || 0) > 40 ? 'OVER_ORBIT' : (pe || 0) > 20 ? 'STABLE_EVAL' : 'UNDER_EVAL'}
                </span>
              </div>
            </div>

            <div className="relative h-48 bg-black/60 border border-white/10 p-6 rounded-sm overflow-hidden">
              <div className="absolute top-3 left-3 text-[9px] text-white/20 font-mono italic tracking-widest flex items-center gap-2">
                <Activity size={10} /> ANNUAL_ORBITAL_TRACKER_V.7
              </div>
              <svg viewBox="0 0 400 150" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stock.isPositive ? '#00FF8C' : '#FF2850'} stopOpacity="0.4" />
                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${pathData} L 400 150 L 0 150 Z`} fill="url(#lineGrad)" />
                <path d={pathData} fill="none" stroke={stock.isPositive ? '#00FF8C' : '#FF2850'} strokeWidth="3" strokeLinecap="round" />
                <line x1="0" y1="0" x2="0" y2="150" stroke="white" strokeWidth="1" className="opacity-10 animate-[scan_4s_linear_infinite]" />
              </svg>
            </div>

            <div className="mt-8 flex justify-between items-center opacity-40">
              <div className="flex gap-6 text-[10px] font-black tracking-widest uppercase italic text-white/50">
                <span className="flex items-center gap-2"><Zap size={12} className="text-[#00FF8C]" /> Propulsion_Sync</span>
                <span className="flex items-center gap-2"><Activity size={12} className="text-blue-500" /> Bio_Link_Stable</span>
              </div>
              <div className="text-[9px] font-mono tracking-widest">REL_ID: {stock.symbol}_SEC_492</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#010103] text-white font-sans p-3 selection:bg-white/20 overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] bg-[#00FF8C]/5 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-15%] left-[-10%] w-[50%] h-[50%] bg-[#FF2850]/5 rounded-full blur-[150px]"></div>
      </div>

      <div className="max-w-[1600px] mx-auto flex flex-col h-[calc(100vh-1.5rem)] relative z-10">
        <header className="flex items-center justify-between px-6 py-5 bg-black/80 border border-white/10 backdrop-blur-3xl mb-4 shadow-2xl rounded-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white text-black flex items-center justify-center rotate-45">
              <Rocket size={20} className="-rotate-45" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">
                STARSHIP<span className="text-white/20">_TERMINAL</span>
              </h1>
              <p className="text-[9px] text-white/30 font-bold tracking-[0.5em] uppercase mt-1">Deep Space Telemetry v7.3</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[9px] text-white/20 font-black uppercase block mb-1">Link_Status</span>
              <span className="font-mono text-lg text-[#00FF8C] font-bold tracking-tighter italic">
                {lastUpdated
                  ? (lastUpdated === "MISSION_BACKUP_DATA" ? "BACKUP_DATA" : lastUpdated)
                  : "CONNECTING..."}
              </span>
            </div>
            <button onClick={() => fetchStockPrices(allSymbols)} disabled={loading} className="p-4 bg-white/5 border border-white/10 hover:bg-white hover:text-black transition-all active:scale-90">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setEditMode(!editMode)} className={`p-4 border transition-all active:scale-90 ${editMode ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
              <Edit2 size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-hide px-1 pb-10">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {Object.entries(categories).map(([catKey, config]) => (
              <div key={catKey} className="flex flex-col">
                <div className="flex items-center gap-4 mb-3 px-1">
                  <div className="p-2 bg-white/5 border border-white/10 rounded-sm">{ICON_MAP[config.iconKey]}</div>
                  {editingCategoryKey === catKey ? (
                    <input
                      autoFocus
                      type="text"
                      value={newCategoryLabel}
                      onChange={(e) => setNewCategoryLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newCategoryLabel.trim()) {
                          const updated = { ...categories, [catKey]: { ...config, label: newCategoryLabel } };
                          setCategories(updated);
                          saveCategories(updated);
                          setEditingCategoryKey(null);
                        } else if (e.key === 'Escape') {
                          setEditingCategoryKey(null);
                        }
                      }}
                      onBlur={() => {
                        if (newCategoryLabel.trim()) {
                          const updated = { ...categories, [catKey]: { ...config, label: newCategoryLabel } };
                          setCategories(updated);
                          saveCategories(updated);
                        }
                        setEditingCategoryKey(null);
                      }}
                      className="flex-1 bg-black/60 border border-white/30 text-white px-2 py-1 text-xs font-black tracking-[0.5em] uppercase italic focus:outline-none focus:border-[#00FF8C]"
                    />
                  ) : (
                    <h3
                      onClick={() => editMode && (setEditingCategoryKey(catKey), setNewCategoryLabel(config.label))}
                      className={`text-xs font-black text-white/70 tracking-[0.5em] uppercase italic ${editMode ? 'cursor-pointer hover:text-white/90' : ''}`}
                    >
                      {config.label}
                    </h3>
                  )}
                  <div className="flex-1 h-[1px] bg-gradient-to-r from-white/10 to-transparent"></div>
                  {editMode && (
                    <button
                      onClick={() => {
                        const updated = { ...categories };
                        delete updated[catKey];
                        setCategories(updated);
                        saveCategories(updated);
                      }}
                      className="p-2 text-white/50 hover:text-[#FF2850] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap border border-white/5 bg-black/40 p-1.5 rounded-sm min-h-[140px]">
                  {config.symbols.map(s => (
                    <Card
                      key={s}
                      symbol={s}
                      data={stockData[s]}
                      editMode={editMode}
                      onDelete={() => {
                        const updated = { ...categories, [catKey]: { ...config, symbols: config.symbols.filter(sym => sym !== s) } };
                        setCategories(updated);
                        saveCategories(updated);
                      }}
                    />
                  ))}
                  {editMode && addingToCategory !== catKey && (
                    <div
                      onClick={() => setAddingToCategory(catKey)}
                      className="flex items-center justify-center gap-2 flex-1 min-w-[140px] h-[140px] border-2 border-dashed border-white/10 hover:border-white/30 cursor-pointer transition-colors text-white/40 hover:text-white/60 text-xs font-black tracking-wide"
                    >
                      + ADD TICKER
                    </div>
                  )}
                  {editMode && addingToCategory === catKey && (
                    <div className="flex items-center justify-center flex-1 min-w-[140px] h-[140px] bg-white/5 border-2 border-white/20 p-3">
                      <input
                        autoFocus
                        type="text"
                        value={newTickerInput}
                        onChange={(e) => setNewTickerInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTickerInput.trim()) {
                            const updated = { ...categories, [catKey]: { ...config, symbols: [...config.symbols, newTickerInput] } };
                            setCategories(updated);
                            saveCategories(updated);
                            fetchStockPrices([...allSymbols, newTickerInput]);
                            setAddingToCategory(null);
                            setNewTickerInput('');
                          } else if (e.key === 'Escape') {
                            setAddingToCategory(null);
                            setNewTickerInput('');
                          }
                        }}
                        onBlur={() => setAddingToCategory(null)}
                        placeholder="e.g. AAPL"
                        className="w-full bg-black/60 border border-white/30 text-white px-2 py-1 text-xs focus:outline-none focus:border-[#00FF8C] placeholder-white/30 text-center font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {editMode && !showNewSectorForm && (
              <div className="flex flex-col">
                <div className="flex items-center gap-4 mb-3 px-1">
                  <button
                    onClick={() => setShowNewSectorForm(true)}
                    className="p-2 bg-white/5 border border-dashed border-white/30 text-white/50 hover:text-white/80 hover:border-white/50 transition-colors rounded-sm"
                  >
                    + NEW SECTOR
                  </button>
                </div>
              </div>
            )}
            {editMode && showNewSectorForm && (
              <div className="flex flex-col">
                <div className="bg-black/40 border border-white/20 p-6 rounded-sm space-y-4">
                  <h4 className="text-xs font-black text-white/70 tracking-[0.5em] uppercase">建立新分類</h4>
                  <input
                    autoFocus
                    type="text"
                    value={newSectorLabel}
                    onChange={(e) => setNewSectorLabel(e.target.value)}
                    placeholder="分類名稱（中文）"
                    className="w-full bg-black/60 border border-white/30 text-white px-3 py-2 text-xs focus:outline-none focus:border-[#00FF8C]"
                  />
                  <select
                    value={newSectorIconKey}
                    onChange={(e) => setNewSectorIconKey(e.target.value)}
                    className="w-full bg-black/60 border border-white/30 text-white px-3 py-2 text-xs focus:outline-none focus:border-[#00FF8C]"
                  >
                    {Object.keys(ICON_MAP).map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (newSectorLabel.trim()) {
                          const catKey = newSectorLabel.toUpperCase().replace(/\s+/g, '_');
                          const updated = { ...categories, [catKey]: { label: newSectorLabel, iconKey: newSectorIconKey, symbols: [] } };
                          setCategories(updated);
                          saveCategories(updated);
                          setShowNewSectorForm(false);
                          setNewSectorLabel('');
                          setNewSectorIconKey('SEMICONDUCTORS');
                        }
                      }}
                      className="flex-1 bg-[#00FF8C]/20 border border-[#00FF8C] text-[#00FF8C] px-3 py-2 text-xs font-bold hover:bg-[#00FF8C]/30 transition-all"
                    >
                      建立
                    </button>
                    <button
                      onClick={() => { setShowNewSectorForm(false); setNewSectorLabel(''); }}
                      className="flex-1 bg-white/5 border border-white/30 text-white/70 px-3 py-2 text-xs font-bold hover:bg-white/10 transition-all"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="mt-4 py-6 flex justify-between items-center border-t border-white/10 opacity-30">
          <div className="text-[9px] font-black tracking-[0.7em] uppercase italic">SpaceX // Advanced Data Fusion System</div>
          <div className="text-[9px] font-mono tracking-[0.3em] uppercase">Visual_Kernel_7.3.0_Stable</div>
        </footer>
      </div>

      {selectedStock && <TrendModal stock={selectedStock} onClose={() => setSelectedStock(null)} />}

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes scan {
          0% { transform: translateX(0); }
          100% { transform: translateX(400px); }
        }
      `}} />
    </div>
  );
};

export default App;

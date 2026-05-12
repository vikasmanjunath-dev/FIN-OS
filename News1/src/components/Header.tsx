import React, { useState, useEffect } from 'react';
import { Moon, Sun, RefreshCw } from 'lucide-react';
import Radar from './Radar';

interface HeaderProps {
  status: string;
  onRefresh: () => void;
}

const Header = ({ status, onRefresh }: HeaderProps) => {
  const [theme, setTheme] = useState(localStorage.getItem('finos-theme') || 'dark');
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('finos-theme', theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleRefresh = () => {
    setIsSpinning(true);
    onRefresh();
    setTimeout(() => setIsSpinning(false), 1000);
  };

  const getStatusColor = () => {
    if (status.includes('SECURE')) return '#00F3FF';
    if (status.includes('INTERRUPTED')) return '#ff4757';
    return '#888888';
  };

  return (
    <header className="relative z-10 flex justify-between items-end border-b border-[#00f3ff]/15 pb-8 mb-0 pt-10">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center gap-2 bg-[#00f3ff]/5 border border-[#00f3ff] px-3 py-1.5 rounded-full font-mono text-xs text-[#00f3ff]">
            <div 
              className="w-2 h-2 rounded-full animate-pulse-fast"
              style={{ backgroundColor: getStatusColor(), boxShadow: `0 0 10px ${getStatusColor()}` }}
            ></div>
            <span>{status}</span>
          </div>
          <button 
            onClick={handleRefresh}
            className={`flex items-center justify-center w-8 h-8 rounded-lg bg-[#00f3ff]/5 border border-[#00f3ff]/20 text-[#00f3ff] hover:bg-[#00f3ff]/15 hover:border-[#00f3ff] transition-all ${isSpinning ? 'animate-spin' : ''}`}
            title="Manual Resync"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <h1 className="glitch-text text-4xl font-extrabold m-0 text-white">GLOBAL INTEL MATRIX</h1>
        <p className="text-[#888888] font-mono text-sm mt-1">Multi-variable live data shards decrypted from local Node.js server.</p>
      </div>
      
      <button 
        onClick={handleThemeToggle} 
        className="relative z-[5] bg-transparent border border-[#00f3ff]/15 text-white p-2 rounded-lg cursor-pointer text-xl hover:bg-white/5 transition-colors"
      >
        {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      <Radar />
    </header>
  );
};

export default Header;

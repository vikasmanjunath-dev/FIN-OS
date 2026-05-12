import React, { useState, useMemo } from 'react';
import { Home, Globe, User, LayoutDashboard, Library, Activity, Calculator, PieChart, TrendingUp, Target, Settings } from 'lucide-react';
import { useIntelFeed } from './hooks/useIntelFeed';
import Header from './components/Header';
import TickerTape from './components/TickerTape';
import FilterDock, { Category, TimeRange } from './components/FilterDock';
import NewsGrid from './components/NewsGrid';
import AlertToast from './components/AlertToast';
import './index.css';

const App = () => {
  const { items, markets, status, loading, newImpactAlerts, removeAlert, manualRefresh } = useIntelFeed();

  const [activeCat, setActiveCat] = useState<Category>('all');
  const [activeImpact, setActiveImpact] = useState(false);
  const [activeTime, setActiveTime] = useState<TimeRange>('all');

  const filteredItems = useMemo(() => {
    const currentTimeSecs = Date.now() / 1000;

    return items.filter(item => {
      if (activeCat !== 'all' && item.type !== activeCat) return false;
      if (activeImpact && !item.high_impact) return false;

      if (activeTime !== 'all') {
        const hoursAgo = (currentTimeSecs - item.timestamp) / 3600;
        if (hoursAgo > parseInt(activeTime)) return false;
      }

      return true;
    });
  }, [items, activeCat, activeImpact, activeTime]);

  return (
    <div className="flex min-h-screen bg-[var(--bg-void)] text-white">
      <div className="fixed top-0 left-0 w-screen h-screen z-0 cyber-grid pointer-events-none opacity-40 overflow-hidden"></div>

      <aside
        className="bg-[#0a0e17]/90 backdrop-blur-xl border-r border-[#00f3ff]/20 p-6 flex flex-col fixed top-0 left-0 h-screen z-[100] overflow-hidden"
        style={{ width: '260px' }}
      >
        <div className="font-mono font-bold text-2xl tracking-[2px] text-[#00f3ff] mb-8 shrink-0">FIN•OS</div>
        <nav className="flex flex-col gap-2 overflow-y-auto flex-1 pb-4 custom-scrollbar pr-2">
          {(() => {
            const getRoute = (target: string) => {
              const url = window.location.href;
              if (url.includes(':3000')) return `/${target}`;
              const newsIndex = url.indexOf('/News1');
              if (newsIndex !== -1) return `${url.substring(0, newsIndex)}/${target}`;
              return `../${target}`;
            };
            return (
              <>
                <NavItem href={getRoute("html/profile.html")} icon={<User size={18} />} label="Profile" />
                <NavItem href={getRoute("html/home.html")} icon={<Home size={18} />} label="Home" />
                <NavItem href={getRoute("html/dashboard.html")} icon={<LayoutDashboard size={18} />} label="Dashboard" />
                <NavItem href={getRoute("html/foundations.html")} icon={<Library size={18} />} label="Foundations" />
                <NavItem href={getRoute("html/diagnostics.html")} icon={<Activity size={18} />} label="Diagnostics" />
                <NavItem href={getRoute("html/calculators.html")} icon={<Calculator size={18} />} label="Calculators" />
                <NavItem href={getRoute("Porfolio Analyser/portfolio-analyser-v9.html")} icon={<PieChart size={18} />} label="Portfolio Disector" />
                <NavItem href={getRoute("stock-dashboard/index.html")} icon={<TrendingUp size={18} />} label="Live Tracker" />
                <NavItem href={getRoute("html/simulator-guide.html")} icon={<Target size={18} />} label="Trading Simulator" />
                <NavItem href={getRoute("News1/index.html")} icon={<Globe size={18} />} label="News" active />
                <NavItem href={getRoute("html/settings.html")} icon={<Settings size={18} />} label="Settings" />
              </>
            );
          })()}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 relative z-10 px-10 flex flex-col ml-[260px]">
        <Header status={status} onRefresh={manualRefresh} />
        <TickerTape markets={markets} />

        <div className="flex-1 relative">
          <NewsGrid items={filteredItems} loading={loading} />
        </div>

        <FilterDock
          activeCat={activeCat} setActiveCat={setActiveCat}
          activeImpact={activeImpact} setActiveImpact={setActiveImpact}
          activeTime={activeTime} setActiveTime={setActiveTime}
        />
      </main>

      <AlertToast alerts={newImpactAlerts} onRemove={removeAlert} />
    </div>
  );
};

const NavItem = ({ href, icon, label, active = false }: { href: string, icon: React.ReactNode, label: string, active?: boolean }) => {
  return (
    <a href={href} className={`flex items-center gap-3 px-4 py-3 rounded-lg font-mono text-sm transition-all duration-300 ${active ? 'bg-[#00f3ff]/10 text-[#00f3ff] pl-6' : 'text-gray-400 hover:bg-[#00f3ff]/5 hover:text-[#00f3ff] hover:pl-6'}`}>
      {icon}
      {label}
    </a>
  );
};

export default App;

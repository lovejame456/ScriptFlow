import React from 'react';
import { ViewState } from '../types';
import Logo from './Logo';
import {
  LayoutDashboard,
  ListOrdered,
  Tv,
  PenTool,
  Download,
  Play,
  LogOut,
  Users
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
  onExit: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, onExit }) => {
  const navItems = [
    { view: ViewState.PROJECT, label: '项目概览', icon: LayoutDashboard },
    { view: ViewState.CHARACTERS, label: '角色池', icon: Users },
    { view: ViewState.WORKSPACE, label: '生产创作中心', icon: Tv }, // Unified Entry
    { view: ViewState.EXPORT, label: '导出交付', icon: Download },
  ];

  return (
    <div className="w-64 h-full flex flex-col z-50 p-4">
      <div className="h-full glass-panel rounded-2xl flex flex-col overflow-hidden">
        {/* Logo Area */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-3 text-white mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-glow group cursor-pointer hover:scale-105 transition-transform duration-300">
              {/* Use Monochrome Logo in White inside the gradient box */}
              <Logo size={20} monochrome className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight leading-none text-lg">ScriptFlow</span>
              <span className="text-[10px] text-primary/80 font-medium tracking-wider mt-1">INTELLIGENCE</span>
            </div>
          </div>
          <div className="h-px bg-white/5 w-full"></div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onViewChange(item.view)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden ${isActive
                    ? 'bg-primary/10 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]'
                    : 'text-textMuted hover:text-white hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-3 relative z-10">
                  <Icon size={18} className={isActive ? 'text-primary drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'group-hover:text-white transition-colors'} />
                  <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 mt-auto">
          <button
            onClick={onExit}
            className="w-full flex items-center gap-3 px-4 py-3 text-textMuted hover:text-danger hover:bg-danger/5 rounded-xl transition-all text-sm group border border-transparent hover:border-danger/10"
          >
            <LogOut size={16} />
            <span>退出项目</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
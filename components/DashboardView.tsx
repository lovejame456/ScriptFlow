import React from 'react';
import { Project } from '../types';
import { Plus, Trash2, Clock, Film, MoreVertical, Search, Zap, Crown } from 'lucide-react';

interface DashboardViewProps {
    projects: Project[];
    onCreateClick: () => void;
    onOpenProject: (id: string) => void;
    onDeleteProject: (id: string) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ projects, onCreateClick, onOpenProject, onDeleteProject }) => {
    return (
        <div className="h-full overflow-auto p-6 md:p-12 max-w-[1400px] mx-auto">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6 animate-in slide-in-from-top-4 duration-500">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Crown size={16} className="text-amber-400" />
                        <span className="text-xs font-bold text-amber-400 tracking-widest uppercase">Premium Workspace</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-1 mb-2">
                        <span className="text-white">ScriptFlow</span>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent ml-3 italic">Studio</span>
                    </h1>
                    <p className="text-textMuted mt-3 text-lg font-light max-w-2xl">
                        管理您的短剧项目。AI 算力引擎已就绪，当前模型：<span className="text-primary font-mono">DeepSeek-V3-Script</span>
                    </p>
                </div>

                <div className="flex gap-4">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full group-hover:bg-primary/40 transition-all duration-500"></div>
                        <button
                            onClick={onCreateClick}
                            className="relative flex items-center gap-3 px-8 py-4 bg-white text-black hover:bg-primary hover:text-white rounded-full font-bold text-sm transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] active:scale-95"
                        >
                            <Plus size={18} />
                            <span>新建剧本</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="glass-panel rounded-2xl p-2 mb-8 flex items-center gap-2 max-w-lg">
                <div className="p-3 text-textMuted">
                    <Search size={20} />
                </div>
                <input
                    type="text"
                    placeholder="搜索项目名称、题材..."
                    className="bg-transparent w-full h-full border-none outline-none text-white placeholder-textMuted/50 font-medium"
                />
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project, idx) => (
                    <div
                        key={project.id}
                        onClick={() => onOpenProject(project.id)}
                        style={{ animationDelay: `${idx * 100}ms` }}
                        className="glass-card rounded-3xl p-8 relative group cursor-pointer flex flex-col h-[320px] animate-in fade-in zoom-in-95 duration-500"
                    >
                        {/* Top Row */}
                        <div className="flex justify-between items-start mb-6">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-textMuted group-hover:bg-primary/20 group-hover:border-primary/20 group-hover:text-primary transition-colors">
                                {project.genre}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                                className="p-2 -mr-2 -mt-2 text-textMuted/20 hover:text-danger hover:bg-white/5 rounded-full transition-all"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                            <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-primary/80 transition-all leading-tight">
                                {project.name}
                            </h3>
                            <p className="text-sm text-textMuted line-clamp-3 leading-relaxed font-light opacity-80 group-hover:opacity-100 transition-opacity">
                                {project.logline}
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4 text-xs font-medium text-textMuted">
                                <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-md">
                                    <Film size={12} /> {project.totalEpisodes} 集
                                </span>
                                <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                            </div>

                            {/* Progress Indicator */}
                            <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                        style={{ width: `${Math.round(((project.episodes || []).filter(e => e.status === 'COMPLETED').length / (project.totalEpisodes || 1)) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Create Placeholder */}
                <div
                    onClick={onCreateClick}
                    className="rounded-3xl border-2 border-dashed border-white/5 hover:border-primary/30 p-8 flex flex-col items-center justify-center text-textMuted hover:text-primary cursor-pointer transition-all duration-300 group h-[320px] bg-transparent hover:bg-white/[0.02]"
                >
                    <div className="w-20 h-20 rounded-full bg-surfaceHighlight group-hover:bg-primary/10 flex items-center justify-center mb-6 transition-colors shadow-inner">
                        <Plus size={32} className="group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <span className="font-bold text-lg">创建新项目</span>
                    <span className="text-sm opacity-50 mt-1">从灵感到剧本</span>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;
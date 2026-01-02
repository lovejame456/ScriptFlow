import React from 'react';
import { Project } from '../types';
import { FileText, Download, Clock, Check, FileJson, FileType, FileCode, Archive } from 'lucide-react';

interface ExportViewProps {
  project: Project;
}

const ExportView: React.FC<ExportViewProps> = ({ project }) => {
  return (
    <div className="p-8 md:p-12 max-w-6xl mx-auto space-y-12 animate-in fade-in duration-500">
      <div className="flex items-end justify-between border-b border-white/5 pb-8">
        <div>
            <h2 className="text-4xl font-bold text-white tracking-tight mb-2">项目交付与导出</h2>
            <p className="text-textMuted text-lg font-light">将剧本编译为生产可用的格式，支持多种行业标准。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Configuration */}
        <div className="glass-panel rounded-3xl p-8 space-y-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Archive size={20} />
                </div>
                <h3 className="font-bold text-xl text-white">导出配置</h3>
            </div>
            
            <div className="space-y-5">
                <label className="text-xs font-bold text-textMuted block uppercase tracking-wider">选择导出范围</label>
                <div className="space-y-4">
                    <label className="flex items-center gap-5 p-5 rounded-2xl border border-primary/40 bg-primary/5 cursor-pointer hover:bg-primary/10 hover:border-primary/60 transition-all group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative flex items-center justify-center h-6 w-6 shrink-0">
                             <input type="radio" name="range" className="peer appearance-none w-6 h-6 border-2 border-white/30 rounded-full checked:border-primary checked:bg-primary transition-colors z-10" defaultChecked />
                             <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 z-10 pointer-events-none" />
                        </div>
                        <div className="relative z-10">
                            <span className="text-base font-bold text-white block mb-0.5">全集导出 (1-{project.totalEpisodes} 集)</span>
                            <span className="text-xs text-textMuted group-hover:text-white/80 transition-colors">包含完整的大纲、人物小传、设定集和分集正文</span>
                        </div>
                    </label>
                    <label className="flex items-center gap-5 p-5 rounded-2xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all group">
                        <div className="relative flex items-center justify-center h-6 w-6 shrink-0">
                             <input type="radio" name="range" className="peer appearance-none w-6 h-6 border-2 border-white/30 rounded-full checked:border-primary checked:bg-primary transition-colors" />
                             <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                        </div>
                        <div>
                            <span className="text-base font-bold text-white block mb-0.5">试读样本 (前 10 集)</span>
                            <span className="text-xs text-textMuted">仅包含开篇大纲与前10集正文，用于投递审核</span>
                        </div>
                    </label>
                </div>
            </div>

            <div className="space-y-5">
                <label className="text-xs font-bold text-textMuted block uppercase tracking-wider">目标格式</label>
                <div className="grid grid-cols-3 gap-4">
                    <button className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-xl border border-primary bg-primary/20 text-primary font-bold text-xs hover:bg-primary/30 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                        <FileText size={24} />
                        TXT 纯文本
                    </button>
                    <button className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-xl border border-white/10 bg-white/5 text-textMuted font-medium text-xs hover:text-white hover:bg-white/10 hover:border-white/20 transition-colors">
                        <FileCode size={24} />
                        Markdown
                    </button>
                    <button className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-xl border border-white/10 bg-white/5 text-textMuted font-medium text-xs hover:text-white hover:bg-white/10 hover:border-white/20 transition-colors">
                        <FileType size={24} />
                        Word Docx
                    </button>
                </div>
            </div>

             <button className="w-full mt-4 py-5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3 transition-all active:scale-95 hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] group text-lg">
                <Download size={24} className="group-hover:translate-y-1 transition-transform" />
                生成并下载资源包
            </button>
        </div>

        {/* History */}
        <div className="glass-panel rounded-3xl p-8 flex flex-col h-full border border-white/5">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg text-accent">
                        <Clock size={20} />
                    </div>
                    <h3 className="font-bold text-xl text-white">历史导出记录</h3>
                </div>
                <button className="text-xs font-medium text-textMuted hover:text-white transition-colors">清空记录</button>
             </div>
             
             <div className="flex-1 space-y-4 overflow-auto pr-2 custom-scrollbar">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-xl bg-surfaceHighlight flex items-center justify-center text-textMuted group-hover:text-primary group-hover:bg-primary/10 transition-colors border border-white/5">
                                <FileText size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white group-hover:text-primary transition-colors flex items-center gap-2">
                                    全集剧本_v{6-i}.txt
                                    {i === 1 && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">Latest</span>}
                                </div>
                                <div className="text-xs text-textMuted mt-1 font-mono">{i} 天前 • 1.2 MB • Full Export</div>
                            </div>
                        </div>
                        <button className="text-xs font-bold text-textMuted hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors border border-white/5">重新下载</button>
                    </div>
                ))}
             </div>
        </div>
      </div>
    </div>
  );
};

export default ExportView;
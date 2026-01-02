import React, { useState } from 'react';
import { Project, PACING_TEMPLATES, ViewState } from '../types';
import { Book, Users, DollarSign, Skull, User, ArrowRight, Copy, Check } from 'lucide-react';

interface ProjectViewProps {
    project: Project;
    onViewChange?: (view: ViewState) => void;
}

const ProjectView: React.FC<ProjectViewProps> = ({ project, onViewChange }) => {
    const templateName = PACING_TEMPLATES[project.pacingTemplateId]?.name || project.pacingTemplateId;
    const [copied, setCopied] = useState(false);

    // 复制剧情总纲
    const copySynopsis = () => {
        if (project.synopsis) {
            navigator.clipboard.writeText(project.synopsis);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="glass-panel rounded-3xl p-8 flex flex-col xl:flex-row justify-between items-start gap-8 relative overflow-hidden">
                {/* Glow effect behind header */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

                <div className="relative z-10 w-full">
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <h2 className="text-4xl font-bold text-white tracking-tight">{project.name}</h2>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary text-white shadow-glow">
                                {project.genre}
                            </span>
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface border border-white/10 text-textMuted">
                                {project.totalEpisodes} 集
                            </span>
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent/20 border border-accent/20 text-accent">
                                {templateName}
                            </span>
                        </div>
                    </div>

                    {/* Logline */}
                    <div className="mb-6">
                      <div className="text-xs uppercase font-bold text-primary mb-2 tracking-wider">一句话卖点</div>
                      <p className="text-white/90 text-xl leading-relaxed font-semibold text-justify border-l-4 border-primary/50 pl-6">
                        {project.logline}
                      </p>
                    </div>

                    {/* Synopsis */}
                    {project.synopsis && (
                      <div className="mb-6 mt-8 pt-6 border-t border-white/10">
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-xs uppercase font-bold text-accent tracking-wider">剧情总纲（投稿用）</div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-textMuted">
                              {project.synopsis.length} 字
                              {project.synopsis.length >= 800 && project.synopsis.length <= 1500 && (
                                <span className="text-green-400 ml-1">✓ 合格</span>
                              )}
                            </div>
                            <button
                              onClick={copySynopsis}
                              className="flex items-center gap-1 px-3 py-1 rounded-lg glass-card text-xs text-textMuted hover:text-white transition-all"
                            >
                              {copied ? <Check size={12} /> : <Copy size={12} />}
                              {copied ? '已复制' : '复制投稿版'}
                            </button>
                          </div>
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none text-justify leading-8">
                          {project.synopsis.split('\n\n').map((section, index) => (
                            <div key={index} className="mb-6 last:mb-0">
                              {section}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                        <div>
                            <div className="text-xs uppercase font-bold text-textMuted mb-1 tracking-wider">目标受众</div>
                            <div className="text-sm text-white">{project.audience}</div>
                        </div>
                        <div>
                            <div className="text-xs uppercase font-bold text-textMuted mb-1 tracking-wider">创建时间</div>
                            <div className="text-sm text-white font-mono">{new Date(project.createdAt).toLocaleDateString('zh-CN')}</div>
                        </div>
                        <div>
                            <div className="text-xs uppercase font-bold text-textMuted mb-1 tracking-wider">已生成集数</div>
                            <div className="text-sm text-white">
                                <span className="font-bold text-primary">{project.episodes?.filter(e => e.content).length || 0}</span> / {project.totalEpisodes}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 项目定位卡片 */}
            <div className="glass-panel rounded-3xl p-6 border-l-4 border-accent/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent/10 blur-[80px] rounded-full pointer-events-none"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-accent/10 rounded-lg text-accent">
                    <Book size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-white">项目定位</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <div className="text-xs text-textMuted mb-2">题材类型</div>
                    <div className="text-white font-semibold">{project.genre}</div>
                  </div>
                  <div>
                    <div className="text-xs text-textMuted mb-2">推荐体量</div>
                    <div className="text-white font-semibold">{project.totalEpisodes} 集</div>
                  </div>
                  <div>
                    <div className="text-xs text-textMuted mb-2">节奏模板</div>
                    <div className="text-accent font-semibold">{templateName}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-6 h-[calc(100vh-320px)]">
                {/* World Bible */}
                <div className="col-span-12 lg:col-span-4 flex flex-col h-full overflow-hidden">
                    <section className="glass-panel rounded-3xl p-8 flex flex-col flex-1 min-h-0 relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50"></div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-white/5 rounded-lg text-white">
                                <Book size={20} />
                            </div>
                            <h3 className="font-bold text-lg text-white">世界观设定集 (Bible)</h3>
                        </div>
                        <div className="prose prose-invert prose-sm text-textMuted flex-1 overflow-y-auto pr-2 custom-scrollbar leading-7 text-justify font-light">
                            <div className="mb-4">
                                <strong className="text-white block mb-1">世界背景:</strong>
                                <p>{project.bible?.canonRules?.worldSetting || '（暂无设定）'}</p>
                            </div>
                            <div className="mb-4">
                                <strong className="text-white block mb-1">核心法则:</strong>
                                <ul className="list-disc pl-4">
                                    {(project.bible?.canonRules?.coreRules || []).map((rule, idx) => <li key={idx}>{rule}</li>)}
                                </ul>
                            </div>
                        </div>
                        <div className="mt-6 pt-6 border-t border-white/5 bg-white/[0.02] -mx-8 -mb-8 p-6">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-textMuted uppercase font-bold tracking-wider">当前节奏模板</span>
                                <span className="text-accent font-bold bg-accent/10 px-3 py-1.5 rounded-lg border border-accent/20 shadow-[0_0_10px_rgba(168,85,247,0.2)]">{templateName}</span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Character Preview */}
                <div className="col-span-12 lg:col-span-8">
                    <section className="glass-panel rounded-3xl p-8 relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-transparent opacity-50"></div>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/5 rounded-lg text-white">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-white">角色池 & 仇恨链</h3>
                                    <div className="text-xs text-textMuted mt-0.5">
                                        共 {(project.characters || []).length} 个角色 · 点击查看详情
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => onViewChange?.(ViewState.CHARACTERS)}
                                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium border border-primary/20"
                            >
                                查看全部角色
                                <ArrowRight size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {(project.characters || []).slice(0, 8).map((char) => {
                                const isVillain = char.roleType === 'ANTAGONIST';
                                const isMain = char.roleType === 'PROTAGONIST';
                                return (
                                    <div
                                        key={char.id}
                                        className="glass-card rounded-xl p-4 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
                                        onClick={() => onViewChange?.(ViewState.CHARACTERS)}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${isVillain ? 'bg-danger/10 text-danger' :
                                            isMain ? 'bg-primary/10 text-primary' :
                                                'bg-surfaceHighlight text-textMuted'
                                            }`}>
                                            {isVillain ? <Skull size={18} /> : <User size={18} />}
                                        </div>
                                        <div className="font-bold text-white text-sm truncate">{char.name}</div>
                                        <div className="text-xs text-textMuted mt-1 truncate">{char.gender} · {char.ageRange}</div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ProjectView;
import React, { useState, useEffect } from 'react';
import { ViewState, Project, EpisodeStatus } from './types';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import CreateView from './components/CreateView';
import ProjectView from './components/ProjectView';
import EpisodesView from './components/EpisodesView';
import ExportView from './components/ExportView';
import UnifiedWorkspace from './components/UnifiedWorkspace';
import CharactersView from './components/CharactersView';
import { api } from './api';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const all = await api.project.getAll();
      setProjects(all);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  };

  const refreshCurrentProject = async () => {
    if (currentProjectId) {
      try {
        const p = await api.project.get(currentProjectId);
        if (p) {
          setProjects(prev => prev.map(proj => proj.id === p.id ? p : proj));
        }
      } catch (error) {
        console.error('Failed to refresh project:', error);
      }
    }
  };

  const currentProject = projects.find(p => p.id === currentProjectId) || null;

  // Handler to Create Project (Real Flow)
  const handleCreateProject = async (prompt: string) => {
    setLoading(true);
    setLoadingStatus("AI 正在构思剧本雏形...");
    try {
      // 1. Seed (AI auto-determines genre, totalEpisodes, pacingTemplateId)
      const newProject = await api.project.seed(prompt);

      // 2. Generate Bible (Auto for MVP flow)
      setLoadingStatus("AI 正在构建世界观与世界观设定...");
      await api.project.generateBible(newProject.id);

      // 3. Generate Synopsis (Auto for MVP flow)
      setLoadingStatus("AI 正在撰写剧情总纲...");
      await api.project.generateSynopsis(newProject.id);

      // 4. Generate Outline (Auto for MVP flow)
      setLoadingStatus("AI 正在编写全集大纲 (0%)...");
      await api.project.generateOutline(newProject.id, (current, total) => {
        const percent = Math.round((current / total) * 100);
        setLoadingStatus(`AI 正在编写全集大纲 (${percent}%)... 第 ${current} 集`);
      });

      // 5. 生成完成后提示
      setLoadingStatus(`项目创建完成！推荐体量：${newProject.totalEpisodes} 集。请在生产工作台开始生成剧本。`);

      await loadProjects();
      setCurrentProjectId(newProject.id);
      setCurrentView(ViewState.PROJECT);
    } catch (e) {
      alert("生成失败: " + e);
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm('确定要删除这个项目吗？此操作无法撤销。')) {
      try {
        await api.project.delete(id);
        await loadProjects(); // Reload from storage to ensure sync
        if (currentProjectId === id) {
          setCurrentProjectId(null);
          setCurrentView(ViewState.DASHBOARD);
        }
      } catch (error) {
        console.error('Failed to delete project:', error);
        alert('删除失败，请重试');
      }
    }
  };

  const handleOpenProject = (id: string) => {
    setCurrentProjectId(id);
    setCurrentView(ViewState.PROJECT);
  }

  const renderView = () => {
    if (loading) return (
      <div className="flex flex-col h-full w-full items-center justify-center bg-background p-8">
        <div className="text-primary text-xl font-bold animate-pulse mb-6 text-center">{loadingStatus || "DeepSeek AI 正在开启创作之路..."}</div>
        <div className="w-80 h-1.5 bg-white/5 rounded-full overflow-hidden relative shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
        </div>
        <p className="mt-4 text-textMuted text-xs uppercase tracking-[0.2em] opacity-50">脚本流 Studio · 深度生成中</p>
      </div>
    );

    switch (currentView) {
      case ViewState.DASHBOARD:
        return <DashboardView projects={projects} onCreateClick={() => setCurrentView(ViewState.CREATE)} onOpenProject={handleOpenProject} onDeleteProject={handleDeleteProject} />;
      case ViewState.CREATE:
        return <CreateView onCreate={handleCreateProject} onBack={() => setCurrentView(ViewState.DASHBOARD)} />;
      case ViewState.PROJECT:
        return currentProject ? <ProjectView project={currentProject} onViewChange={setCurrentView} /> : null;
      case ViewState.CHARACTERS:
        return currentProject ? <CharactersView characters={currentProject.characters || []} onBack={() => setCurrentView(ViewState.PROJECT)} /> : null;
      case ViewState.EPISODES:
        return currentProject ? <EpisodesView project={currentProject} onRefresh={refreshCurrentProject} /> : null;
      case ViewState.WORKSPACE:
        return currentProject ? <UnifiedWorkspace project={currentProject} onRefresh={refreshCurrentProject} /> : null;
      case ViewState.EXPORT:
        return currentProject ? <ExportView project={currentProject} /> : null;
      default:
        return <DashboardView projects={projects} onCreateClick={() => setCurrentView(ViewState.CREATE)} onOpenProject={handleOpenProject} onDeleteProject={handleDeleteProject} />;
    }
  };

  const showSidebar = currentProjectId !== null && currentView !== ViewState.DASHBOARD && currentView !== ViewState.CREATE;

  return (
    <div className="flex h-screen w-full text-textMain font-sans overflow-hidden">
      {showSidebar && (
        <Sidebar currentView={currentView} onViewChange={setCurrentView} onExit={() => { setCurrentProjectId(null); setCurrentView(ViewState.DASHBOARD); }} />
      )}

      <main className="flex-1 overflow-auto relative z-10">
        {renderView()}
      </main>
    </div>
  );
};

export default App;
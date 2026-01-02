import { Project, EpisodeStatus } from '../../types';

export function buildEpisodes(project: Project): { episodeIndex: number; content: string }[] {
  // 过滤出已完成或通过的剧集
  const completedEpisodes = project.episodes.filter(
    ep => ep.status === EpisodeStatus.COMPLETED || ep.status === EpisodeStatus.PASS
  );

  // 按集号排序
  completedEpisodes.sort((a, b) => a.id - b.id);

  // 为每集生成 Markdown
  return completedEpisodes.map(ep => {
    const epNumber = String(ep.id).padStart(2, '0');
    const content = `# 第 ${ep.id} 集｜${ep.title}

${ep.content}
`;

    return {
      episodeIndex: ep.id,
      content
    };
  });
}






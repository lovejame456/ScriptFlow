import { Project, PacingTemplate, PACING_TEMPLATES } from '../../types';
import { PacingContext, ProgressType, HookStrength } from './pacingContext';
import { getHongguoPacingHints } from '../../platforms/hongguo/pacingHints';

function getTemplate(templateId: string): PacingTemplate {
  const template = PACING_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown pacing template: ${templateId}`);
  }
  return template;
}

function getActForEpisode(episodeIndex: number, template: PacingTemplate): number {
  const act = template.acts.find(a =>
    episodeIndex >= a.range[0] && episodeIndex <= a.range[1]
  );

  if (!act) {
    throw new Error(`Episode ${episodeIndex} not within any act range for template ${template.id}`);
  }

  return act.act;
}

function getProgressType(
  templateId: string,
  episodeIndex: number,
  actNumber: number,
  template: PacingTemplate
): ProgressType {
  switch (templateId) {
    case 'romance_ceo':
      // 每 10 集关系质变 -> RELATION_SHIFT
      if (episodeIndex % 10 === 0) {
        return 'RELATION_SHIFT';
      }
      // 每 3 集情绪爽点 -> GENERAL_ESCALATION
      if (episodeIndex % 3 === 0) {
        return 'GENERAL_ESCALATION';
      }
      return 'GENERAL_ESCALATION';

    case 'revenge_rebirth':
      // 每 5 集打脸 -> FACE_SLAP
      if (episodeIndex % 5 === 0) {
        return 'FACE_SLAP';
      }
      return 'GENERAL_ESCALATION';

    case 'cultivation_fantasy':
      // 计算当前 act 是否在最后 3 集
      const currentAct = template.acts.find(a => a.act === actNumber);
      if (!currentAct) {
        return 'GENERAL_ESCALATION';
      }
      const actRange = currentAct.range;
      const actLength = actRange[1] - actRange[0] + 1;
      const episodesFromEnd = actRange[1] - episodeIndex;

      // 进入每个 Act 的最后 3 集标记更强
      if (episodesFromEnd < 3) {
        return 'REALM_BREAK';
      }
      return 'GENERAL_ESCALATION';

    case 'urban_concept':
      // 每 5 集新变量 -> NEW_VARIABLE
      if (episodeIndex % 5 === 0) {
        return 'NEW_VARIABLE';
      }
      return 'GENERAL_ESCALATION';

    case 'urban_wealth':
      // 每 5 集打脸 -> FACE_SLAP
      if (episodeIndex % 5 === 0) {
        return 'FACE_SLAP';
      }
      // 每 10 集阶级反转 -> CLASS_REVERSAL
      if (episodeIndex % 10 === 0) {
        return 'CLASS_REVERSAL';
      }
      return 'GENERAL_ESCALATION';

    default:
      return 'GENERAL_ESCALATION';
  }
}

export function getPacingContext(project: Project, episodeIndex: number): PacingContext {
  const templateId = project.pacingTemplateId;
  const template = getTemplate(templateId);

  const actNumber = getActForEpisode(episodeIndex, template);
  const currentAct = template.acts.find(a => a.act === actNumber);
  if (!currentAct) {
    throw new Error(`Act ${actNumber} not found in template ${templateId}`);
  }

  const progressType = getProgressType(templateId, episodeIndex, actNumber, template);
  const minHookStrength: HookStrength = progressType !== 'GENERAL_ESCALATION' ? 'STRONG' : 'NORMAL';

  // M5-1.2: 红果节奏偏好层 - 注入红果专属提示
  let platformHints;
  if (project.platformId === 'hongguo') {
    platformHints = getHongguoPacingHints(project.genre);
  }

  return {
    templateId,
    episodeIndex,
    actNumber,
    actGoal: currentAct.goal,
    actRange: currentAct.range,
    hardRules: template.hardRules,
    kpi: {
      requireProgress: true,
      progressType,
      minHookStrength
    },
    platformHints // 新增：平台特有提示
  };
}


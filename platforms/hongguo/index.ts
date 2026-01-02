// M5-1: 红果短剧平台入口
// 组合规则、模板和校验器

import { PlatformConfig } from '../../types/platform';
import { rules } from './rules';
import { exportTemplateBuilder } from './exportTemplate';
import { validateForPlatform } from './validator';

export const hongguo: PlatformConfig = {
  metadata: {
    id: 'hongguo',
    name: '红果短剧',
    recommended: true
  },
  rules,
  validator: validateForPlatform,
  templateBuilder: exportTemplateBuilder
};

export default hongguo;





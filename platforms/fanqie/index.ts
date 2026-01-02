// M5-1: 番茄短剧平台入口
// 组合规则、模板和校验器

import { PlatformConfig } from '../../types/platform';
import { rules } from './rules';
import { exportTemplateBuilder } from './exportTemplate';
import { validateForPlatform } from './validator';

export const fanqie: PlatformConfig = {
  metadata: {
    id: 'fanqie',
    name: '番茄短剧'
  },
  rules,
  validator: validateForPlatform,
  templateBuilder: exportTemplateBuilder
};

export default fanqie;





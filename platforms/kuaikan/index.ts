// M5-1: 快看平台入口
// 组合规则、模板和校验器

import { PlatformConfig } from '../../types/platform';
import { rules } from './rules';
import { exportTemplateBuilder } from './exportTemplate';
import { validateForPlatform } from './validator';

export const kuaikan: PlatformConfig = {
  metadata: {
    id: 'kuaikan',
    name: '快看'
  },
  rules,
  validator: validateForPlatform,
  templateBuilder: exportTemplateBuilder
};

export default kuaikan;





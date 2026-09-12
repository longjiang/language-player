/**
 * Tasks for Life in China (HSK 4) — 学生用书.
 *
 * The pilot book for SPEC-095. Unit 6 (第六单元 交通出行) is the first unit
 * authored; further units are added as lessons under `uNN/`.
 */

import type { BookMeta, UnitMeta } from '../../types';
import { lessonA } from './u06/lesson-a';
import { lessonB } from './u06/lesson-b';
import { lessonC } from './u06/lesson-c';
import { lessonD } from './u06/lesson-d';
import { lessonE } from './u06/lesson-e';

/**
 * Bump whenever authored answers or blank ids change. (2: lessons A and C added,
 * plus B ➊ and the comparison table for B ➋. 3: lessons D and E added.)
 *
 * Responses saved against an older version are discarded on load (ADR-0044),
 * because a re-authored task can leave a saved answer pointing at the wrong
 * blank.
 */
export const TBLT_HSK4_CONTENT_VERSION = 3;

const unit06: UnitMeta = {
  id: 'u06',
  number: 6,
  title: '交通出行',
  lessons: [lessonA, lessonB, lessonC, lessonD, lessonE],
};

export const tbltHsk4: BookMeta = {
  id: 'tblt-hsk4',
  title: 'Tasks for Life in China (HSK 4)',
  l2: 'zh',
  contentVersion: TBLT_HSK4_CONTENT_VERSION,
  units: [unit06],
};

import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTS,getQuestPoints,getQuestCompletion} from '../src/questLogic.js';
test('routine metrics report only recorded tasks',()=>{assert.equal(getQuestCompletion([]),0);assert.equal(getQuestPoints([]),0);assert.equal(getQuestCompletion(QUESTS.map(q=>q.id)),100);});

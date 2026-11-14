import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTS,getQuestCompletion,getQuestPoints} from '../src/questLogic.js';
test('mission routine totals and dedupes task completion',()=>{assert.equal(QUESTS.length,5);assert.equal(getQuestPoints(['morning','morning','quality']),35);assert.equal(getQuestPoints([]),0);assert.equal(getQuestCompletion(['morning','quality']),40);});

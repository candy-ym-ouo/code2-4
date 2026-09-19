import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHour, summarizeCourierLoad } from '../../client/src/utils.js';

test('时间格式不会产生 60 分钟并正确处理跨小时进位', () => {
  assert.equal(formatHour(7.999), '08:00');
  assert.equal(formatHour(8.996), '09:00');
  assert.equal(formatHour(12.5), '12:30');
  assert.equal(formatHour(23.999), '24:00');
  assert.equal(formatHour(Number.NaN), '--:--');
});

const COURIERS = [
  { id: 'zephyr', name: '风信子号', capacity: 11, maxLetters: 5 },
  { id: 'comet', name: '彗尾号', capacity: 7, maxLetters: 3 }
];

function letter(id, weight) {
  return { id, weight };
}

test('本地复算同时统计封数与载重，合法装载不产生问题', () => {
  const letters = [letter('L1', 3.2), letter('L2', 4.1)];
  const assignments = letters.map((item, index) => ({ letterId: item.id, courierId: 'zephyr', order: index }));

  const { loads, issues } = summarizeCourierLoad(COURIERS, assignments, letters);

  const zephyr = loads.find((load) => load.courierId === 'zephyr');
  assert.equal(zephyr.letterCount, 2);
  assert.equal(zephyr.maxLetters, 5);
  assert.equal(zephyr.totalWeight, 7.3);
  assert.equal(zephyr.capacity, 11);
  assert.equal(zephyr.countOver, false);
  assert.equal(zephyr.weightOver, false);
  assert.equal(issues.length, 0);
});

test('封数与载重各自超限都会给出与服务端一致的错误码、文案与信使定位', () => {
  const letters = [letter('L1', 1), letter('L2', 1), letter('L3', 1), letter('L4', 1)];
  const assignments = letters.map((item, index) => ({ letterId: item.id, courierId: 'comet', order: index }));

  const { loads, issues } = summarizeCourierLoad(COURIERS, assignments, letters);

  const comet = loads.find((load) => load.courierId === 'comet');
  assert.equal(comet.letterCount, 4);
  assert.equal(comet.countOver, true);
  assert.equal(comet.weightOver, false);

  const countIssue = issues.find((issue) => issue.code === 'LETTER_LIMIT_EXCEEDED');
  assert.ok(countIssue);
  assert.equal(countIssue.courierId, 'comet');
  assert.equal(countIssue.message, '彗尾号 最多携带 3 封，当前为 4 封。');

  const heavy = [letter('H1', 3.4), letter('H2', 3.7)];
  const heavyAssignments = heavy.map((item, index) => ({ letterId: item.id, courierId: 'comet', order: index }));
  const weightResult = summarizeCourierLoad(COURIERS, heavyAssignments, heavy);

  const weightIssue = weightResult.issues.find((issue) => issue.code === 'WEIGHT_LIMIT_EXCEEDED');
  assert.ok(weightIssue);
  assert.equal(weightIssue.courierId, 'comet');
  assert.equal(weightIssue.message, '彗尾号 载重上限 7 kg，当前为 7.1 kg。');
});

test('浮点累加误差不会把刚好满载误报为超重', () => {
  const letters = [letter('A', 0.1), letter('B', 0.2)];
  const assignments = letters.map((item, index) => ({ letterId: item.id, courierId: 'comet', order: index }));
  const couriers = [{ id: 'comet', name: '彗尾号', capacity: 0.3, maxLetters: 3 }];

  const { loads, issues } = summarizeCourierLoad(couriers, assignments, letters);

  assert.equal(loads[0].totalWeight, 0.3);
  assert.equal(loads[0].weightOver, false);
  assert.equal(issues.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapacityIssues,
  formatHour,
  hasCapacityOverflow,
  summarizeCourierLoads
} from '../../client/src/utils.js';

const COURIERS = [
  { id: 'swift', name: '疾风号', maxLetters: 2, capacity: 5 },
  { id: 'heavy', name: '载山号', maxLetters: 4, capacity: 12 }
];

const LETTERS = [
  { id: 'L1', weight: 2.5 },
  { id: 'L2', weight: 2.5 },
  { id: 'L3', weight: 0.1 },
  { id: 'L4', weight: 0.2 },
  { id: 'L5', weight: 1.4 }
];

function assign(letterId, courierId) {
  return { letterId, courierId, targetIslandId: 'sun', order: 0 };
}

test('时间格式不会产生 60 分钟并正确处理跨小时进位', () => {
  assert.equal(formatHour(7.999), '08:00');
  assert.equal(formatHour(8.996), '09:00');
  assert.equal(formatHour(12.5), '12:30');
  assert.equal(formatHour(23.999), '24:00');
  assert.equal(formatHour(Number.NaN), '--:--');
});

test('恰好装满封数与载重上限时不判定超限', () => {
  const loads = summarizeCourierLoads(COURIERS, [assign('L1', 'swift'), assign('L2', 'swift')], LETTERS);
  const swift = loads.get('swift');

  assert.equal(swift.letterCount, 2);
  assert.equal(swift.totalWeight, 5);
  assert.equal(swift.overLimit, false);
  assert.equal(hasCapacityOverflow(loads), false);
  assert.deepEqual(buildCapacityIssues(COURIERS, loads), []);
});

test('封数超限会定位到具体信使并给出超出数量', () => {
  const loads = summarizeCourierLoads(
    COURIERS,
    [assign('L3', 'swift'), assign('L4', 'swift'), assign('L5', 'swift')],
    LETTERS
  );
  const swift = loads.get('swift');

  assert.equal(swift.letterCount, 3);
  assert.equal(swift.countOverBy, 1);
  assert.equal(swift.weightOverBy, 0);
  assert.equal(swift.overLimit, true);
  assert.equal(loads.get('heavy').overLimit, false);
  assert.equal(hasCapacityOverflow(loads), true);

  const issues = buildCapacityIssues(COURIERS, loads);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'LETTER_LIMIT_EXCEEDED');
  assert.equal(issues[0].courierId, 'swift');
  assert.equal(issues[0].message, '疾风号 最多携带 2 封，当前为 3 封。');
});

test('载重超限会按 0.1 kg 精度给出超出量', () => {
  const loads = summarizeCourierLoads(
    COURIERS,
    [assign('L1', 'swift'), assign('L2', 'swift'), assign('L3', 'swift')],
    LETTERS
  );
  const swift = loads.get('swift');

  assert.equal(swift.totalWeight, 5.1);
  assert.equal(swift.weightOverBy, 0.1);
  assert.equal(swift.overLimit, true);

  const issues = buildCapacityIssues(COURIERS, loads);
  assert.ok(issues.some((issue) => (
    issue.code === 'WEIGHT_LIMIT_EXCEEDED' &&
    issue.courierId === 'swift' &&
    issue.message === '疾风号 载重上限 5 kg，当前为 5.1 kg。'
  )));
});

test('浮点求和误差不会被误判为超限', () => {
  const letters = [
    { id: 'F1', weight: 0.1 },
    { id: 'F2', weight: 0.2 },
    { id: 'F3', weight: 1.1 }
  ];
  const couriers = [{ id: 'tiny', name: '轻羽号', maxLetters: 3, capacity: 1.4 }];
  const loads = summarizeCourierLoads(
    couriers,
    letters.map((letter) => assign(letter.id, 'tiny')),
    letters
  );
  const tiny = loads.get('tiny');

  assert.equal(tiny.totalWeight, 1.4);
  assert.equal(tiny.weightOverBy, 0);
  assert.equal(tiny.overLimit, false);
});

test('未知信使或邮件的调度项会被忽略而不是抛错', () => {
  const loads = summarizeCourierLoads(
    COURIERS,
    [assign('L1', 'swift'), assign('GHOST', 'swift'), assign('L2', 'unknown-courier')],
    LETTERS
  );

  assert.equal(loads.get('swift').letterCount, 1);
  assert.equal(loads.get('swift').totalWeight, 2.5);
  assert.equal(loads.has('unknown-courier'), false);
});

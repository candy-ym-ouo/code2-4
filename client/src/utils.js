export function formatHour(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return '--:--';

  const totalMinutes = Math.round(numericValue * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// 与服务端 validateAssignmentPlan 保持一致的载重判定：先按 0.1 kg 舍入，再留 0.001 浮点余量。
const WEIGHT_EPSILON = 0.001;

function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}

export function summarizeCourierLoads(couriers = [], assignments = [], letters = []) {
  const letterMap = new Map(letters.map((letter) => [letter.id, letter]));
  const loads = new Map();

  for (const courier of couriers) {
    loads.set(courier.id, {
      courierId: courier.id,
      maxLetters: courier.maxLetters,
      capacity: courier.capacity,
      letterCount: 0,
      totalWeight: 0,
      countOverBy: 0,
      weightOverBy: 0,
      overLimit: false
    });
  }

  for (const assignment of assignments) {
    const load = loads.get(assignment?.courierId);
    const letter = letterMap.get(assignment?.letterId);
    if (!load || !letter || !Number.isFinite(letter.weight)) continue;
    load.letterCount += 1;
    load.totalWeight += letter.weight;
  }

  for (const load of loads.values()) {
    load.totalWeight = roundToTenth(load.totalWeight);
    load.countOverBy = Math.max(0, load.letterCount - load.maxLetters);
    load.weightOverBy = load.totalWeight > load.capacity + WEIGHT_EPSILON
      ? roundToTenth(load.totalWeight - load.capacity)
      : 0;
    load.overLimit = load.countOverBy > 0 || load.weightOverBy > 0;
  }

  return loads;
}

export function hasCapacityOverflow(loads) {
  for (const load of loads.values()) {
    if (load.overLimit) return true;
  }
  return false;
}

// 文案与服务端 LETTER_LIMIT_EXCEEDED / WEIGHT_LIMIT_EXCEEDED 保持一致，
// 本地即时提示在服务端预览返回后无缝切换，不会闪烁。
export function buildCapacityIssues(couriers = [], loads = new Map()) {
  const issues = [];
  for (const courier of couriers) {
    const load = loads.get(courier.id);
    if (!load) continue;
    if (load.countOverBy > 0) {
      issues.push({
        code: 'LETTER_LIMIT_EXCEEDED',
        courierId: courier.id,
        message: `${courier.name} 最多携带 ${courier.maxLetters} 封，当前为 ${load.letterCount} 封。`
      });
    }
    if (load.weightOverBy > 0) {
      issues.push({
        code: 'WEIGHT_LIMIT_EXCEEDED',
        courierId: courier.id,
        message: `${courier.name} 载重上限 ${courier.capacity} kg，当前为 ${load.totalWeight} kg。`
      });
    }
  }
  return issues;
}

export function formatHour(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return '--:--';

  const totalMinutes = Math.round(numericValue * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// 与服务端 engine.js 的 round(..., 1) 保持一致，避免 0.1 + 0.2 这类浮点误差造成误判。
export function roundWeight(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/**
 * 即时复算每位信使的封数 / 载重占用。
 * 规则、错误码与文案必须与服务端 validateAssignmentPlan 完全一致：
 * 服务端是最终裁决，这里只用于调整后立刻给出提示，绝不能反过来放宽限制。
 */
export function summarizeCourierLoad(couriers, assignments = [], letters = []) {
  const letterMap = new Map(letters.map((letter) => [letter.id, letter]));

  const loads = couriers.map((courier) => {
    const carriedLetters = assignments
      .filter((assignment) => assignment.courierId === courier.id)
      .map((assignment) => letterMap.get(assignment.letterId))
      .filter(Boolean);
    const letterCount = carriedLetters.length;
    const totalWeight = roundWeight(carriedLetters.reduce((sum, letter) => sum + letter.weight, 0));
    const countOver = letterCount > courier.maxLetters;
    const weightOver = totalWeight > courier.capacity + 0.001;

    return {
      courierId: courier.id,
      courierName: courier.name,
      letterCount,
      maxLetters: courier.maxLetters,
      totalWeight,
      capacity: courier.capacity,
      countOver,
      weightOver,
      over: countOver || weightOver
    };
  });

  const issues = [];
  for (const load of loads) {
    if (load.countOver) {
      issues.push({
        code: 'LETTER_LIMIT_EXCEEDED',
        courierId: load.courierId,
        message: `${load.courierName} 最多携带 ${load.maxLetters} 封，当前为 ${load.letterCount} 封。`
      });
    }
    if (load.weightOver) {
      issues.push({
        code: 'WEIGHT_LIMIT_EXCEEDED',
        courierId: load.courierId,
        message: `${load.courierName} 载重上限 ${load.capacity} kg，当前为 ${load.totalWeight} kg。`
      });
    }
  }

  return { loads, issues };
}

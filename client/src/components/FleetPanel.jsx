import { useEffect, useRef, useState } from 'react';
import { formatHour } from '../utils.js';

const OUTCOME = {
  'on-time': { label: '准时', className: 'success' },
  late: { label: '逾时', className: 'warning' },
  wrong: { label: '误投', className: 'danger' },
  'wrong-late': { label: '误投·逾时', className: 'danger' }
};

// 只有装载类问题可以定位到具体信使卡片；其余问题保持普通文本展示。
const LOCATABLE_CODES = new Set(['LETTER_LIMIT_EXCEEDED', 'WEIGHT_LIMIT_EXCEEDED']);


function RouteLetter({ entry, index, total, game, routeResult, busy, onChangeTarget, onMove, onUnassign }) {
  const recipientIslands = game.islands.filter((island) => island.id !== 'skyport');
  const projection = routeResult?.letters.find((letter) => letter.letterId === entry.letterId);
  const outcome = projection ? OUTCOME[projection.outcome] : null;

  return (
    <div className="route-letter">
      <div className="route-sequence">{index + 1}</div>
      <div className="route-letter-main">
        <div className="route-letter-title">
          <strong>{entry.letter.subject}</strong>
          <code>{entry.letter.id}</code>
        </div>
        <div className="route-letter-controls">
          <label>
            <span>投递至</span>
            <select
              value={entry.targetIslandId}
              onChange={(event) => onChangeTarget(entry.letterId, event.target.value)}
              aria-label={`${entry.letter.id} 的投递目标`}
              disabled={busy}
            >
              {recipientIslands.map((island) => (
                <option key={island.id} value={island.id}>
                  {island.name}{island.id === entry.letter.recipientIslandId ? '（原址）' : ''}
                </option>
              ))}
            </select>
          </label>
          <span>{entry.letter.weight.toFixed(1)} kg · 紧急度 {entry.letter.urgency}</span>
          {projection && <span className={`outcome ${outcome?.className || ''}`}>{outcome?.label} {formatHour(projection.arrivalHour)}</span>}
        </div>
      </div>
      <div className="route-letter-buttons">
        <button type="button" disabled={busy || index === 0} onClick={() => onMove(entry.letterId, -1)} aria-label="路线中前移">↑</button>
        <button type="button" disabled={busy || index === total - 1} onClick={() => onMove(entry.letterId, 1)} aria-label="路线中后移">↓</button>
        <button type="button" className="remove-button" disabled={busy} onClick={() => onUnassign(entry.letterId)} aria-label="移出路线">×</button>
      </div>
    </div>
  );
}

function CapacityRow({ label, used, limit, unit, over, fillColor, barClassName = '' }) {
  const ratio = limit > 0 ? used / limit : 0;
  const percent = Math.round(Math.min(1, ratio) * 100);
  const exact = !over && ratio >= 1;
  const remaining = Math.max(0, limit - used);

  return (
    <div className={`capacity-row ${over ? 'over' : exact ? 'full' : ''}`}>
      <span>
        {label} <b className={over ? 'capacity-value-over' : ''}>{Number.isInteger(used) ? used : used.toFixed(1)}</b>
        {' / '}{limit} {unit}
      </span>
      <div className={`capacity-track ${over ? 'over' : exact ? 'full' : ''} ${barClassName}`}>
        <i style={{ width: `${Math.min(100, ratio * 100)}%`, background: over || exact ? undefined : fillColor }} />
      </div>
      <b>
        {over
          ? <span className="capacity-flag">超限 {Number.isInteger(used - limit) ? used - limit : (used - limit).toFixed(1)}{unit === 'kg' ? ' kg' : ' 封'}</span>
          : exact
            ? '已满'
            : `余 ${remaining}${unit === 'kg' ? ' kg' : ' 封'}`}
      </b>
    </div>
  );
}

export default function FleetPanel({
  game,
  assignments,
  preview,
  loads = [],
  issues = [],
  recalculating = false,
  busy,
  onMove,
  onUnassign,
  onChangeTarget
}) {
  const letterMap = new Map(game.letters.map((letter) => [letter.id, letter]));
  const cardRefs = useRef(new Map());
  const flashTimers = useRef(new Map());
  const [flashId, setFlashId] = useState(null);

  useEffect(() => () => {
    flashTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function locateCourier(courierId) {
    const element = cardRefs.current.get(courierId);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(courierId);
    const previousTimer = flashTimers.current.get(courierId);
    if (previousTimer) window.clearTimeout(previousTimer);
    flashTimers.current.set(courierId, window.setTimeout(() => {
      setFlashId((current) => (current === courierId ? null : current));
      flashTimers.current.delete(courierId);
    }, 2000));
  }

  return (
    <section className="panel fleet-panel" aria-labelledby="fleet-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">三艘信使艇</p>
          <h2 id="fleet-title">装载与航线</h2>
        </div>
        {recalculating
          ? <span className="plan-pending">复算中…</span>
          : issues.length > 0
            ? <span className="plan-invalid">超限 {issues.length} 项</span>
            : preview?.valid
              ? <span className="plan-valid">方案合法</span>
              : <span className="plan-invalid">需要调整</span>}
      </div>

      {issues.length > 0 && (
        <div className="validation-issues" role="alert">
          {issues.map((issue, index) => (
            LOCATABLE_CODES.has(issue.code) && issue.courierId ? (
              <button
                key={`${issue.code}-${index}`}
                type="button"
                className="issue-locator"
                onClick={() => locateCourier(issue.courierId)}
              >
                <span>⚠ {issue.message}</span>
                <i>定位 →</i>
              </button>
            ) : (
              <p key={`${issue.code}-${index}`}>{issue.message}</p>
            )
          ))}
        </div>
      )}

      <div className="fleet-list">
        {game.couriers.map((courier) => {
          const entries = assignments
            .filter((assignment) => assignment.courierId === courier.id)
            .sort((first, second) => first.order - second.order)
            .map((assignment) => ({ ...assignment, letter: letterMap.get(assignment.letterId) }))
            .filter((assignment) => assignment.letter);
          const fallbackWeight = entries.reduce((sum, entry) => sum + entry.letter.weight, 0);
          const load = loads.find((item) => item.courierId === courier.id) || {
            letterCount: entries.length,
            maxLetters: courier.maxLetters,
            totalWeight: Math.round(fallbackWeight * 10) / 10,
            capacity: courier.capacity,
            countOver: entries.length > courier.maxLetters,
            weightOver: fallbackWeight > courier.capacity + 0.001,
            over: entries.length > courier.maxLetters || fallbackWeight > courier.capacity + 0.001
          };
          const routeResult = preview?.routes?.find((route) => route.courierId === courier.id);

          return (
            <article
              className={`courier-card ${load.over ? 'courier-card-over' : ''} ${flashId === courier.id ? 'courier-flash' : ''}`}
              key={courier.id}
              ref={(element) => {
                if (element) cardRefs.current.set(courier.id, element);
                else cardRefs.current.delete(courier.id);
              }}
            >
              <div className="courier-header">
                <div className="courier-identity">
                  <span className="courier-mark" style={{ background: courier.color }}>{courier.callSign.slice(0, 1)}</span>
                  <div>
                    <h3>{courier.name}</h3>
                    <p>{courier.callSign} · {courier.description}</p>
                  </div>
                </div>
                <div className="courier-timing">
                  <span className={load.countOver ? 'capacity-value-over' : ''}>
                    封数 <b>{load.letterCount}/{courier.maxLetters}</b>
                    {load.countOver && <em className="capacity-tag">封数超限</em>}
                  </span>
                  <strong>{routeResult ? `${formatHour(routeResult.startHour)} → ${formatHour(routeResult.endHour)}` : '待命'}</strong>
                </div>
              </div>

              <CapacityRow
                label="封数"
                used={load.letterCount}
                limit={courier.maxLetters}
                unit="封"
                over={load.countOver}
                fillColor="linear-gradient(90deg, var(--blue), var(--cyan))"
                barClassName="count-track"
              />
              <CapacityRow
                label="载重"
                used={load.totalWeight}
                limit={courier.capacity}
                unit="kg"
                over={load.weightOver}
                fillColor={courier.color}
              />

              <div className="route-letters">
                {entries.length === 0 ? (
                  <p className="empty-lane">尚未分配邮件</p>
                ) : entries.map((entry, index) => (
                  <RouteLetter
                    key={entry.letterId}
                    entry={entry}
                    index={index}
                    total={entries.length}
                    game={game}
                    routeResult={routeResult}
                    busy={busy}
                    onChangeTarget={onChangeTarget}
                    onMove={onMove}
                    onUnassign={onUnassign}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

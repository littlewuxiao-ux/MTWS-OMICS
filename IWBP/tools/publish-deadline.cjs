/**
 * 发布截止时刻（北京时）计算，供服务端与兜底提醒共用
 */

function getBeijingParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || "0";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")) % 24,
    minute: Number(pick("minute")),
  };
}

function addCalendarDays(y, m, d, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** 北京时本地时刻 → ISO（UTC） */
function beijingLocalToIso(year, month, day, hour, minute = 0) {
  let y = year;
  let mo = month;
  let da = day;
  let h = hour;
  let mi = minute;
  if (h >= 24) {
    const next = addCalendarDays(y, mo, da, 1);
    y = next.year;
    mo = next.month;
    da = next.day;
    h -= 24;
  }
  return new Date(Date.UTC(y, mo - 1, da, h - 8, mi)).toISOString();
}

function parseYmd(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function computePeriodDeadlineIso(periodSlotId, anchorYmd, savedAt) {
  const anchor = parseYmd(anchorYmd) || getBeijingParts(savedAt ? new Date(savedAt) : new Date());
  const { year, month, day } = anchor;
  if (periodSlotId === "h4") return beijingLocalToIso(year, month, day, 4);
  if (periodSlotId === "h12") return beijingLocalToIso(year, month, day, 8);
  if (periodSlotId === "h8") return beijingLocalToIso(year, month, day, 20);
  return null;
}

function computePublishDeadlineAt(entry) {
  if (!entry || entry.pushedToNext) return entry?.publishDeadlineAt || null;
  const type = String(entry.type || "");
  const savedAt = entry.savedAt || new Date().toISOString();

  if (type === "period") {
    return computePeriodDeadlineIso(entry.periodSlotId, entry.anchorYmd, savedAt);
  }

  if (type === "brush") {
    const anchor = parseYmd(entry.anchorYmd) || getBeijingParts(new Date(savedAt));
    return beijingLocalToIso(anchor.year, anchor.month, anchor.day, 24, 0);
  }

  if (type === "alert") {
    return new Date(new Date(savedAt).getTime() + 15 * 60000).toISOString();
  }

  return null;
}

function classifyPublishUrgency(entry, nowMs = Date.now()) {
  if (!entry || entry.pushedToNext) return "done";
  const deadlineIso = entry.publishDeadlineAt || computePublishDeadlineAt(entry);
  if (!deadlineIso) return "pending";
  const deadlineMs = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadlineMs)) return "pending";
  if (nowMs > deadlineMs) return "overdue";
  const type = String(entry.type || "");
  const warnLeadMs =
    type === "alert" ? 5 * 60000 : type === "brush" ? 120 * 60000 : 90 * 60000;
  if (deadlineMs - nowMs <= warnLeadMs) return "due_soon";
  return "pending";
}

module.exports = {
  getBeijingParts,
  beijingLocalToIso,
  computePeriodDeadlineIso,
  computePublishDeadlineAt,
  classifyPublishUrgency,
};

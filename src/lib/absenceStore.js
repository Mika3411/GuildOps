const ABSENCE_STORAGE_PREFIX = "guildops:absences:v1:";

const STATUS_ORDER = Object.freeze({
  active: 0,
  upcoming: 1,
  past: 2,
});

const FALLBACK_MEMBER_NAME = "Membre";

function toDateInputDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value) {
  const normalized = toDateInputDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getTodayInputValue(now = new Date()) {
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function getAbsenceGuildKey(guild) {
  const rawKey = guild?.id || guild?.slug || guild?.name || guild?.guildName || "default";
  return String(rawKey)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

export function getAbsenceStorageKey(guild) {
  return `${ABSENCE_STORAGE_PREFIX}${getAbsenceGuildKey(guild)}`;
}

export function getCurrentMemberName(currentUser) {
  return (
    currentUser?.displayName ||
    currentUser?.name ||
    currentUser?.username ||
    currentUser?.email ||
    FALLBACK_MEMBER_NAME
  );
}

export function getCurrentMemberId(currentUser) {
  return currentUser?.id || currentUser?.email || currentUser?.username || "local-member";
}

export function createAbsenceDraft(currentUser, now = new Date()) {
  const today = getTodayInputValue(now);

  return {
    memberName: getCurrentMemberName(currentUser),
    startDate: today,
    endDate: today,
    reason: "",
  };
}

export function normalizeAbsence(absence) {
  if (!absence || typeof absence !== "object") return null;
  const startDate = toDateInputDate(absence.startDate || absence.startsAt || absence.from);
  const initialEndDate = toDateInputDate(absence.endDate || absence.endsAt || absence.to) || startDate;
  if (!startDate || !initialEndDate) return null;

  const startTime = parseDateInput(startDate)?.getTime() || 0;
  const endTime = parseDateInput(initialEndDate)?.getTime() || startTime;
  const endDate = endTime < startTime ? startDate : initialEndDate;
  const memberName = String(absence.memberName || absence.member || FALLBACK_MEMBER_NAME).trim() || FALLBACK_MEMBER_NAME;
  const reason = String(absence.reason || absence.motif || "").trim();
  const createdAt = absence.createdAt || new Date().toISOString();

  return {
    id: String(absence.id || `absence-${createdAt}-${memberName}`).replace(/\s+/g, "-"),
    memberId: String(absence.memberId || absence.userId || "local-member"),
    memberName,
    startDate,
    endDate,
    reason,
    createdAt,
    updatedAt: absence.updatedAt || createdAt,
  };
}

export function getAbsenceStatus(absence, now = new Date()) {
  const today = getTodayInputValue(now);
  if (absence.endDate < today) return "past";
  if (absence.startDate > today) return "upcoming";
  return "active";
}

export function getAbsenceDurationDays(absence) {
  const start = parseDateInput(absence.startDate);
  const end = parseDateInput(absence.endDate);
  if (!start || !end) return 1;

  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
}

export function sortAbsences(absences = [], now = new Date()) {
  return [...absences].sort((a, b) => {
    const statusDelta = STATUS_ORDER[getAbsenceStatus(a, now)] - STATUS_ORDER[getAbsenceStatus(b, now)];
    if (statusDelta) return statusDelta;

    if (getAbsenceStatus(a, now) === "past") {
      return b.endDate.localeCompare(a.endDate) || b.createdAt.localeCompare(a.createdAt);
    }

    return a.startDate.localeCompare(b.startDate) || a.memberName.localeCompare(b.memberName);
  });
}

export function summarizeAbsences(absences = [], now = new Date()) {
  return absences.reduce(
    (summary, absence) => {
      const status = getAbsenceStatus(absence, now);
      summary[status] += 1;
      if (status !== "past") {
        summary.coveredDays += getAbsenceDurationDays(absence);
      }
      return summary;
    },
    { active: 0, upcoming: 0, past: 0, coveredDays: 0 },
  );
}

export function loadAbsences(guild) {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(getAbsenceStorageKey(guild));
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return sortAbsences((Array.isArray(parsed) ? parsed : []).map(normalizeAbsence).filter(Boolean));
  } catch {
    return [];
  }
}

export function saveAbsences(guild, absences = []) {
  if (typeof window === "undefined") return;

  const normalizedAbsences = sortAbsences(absences.map(normalizeAbsence).filter(Boolean));
  window.localStorage.setItem(getAbsenceStorageKey(guild), JSON.stringify(normalizedAbsences));
}

export function formatAbsenceDate(value) {
  const date = parseDateInput(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatAbsenceDateRange(absence) {
  if (absence.startDate === absence.endDate) {
    return formatAbsenceDate(absence.startDate);
  }

  return `du ${formatAbsenceDate(absence.startDate)} au ${formatAbsenceDate(absence.endDate)}`;
}

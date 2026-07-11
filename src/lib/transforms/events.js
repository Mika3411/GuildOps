import {
  eventColors,
  eventStatusKeys
} from "../../config/guildOpsConfig.js";

export function buildEventStatusMap(eventList = []) {
  return eventStatusKeys.reduce((map, key, index) => {
    map[key] = eventList[index]?.id || "";
    return map;
  }, {});
}

export function buildWarSummary({ eventSummary, events: scheduleEvents = [], members = [] }) {
  const attendanceRate = eventSummary?.attendanceRate || buildLocalAttendanceRate(members);
  const expectedMembers =
    eventSummary?.expectedMembers ||
    members.filter((member) => ["Confirme", "Peut-etre"].includes(member.allianceWar));

  return {
    nextEvent: eventSummary?.nextEvent || scheduleEvents[0] || null,
    attendanceRate,
    expectedMembers,
    weeklyObjectives:
      eventSummary?.weeklyObjectives ||
      {
        total: 0,
        done: 0,
        completionRate: 0,
        objectives: [],
      },
  };
}

export function buildLocalAttendanceRate(members = []) {
  const confirmed = members.filter((member) => member.allianceWar === "Confirme").length;
  const maybe = members.filter((member) => member.allianceWar === "Peut-etre").length;
  const absent = members.filter((member) => member.allianceWar === "Absent").length;
  const activeMembers = members.length;

  return {
    activeMembers,
    confirmed,
    maybe,
    absent,
    pending: Math.max(activeMembers - confirmed - maybe - absent, 0),
    expected: confirmed + maybe,
    rate: activeMembers ? confirmed / activeMembers : 0,
  };
}

export function buildTimelineEvents(eventList = []) {
  return eventList.slice(0, 5).map((event, index) => ({
    id: event.id || `${event.title || event.label}-${index}`,
    label: formatEventTitle(event) || `Event ${index + 1}`,
    time: event.time || formatEventWhen(event) || "A planifier",
    color: event.color || eventColors[index % eventColors.length],
  }));
}

export function normalizeEvent(event = {}) {
  const startsAt = event.startsAt || event.starts_at || new Date().toISOString();
  const title = event.title || event.label || "Event de guilde";
  const eventType = event.eventType || event.event_type || event.type || "other";

  return {
    id: event.id || `local-event-${Date.now()}`,
    guildId: event.guildId || event.guild_id || "",
    title,
    label: title,
    eventType,
    type: eventType,
    description: event.description || "",
    startsAt,
    endsAt: event.endsAt || event.ends_at || null,
    time: event.time || formatEventWhen({ startsAt }),
    locationLabel: event.locationLabel || event.location_label || "",
    locationX: event.locationX ?? event.location_x ?? "",
    locationY: event.locationY ?? event.location_y ?? "",
    reminderOffsetsMinutes: normalizeReminderOffsets(event.reminderOffsetsMinutes || event.reminder_offsets_minutes),
    color: event.color,
    status: event.status || formatRelativeEventTime({ startsAt }),
  };
}

export function normalizeReminderOffsets(value = [1440, 60]) {
  const allowed = new Set([1440, 60, 15]);
  const source = Array.isArray(value) ? value : [1440, 60];
  return [...new Set(source.map(Number).filter((offset) => allowed.has(offset)))].sort((left, right) => right - left);
}

export function getDefaultEventDateInput(offsetMs = 3600000) {
  const date = new Date(Date.now() + offsetMs);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function formatEventTitle(event) {
  return event?.label || event?.title || "";
}

export function formatEventWhen(event) {
  if (!event?.startsAt) return event?.time || "";

  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) return event.time || "";

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatRelativeEventTime(event) {
  if (!event?.startsAt) return "A planifier";

  const startsAt = new Date(event.startsAt).getTime();
  if (Number.isNaN(startsAt)) return "Planifie";

  const diffMinutes = Math.round((startsAt - Date.now()) / 60000);
  if (diffMinutes < -120) return "Termine";
  if (diffMinutes <= 0) return "En cours";
  if (diffMinutes < 60) return `Dans ${diffMinutes}m`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes ? `Dans ${hours}h ${minutes}m` : `Dans ${hours}h`;
}

export function toApiAttendanceStatus(status) {
  if (status === "Confirme") return "confirmed";
  if (status === "Absent") return "absent";
  return "maybe";
}

export function resolveMemberStatus(members = [], currentUser = {}) {
  return members.find((member) => isCurrentUserMember(member.id, members, currentUser))?.allianceWar;
}

export function resolveCurrentMemberId(members = [], currentUser = {}) {
  return members.find((member) => member.userId === currentUser.id || member.id === currentUser.id)?.id || currentUser.id;
}

export function isCurrentUserMember(memberId, members = [], currentUser = {}) {
  return Boolean(
    memberId === currentUser.id ||
      members.some((member) => member.id === memberId && (member.userId === currentUser.id || member.id === currentUser.id)),
  );
}

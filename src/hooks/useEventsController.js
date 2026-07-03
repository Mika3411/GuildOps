import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  events as fallbackEvents
} from "../data/guildOpsMockData.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  can
} from "../lib/rbac.js";
import {
  buildEventStatusMap,
  buildWarSummary,
  getApiGuildId,
  isCurrentUserMember,
  isUuid,
  normalizeEvent,
  parseCoordinate,
  resolveCurrentMemberId,
  resolveMemberStatus,
  toApiAttendanceStatus
} from "../lib/guildOpsTransforms.js";

export function useEventsController({ apiEnabled, currentUser, selectedGuild, guildOpsData, moduleEnabled = true }) {
  const [eventsState, setEventsState] = useState(() => (moduleEnabled ? guildOpsData.events : []));
  const [members, setMembers] = useState(() => guildOpsData.members);
  const [selfStatus, setSelfStatus] = useState("Confirme");
  const [eventSummary, setEventSummary] = useState(() => guildOpsData.eventSummary || null);
  const [checkinError, setCheckinError] = useState("");
  const [eventCreateError, setEventCreateError] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);

  const activeEvents = moduleEnabled
    ? eventsState.length
      ? eventsState
      : guildOpsData.events.length
        ? guildOpsData.events
        : apiEnabled
          ? []
          : fallbackEvents
    : [];
  const eventStatusMap = useMemo(() => buildEventStatusMap(activeEvents), [activeEvents]);
  const currentMemberId = useMemo(() => resolveCurrentMemberId(members, currentUser), [currentUser, members]);
  const warSummary = useMemo(
    () => buildWarSummary({ eventSummary, events: activeEvents, members }),
    [activeEvents, eventSummary, members],
  );

  useEffect(() => {
    setEventsState(moduleEnabled ? guildOpsData.events : []);
    setMembers(guildOpsData.members);
    setSelfStatus(resolveMemberStatus(guildOpsData.members, currentUser) || "Confirme");
    setEventSummary(moduleEnabled ? guildOpsData.eventSummary || null : null);
  }, [currentUser, guildOpsData, moduleEnabled]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setEventSummary(moduleEnabled ? guildOpsData.eventSummary || null : null);
      return undefined;
    }

    const controller = new AbortController();

    guildOpsApi
      .getEventQuickSummary(guildId, { signal: controller.signal })
      .then((payload) => {
        setEventSummary(payload?.summary || null);
        setCheckinError("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setCheckinError(error?.message || "Resume events indisponible.");
      });

    return () => controller.abort();
  }, [apiEnabled, guildOpsData.eventSummary, moduleEnabled, selectedGuild]);

  async function refreshEventSummary(guildId = getApiGuildId(selectedGuild)) {
    if (!moduleEnabled || !apiEnabled || !guildId) return;
    const payload = await guildOpsApi.getEventQuickSummary(guildId);
    setEventSummary(payload?.summary || null);
  }

  async function updateMemberStatus(memberId, eventKey, value) {
    if (!moduleEnabled) return;
    const isSelf = isCurrentUserMember(memberId, members, currentUser);

    if (!isSelf && !can(currentUser, "manage_events")) return;
    if (isSelf && eventKey === "allianceWar") setSelfStatus(value);
    setCheckinError("");

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId || (isSelf && member.userId === currentUser.id)
          ? { ...member, [eventKey]: value }
          : member,
      ),
    );

    const guildId = getApiGuildId(selectedGuild);
    const eventId = eventStatusMap[eventKey];

    if (!apiEnabled || !guildId || !isUuid(eventId)) return;

    try {
      if (isSelf) {
        await guildOpsApi.updateMyAttendance(guildId, eventId, { status: toApiAttendanceStatus(value) });
      } else if (isUuid(memberId)) {
        await guildOpsApi.updateMemberAttendance(guildId, eventId, memberId, { status: toApiAttendanceStatus(value) });
      }

      await refreshEventSummary(guildId);
    } catch (error) {
      setCheckinError(error?.message || "Check-in enregistre ici, mais pas encore partage.");
    }
  }

  function checkIn(status) {
    void updateMemberStatus(currentMemberId, "allianceWar", status);
  }

  async function createEvent(draft) {
    if (!moduleEnabled) return null;
    if (!can(currentUser, "manage_events")) return null;

    const startsAt = draft.startsAt ? new Date(draft.startsAt).toISOString() : new Date(Date.now() + 3600000).toISOString();
    const localEvent = normalizeEvent({
      ...draft,
      id: `local-event-${Date.now()}`,
      startsAt,
      createdAt: new Date().toISOString(),
    });

    setEventCreateError("");
    setCreatingEvent(true);
    setEventsState((current) => [localEvent, ...current]);

    const guildId = getApiGuildId(selectedGuild);
    if (!apiEnabled || !guildId) {
      setCreatingEvent(false);
      return localEvent;
    }

    try {
      const payload = await guildOpsApi.createEvent(guildId, {
        title: localEvent.title,
        eventType: localEvent.eventType,
        description: localEvent.description || undefined,
        startsAt: localEvent.startsAt,
        locationLabel: localEvent.locationLabel || undefined,
        locationX: parseCoordinate(localEvent.locationX),
        locationY: parseCoordinate(localEvent.locationY),
      });
      const savedEvent = normalizeEvent(payload?.event || payload);
      setEventsState((current) => [savedEvent, ...current.filter((event) => event.id !== localEvent.id && event.id !== savedEvent.id)]);
      await refreshEventSummary(guildId);
      return savedEvent;
    } catch (error) {
      setEventCreateError(error?.message || "Event cree ici, mais pas encore partage.");
      return localEvent;
    } finally {
      setCreatingEvent(false);
    }
  }

  return {
    activeEvents,
    checkIn,
    checkinError,
    createEvent,
    creatingEvent,
    currentMemberId,
    eventCreateError,
    members,
    selfStatus,
    setSelfStatus,
    updateMemberStatus,
    warSummary,
  };
}

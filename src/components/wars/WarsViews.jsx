import React, {
  useState
} from "react";
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Plus,
  Search,
  Target,
  Users,
  X
} from "lucide-react";
import {
  can,
  getGuardProps,
  getPermissionLabel,
  permissionRoles
} from "../../lib/rbac.js";
import {
  checkinStatuses
} from "../../config/guildOpsConfig.js";
import {
  buildTimelineEvents,
  getDefaultEventDateInput,
  formatEventWhen,
  normalizeReminderOffsets
} from "../../lib/guildOpsTransforms.js";
import {
  Avatar,
  EmptyState,
  PanelHeader,
  RolePill
} from "../shared/Shared.jsx";

const EVENT_REMINDER_OPTIONS = Object.freeze([
  { label: "24h avant", value: 1440 },
  { label: "1h avant", value: 60 },
  { label: "15 min avant", value: 15 },
]);

export function WarsView(props) {
  const weeklyObjectives = props.warSummary?.weeklyObjectives?.objectives?.length
    ? props.warSummary.weeklyObjectives.objectives.map((objective) => [
        objective.memberName || "Guilde",
        objective.title,
        objective.eventTitle || formatEventWhen({ startsAt: objective.dueAt }) || "Objectif hebdo",
      ])
    : [];

  return (
    <div className="page-grid">
      <EventComposer
        creating={props.creatingEvent}
        currentUser={props.currentUser}
        error={props.eventCreateError}
        onCreate={props.createEvent}
      />
      <PresencePanel
        checkinError={props.checkinError}
        currentUser={props.currentUser}
        events={props.events}
        members={props.members}
        onCheckIn={props.checkIn}
        selfStatus={props.selfStatus}
        warSummary={props.warSummary}
      />
      <section className="panel">
        <PanelHeader
          icon={Target}
          title="Rôles et objectifs d'évènement"
          meta={`${props.warSummary?.expectedMembers?.length ?? 0} membres attendus`}
        />
        <div className="objective-list">
          {weeklyObjectives.length ? (
            weeklyObjectives.map(([owner, role, target]) => (
              <div className="objective-row" key={`${owner}-${role}-${target}`}>
                <Avatar name={owner} />
                <span>
                  <strong>{owner}</strong>
                  <small>{role}</small>
                </span>
                <em>{target}</em>
              </div>
            ))
          ) : (
            <EmptyState icon={Target} title="Aucun objectif d'évènement" text="Crée un évènement ou ajoute des objectifs pour piloter les rôles." />
          )}
        </div>
      </section>
      <MemberAvailability
        currentUser={props.currentUser}
        members={props.members}
        updateMemberStatus={props.updateMemberStatus}
        warSummary={props.warSummary}
      />
    </div>
  );
}

export function EventComposer({ creating = false, currentUser, error = "", onCreate }) {
  const eventGuard = getGuardProps(currentUser, "manage_events");
  const disabled = Boolean(eventGuard.disabled || creating);
  const [draft, setDraft] = useState(() => ({
    title: "Prépa évènement",
    eventType: "alliance_war",
    startsAt: getDefaultEventDateInput(),
    locationLabel: "",
    locationX: "",
    locationY: "",
    description: "",
    reminderOffsetsMinutes: [1440, 60],
  }));

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleReminderOffset(value) {
    setDraft((current) => {
      const offsets = normalizeReminderOffsets(current.reminderOffsetsMinutes);
      const next = offsets.includes(value)
        ? offsets.filter((offset) => offset !== value)
        : normalizeReminderOffsets([...offsets, value]);

      return { ...current, reminderOffsetsMinutes: next };
    });
  }

  async function submitEvent(event) {
    event.preventDefault();
    const created = await onCreate?.(draft);
    if (!created) return;
    setDraft((current) => ({
      ...current,
      title: "",
      startsAt: getDefaultEventDateInput(2 * 3600000),
      locationLabel: "",
      locationX: "",
      locationY: "",
      description: "",
      reminderOffsetsMinutes: current.reminderOffsetsMinutes,
    }));
  }

  return (
    <section className="panel event-composer-panel">
      <PanelHeader icon={Plus} title="Créer évènement" meta={creating ? "Enregistrement" : "Évènements, rallyes, objectifs"} />
      <form className="event-form-grid" onSubmit={submitEvent}>
        <label className="form-row">
          <span>Titre</span>
          <input
            value={draft.title}
            placeholder="Bear Hunt, Forteresse, rally..."
            onChange={(event) => updateDraft("title", event.target.value)}
            disabled={disabled}
            title={eventGuard.title}
            required
          />
        </label>
        <label className="form-row">
          <span>Type</span>
          <select value={draft.eventType} onChange={(event) => updateDraft("eventType", event.target.value)} disabled={disabled} title={eventGuard.title}>
            <option value="alliance_war">Guerre alliance</option>
            <option value="fortress">Forteresse</option>
            <option value="bear_hunt">Bear Hunt</option>
            <option value="rally">Rallye</option>
            <option value="other">Autre</option>
          </select>
        </label>
        <label className="form-row">
          <span>Heure</span>
          <input type="datetime-local" value={draft.startsAt} onChange={(event) => updateDraft("startsAt", event.target.value)} disabled={disabled} required />
        </label>
        <label className="form-row">
          <span>Lieu</span>
          <input value={draft.locationLabel} placeholder="Forteresse Est" onChange={(event) => updateDraft("locationLabel", event.target.value)} disabled={disabled} />
        </label>
        <label className="form-row">
          <span>X</span>
          <input inputMode="numeric" value={draft.locationX} onChange={(event) => updateDraft("locationX", event.target.value)} disabled={disabled} />
        </label>
        <label className="form-row">
          <span>Y</span>
          <input inputMode="numeric" value={draft.locationY} onChange={(event) => updateDraft("locationY", event.target.value)} disabled={disabled} />
        </label>
        <label className="form-row wide">
          <span>Details</span>
          <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} disabled={disabled} />
        </label>
        <fieldset className="form-row wide reminder-options">
          <legend>Rappels push</legend>
          <div>
            {EVENT_REMINDER_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={draft.reminderOffsetsMinutes.includes(option.value)}
                  onChange={() => toggleReminderOffset(option.value)}
                  disabled={disabled}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <small>Les membres avec notifications push actives recevront ces rappels.</small>
        </fieldset>
        {error ? <p className="sync-warning event-warning">{error}</p> : null}
        <button className="primary-action" type="submit" disabled={disabled || !draft.title.trim() || !draft.startsAt}>
          <CalendarDays size={17} />
          {creating ? "Création..." : "Créer évènement"}
        </button>
      </form>
    </section>
  );
}

export function PresencePanel({ checkinError, currentUser, events: scheduleEvents, onCheckIn, members, selfStatus, warSummary }) {
  const localConfirmedCount = members.filter((member) => member.allianceWar === "Confirme").length;
  const attendanceRate = warSummary?.attendanceRate;
  const confirmedCount = attendanceRate?.confirmed ?? localConfirmedCount;
  const totalCount = attendanceRate?.activeMembers ?? members.length;
  const timelineEvents = buildTimelineEvents(scheduleEvents);

  return (
    <section className="panel presence-panel">
      <PanelHeader
        icon={CalendarDays}
        title="Présence - Évènements"
        meta={`${confirmedCount}/${totalCount} confirmés`}
        action={
          <div className="segmented">
            <button type="button">Agenda</button>
            <button type="button" className="is-active">
              Timeline
            </button>
          </div>
        }
      />
      <div className="self-checkin">
        <span>
          <strong>Votre statut</strong>
          <small>Prochain évènement : {formatEventWhen(warSummary?.nextEvent) || "à planifier"}</small>
          {checkinError ? <small className="sync-warning">{checkinError}</small> : null}
        </span>
        <div className="status-actions">
          {checkinStatuses.map((status) => (
            <button
              key={status}
              type="button"
              className={`status-button ${statusClass(status)} ${selfStatus === status ? "is-active" : ""}`}
              onClick={() => onCheckIn?.(status)}
            >
              {status === "Confirme" ? <Check size={16} /> : status === "Absent" ? <X size={16} /> : "?"}
              {status}
            </button>
          ))}
        </div>
      </div>
      {timelineEvents.length ? (
        <>
          <div className="timeline-table" role="table" aria-label="Planning des évènements">
            <div className="timeline-head" role="row">
              <span>Évènement</span>
              {["Dim 18", "Lun 19", "Mar 20", "Mer 21", "Jeu 22", "Ven 23", "Sam 24", "Dim 25"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            {timelineEvents.map((event, index) => (
              <div key={event.id} className="timeline-row" role="row">
                <span className="event-label">
                  <i className={`event-icon ${event.color}`} />
                  <strong>{event.label}</strong>
                  <small>{event.time}</small>
                </span>
                <span className={`event-bar span-${index + 2} ${event.color}`}>
                  {index % 2 === 0 ? "ATTENDU" : "PLANIFIÉ"}
                </span>
              </div>
            ))}
            <div className="now-line" aria-hidden="true" />
          </div>
          <div className="legend">
            <span className="ok">Confirmé</span>
            <span className="maybe">Peut-être</span>
            <span className="danger">Absent</span>
            <span className="muted">Non répondu</span>
          </div>
        </>
      ) : (
        <EmptyState icon={CalendarDays} title="Aucun évènement planifié" text="Crée un évènement pour activer la timeline et les check-ins." />
      )}
    </section>
  );
}

export function MemberAvailability({ currentUser, members, updateMemberStatus, warSummary }) {
  const canManageEvents = can(currentUser, "manage_events");
  const attendanceRate = warSummary?.attendanceRate;

  return (
    <section className="panel member-table-panel">
      <PanelHeader
        icon={ClipboardCheck}
        title="Disponibilite des membres"
        meta={
          attendanceRate
            ? `${attendanceRate.confirmed}/${attendanceRate.activeMembers} confirmes`
            : "0/0 confirmes"
        }
        action={
          <div className="table-tools">
            <label className="search-field">
              <Search size={15} />
              <input placeholder="Rechercher un membre..." />
            </label>
            <select defaultValue="Tous les roles" aria-label="Filtrer roles">
              <option>Tous les roles</option>
              {permissionRoles.map((role) => (
                <option key={role.code}>{role.role}</option>
              ))}
            </select>
          </div>
        }
      />
      <div className="data-table availability-table">
        <div className="table-row table-head">
          <span>Membre</span>
          <span>Role</span>
          <span>Puissance</span>
          <span>Guerre d'alliance</span>
          <span>Forteresse</span>
          <span>Hero Stage</span>
          <span>Bear Hunt</span>
          <span>Derniere activite</span>
        </div>
        {members.length ? members.map((member) => (
          <div className="table-row" key={member.id}>
            <span className="member-cell">
              <Avatar name={member.name} />
              {member.name}
            </span>
            <span>
              <RolePill role={member.role} />
            </span>
            <span>{member.power}</span>
            <InlineStatus
              value={member.allianceWar}
              onChange={(value) => updateMemberStatus(member.id, "allianceWar", value)}
              disabled={member.id !== currentUser.id && !canManageEvents}
            />
            <InlineStatus
              value={member.fortress}
              onChange={(value) => updateMemberStatus(member.id, "fortress", value)}
              disabled={member.id !== currentUser.id && !canManageEvents}
            />
            <InlineStatus
              value={member.heroStage}
              onChange={(value) => updateMemberStatus(member.id, "heroStage", value)}
              disabled={member.id !== currentUser.id && !canManageEvents}
            />
            <InlineStatus
              value={member.bearHunt}
              onChange={(value) => updateMemberStatus(member.id, "bearHunt", value)}
              disabled={member.id !== currentUser.id && !canManageEvents}
            />
            <span className={member.status === "online" ? "online" : "muted-text"}>
              {member.status === "online" ? "En ligne" : `Il y a ${member.status}`}
            </span>
          </div>
        )) : null}
      </div>
      {!members.length ? <EmptyState icon={Users} title="Aucun membre actif" text="Invite les premiers membres pour suivre leur presence." /> : null}
    </section>
  );
}

export function InlineStatus({ disabled = false, value, onChange }) {
  return (
    <span className="inline-status">
      <button
        type="button"
        className={statusClass(value)}
        disabled={disabled}
        title={disabled ? `Reserve aux roles avec ${getPermissionLabel("manage_events")}.` : undefined}
        onClick={() => cycleStatus(value, onChange)}
      >
        {value}
      </button>
    </span>
  );
}

export function cycleStatus(value, onChange) {
  const order = ["Confirme", "Peut-etre", "Absent"];
  const next = order[(order.indexOf(value) + 1) % order.length];
  onChange(next);
}

export function statusClass(value) {
  if (value === "Confirme") return "ok";
  if (value === "Absent") return "danger";
  return "maybe";
}

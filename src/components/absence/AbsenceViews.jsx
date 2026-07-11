import React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  Clock3,
  Trash2,
  UserRound
} from "lucide-react";
import {
  formatAbsenceDate,
  formatAbsenceDateRange,
  getAbsenceDurationDays,
  getAbsenceStatus
} from "../../lib/absenceStore.js";
import {
  can
} from "../../lib/rbac.js";
import {
  EmptyState,
  PanelHeader
} from "../shared/Shared.jsx";

const STATUS_LABELS = Object.freeze({
  active: "Absent",
  upcoming: "Prévu",
  past: "Terminé",
});

function getAbsenceStatusLabel(absence) {
  return STATUS_LABELS[getAbsenceStatus(absence)] || "Prévu";
}

function getAbsenceDurationLabel(absence) {
  const days = getAbsenceDurationDays(absence);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

function canDeleteAbsence(absence, currentUser) {
  const currentUserId = currentUser?.id || currentUser?.email || currentUser?.username || "local-member";
  return String(absence.memberId) === String(currentUserId) || can(currentUser, "manage_members");
}

function formatCreatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AbsencesView({
  absenceDraft = {},
  absenceError = "",
  absenceSummary = {},
  absences = [],
  currentUser,
  onDeleteAbsence,
  onSubmitAbsence,
  setAbsenceDraft,
}) {
  function updateDraft(key, value) {
    setAbsenceDraft?.((current) => ({
      ...current,
      [key]: value,
      ...(key === "startDate" && (!current.endDate || current.endDate < value) ? { endDate: value } : {}),
    }));
  }

  function submitAbsence(event) {
    event.preventDefault();
    onSubmitAbsence?.(absenceDraft);
  }

  return (
    <div className="page-grid absences-page">
      <section className="absence-summary-grid" aria-label="Résumé des absences">
        <article className="absence-summary-card is-active">
          <CalendarX2 size={22} />
          <span>
            <small>En cours</small>
            <strong>{absenceSummary.active || 0}</strong>
          </span>
        </article>
        <article className="absence-summary-card is-upcoming">
          <CalendarClock size={22} />
          <span>
            <small>À venir</small>
            <strong>{absenceSummary.upcoming || 0}</strong>
          </span>
        </article>
        <article className="absence-summary-card">
          <Clock3 size={22} />
          <span>
            <small>Jours couverts</small>
            <strong>{absenceSummary.coveredDays || 0}</strong>
          </span>
        </article>
      </section>

      <section className="panel absence-form-panel">
        <PanelHeader icon={CalendarX2} title="Déclarer une absence" meta="Dates + motif" />
        <form className="absence-form" onSubmit={submitAbsence}>
          <label className="form-row">
            <span>Membre</span>
            <input
              value={absenceDraft.memberName || ""}
              onChange={(event) => updateDraft("memberName", event.target.value)}
              placeholder="Pseudo du membre"
            />
          </label>
          <div className="absence-date-grid">
            <label className="form-row">
              <span>Début</span>
              <input
                type="date"
                value={absenceDraft.startDate || ""}
                onChange={(event) => updateDraft("startDate", event.target.value)}
              />
            </label>
            <label className="form-row">
              <span>Fin</span>
              <input
                type="date"
                value={absenceDraft.endDate || ""}
                min={absenceDraft.startDate || undefined}
                onChange={(event) => updateDraft("endDate", event.target.value)}
              />
            </label>
          </div>
          <label className="form-row absence-reason-row">
            <span>Motif</span>
            <textarea
              value={absenceDraft.reason || ""}
              onChange={(event) => updateDraft("reason", event.target.value)}
              placeholder="Vacances, déplacement, examens..."
              rows={5}
              maxLength={220}
            />
          </label>
          {absenceError ? (
            <p className="membership-moderation-error" aria-live="polite">
              <AlertTriangle size={16} />
              {absenceError}
            </p>
          ) : null}
          <button className="primary-action" type="submit">
            Enregistrer l'absence
          </button>
        </form>
      </section>

      <section className="panel absence-list-panel">
        <PanelHeader icon={CalendarClock} title="Planning des absences" meta={`${absences.length} déclaration${absences.length > 1 ? "s" : ""}`} />
        {absences.length ? (
          <div className="absence-list">
            {absences.map((absence) => {
              const status = getAbsenceStatus(absence);
              const canDelete = canDeleteAbsence(absence, currentUser);

              return (
                <article className={`absence-card is-${status}`} key={absence.id}>
                  <header>
                    <span className="absence-member">
                      <UserRound size={18} />
                      <strong>{absence.memberName}</strong>
                    </span>
                    <em>{getAbsenceStatusLabel(absence)}</em>
                  </header>
                  <div className="absence-card-dates">
                    <CalendarClock size={16} />
                    <span>{formatAbsenceDateRange(absence)}</span>
                    <small>{getAbsenceDurationLabel(absence)}</small>
                  </div>
                  <p>{absence.reason}</p>
                  <footer>
                    <small>{absence.createdAt ? `Déclarée le ${formatCreatedAt(absence.createdAt)}` : `Début ${formatAbsenceDate(absence.startDate)}`}</small>
                    {canDelete ? (
                      <button type="button" onClick={() => onDeleteAbsence?.(absence.id)} aria-label={`Supprimer l'absence de ${absence.memberName}`}>
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="absence-empty">
            <EmptyState
              icon={CalendarX2}
              title="Aucune absence déclarée"
              text="Les absences enregistrées apparaîtront ici avec leurs dates et leur motif."
            />
          </div>
        )}
      </section>
    </div>
  );
}

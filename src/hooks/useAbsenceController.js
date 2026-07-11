import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  createAbsenceDraft,
  getAbsenceGuildKey,
  getAbsenceDurationDays,
  getCurrentMemberId,
  getCurrentMemberName,
  loadAbsences,
  normalizeAbsence,
  saveAbsences,
  sortAbsences,
  summarizeAbsences
} from "../lib/absenceStore.js";

function buildAbsenceId(currentUser) {
  const userKey = String(getCurrentMemberId(currentUser)).replace(/[^a-z0-9_-]+/gi, "-");
  return `absence-${userKey}-${Date.now()}`;
}

function validateAbsenceDraft(draft) {
  if (!draft?.startDate || !draft?.endDate) {
    return "Choisis une date de début et une date de fin.";
  }

  if (draft.endDate < draft.startDate) {
    return "La date de fin doit être après la date de début.";
  }

  if (!String(draft.reason || "").trim()) {
    return "Ajoute un motif pour que le commandement sache pourquoi tu es absent.";
  }

  return "";
}

export function useAbsenceController({ currentUser, selectedGuild } = {}) {
  const guildKey = getAbsenceGuildKey(selectedGuild);
  const currentMemberId = getCurrentMemberId(currentUser);
  const currentMemberName = getCurrentMemberName(currentUser);
  const [absences, setAbsences] = useState(() => loadAbsences(selectedGuild));
  const [absenceDraft, setAbsenceDraft] = useState(() => createAbsenceDraft(currentUser));
  const [absenceError, setAbsenceError] = useState("");

  useEffect(() => {
    setAbsences(loadAbsences(selectedGuild));
    setAbsenceError("");
  }, [guildKey, selectedGuild]);

  useEffect(() => {
    setAbsenceDraft((current) => ({
      ...current,
      memberName: current.memberName && current.memberName !== "Membre" ? current.memberName : currentMemberName,
    }));
  }, [currentMemberId, currentMemberName]);

  function persistAbsences(nextAbsences) {
    const normalizedAbsences = sortAbsences(nextAbsences.map(normalizeAbsence).filter(Boolean));
    setAbsences(normalizedAbsences);
    saveAbsences(selectedGuild, normalizedAbsences);
  }

  function submitAbsence(draft = absenceDraft) {
    const error = validateAbsenceDraft(draft);
    if (error) {
      setAbsenceError(error);
      return null;
    }

    const now = new Date().toISOString();
    const normalizedAbsence = normalizeAbsence({
      ...draft,
      id: draft.id || buildAbsenceId(currentUser),
      memberId: draft.memberId || currentMemberId,
      memberName: draft.memberName || currentMemberName,
      createdAt: draft.createdAt || now,
      updatedAt: now,
    });

    if (!normalizedAbsence) {
      setAbsenceError("Impossible d'enregistrer cette absence.");
      return null;
    }

    persistAbsences([
      normalizedAbsence,
      ...absences.filter((absence) => absence.id !== normalizedAbsence.id),
    ]);
    setAbsenceDraft(createAbsenceDraft(currentUser));
    setAbsenceError("");
    return normalizedAbsence;
  }

  function deleteAbsence(absenceId) {
    if (!absenceId) return;
    persistAbsences(absences.filter((absence) => absence.id !== absenceId));
  }

  const absenceSummary = useMemo(() => summarizeAbsences(absences), [absences]);
  const longestAbsenceDays = useMemo(
    () => absences.reduce((longest, absence) => Math.max(longest, getAbsenceDurationDays(absence)), 0),
    [absences],
  );

  return {
    absenceDraft,
    absenceError,
    absenceSummary: {
      ...absenceSummary,
      longestAbsenceDays,
      total: absences.length,
    },
    absences,
    deleteAbsence,
    setAbsenceDraft,
    submitAbsence,
  };
}

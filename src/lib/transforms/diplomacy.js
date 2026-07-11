import {
  slugify
} from "../guildSiteStore.js";
import {
  cleanApiPayload,
  isRecord,
  isUuid,
  normalizeSearchText
} from "./shared.js";

export function normalizeDiplomacyRelation(relation = {}) {
  const relationType = normalizeDiplomacyType(relation.relationType || relation.relation_type || relation.type || relation.mood);

  return {
    id: relation.id || `local-dip-${slugify(relation.name || relation.tag || "relation")}`,
    tag: String(relation.tag || "").toUpperCase(),
    name: relation.name || "Relation",
    type: getDiplomacyTypeLabel(relationType),
    relationType,
    mood: getDiplomacyMood(relationType),
    stance: relation.stance || "",
    notes: relation.notes || "",
    createdByName: relation.createdByName || relation.created_by_name || "Inconnu",
    updatedByName: relation.updatedByName || relation.updated_by_name || relation.createdByName || "Inconnu",
    createdAt: relation.createdAt || relation.created_at || new Date().toISOString(),
    updatedAt: relation.updatedAt || relation.updated_at || relation.createdAt || new Date().toISOString(),
  };
}

export function buildPublicDiplomacySnapshot({ coordinates = [], napAgreements = [], relations = [] } = {}) {
  const publicRelations = relations
    .filter(isPublicDiplomacyRelationVisible)
    .map(toPublicDiplomacyRelation);
  const publicRelationIds = new Set(publicRelations.map((relation) => relation.id));
  const publicRelationTags = new Set(publicRelations.map((relation) => relation.tag).filter(Boolean));
  const publicNaps = napAgreements
    .filter((agreement) => isPublicNapAgreementVisible(agreement, publicRelationIds, publicRelationTags))
    .map(toPublicNapAgreement);
  const publicCoordinates = coordinates
    .filter(isPublicDiplomacyCoordinateVisible)
    .map(toPublicDiplomacyCoordinate);

  return {
    relations: publicRelations,
    napAgreements: publicNaps,
    coordinates: publicCoordinates,
    privacy: {
      relations: "Allies et NAP, hostiles declares par la guilde.",
      coordinates: "Coordonnees declarees par la guilde.",
      internal: "Notes, audit, auteurs internes et acces prives exclus.",
    },
  };
}

export function isPublicDiplomacyRelationVisible(relation = {}) {
  const normalized = normalizeDiplomacyRelation(relation);

  if (isPrivateDiplomacyValue(relation)) return false;
  if (isExplicitPublicDiplomacyValue(relation)) return true;
  if (normalized.relationType === "enemy" || normalized.relationType === "watchlist") return false;

  return ["ally", "nap"].includes(normalized.relationType);
}

export function isPublicDiplomacyCoordinateVisible(coordinate = {}) {
  const visibility = String(coordinate.visibility || "").trim().toLowerCase();

  if (isPrivateDiplomacyValue(coordinate)) return false;

  return visibility === "public" || isExplicitPublicDiplomacyValue(coordinate);
}

export function normalizeNapAgreement(agreement = {}) {
  const status = normalizeAgreementStatus(agreement.status);
  const endsAt = agreement.endsAt || agreement.ends_at || "";
  return {
    id: agreement.id || `local-nap-${slugify(agreement.title || "accord")}`,
    relationId: agreement.relationId || agreement.relation_id || "",
    relationName: agreement.relationName || agreement.relation_name || "",
    relationTag: agreement.relationTag || agreement.relation_tag || "",
    title: agreement.title || "Accord NAP",
    terms: agreement.terms || "",
    startsAt: agreement.startsAt || agreement.starts_at || "",
    endsAt,
    status: status === "active" && isPastDate(endsAt) ? "expired" : status,
    createdByName: agreement.createdByName || agreement.created_by_name || "Inconnu",
    createdAt: agreement.createdAt || agreement.created_at || new Date().toISOString(),
    updatedAt: agreement.updatedAt || agreement.updated_at || agreement.createdAt || new Date().toISOString(),
  };
}

export function normalizeDiplomacyCoordinate(coordinate = {}) {
  const parsed = parseCoordinateValue(coordinate.value);
  const x = coordinate.x ?? coordinate.targetX ?? parsed.x ?? "";
  const y = coordinate.y ?? coordinate.targetY ?? parsed.y ?? "";

  return {
    id: coordinate.id || `local-coord-${slugify(coordinate.label || "coord")}`,
    relationId: coordinate.relationId || coordinate.relation_id || "",
    relationName: coordinate.relationName || coordinate.relation_name || "",
    label: coordinate.label || "Coordonnee",
    x,
    y,
    value: coordinate.value || `X:${x} Y:${y}`,
    type: coordinate.type || coordinate.category || "Important",
    category: coordinate.category || coordinate.type || "Important",
    visibility: coordinate.visibility || "members",
    notes: coordinate.notes || "",
    createdByName: coordinate.createdByName || coordinate.created_by_name || "Inconnu",
    createdAt: coordinate.createdAt || coordinate.created_at || new Date().toISOString(),
    updatedAt: coordinate.updatedAt || coordinate.updated_at || coordinate.createdAt || new Date().toISOString(),
  };
}

export function normalizeDiplomacyAuditEntry(entry = {}) {
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  return {
    id: entry.id || `local-audit-${Date.now()}`,
    action: entry.action || "diplomacy.updated",
    targetTable: entry.targetTable || entry.target_table || "",
    targetId: entry.targetId || entry.target_id || "",
    actorName: entry.actorName || entry.actor_name || "Systeme",
    metadata,
    metadataLabel: metadata.title || metadata.name || metadata.label || metadata.status || metadata.relationType || "Mise a jour",
    createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
  };
}

export function createRelationDraft(relation) {
  const normalized = relation ? normalizeDiplomacyRelation(relation) : null;
  return {
    id: normalized?.id || "",
    tag: normalized?.tag || "",
    name: normalized?.name || "Nouvelle relation",
    relationType: normalized?.relationType || "ally",
    stance: normalized?.stance || "",
    notes: normalized?.notes || "",
    createdByName: normalized?.createdByName || "",
    createdAt: normalized?.createdAt || "",
  };
}

export function createNapDraft(agreement, relations = []) {
  const normalized = agreement ? normalizeNapAgreement(agreement) : null;
  return {
    id: normalized?.id || "",
    relationId: normalized?.relationId || relations.find((relation) => relation.relationType === "nap")?.id || "",
    title: normalized?.title || "Nouvel accord NAP",
    terms: normalized?.terms || "",
    startsAt: normalized?.startsAt || new Date().toISOString(),
    endsAt: normalized?.endsAt || dateInputToIso(toDateInputValue(new Date(Date.now() + 7 * 86400000).toISOString())),
    status: normalized?.status || "active",
    createdByName: normalized?.createdByName || "",
    createdAt: normalized?.createdAt || "",
  };
}

export function createCoordinateDraft(coordinate) {
  const normalized = coordinate ? normalizeDiplomacyCoordinate(coordinate) : null;
  return {
    id: normalized?.id || "",
    relationId: normalized?.relationId || "",
    label: normalized?.label || "Nouvelle coordonnee",
    x: normalized?.x || "",
    y: normalized?.y || "",
    category: normalized?.category || "Important",
    visibility: normalized?.visibility || "members",
    notes: normalized?.notes || "",
    createdByName: normalized?.createdByName || "",
    createdAt: normalized?.createdAt || "",
  };
}

export function toApiDiplomacyRelation(relation = {}) {
  return cleanApiPayload({
    id: isUuid(relation.id) ? relation.id : undefined,
    tag: relation.tag || null,
    name: relation.name,
    relationType: relation.relationType,
    stance: relation.stance || null,
    notes: relation.notes || null,
  });
}

export function toApiNapAgreement(agreement = {}) {
  return cleanApiPayload({
    id: isUuid(agreement.id) ? agreement.id : undefined,
    relationId: isUuid(agreement.relationId) ? agreement.relationId : null,
    title: agreement.title,
    terms: agreement.terms,
    startsAt: agreement.startsAt || null,
    endsAt: agreement.endsAt || null,
    status: agreement.status || "active",
  });
}

export function toApiDiplomacyCoordinate(coordinate = {}) {
  return cleanApiPayload({
    id: isUuid(coordinate.id) ? coordinate.id : undefined,
    relationId: isUuid(coordinate.relationId) ? coordinate.relationId : null,
    label: coordinate.label,
    x: Number(coordinate.x),
    y: Number(coordinate.y),
    category: coordinate.category || "important",
    visibility: coordinate.visibility || "members",
    notes: coordinate.notes || null,
  });
}

export function createLocalDiplomacyAudit(action, targetTable, targetId, metadata, currentUser = {}) {
  return normalizeDiplomacyAuditEntry({
    id: `audit-local-${Date.now()}`,
    action,
    targetTable,
    targetId,
    actorName: currentUser.displayName || "Moi",
    metadata,
    createdAt: new Date().toISOString(),
  });
}

export function normalizeDiplomacyType(value) {
  const normalized = normalizeSearchText(value);
  if (["alliance", "allie", "ally", "amical"].includes(normalized)) return "ally";
  if (["ennemi", "enemy", "hostile"].includes(normalized)) return "enemy";
  if (normalized === "nap") return "nap";
  if (["watchlist", "surveillance"].includes(normalized)) return "watchlist";
  return "neutral";
}

export function normalizeAgreementStatus(value) {
  const normalized = normalizeSearchText(value);
  if (["draft", "brouillon"].includes(normalized)) return "draft";
  if (["expired", "expire"].includes(normalized)) return "expired";
  if (["cancelled", "annule"].includes(normalized)) return "cancelled";
  return "active";
}

export function getDiplomacyTypeLabel(type) {
  return (
    {
      ally: "Allie",
      enemy: "Ennemi",
      nap: "NAP",
      neutral: "Neutre",
      watchlist: "Surveillance",
    }[type] || "Neutre"
  );
}

export function getDiplomacyMood(type) {
  if (type === "ally") return "Amical";
  if (type === "enemy") return "Hostile";
  if (type === "nap") return "NAP";
  if (type === "watchlist") return "Surveillance";
  return "Neutre";
}

export function getAgreementStatusLabel(status) {
  return (
    {
      active: "Actif",
      draft: "Brouillon",
      expired: "Expire",
      cancelled: "Annule",
    }[status] || "Actif"
  );
}

export function formatDiplomacyAction(action = "") {
  if (action.includes("relation")) return "Relation";
  if (action.includes("nap")) return "Accord NAP";
  if (action.includes("coordinate")) return "Coordonnee";
  return "Diplomatie";
}

export function formatDiplomacyDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDiplomacyDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function isAgreementExpired(agreement = {}) {
  return agreement.status === "expired" || isPastDate(agreement.endsAt);
}

export function isAgreementScheduled(agreement = {}) {
  if (agreement.status !== "active" || !agreement.startsAt) return false;
  const startsAt = new Date(agreement.startsAt).getTime();
  return Number.isFinite(startsAt) && startsAt > Date.now();
}

function isPublicNapAgreementVisible(agreement = {}, publicRelationIds = new Set(), publicRelationTags = new Set()) {
  const normalized = normalizeNapAgreement(agreement);

  if (isPrivateDiplomacyValue(agreement)) return false;
  if (isExplicitPublicDiplomacyValue(agreement)) return true;
  if (["cancelled", "draft"].includes(normalized.status)) return false;

  return (
    publicRelationIds.has(normalized.relationId) ||
    publicRelationTags.has(String(normalized.relationTag || "").toUpperCase())
  );
}

function toPublicDiplomacyRelation(relation = {}) {
  const normalized = normalizeDiplomacyRelation(relation);

  return {
    id: normalized.id,
    tag: normalized.tag,
    name: normalized.name,
    relationType: normalized.relationType,
    type: normalized.type,
    mood: normalized.mood,
    public: true,
    stance: normalized.stance,
    updatedAt: normalized.updatedAt,
  };
}

function toPublicNapAgreement(agreement = {}) {
  const normalized = normalizeNapAgreement(agreement);
  const hasPublicTerms = isExplicitPublicDiplomacyValue(agreement) || Boolean(agreement.publicTerms || agreement.public_terms);

  return {
    id: normalized.id,
    relationId: normalized.relationId,
    relationName: normalized.relationName,
    relationTag: normalized.relationTag,
    title: normalized.title,
    status: normalized.status,
    startsAt: normalized.startsAt,
    endsAt: normalized.endsAt,
    public: true,
    summary: agreement.publicSummary || agreement.public_summary || (hasPublicTerms ? normalized.terms : ""),
  };
}

function toPublicDiplomacyCoordinate(coordinate = {}) {
  const normalized = normalizeDiplomacyCoordinate(coordinate);

  return {
    id: normalized.id,
    relationId: normalized.relationId,
    relationName: normalized.relationName,
    label: normalized.label,
    x: normalized.x,
    y: normalized.y,
    value: normalized.value,
    category: normalized.category,
    visibility: "public",
  };
}

function isExplicitPublicDiplomacyValue(value = {}) {
  return (
    value.public === true ||
    value.isPublic === true ||
    value.is_public === true ||
    value.showOnPublicSite === true ||
    value.show_on_public_site === true ||
    String(value.visibility || "").trim().toLowerCase() === "public"
  );
}

function isPrivateDiplomacyValue(value = {}) {
  const visibility = String(value.visibility || "").trim().toLowerCase();

  return (
    value.public === false ||
    value.isPublic === false ||
    value.is_public === false ||
    value.visible === false ||
    value.showOnPublicSite === false ||
    value.show_on_public_site === false ||
    ["private", "internal", "members", "officers", "admins"].includes(visibility)
  );
}

export function isPastDate(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

export function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : "";
}

export function parseCoordinateValue(value = "") {
  const match = /x[:\s]*(\d+).*y[:\s]*(\d+)/i.exec(String(value));
  return match ? { x: Number(match[1]), y: Number(match[2]) } : {};
}

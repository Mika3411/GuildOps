import React, {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  ClipboardCheck,
  FileText,
  Handshake,
  MapPin,
  MessageSquare,
  Settings,
  X
} from "lucide-react";
import {
  slugify
} from "../../lib/guildSiteStore.js";
import {
  can,
  getGuardProps,
  getPermissionLabel
} from "../../lib/rbac.js";
import {
  normalizeDiplomacyRelation,
  normalizeNapAgreement,
  normalizeDiplomacyCoordinate,
  normalizeDiplomacyAuditEntry,
  buildPublicDiplomacySnapshot,
  createRelationDraft,
  createNapDraft,
  createCoordinateDraft,
  getDiplomacyTypeLabel,
  getAgreementStatusLabel,
  formatDiplomacyAction,
  formatDiplomacyDate,
  formatDiplomacyDay,
  isAgreementExpired,
  isAgreementScheduled,
  toDateInputValue,
  dateInputToIso
} from "../../lib/guildOpsTransforms.js";
import {
  EmptyState,
  PanelHeader
} from "../shared/Shared.jsx";

function navigatePublicDiplomacyLink(event, path, onNavigatePublicRoute) {
  const button = event.button ?? event.nativeEvent?.button ?? 0;

  if (
    event.defaultPrevented ||
    button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }

  event.preventDefault();
  navigatePublicDiplomacyPath(path, onNavigatePublicRoute);
}

function navigatePublicDiplomacyPath(path, onNavigatePublicRoute) {
  if (onNavigatePublicRoute) {
    onNavigatePublicRoute(path);
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function DiplomacyMini({ diplomacyRelations = [] }) {
  const rows = diplomacyRelations.map(normalizeDiplomacyRelation);
  const counts = rows.reduce(
    (total, row) => ({
      ...total,
      [row.relationType]: (total[row.relationType] || 0) + 1,
    }),
    {},
  );

  return (
    <section className="panel mini-panel diplomacy-panel">
      <PanelHeader icon={Handshake} title="Diplomatie" meta="Voir toutes" />
      <div className="tabline">
        <span className="is-active">Allies ({counts.ally || 0})</span>
        <span>Ennemis ({counts.enemy || 0})</span>
        <span>NAP ({counts.nap || 0})</span>
      </div>
      <div className="compact-list">
        {rows.length ? (
          rows.slice(0, 4).map((row) => (
            <div className="compact-row" key={row.id || row.tag}>
              <strong>[{row.tag || "--"}] {row.name}</strong>
              <span>{row.type}</span>
              <em className={row.mood === "Hostile" ? "danger-text" : row.mood === "NAP" ? "amber-text" : "online"}>
                {row.mood}
              </em>
            </div>
          ))
        ) : (
          <EmptyState icon={Handshake} title="Aucune relation" text="Les allies, NAP et ennemis s'afficheront ici." compact />
        )}
      </div>
    </section>
  );
}

function getAgreementDateLine(agreement = {}) {
  const startsAt = formatDiplomacyDay(agreement.startsAt);
  const endsAt = formatDiplomacyDay(agreement.endsAt);

  if (startsAt && endsAt) return `Actif à partir du ${startsAt} · Expire le ${endsAt}`;
  if (startsAt) return `Actif à partir du ${startsAt}`;
  if (endsAt) return `Expire le ${endsAt}`;
  return "";
}

export function PublicDiplomacyModule({ onNavigatePublicRoute, publicDiplomacy = {}, publicSlug = "", siteDraft = {} }) {
  const snapshot = useMemo(() => buildPublicDiplomacySnapshot(publicDiplomacy), [publicDiplomacy]);
  const relations = snapshot.relations || [];
  const publicNaps = snapshot.napAgreements || [];
  const publicCoordinates = snapshot.coordinates || [];
  const allianceRelations = relations.filter((relation) => ["ally", "nap"].includes(relation.relationType));
  const hostileRelations = relations.filter((relation) => ["enemy", "watchlist"].includes(relation.relationType));
  const chatEnabled = Boolean(siteDraft?.sections?.publicChat);
  const slug = slugify(publicSlug || siteDraft.slug || siteDraft.guildName);
  const chatPath = `/g/${slug}/chat`;
  const hasPublicData = Boolean(allianceRelations.length || publicNaps.length || hostileRelations.length || publicCoordinates.length);

  if (!hasPublicData) {
    return (
      <section className="public-empty public-route-empty public-diplomacy-empty" id="public-section-diplomacy" tabIndex={-1}>
        <Handshake size={42} />
        <h1>Diplomatie vide</h1>
        <p>Cette guilde n'a pas encore publié d'alliance, NAP, relation hostile ou coordonnée diplomatique.</p>
        {chatEnabled ? (
          <a href={chatPath} onClick={(event) => navigatePublicDiplomacyLink(event, chatPath, onNavigatePublicRoute)}>
            Contacter un diplomate
          </a>
        ) : null}
      </section>
    );
  }

  return (
    <section className="public-diplomacy-page" id="public-section-diplomacy" tabIndex={-1}>
      <div className="public-diplomacy-hero">
        <div>
          <span className="theme-kicker">Diplomatie</span>
          <h1>{siteDraft.guildName || "Guilde"}</h1>
          <p>
            Alliances, NAP et points diplomatiques déclarés par la guilde. Les notes, audits, auteurs internes et
            coordonnées privées restent masqués.
          </p>
        </div>
        <dl className="public-diplomacy-metrics">
          <div>
            <dt>Alliances / NAP</dt>
            <dd>{allianceRelations.length + publicNaps.length}</dd>
          </div>
          <div>
            <dt>Relations hostiles</dt>
            <dd>{hostileRelations.length}</dd>
          </div>
          <div>
            <dt>Coordonnées</dt>
            <dd>{publicCoordinates.length}</dd>
          </div>
        </dl>
        <div className="public-diplomacy-contact">
          {chatEnabled ? (
            <a href={chatPath} onClick={(event) => navigatePublicDiplomacyLink(event, chatPath, onNavigatePublicRoute)}>
              Contacter diplomate
              <MessageSquare size={17} />
            </a>
          ) : (
            <span>Chat invités fermé</span>
          )}
        </div>
      </div>

      <div className="public-diplomacy-layout">
        <section className="public-diplomacy-panel">
          <header>
            <span>
              <strong>Alliances et NAP</strong>
              <small>Accords déclarés</small>
            </span>
            <em>{allianceRelations.length}</em>
          </header>
          {allianceRelations.length ? (
            <div className="public-diplomacy-list">
              {allianceRelations.map((relation) => (
                <article className={`diplomacy-entry ${relation.relationType}`} key={relation.id}>
                  <header>
                    <span>
                      <strong>[{relation.tag || "--"}] {relation.name}</strong>
                      <small>{relation.stance || "Posture non précisée"}</small>
                    </span>
                    <DiplomacyBadge type={relation.relationType} />
                  </header>
                  <footer>
                    <span>Maj: {formatDiplomacyDate(relation.updatedAt)}</span>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <p className="preview-card-text">Aucune alliance ou relation NAP.</p>
          )}
        </section>

        <section className="public-diplomacy-panel">
          <header>
            <span>
              <strong>Accords NAP</strong>
              <small>Titres et statuts</small>
            </span>
            <em>{publicNaps.length}</em>
          </header>
          {publicNaps.length ? (
            <div className="public-nap-list">
              {publicNaps.map((agreement) => (
                <article key={agreement.id}>
                  <span>
                    <strong>{agreement.title}</strong>
                    <small>{agreement.relationTag || agreement.relationName || "Relation liée"}</small>
                    {getAgreementDateLine(agreement) ? <small className="nap-date-line">{getAgreementDateLine(agreement)}</small> : null}
                  </span>
                  <AgreementBadge agreement={agreement} />
                  {agreement.summary ? <p>{agreement.summary}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="preview-card-text">Aucun accord NAP.</p>
          )}
        </section>

        <section className="public-diplomacy-panel">
          <header>
            <span>
              <strong>Relations hostiles</strong>
              <small>Menaces déclarées</small>
            </span>
            <em>{hostileRelations.length}</em>
          </header>
          {hostileRelations.length ? (
            <div className="public-diplomacy-list">
              {hostileRelations.map((relation) => (
                <article className={`diplomacy-entry ${relation.relationType}`} key={relation.id}>
                  <header>
                    <span>
                      <strong>[{relation.tag || "--"}] {relation.name}</strong>
                      <small>{relation.stance || "Posture non précisée"}</small>
                    </span>
                    <DiplomacyBadge type={relation.relationType} />
                  </header>
                </article>
              ))}
            </div>
          ) : (
            <p className="preview-card-text">Aucune relation hostile.</p>
          )}
        </section>

        <section className="public-diplomacy-panel public-diplomacy-coordinates">
          <header>
            <span>
              <strong>Coordonnées</strong>
              <small>Points déclarés</small>
            </span>
            <em>{publicCoordinates.length}</em>
          </header>
          {publicCoordinates.length ? (
            <div className="public-coordinate-list">
              {publicCoordinates.map((coordinate) => (
                <article key={coordinate.id}>
                  <MapPin size={20} />
                  <span>
                    <strong>{coordinate.label}</strong>
                    <small>{coordinate.relationName || coordinate.category || "Diplomatie"}</small>
                  </span>
                  <em>
                    X:{coordinate.x} Y:{coordinate.y}
                  </em>
                </article>
              ))}
            </div>
          ) : (
            <p className="preview-card-text">Aucune coordonnée.</p>
          )}
        </section>
      </div>

      <p className="public-diplomacy-privacy">
        Masqué: notes privées, journal d'audit, auteurs internes et coordonnées membres/officiers/admins.
      </p>
    </section>
  );
}

export function DiplomacyView({
  currentUser,
  diplomacyAudit = [],
  diplomacyCoordinates = [],
  diplomacyError = "",
  diplomacyNapAgreements = [],
  diplomacyRelations = [],
  saveDiplomacyCoordinate,
  saveDiplomacyRelation,
  saveNapAgreement,
}) {
  const canManageDiplomacy = can(currentUser, "manage_diplomacy");
  const activeRelations = diplomacyRelations.map(normalizeDiplomacyRelation);
  const activeNaps = diplomacyNapAgreements.map(normalizeNapAgreement);
  const visibleCoordinates = diplomacyCoordinates.map(normalizeDiplomacyCoordinate);
  const counts = activeRelations.reduce(
    (total, relation) => ({
      ...total,
      [relation.relationType]: (total[relation.relationType] || 0) + 1,
    }),
    {},
  );

  return (
    <div className="page-grid diplomacy-workspace">
      <section className="panel wide-panel diplomacy-command">
        <PanelHeader
          icon={Handshake}
          title="Diplomatie active"
          meta={`${counts.ally || 0} allies · ${counts.nap || 0} NAP · ${counts.enemy || 0} ennemis`}
        />
        {diplomacyError ? <p className="sync-warning diplomacy-warning">{diplomacyError}</p> : null}
        <div className="diplomacy-ledger">
          {activeRelations.length ? (
            activeRelations.map((relation) => (
              <article className={`diplomacy-entry ${relation.relationType}`} key={relation.id}>
                <header>
                  <span>
                    <strong>[{relation.tag || "--"}] {relation.name}</strong>
                    <small>{relation.stance || "Aucune posture definie"}</small>
                  </span>
                  <DiplomacyBadge type={relation.relationType} />
                </header>
                <p>{canManageDiplomacy ? relation.notes || "Aucune note privee." : "Notes privees reservees aux diplomates."}</p>
                <footer>
                  <span>Auteur: {relation.createdByName || "Inconnu"}</span>
                  <span>Maj: {formatDiplomacyDate(relation.updatedAt || relation.createdAt)}</span>
                </footer>
              </article>
            ))
          ) : (
            <EmptyState icon={Handshake} title="Diplomatie vierge" text="Ajoute un allie, ennemi ou NAP pour activer le suivi." />
          )}
        </div>
      </section>
      <DiplomacyRelationEditor
        canManage={canManageDiplomacy}
        currentUser={currentUser}
        onSave={saveDiplomacyRelation}
        relations={activeRelations}
      />
      <NapAgreementsPanel
        canManage={canManageDiplomacy}
        onSave={saveNapAgreement}
        relations={activeRelations}
        agreements={activeNaps}
      />
      <DiplomacyCoordinatesPanel
        canManage={canManageDiplomacy}
        coordinates={visibleCoordinates}
        onSave={saveDiplomacyCoordinate}
        relations={activeRelations}
      />
      <DiplomacyAuditPanel auditLog={diplomacyAudit.map(normalizeDiplomacyAuditEntry)} />
    </div>
  );
}

export function DiplomacyRelationEditor({ canManage, currentUser, onSave, relations }) {
  const relationGuard = getGuardProps(currentUser, "manage_diplomacy");
  const [activeId, setActiveId] = useState(() => relations[0]?.id || "new");
  const activeRelation = relations.find((relation) => relation.id === activeId);
  const [draft, setDraft] = useState(() => createRelationDraft(activeRelation));

  useEffect(() => {
    setDraft(createRelationDraft(activeRelation));
  }, [activeRelation?.id]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSave() {
    onSave?.(draft);
    if (!draft.id) setActiveId("new");
  }

  return (
    <section className="panel diplomacy-editor">
      <PanelHeader icon={Settings} title="Relation" meta={canManage ? "Diplomate/admin" : "Lecture seule"} />
      <div className="segmented-list">
        <button type="button" className={activeId === "new" ? "is-active" : ""} onClick={() => setActiveId("new")} {...relationGuard}>
          Nouvelle
        </button>
        {relations.slice(0, 4).map((relation) => (
          <button
            key={relation.id}
            type="button"
            className={activeId === relation.id ? "is-active" : ""}
            onClick={() => setActiveId(relation.id)}
          >
            {relation.tag || relation.name}
          </button>
        ))}
      </div>
      <div className="diplomacy-form-grid">
        <label className="form-row">
          <span>Tag</span>
          <input value={draft.tag} maxLength={16} onChange={(event) => updateDraft("tag", event.target.value)} {...relationGuard} />
        </label>
        <label className="form-row">
          <span>Nom</span>
          <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} {...relationGuard} />
        </label>
        <label className="form-row">
          <span>Statut</span>
          <select value={draft.relationType} onChange={(event) => updateDraft("relationType", event.target.value)} {...relationGuard}>
            <option value="ally">Allie</option>
            <option value="nap">NAP</option>
            <option value="enemy">Ennemi</option>
            <option value="neutral">Neutre</option>
            <option value="watchlist">Surveillance</option>
          </select>
        </label>
        <label className="form-row">
          <span>Posture</span>
          <input value={draft.stance} onChange={(event) => updateDraft("stance", event.target.value)} {...relationGuard} />
        </label>
        <label className="form-row wide">
          <span>Notes privees</span>
          <textarea
            value={canManage ? draft.notes : ""}
            placeholder={canManage ? "" : "Reserve aux diplomates et admins"}
            onChange={(event) => updateDraft("notes", event.target.value)}
            {...relationGuard}
          />
        </label>
      </div>
      <button className="primary-action" type="button" onClick={handleSave} {...relationGuard}>
        Enregistrer la relation
      </button>
    </section>
  );
}

export function NapAgreementsPanel({ agreements, canManage, onSave, relations }) {
  const [activeId, setActiveId] = useState(() => agreements[0]?.id || "new");
  const activeAgreement = agreements.find((agreement) => agreement.id === activeId);
  const [draft, setDraft] = useState(() => createNapDraft(activeAgreement, relations));
  const guard = canManage ? {} : { disabled: true, "aria-disabled": true, title: `Reserve aux roles avec ${getPermissionLabel("manage_diplomacy")}.` };

  useEffect(() => {
    setDraft(createNapDraft(activeAgreement, relations));
  }, [activeAgreement?.id, relations]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="panel nap-panel">
      <PanelHeader icon={FileText} title="Accords NAP" meta={`${agreements.length} accords`} />
      <div className="nap-list">
        <button type="button" className={activeId === "new" ? "is-active" : ""} onClick={() => setActiveId("new")} {...guard}>
          <span>
            <strong>Nouvel accord</strong>
            <small>Créer un NAP</small>
          </span>
          <em className="diplomacy-badge draft">Brouillon</em>
        </button>
        {agreements.map((agreement) => (
          <button
            key={agreement.id}
            type="button"
            className={activeId === agreement.id ? "is-active" : ""}
            onClick={() => setActiveId(agreement.id)}
          >
            <span>
              <strong>{agreement.title}</strong>
              <small>{agreement.relationTag || agreement.relationName || "Relation libre"}</small>
              {getAgreementDateLine(agreement) ? <small className="nap-date-line">{getAgreementDateLine(agreement)}</small> : null}
            </span>
            <AgreementBadge agreement={agreement} />
          </button>
        ))}
      </div>
      <div className="diplomacy-form-grid">
        <label className="form-row">
          <span>Relation</span>
          <select value={draft.relationId} onChange={(event) => updateDraft("relationId", event.target.value)} {...guard}>
            <option value="">Aucune</option>
            {relations.map((relation) => (
              <option key={relation.id} value={relation.id}>
                [{relation.tag || "--"}] {relation.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span>Actif à partir du</span>
          <input type="date" value={toDateInputValue(draft.startsAt)} onChange={(event) => updateDraft("startsAt", dateInputToIso(event.target.value))} {...guard} />
        </label>
        <label className="form-row">
          <span>Expiration</span>
          <input type="date" value={toDateInputValue(draft.endsAt)} onChange={(event) => updateDraft("endsAt", dateInputToIso(event.target.value))} {...guard} />
        </label>
        <label className="form-row">
          <span>Statut</span>
          <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value)} {...guard}>
            <option value="active">Actif</option>
            <option value="draft">Brouillon</option>
            <option value="expired">Expire</option>
            <option value="cancelled">Annule</option>
          </select>
        </label>
        <label className="form-row wide">
          <span>Titre</span>
          <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} {...guard} />
        </label>
        <label className="form-row wide">
          <span>Termes</span>
          <textarea value={draft.terms} onChange={(event) => updateDraft("terms", event.target.value)} {...guard} />
        </label>
      </div>
      <button className="primary-action" type="button" onClick={() => onSave?.(draft)} {...guard}>
        Enregistrer l'accord
      </button>
    </section>
  );
}

export function DiplomacyCoordinatesPanel({ canManage, coordinates, onSave, relations }) {
  const [activeId, setActiveId] = useState(() => coordinates[0]?.id || "new");
  const activeCoordinate = coordinates.find((coordinate) => coordinate.id === activeId);
  const [draft, setDraft] = useState(() => createCoordinateDraft(activeCoordinate));
  const guard = canManage ? {} : { disabled: true, "aria-disabled": true, title: `Reserve aux roles avec ${getPermissionLabel("manage_diplomacy")}.` };

  useEffect(() => {
    setDraft(createCoordinateDraft(activeCoordinate));
  }, [activeCoordinate?.id]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="panel diplomacy-coordinates">
      <PanelHeader icon={MapPin} title="Coordonnees importantes" meta="Acces controle" />
      <div className="coordinate-list diplomacy-coordinate-list">
        <button type="button" className="coordinate-row" onClick={() => setActiveId("new")} {...guard}>
          <MapPin size={18} />
          <span>
            <strong>Nouvelle coordonnee</strong>
            <small>Ajouter un point important</small>
          </span>
          <em>Ajouter</em>
        </button>
        {coordinates.map((coord) => (
          <button key={coord.id} type="button" className="coordinate-row" onClick={() => setActiveId(coord.id)}>
            <MapPin size={18} />
            <span>
              <strong>{coord.label}</strong>
              <small>X:{coord.x} Y:{coord.y} · {coord.relationName || "Interne"}</small>
            </span>
            <em>{coord.category}</em>
          </button>
        ))}
      </div>
      <div className="diplomacy-form-grid">
        <label className="form-row">
          <span>Libelle</span>
          <input value={draft.label} onChange={(event) => updateDraft("label", event.target.value)} {...guard} />
        </label>
        <label className="form-row">
          <span>Relation</span>
          <select value={draft.relationId} onChange={(event) => updateDraft("relationId", event.target.value)} {...guard}>
            <option value="">Interne</option>
            {relations.map((relation) => (
              <option key={relation.id} value={relation.id}>
                [{relation.tag || "--"}] {relation.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span>X</span>
          <input inputMode="numeric" value={draft.x} onChange={(event) => updateDraft("x", event.target.value)} {...guard} />
        </label>
        <label className="form-row">
          <span>Y</span>
          <input inputMode="numeric" value={draft.y} onChange={(event) => updateDraft("y", event.target.value)} {...guard} />
        </label>
        <label className="form-row">
          <span>Categorie</span>
          <input value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} {...guard} />
        </label>
        <label className="form-row">
          <span>Acces</span>
          <select value={draft.visibility} onChange={(event) => updateDraft("visibility", event.target.value)} {...guard}>
            <option value="public">Invités</option>
            <option value="members">Membres</option>
            <option value="officers">Officiers</option>
            <option value="admins">Admins</option>
          </select>
        </label>
        <label className="form-row wide">
          <span>Notes privees</span>
          <textarea
            value={canManage ? draft.notes : ""}
            placeholder={canManage ? "" : "Reserve aux diplomates et admins"}
            onChange={(event) => updateDraft("notes", event.target.value)}
            {...guard}
          />
        </label>
      </div>
      <button className="primary-action" type="button" onClick={() => onSave?.(draft)} {...guard}>
        Enregistrer la coordonnee
      </button>
    </section>
  );
}

export function DiplomacyAuditPanel({ auditLog }) {
  return (
    <section className="panel diplomacy-audit-panel">
      <PanelHeader icon={ClipboardCheck} title="Historique d'audit" meta={`${auditLog.length} traces`} />
      <div className="audit-timeline">
        {auditLog.length ? (
          auditLog.slice(0, 8).map((entry) => (
            <article key={entry.id}>
              <span>{formatDiplomacyDate(entry.createdAt)}</span>
              <strong>{formatDiplomacyAction(entry.action)}</strong>
              <small>{entry.actorName || "Systeme"} · {entry.metadataLabel}</small>
            </article>
          ))
        ) : (
          <EmptyState icon={ClipboardCheck} title="Aucun audit" text="Les prochaines modifications diplomatiques seront journalisees ici." compact />
        )}
      </div>
    </section>
  );
}

export function DiplomacyBadge({ type }) {
  return <em className={`diplomacy-badge ${type}`}>{getDiplomacyTypeLabel(type)}</em>;
}

export function AgreementBadge({ agreement }) {
  const expired = isAgreementExpired(agreement);
  const scheduled = !expired && isAgreementScheduled(agreement);
  const badgeClass = expired ? "expired" : scheduled ? "scheduled" : agreement.status;
  const label = expired ? "Expire" : scheduled ? "Planifié" : getAgreementStatusLabel(agreement.status);
  return <em className={`diplomacy-badge ${badgeClass}`}>{label}</em>;
}

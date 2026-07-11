import React, {
  useEffect,
  useState
} from "react";
import {
  Banknote,
  ClipboardCheck,
  Command,
  FileText,
  Lock,
  MessageSquare,
  Plus
} from "lucide-react";
import {
  isApiConfigured
} from "../../lib/apiClient.js";
import {
  guildOpsApi
} from "../../lib/guildOpsApi.js";
import {
  can,
  getGuardProps
} from "../../lib/rbac.js";
import {
  slugify
} from "../../lib/guildSiteStore.js";
import {
  bankRequestStatusLabels
} from "../../config/guildOpsConfig.js";
import {
  getBankResourceCode,
  getBankResourceName,
  normalizeBankRequestStatus,
  formatResourceAmount,
  formatRequestAmount,
  formatMovementAmount,
  buildBankCommandResponse
} from "../../lib/guildOpsTransforms.js";
import {
  EmptyState,
  PanelHeader
} from "../shared/Shared.jsx";

const PUBLIC_BANK_FALLBACK_RULES = Object.freeze([
  "Precise la ressource, le montant et le motif de la demande.",
  "Les banquiers priorisent les demandes liees aux events, soins et preparations de guerre.",
  "Les arbitrages, logs et commandes internes restent reserves aux officiers.",
]);

function createPrivatePublicBank(siteDraft = {}) {
  return {
    configured: false,
    moduleEnabled: false,
    name: "Banque de guilde",
    summary: `${siteDraft.guildName || "La guilde"} explique sa banque sans partager ses donnees operationnelles.`,
    resources: [],
    requests: [],
    requestStats: {
      total: 0,
      pending: 0,
      approved: 0,
      fulfilled: 0,
      refused: 0,
    },
    rules: [...PUBLIC_BANK_FALLBACK_RULES],
    privacy: {
      resources: {
        mode: "private",
        label: "Stocks reserves",
      },
      requests: {
        mode: "private",
        label: "Demandes reservees",
      },
      note: "Les mouvements, commandes, acteurs internes et arbitrages officiers restent reserves.",
    },
  };
}

function getPublicBankSlug(siteDraft = {}, publicSlug = "") {
  return slugify(publicSlug || siteDraft.slug || siteDraft.guildName);
}

function navigatePublicBankLink(event, path, onNavigatePublicRoute) {
  if (
    !onNavigatePublicRoute ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }

  event.preventDefault();
  onNavigatePublicRoute(path);
}

function formatPublicBankDate(value) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPublicResourceAmount(resource = {}) {
  return resource.amountLabel || formatResourceAmount(resource);
}

function formatPublicRequestAmount(request = {}) {
  return request.amountLabel || formatRequestAmount(request);
}

function PublicBankPrivateState({ text = "Acces reserve aux membres autorises.", title = "Reserve" }) {
  return (
    <div className="public-bank-private-state">
      <Lock size={24} />
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </div>
  );
}

export function PublicBankModule({ onNavigatePublicRoute, publicSlug = "", siteDraft }) {
  const slug = getPublicBankSlug(siteDraft, publicSlug);
  const chatPath = `/g/${slug}/chat`;
  const chatEnabled = Boolean(siteDraft?.sections?.publicChat);
  const guildName = siteDraft?.guildName || "";
  const [state, setState] = useState(() => ({
    bank: createPrivatePublicBank({ guildName }),
    error: "",
    status: isApiConfigured() ? "loading" : "ready",
  }));

  useEffect(() => {
    if (!isApiConfigured() || !slug) {
      setState({
        bank: createPrivatePublicBank({ guildName }),
        error: "",
        status: "ready",
      });
      return undefined;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading" }));

    guildOpsApi
      .getPublicBank(slug, { signal: controller.signal })
      .then((payload) => {
        setState({
          bank: payload?.bank || createPrivatePublicBank({ guildName }),
          error: "",
          status: "ready",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          bank: createPrivatePublicBank({ guildName }),
          error: error?.message || "Banque momentanement inaccessible.",
          status: "ready",
        });
      });

    return () => controller.abort();
  }, [guildName, slug]);

  const bank = state.bank || createPrivatePublicBank({ guildName });
  const resourcesMode = bank.privacy?.resources?.mode || "private";
  const requestsMode = bank.privacy?.requests?.mode || "private";
  const resources = Array.isArray(bank.resources) ? bank.resources : [];
  const requests = Array.isArray(bank.requests) ? bank.requests : [];
  const rules = Array.isArray(bank.rules) && bank.rules.length ? bank.rules : PUBLIC_BANK_FALLBACK_RULES;
  const requestStats = bank.requestStats || {};
  const isLoading = state.status === "loading";

  return (
    <section className="public-bank-page" id="public-section-bank" tabIndex={-1}>
      <div className="public-bank-hero-panel">
        <div className="public-bank-title">
          <span className="public-bank-icon">
            <Banknote size={30} />
          </span>
          <span>
            <small>{siteDraft?.guildName || "Guilde"}</small>
            <h1>{bank.name || "Banque de guilde"}</h1>
          </span>
        </div>
        <p>{bank.summary}</p>
        <dl className="public-bank-metrics" aria-label="Resume banque">
          <div>
            <dt>Ressources</dt>
            <dd>{resourcesMode === "private" ? "Privees" : resources.length || "Aucune"}</dd>
          </div>
          <div>
            <dt>Demandes en attente</dt>
            <dd>{requestsMode === "private" ? "Masquees" : requestStats.pending || 0}</dd>
          </div>
          <div>
            <dt>Confidentialite</dt>
            <dd>{bank.privacy?.requests?.label || "Demandes reservees"}</dd>
          </div>
        </dl>
        <div className="public-bank-cta-row">
          {chatEnabled ? (
            <a
              href={chatPath}
              onClick={(event) => navigatePublicBankLink(event, chatPath, onNavigatePublicRoute)}
            >
              Contacter la guilde
              <MessageSquare size={17} />
            </a>
          ) : (
            <span className="public-bank-closed-contact">
              <Lock size={16} />
              Contact ferme
            </span>
          )}
        </div>
      </div>

      {state.error ? (
        <p className="public-bank-notice">{state.error} Les details sensibles restent masques.</p>
      ) : null}

      <div className="public-bank-layout">
        <section className="public-bank-panel public-bank-resources">
          <header>
            <span>
              <strong>Ressources</strong>
              <small>{bank.privacy?.resources?.label || "Stocks reserves"}</small>
            </span>
          </header>
          {isLoading ? <PublicBankPrivateState title="Chargement" text="Chargement des stocks..." /> : null}
          {!isLoading && resourcesMode === "private" ? (
            <PublicBankPrivateState text="Le stock detaille est reserve aux membres et banquiers." />
          ) : null}
          {!isLoading && resourcesMode !== "private" && !resources.length ? (
            <PublicBankPrivateState title="Aucune ressource" text="Aucun stock pour le moment." />
          ) : null}
          {!isLoading && resourcesMode !== "private" && resources.length ? (
            <div className="public-bank-resource-list">
              {resources.map((resource) => (
                <article key={resource.resourceCode || resource.code || resource.name}>
                  <span>
                    <strong>{resource.resourceName || resource.name}</strong>
                    <small>{resource.visibility === "public" ? "Stock detaille" : "Stock agrege"}</small>
                  </span>
                  <em>{formatPublicResourceAmount(resource)}</em>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="public-bank-panel public-bank-requests">
          <header>
            <span>
              <strong>Dernieres demandes</strong>
              <small>{bank.privacy?.requests?.label || "Demandes reservees"}</small>
            </span>
          </header>
          {isLoading ? <PublicBankPrivateState title="Chargement" text="Chargement des demandes..." /> : null}
          {!isLoading && requestsMode === "private" ? (
            <PublicBankPrivateState text="Les demandes restent reservees aux membres autorises." />
          ) : null}
          {!isLoading && requestsMode !== "private" && !requests.length ? (
            <PublicBankPrivateState title="Aucune demande" text="Aucune demande pour le moment." />
          ) : null}
          {!isLoading && requestsMode !== "private" && requests.length ? (
            <div className="public-bank-request-list">
              {requests.map((request) => {
                const status = normalizeBankRequestStatus(request);
                return (
                  <article key={request.id}>
                    <span>
                      <strong>{request.member}</strong>
                      <small>
                        {request.resource} · {formatPublicRequestAmount(request)} · {formatPublicBankDate(request.createdAt)}
                      </small>
                    </span>
                    <i className={`status-chip ${status}`}>{bankRequestStatusLabels[status] || status}</i>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="public-bank-panel public-bank-rules">
          <header>
            <span>
              <strong>Regles de demande</strong>
              <small>Cadre de demande</small>
            </span>
          </header>
          <ol>
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
          <p>{bank.privacy?.note}</p>
        </section>
      </div>
    </section>
  );
}

export function BankMini({ bankError = "", currentUser, bankMovements = [], bankRequests = [], bankStock = [], updateBankRequestStatus }) {
  const pendingRequests = bankRequests.filter((request) => normalizeBankRequestStatus(request) === "pending");
  const lastMovement = bankMovements[0];

  return (
    <section className="panel mini-panel bank-panel">
      <PanelHeader icon={Banknote} title="Banque - ressources" meta="!banque" />
      {bankError ? <p className="sync-warning">{bankError}</p> : null}
      <div className="tabline">
        <span className="is-active">Stock</span>
        <span>Demandes ({pendingRequests.length})</span>
        <span>Historique</span>
      </div>
      <div className="mini-stock-strip">
        {bankStock.length ? (
          bankStock.slice(0, 3).map((resource) => (
            <span key={getBankResourceCode(resource)}>
              <strong>{formatResourceAmount(resource)}</strong>
              {getBankResourceName(resource)}
            </span>
          ))
        ) : (
          <EmptyState icon={Banknote} title="Stock vide" text="Ajoute un mouvement pour amorcer la banque." compact />
        )}
      </div>
      <div className="compact-list">
        {pendingRequests.slice(0, 3).map((request) => (
          <div className="compact-row request-row" key={request.id}>
            <strong>{request.member}</strong>
            <span>
              {formatRequestAmount(request)} {request.resource}
            </span>
            <button
              type="button"
              onClick={() => updateBankRequestStatus(request.id, "approved")}
              {...getGuardProps(currentUser, "manage_bank")}
            >
              OK
            </button>
          </div>
        ))}
        {!pendingRequests.length && !lastMovement ? (
          <EmptyState icon={ClipboardCheck} title="Aucune demande" text="Les demandes membres arriveront ici." compact />
        ) : null}
        {lastMovement ? (
          <div className="compact-row request-row">
            <strong>{lastMovement.time}</strong>
            <span>{lastMovement.note}</span>
            <em className={(lastMovement.type || lastMovement.movementType) === "in" ? "online" : "amber-text"}>
              {formatMovementAmount(lastMovement)}
            </em>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function BankView({
  addBankMovement,
  bankError = "",
  bankCommand,
  bankMovements = [],
  bankRequests = [],
  bankStock = [],
  createBankRequest,
  currentUser,
  saveBankResource,
  setBankCommand,
  updateBankRequestStatus,
}) {
  const commandReady = bankCommand.trim().toLowerCase() === "!banque";
  const bankGuard = getGuardProps(currentUser, "manage_bank");
  const pendingRequests = bankRequests.filter((request) => normalizeBankRequestStatus(request) === "pending");
  const hasResources = bankStock.length > 0;

  return (
    <div className="page-grid two-columns">
      <section className="panel bank-dashboard wide-panel">
        <PanelHeader icon={Banknote} title="Banque de guilde" meta={`${pendingRequests.length} demandes en attente`} />
        {bankError ? <p className="sync-warning">{bankError}</p> : null}
        <div className="bank-stock-cards">
          {hasResources ? (
            bankStock.map((resource) => (
              <div className="bank-stock-card" key={getBankResourceCode(resource)}>
                <strong>{formatResourceAmount(resource)}</strong>
                <span>{getBankResourceName(resource)}</span>
                <small>Maj {resource.updatedAt || "--"}</small>
              </div>
            ))
          ) : (
            <EmptyState icon={Banknote} title="Aucun stock" text="Enregistre un premier depot pour alimenter la banque." />
          )}
        </div>
        <label className="command-input">
          <Command size={17} />
          <input value={bankCommand} onChange={(event) => setBankCommand(event.target.value)} {...bankGuard} />
          <button type="button" {...bankGuard}>Lancer</button>
        </label>
        {commandReady && can(currentUser, "manage_bank") ? (
          <div className="command-result">
            {buildBankCommandResponse({
              command: bankCommand,
              guild: null,
              requests: bankRequests,
              stock: bankStock,
            })}
          </div>
        ) : null}
      </section>
      <BankResourceEditor bankStock={bankStock} currentUser={currentUser} onSave={saveBankResource} />
      <BankRequestComposer bankStock={bankStock} onCreate={createBankRequest} />
      <BankRequestsPanel
        bankRequests={bankRequests}
        currentUser={currentUser}
        updateBankRequestStatus={updateBankRequestStatus}
      />
      <BankRequestHistoryPanel bankRequests={bankRequests} />
      <BankMovementComposer
        bankStock={bankStock}
        currentUser={currentUser}
        onCreate={addBankMovement}
      />
      <section className="panel">
        <PanelHeader icon={FileText} title="Mouvements recents" meta={`${bankMovements.length} lignes`} />
        <div className="bank-movement-list">
          {bankMovements.length ? (
            bankMovements.slice(0, 6).map((entry) => (
              <div className="bank-movement-row" key={entry.id || `${entry.time}-${entry.note}`}>
                <time>{entry.time}</time>
                <span>
                  <strong>{entry.note}</strong>
                  <small>{entry.actor}</small>
                </span>
                <em
                  className={
                    (entry.type || entry.movementType) === "in"
                      ? "online"
                      : (entry.type || entry.movementType) === "out"
                        ? "amber-text"
                        : "muted-text"
                  }
                >
                  {formatMovementAmount(entry)}
                </em>
              </div>
            ))
          ) : (
            <EmptyState icon={FileText} title="Aucun mouvement" text="Les depots, sorties et commandes banque s'afficheront ici." compact />
          )}
        </div>
      </section>
    </div>
  );
}

const NEW_BANK_RESOURCE_VALUE = "__new_resource__";

function createBankResourceDraft(resource = {}) {
  return {
    resourceCode: getBankResourceCode(resource),
    resourceName: getBankResourceName(resource),
    amount: resource.amount ?? "",
    unit: resource.unit || "",
  };
}

function createEmptyBankResourceDraft() {
  return {
    resourceCode: "",
    resourceName: "",
    amount: "",
    unit: "",
  };
}

export function BankResourceEditor({ bankStock = [], currentUser, onSave }) {
  const bankGuard = getGuardProps(currentUser, "manage_bank");
  const firstResourceCode = getBankResourceCode(bankStock[0]);
  const [selectedCode, setSelectedCode] = useState(firstResourceCode || NEW_BANK_RESOURCE_VALUE);
  const [draft, setDraft] = useState(() =>
    firstResourceCode ? createBankResourceDraft(bankStock[0]) : createEmptyBankResourceDraft(),
  );

  useEffect(() => {
    if (selectedCode === NEW_BANK_RESOURCE_VALUE) return;
    const selectedResource = bankStock.find((resource) => getBankResourceCode(resource) === selectedCode);

    if (selectedResource) {
      setDraft(createBankResourceDraft(selectedResource));
      return;
    }

    if (!firstResourceCode) {
      setSelectedCode(NEW_BANK_RESOURCE_VALUE);
      setDraft(createEmptyBankResourceDraft());
    }
  }, [bankStock, firstResourceCode, selectedCode]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectResource(value) {
    setSelectedCode(value);
    if (value === NEW_BANK_RESOURCE_VALUE) {
      setDraft(createEmptyBankResourceDraft());
      return;
    }

    const resource = bankStock.find((item) => getBankResourceCode(item) === value);
    setDraft(createBankResourceDraft(resource));
  }

  function submitResource() {
    if (bankGuard.disabled) return;
    onSave?.(draft);
    if (selectedCode === NEW_BANK_RESOURCE_VALUE) {
      setDraft(createEmptyBankResourceDraft());
    }
  }

  const amount = Number(draft.amount);
  const isInvalid = !draft.resourceName.trim() || draft.amount === "" || !Number.isFinite(amount) || amount < 0;
  const isExistingResource = selectedCode !== NEW_BANK_RESOURCE_VALUE;

  return (
    <section className="panel bank-compact-panel bank-resource-editor">
      <PanelHeader icon={Banknote} title="Ressources" meta="Membres autorisés" />
      <div className="bank-resource-toolbar">
        <label className="form-row">
          <span>Stock</span>
          <select value={selectedCode} onChange={(event) => selectResource(event.target.value)} disabled={bankGuard.disabled} title={bankGuard.title}>
            <option value={NEW_BANK_RESOURCE_VALUE}>Nouvelle ressource</option>
            {bankStock.map((resource) => (
              <option key={getBankResourceCode(resource)} value={getBankResourceCode(resource)}>
                {getBankResourceName(resource)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => selectResource(NEW_BANK_RESOURCE_VALUE)} disabled={bankGuard.disabled} title={bankGuard.title}>
          <Plus size={16} />
          Ajouter
        </button>
      </div>
      <div className="bank-form-grid">
        <label className="form-row">
          <span>Nom</span>
          <input value={draft.resourceName} onChange={(event) => updateDraft("resourceName", event.target.value)} disabled={bankGuard.disabled} title={bankGuard.title} />
        </label>
        <label className="form-row">
          <span>Code</span>
          <input
            value={draft.resourceCode}
            placeholder="auto"
            onChange={(event) => updateDraft("resourceCode", event.target.value)}
            disabled={bankGuard.disabled || isExistingResource}
            title={isExistingResource ? "Le code d'une ressource existante reste stable." : bankGuard.title}
          />
        </label>
        <label className="form-row">
          <span>Montant</span>
          <input value={draft.amount} inputMode="decimal" onChange={(event) => updateDraft("amount", event.target.value)} disabled={bankGuard.disabled} title={bankGuard.title} />
        </label>
        <label className="form-row">
          <span>Unité</span>
          <input value={draft.unit} placeholder="K, M, rss..." onChange={(event) => updateDraft("unit", event.target.value)} disabled={bankGuard.disabled} title={bankGuard.title} />
        </label>
      </div>
      <div className="bank-resource-actions">
        <button className="primary-action" type="button" onClick={submitResource} disabled={bankGuard.disabled || isInvalid} title={bankGuard.title}>
          Enregistrer la ressource
        </button>
      </div>
    </section>
  );
}

export function BankRequestComposer({ bankStock, onCreate }) {
  const [draft, setDraft] = useState(() => ({
    resourceCode: getBankResourceCode(bankStock[0]) || "",
    amount: "",
    reason: "",
  }));
  const hasResources = bankStock.length > 0;

  useEffect(() => {
    const firstCode = getBankResourceCode(bankStock[0]) || "";
    setDraft((current) =>
      bankStock.some((resource) => getBankResourceCode(resource) === current.resourceCode)
        ? current
        : { ...current, resourceCode: firstCode },
    );
  }, [bankStock]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submitRequest() {
    if (!hasResources) return;
    onCreate?.(draft);
    setDraft((current) => ({ ...current, amount: "", reason: "" }));
  }

  return (
    <section className="panel bank-compact-panel">
      <PanelHeader icon={Plus} title="Demande de ressources" meta="Membre" />
      <div className="bank-form-grid">
        <label className="form-row">
          <span>Ressource</span>
            <select value={draft.resourceCode} onChange={(event) => updateDraft("resourceCode", event.target.value)} disabled={!hasResources}>
              {bankStock.map((resource) => (
                <option key={getBankResourceCode(resource)} value={getBankResourceCode(resource)}>
                  {getBankResourceName(resource)}
                </option>
              ))}
            </select>
        </label>
        <label className="form-row">
          <span>Montant</span>
          <input
            value={draft.amount}
            inputMode="decimal"
            placeholder="Ex: 25"
            onChange={(event) => updateDraft("amount", event.target.value)}
            disabled={!hasResources}
          />
        </label>
        <label className="form-row wide">
          <span>Motif</span>
          <input
            value={draft.reason}
            placeholder="Heal, war prep, rally..."
            onChange={(event) => updateDraft("reason", event.target.value)}
            disabled={!hasResources}
          />
        </label>
      </div>
      {!hasResources ? <EmptyState icon={Banknote} title="Stock a initialiser" text="Un banquier doit enregistrer une ressource avant les demandes." compact /> : null}
      <button className="teal-action" type="button" onClick={submitRequest} disabled={!hasResources || !draft.amount}>
        Envoyer la demande
      </button>
    </section>
  );
}

export function BankRequestsPanel({ bankRequests = [], currentUser, updateBankRequestStatus }) {
  const bankGuard = getGuardProps(currentUser, "manage_bank");

  return (
    <section className="panel bank-compact-panel">
      <PanelHeader icon={ClipboardCheck} title="Demandes" meta={`${bankRequests.length} total`} />
      <div className="bank-request-list">
        {bankRequests.length ? bankRequests.map((request) => {
          const status = normalizeBankRequestStatus(request);
          return (
            <article className="bank-request-card" key={request.id}>
              <span>
                <strong>{request.member}</strong>
                <small>
                  {formatRequestAmount(request)} {request.resource} · {request.reason || request.urgency}
                </small>
              </span>
              <i className={`status-chip ${status}`}>{bankRequestStatusLabels[status] || status}</i>
              <div className="bank-request-actions">
                {status === "pending" ? (
                  <>
                    <button type="button" onClick={() => updateBankRequestStatus(request.id, "approved")} {...bankGuard}>
                      OK
                    </button>
                    <button type="button" onClick={() => updateBankRequestStatus(request.id, "refused")} {...bankGuard}>
                      Refuser
                    </button>
                  </>
                ) : null}
                {status === "approved" ? (
                  <button type="button" onClick={() => updateBankRequestStatus(request.id, "fulfilled")} {...bankGuard}>
                    Livrer
                  </button>
                ) : null}
              </div>
            </article>
          );
        }) : <EmptyState icon={ClipboardCheck} title="Aucune demande" text="Les demandes de ressources arriveront ici." compact />}
      </div>
    </section>
  );
}

const BANK_REQUEST_HISTORY_STATUSES = new Set(["approved", "fulfilled", "refused"]);

function getBankRequestHistoryDate(request = {}) {
  return request.decidedAt || request.updatedAt || request.createdAt || request.time || "";
}

export function BankRequestHistoryPanel({ bankRequests = [] }) {
  const historyRequests = bankRequests.filter((request) =>
    BANK_REQUEST_HISTORY_STATUSES.has(normalizeBankRequestStatus(request)),
  );
  const acceptedCount = historyRequests.filter((request) => {
    const status = normalizeBankRequestStatus(request);
    return status === "approved" || status === "fulfilled";
  }).length;
  const refusedCount = historyRequests.filter((request) => normalizeBankRequestStatus(request) === "refused").length;

  return (
    <section className="panel bank-compact-panel">
      <PanelHeader icon={ClipboardCheck} title="Historique demandes" meta={`${acceptedCount} acceptees · ${refusedCount} refusees`} />
      <div className="bank-request-history-list">
        {historyRequests.length ? historyRequests.map((request) => {
          const status = normalizeBankRequestStatus(request);
          const date = getBankRequestHistoryDate(request);

          return (
            <article
              className={`bank-request-history-row ${status}`}
              key={request.id || `${request.member}-${request.resource}-${request.amount}-${status}`}
            >
              <span>
                <strong>{request.member || request.requester || "Membre"}</strong>
                <small>
                  {request.resource}
                  {request.reason || request.urgency ? ` · ${request.reason || request.urgency}` : ""}
                </small>
              </span>
              <em className="bank-request-quantity">{formatRequestAmount(request)}</em>
              <i className={`status-chip ${status}`}>{bankRequestStatusLabels[status] || status}</i>
              {date ? <time>{date}</time> : null}
            </article>
          );
        }) : (
          <EmptyState icon={ClipboardCheck} title="Aucun historique" text="Les demandes acceptees ou refusees s'afficheront ici." compact />
        )}
      </div>
    </section>
  );
}

export function BankMovementComposer({ bankStock, currentUser, onCreate }) {
  const bankGuard = getGuardProps(currentUser, "manage_bank");
  const [draft, setDraft] = useState(() => ({
    type: "in",
    resourceCode: getBankResourceCode(bankStock[0]) || "",
    amount: "",
    note: "",
  }));
  const hasResources = bankStock.length > 0;

  useEffect(() => {
    const firstCode = getBankResourceCode(bankStock[0]) || "";
    setDraft((current) =>
      bankStock.some((resource) => getBankResourceCode(resource) === current.resourceCode)
        ? current
        : { ...current, resourceCode: firstCode },
    );
  }, [bankStock]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submitMovement() {
    if (!hasResources) return;
    onCreate?.(draft);
    setDraft((current) => ({ ...current, amount: "", note: "" }));
  }

  return (
    <section className="panel bank-compact-panel">
      <PanelHeader icon={FileText} title="Mouvement" meta="Banquier/admin" />
      <div className="bank-form-grid">
        <label className="form-row">
          <span>Type</span>
          <select value={draft.type} onChange={(event) => updateDraft("type", event.target.value)} disabled={bankGuard.disabled || !hasResources} title={bankGuard.title}>
            <option value="in">Depot</option>
            <option value="out">Sortie</option>
          </select>
        </label>
        <label className="form-row">
          <span>Ressource</span>
          <select value={draft.resourceCode} onChange={(event) => updateDraft("resourceCode", event.target.value)} disabled={bankGuard.disabled || !hasResources} title={bankGuard.title}>
            {bankStock.map((resource) => (
              <option key={getBankResourceCode(resource)} value={getBankResourceCode(resource)}>
                {getBankResourceName(resource)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span>Montant</span>
          <input value={draft.amount} inputMode="decimal" onChange={(event) => updateDraft("amount", event.target.value)} disabled={bankGuard.disabled || !hasResources} title={bankGuard.title} />
        </label>
        <label className="form-row">
          <span>Note</span>
          <input value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} disabled={bankGuard.disabled || !hasResources} title={bankGuard.title} />
        </label>
      </div>
      {!hasResources ? <EmptyState icon={Banknote} title="Aucune ressource" text="Ajoute une ressource en base pour activer les mouvements." compact /> : null}
      <button className="primary-action" type="button" onClick={submitMovement} disabled={bankGuard.disabled || !hasResources || !draft.amount} title={bankGuard.title}>
        Enregistrer
      </button>
    </section>
  );
}

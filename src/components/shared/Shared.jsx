import React, {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Bot,
  ChevronRight,
  CircleHelp,
  Languages,
  Shield
} from "lucide-react";
import {
  isApiConfigured
} from "../../lib/apiClient.js";
import {
  guildOpsApi
} from "../../lib/guildOpsApi.js";
import {
  can,
  getGuardProps,
  getRoleColor,
  permissionRoles
} from "../../lib/rbac.js";
import {
  getGuildKey,
  getGuildLabel,
  getMergeDecisionLabel
} from "../../lib/guildOpsTransforms.js";

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PanelHeader({ icon: Icon, title, meta, action }) {
  return (
    <header className="panel-header">
      <div>
        {Icon ? <Icon size={18} /> : null}
        <h2>{title}</h2>
      </div>
      {action || (meta ? <span className="panel-meta">{meta}</span> : null)}
    </header>
  );
}

export function EmptyState({ compact = false, icon: Icon = CircleHelp, text, title }) {
  return (
    <div className={`empty-card ${compact ? "compact" : ""}`}>
      <span className="empty-card-icon">{Icon ? <Icon size={compact ? 16 : 22} /> : null}</span>
      <span>
        <strong>{title}</strong>
        {text ? <small>{text}</small> : null}
      </span>
    </div>
  );
}

export function RolePill({ role }) {
  const color = getRoleColor(role);
  return <em className={`role-pill ${color}`}>{role}</em>;
}

export function Avatar({ name }) {
  const initials = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return <span className="avatar">{initials}</span>;
}

export function TranslationPanel({ translateOn, setTranslateOn, targetLanguage, setTargetLanguage }) {
  return (
    <section className="panel translation-panel">
      <PanelHeader
        icon={Languages}
        title="Traduction auto"
        action={
          <button
            className={`toggle ${translateOn ? "is-on" : ""}`}
            type="button"
            onClick={() => setTranslateOn(!translateOn)}
            aria-pressed={translateOn}
          >
            <span />
          </button>
        }
      />
      <div className="language-row">
        <select defaultValue="EN">
          <option>EN - Anglais</option>
          <option>ES - Espagnol</option>
          <option>DE - Allemand</option>
        </select>
        <ChevronRight size={15} />
        <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
          <option value="FR">FR - Francais</option>
          <option value="EN">EN - Anglais</option>
          <option value="ES">ES - Espagnol</option>
        </select>
      </div>
      <p className="rail-note">
        Statut: <strong className="online">{translateOn ? "Actif" : "Pause"}</strong> sur Chat invités et Messages
      </p>
    </section>
  );
}

export function MergePanel({ compact = false, currentUser, guilds: availableGuilds = [], selectedGuild }) {
  const apiEnabled = isApiConfigured();
  const guildOptions = useMemo(() => availableGuilds, [availableGuilds]);
  const [sourceGuildKey, setSourceGuildKey] = useState("");
  const [targetGuildKey, setTargetGuildKey] = useState("");
  const [mergeRequest, setMergeRequest] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [merged, setMerged] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mergeGuard = getGuardProps(currentUser, "admin_all");
  const mergeDisabled = Boolean(mergeGuard.disabled);

  useEffect(() => {
    const selectedKey = selectedGuild ? getGuildKey(selectedGuild) : "";
    const fallbackKey = selectedKey || getGuildKey(guildOptions[0]);

    setSourceGuildKey((current) => (guildOptions.some((guild) => getGuildKey(guild) === current) ? current : fallbackKey));
  }, [guildOptions, selectedGuild]);

  useEffect(() => {
    setTargetGuildKey((current) => {
      const currentIsValid = guildOptions.some((guild) => getGuildKey(guild) === current && current !== sourceGuildKey);
      if (currentIsValid) return current;
      return getGuildKey(guildOptions.find((guild) => getGuildKey(guild) !== sourceGuildKey));
    });
  }, [guildOptions, sourceGuildKey]);

  useEffect(() => {
    setMergeRequest(null);
    setDuplicates([]);
    setMerged([]);
    setError("");
  }, [sourceGuildKey, targetGuildKey]);

  const sourceGuild = guildOptions.find((guild) => getGuildKey(guild) === sourceGuildKey) || guildOptions[0];
  const targetGuild =
    guildOptions.find((guild) => getGuildKey(guild) === targetGuildKey) ||
    guildOptions.find((guild) => getGuildKey(guild) !== sourceGuildKey);
  const canUseApi = apiEnabled && sourceGuild?.id && targetGuild?.id;
  const pendingCount = duplicates.filter((duplicate) => duplicate.decision === "pending").length;
  const headerMeta = loading
    ? "Analyse en cours"
    : `${pendingCount} doublon${pendingCount > 1 ? "s" : ""} a traiter`;

  async function launchAnalysis() {
    if (mergeDisabled) return;
    setError("");

    if (!apiEnabled) {
      setMerged([]);
      setMergeRequest({ id: "local", status: "review", duplicateCount: 0 });
      return;
    }

    if (!canUseApi) {
      setError("Selectionnez deux guildes de votre espace.");
      return;
    }

    setLoading(true);
    try {
      const payload = mergeRequest?.id
        ? await guildOpsApi.rescanMergeRequest(sourceGuild.id, mergeRequest.id)
        : await guildOpsApi.createMergeRequest(sourceGuild.id, {
            targetGuildId: targetGuild.id,
            strategy: { scope: "guild-site", resolution: "manual" },
            scan: true,
          });

      setMergeRequest(payload.mergeRequest || null);
      setDuplicates(Array.isArray(payload.duplicates) ? payload.duplicates : []);
    } catch (apiError) {
      setError(apiError?.message || "Analyse de fusion impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function resolveDuplicate(duplicate, decision) {
    if (mergeDisabled) return;

    if (!apiEnabled || !mergeRequest?.id) {
      setMerged((current) => (current.includes(duplicate.a) ? current : [...current, duplicate.a]));
      return;
    }

    setError("");
    try {
      const payload = await guildOpsApi.decideMergeDuplicate(sourceGuild.id, mergeRequest.id, duplicate.id, decision);
      setDuplicates((current) => {
        const next = current.map((candidate) =>
          candidate.id === duplicate.id ? payload.duplicate || { ...candidate, decision } : candidate,
        );
        setMergeRequest((currentRequest) =>
          currentRequest
            ? {
                ...currentRequest,
                pendingCount: next.filter((candidate) => candidate.decision === "pending").length,
              }
            : currentRequest,
        );
        return next;
      });
    } catch (apiError) {
      setError(apiError?.message || "Decision impossible pour ce doublon.");
    }
  }

  return (
    <section className={`panel merge-panel ${compact ? "compact-merge" : ""}`}>
      <PanelHeader icon={Bot} title="Fusion avec doublons" meta={headerMeta} />
      <div className="merge-controls">
        <label className="form-row">
          <span>Guilde source</span>
          <select value={sourceGuildKey} onChange={(event) => setSourceGuildKey(event.target.value)} disabled={loading || mergeDisabled}>
            {guildOptions.map((guild) => (
              <option key={getGuildKey(guild)} value={getGuildKey(guild)}>
                {getGuildLabel(guild)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span>Guilde cible</span>
          <select value={targetGuildKey} onChange={(event) => setTargetGuildKey(event.target.value)} disabled={loading || mergeDisabled}>
            {guildOptions
              .filter((guild) => getGuildKey(guild) !== sourceGuildKey)
              .map((guild) => (
                <option key={getGuildKey(guild)} value={getGuildKey(guild)}>
                  {getGuildLabel(guild)}
                </option>
              ))}
          </select>
        </label>
        <button
          className="primary-action"
          type="button"
          onClick={launchAnalysis}
          disabled={loading || mergeDisabled || !targetGuild}
          title={mergeGuard.title}
        >
          {loading ? "Analyse..." : mergeRequest?.id && apiEnabled ? "Relancer l'analyse" : "Lancer l'analyse"}
        </button>
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
      {apiEnabled ? (
        <div className="merge-list resolution-list">
          {duplicates.length ? (
            duplicates.map((duplicate) => (
              <article className={`merge-row merge-resolution-row ${duplicate.decision !== "pending" ? "is-merged" : ""}`} key={duplicate.id}>
                <MergeMemberSummary member={duplicate.sourceMember} />
                <ChevronRight size={16} />
                <MergeMemberSummary member={duplicate.targetMember} />
                <div className="merge-resolution-meta">
                  <strong>{Math.round((duplicate.confidence || 0) * 100)}%</strong>
                  <small>{(duplicate.reasons || []).join(" · ") || "Signal faible"}</small>
                </div>
                <div className="merge-actions">
                  {["merge", "keep_both", "ignore"].map((decision) => (
                    <button
                      type="button"
                      key={decision}
                      className={duplicate.decision === decision ? "is-active" : ""}
                      onClick={() => resolveDuplicate(duplicate, decision)}
                      disabled={mergeDisabled}
                      title={mergeGuard.title}
                    >
                      {getMergeDecisionLabel(decision)}
                    </button>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">
              {mergeRequest ? "Aucun doublon detecte pour cette analyse." : "Lancez l'analyse pour ouvrir la resolution manuelle."}
            </p>
          )}
        </div>
      ) : (
        <div className="merge-list">
          <p className="empty-state">Aucune analyse automatique pour le moment.</p>
        </div>
      )}
    </section>
  );
}

export function MergeMemberSummary({ member }) {
  const safeMember = member || {};
  const name = safeMember.name || safeMember.nickname || safeMember.displayName || "Membre";
  const meta = [safeMember.guildName, safeMember.game, safeMember.server, ...(safeMember.roleCodes || [])].filter(Boolean).join(" · ");

  return (
    <span>
      <Avatar name={name} />
      <strong>{name}</strong>
      <small>{meta || safeMember.email || "Profil sans detail"}</small>
    </span>
  );
}

export function PermissionsMatrix({ currentUser }) {
  const roleGuard = getGuardProps(currentUser, "manage_roles");
  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(permissionRoles.flatMap((role) => role.modules.map((module) => [`${role.role}-${module}`, true]))),
  );

  return (
    <section className="panel permissions-matrix">
      <PanelHeader icon={Shield} title="Permissions avancees" meta="Roles modulaires" />
      <div className="permission-list matrix">
        {permissionRoles.map((role) => (
          <div key={role.role} className="permission-row">
            <RolePill role={role.role} />
            <span>
              {role.modules.map((module) => (
                <button
                  key={module}
                  type="button"
                  className={enabled[`${role.role}-${module}`] ? "is-enabled" : ""}
                  disabled={roleGuard.disabled}
                  title={roleGuard.title}
                  onClick={() =>
                    can(currentUser, "manage_roles")
                      ? setEnabled((current) => ({
                          ...current,
                          [`${role.role}-${module}`]: !current[`${role.role}-${module}`],
                        }))
                      : undefined
                  }
                >
                  {module}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

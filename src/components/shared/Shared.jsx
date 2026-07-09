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

function PremiumHeroGlyph({ icon: Icon, variant = "crest" }) {
  if (!Icon) return null;

  return (
    <span className={`premium-hero-glyph is-${variant}`} aria-hidden="true">
      <svg className="premium-hero-glyph-frame" viewBox="0 0 120 132" focusable="false">
        <path className="premium-glyph-shadow" d="M60 5l43 16v56L60 126 17 77V21L60 5Z" />
        <path className="premium-glyph-back" d="M60 12l35 13v48L60 116 25 73V25l35-13Z" />
        <path className="premium-glyph-top" d="M38 19h44l10 11-32 13-32-13 10-11Z" />
        <path className="premium-glyph-frame-line" d="M60 20l27 10v38L60 102 33 68V30l27-10Z" />
        <path className="premium-glyph-core" d="M60 32l18 7v24L60 86 42 63V39l18-7Z" />
        <path className="premium-glyph-notches" d="M37 35l23-9 23 9M39 67l21 25 21-25M28 48h11M81 48h11M47 108h26" />
        <circle className="premium-glyph-rivet" cx="33" cy="30" r="2" />
        <circle className="premium-glyph-rivet" cx="87" cy="30" r="2" />
        <circle className="premium-glyph-rivet" cx="38" cy="72" r="2" />
        <circle className="premium-glyph-rivet" cx="82" cy="72" r="2" />
        <path className="premium-glyph-sheen" d="M36 28l34-12 14 7-48 19Z" />
      </svg>
      <Icon className="premium-hero-glyph-icon" />
    </span>
  );
}

export function ModuleHero({
  badge = 0,
  className = "",
  crest,
  eyebrow,
  icon: Icon = Shield,
  mark,
  metric,
  title,
}) {
  const displayBadge = Number(badge || 0) > 0 ? badge : "";

  return (
    <section className={`panel wide-panel message-space-hero module-space-hero${className ? ` ${className}` : ""}`}>
      <div className="message-space-mark module-space-mark">
        {mark || <PremiumHeroGlyph icon={Icon} variant="mark" />}
        {displayBadge ? <span>{displayBadge}</span> : null}
      </div>
      <span>
        <small>{eyebrow}</small>
        <strong>{title}</strong>
      </span>
      {metric ? <em>{metric}</em> : null}
      <div className="message-hero-crest module-hero-crest" aria-hidden="true">
        {crest || <PremiumHeroGlyph icon={Icon} variant="crest" />}
      </div>
    </section>
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
              {role.modules.length ? (
                role.modules.map((module) => (
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
                ))
              ) : (
                <em>Accès membre</em>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

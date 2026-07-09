import React, {
  useState
} from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  Globe2,
  Lock,
  RefreshCw,
  Shield,
  UserCheck,
  Users,
  X
} from "lucide-react";
import {
  can,
  getGuardProps,
  getPermissionLabel,
  getRoleLabel,
  permissionRoles
} from "../../../lib/rbac.js";
import {
  getAdministrationModules
} from "../../../config/moduleRegistry.js";
import {
  getGuildKey
} from "../../../lib/guildOpsTransforms.js";
import {
  slugify
} from "../../../lib/guildSiteStore.js";
import {
  Avatar,
  MergePanel,
  PanelHeader,
  PermissionsMatrix,
  RolePill
} from "../../shared/Shared.jsx";

function getAdministrationModuleSummary(module) {
  if (!module.permissionKeys.length) return "Accès privé";
  return module.permissionKeys.map((permission) => getPermissionLabel(permission)).join(", ");
}

export function AdministrationView({
  administrationAccess = {},
  currentUser,
  enabledModuleIds = [],
  members = [],
  onToggleAdministrationMember,
  onToggleAdministrationModule,
  onToggleAllAdministrationModules,
}) {
  const administrationModules = getAdministrationModules();
  const enabledSet = new Set(enabledModuleIds);
  const accessGuard = getGuardProps(currentUser, "admin_all");
  const canEditAdministration = can(currentUser, "admin_all");
  const activeMemberCount = members.filter((member) => (administrationAccess[member.id] || []).length > 0).length;
  const enabledAdminModuleCount = administrationModules.filter((module) => enabledSet.has(module.id)).length;
  const grantCount = members.reduce((total, member) => total + (administrationAccess[member.id] || []).length, 0);

  return (
    <div className="page-grid administration-page">
      <section className="panel wide-panel administration-panel">
        <PanelHeader icon={Shield} title="Administration" meta={`${activeMemberCount}/${members.length} membres`} />
        <div className="administration-summary">
          <article>
            <span>Membres avec accès</span>
            <strong>{activeMemberCount}</strong>
          </article>
          <article>
            <span>Modules administrables</span>
            <strong>{enabledAdminModuleCount}/{administrationModules.length}</strong>
          </article>
          <article>
            <span>Restrictions actives</span>
            <strong>{grantCount}</strong>
          </article>
        </div>
        <div className="administration-list">
          {members.map((member) => {
            const moduleIds = administrationAccess[member.id] || [];
            const hasAdministrationAccess = moduleIds.length > 0;
            const hasAllModules = administrationModules.every((module) => moduleIds.includes(module.id));

            return (
              <article className={`administration-row ${hasAdministrationAccess ? "is-admin" : ""}`} key={member.id}>
                <header className="administration-member">
                  <Avatar name={member.name} />
                  <span>
                    <strong>{member.name}</strong>
                    <small>{[member.power, member.status].filter(Boolean).join(" · ")}</small>
                  </span>
                  <RolePill role={getRoleLabel(member.role)} />
                  <button
                    className={`admin-access-toggle ${hasAdministrationAccess ? "is-on" : ""}`}
                    type="button"
                    aria-pressed={hasAdministrationAccess}
                    disabled={!canEditAdministration}
                    title={accessGuard.title}
                    onClick={() => onToggleAdministrationMember?.(member.id)}
                  >
                    <span />
                    {hasAdministrationAccess ? "Accès admin" : "Sans accès"}
                  </button>
                  <button
                    className="admin-all-toggle"
                    type="button"
                    aria-pressed={hasAllModules}
                    disabled={!canEditAdministration}
                    title={accessGuard.title}
                    onClick={() => onToggleAllAdministrationModules?.(member.id)}
                  >
                    {hasAllModules ? "Retirer tout" : "Tout"}
                  </button>
                </header>
                <div className="administration-modules" aria-label={`Restrictions modules pour ${member.name}`}>
                  {administrationModules.map((module) => {
                    const Icon = module.icon;
                    const isGranted = moduleIds.includes(module.id);
                    const isModuleEnabled = enabledSet.has(module.id);
                    const title = isModuleEnabled
                      ? getAdministrationModuleSummary(module)
                      : `${module.label} inactif pour cette guilde`;

                    return (
                      <button
                        className={`admin-module-chip ${isGranted ? "is-granted" : ""} ${isModuleEnabled ? "" : "is-inactive"}`}
                        type="button"
                        aria-pressed={isGranted}
                        disabled={!canEditAdministration}
                        key={module.id}
                        title={accessGuard.title || title}
                        onClick={() => onToggleAdministrationModule?.(member.id, module.id)}
                      >
                        <Icon size={15} />
                        <span>{module.hubLabel || module.navLabel || module.label}</span>
                        <small>{isModuleEnabled ? title : "Inactif"}</small>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function MembershipRequestsView({
  currentUser,
  memberModerationError = "",
  membershipRequests = [],
  moderatingMemberId = "",
  onRotateInviteLink,
  onApproveMembershipRequest,
  onBlockMembershipRequest,
  onRefuseMembershipRequest,
  rotatingInviteLink = false,
  selectedGuild,
  siteDraft,
}) {
  const guildSlug = slugify(selectedGuild?.name || "");
  const requests = membershipRequests.filter((request) => !guildSlug || request.guildSlug === guildSlug);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const approvedRequests = requests.filter((request) => request.status === "approved");
  const refusedRequests = requests.filter((request) => request.status === "refused");
  const approvalGuard = getGuardProps(currentUser, "approve_members");
  const canApprove = can(currentUser, "approve_members");
  const memberGuard = getGuardProps(currentUser, "manage_members");
  const canBlock = can(currentUser, "manage_members");
  const [inviteCopied, setInviteCopied] = useState(false);
  const inviteUrl = siteDraft?.memberInviteUrl
    ? new URL(siteDraft.memberInviteUrl, window.location.origin).href
    : "";

  async function copyInviteLink() {
    if (!inviteUrl || !navigator.clipboard) return;

    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1400);
  }

  return (
    <div className="page-grid membership-requests-page">
      <section className="panel wide-panel membership-requests-panel">
        <PanelHeader icon={UserCheck} title="Adhésions" meta={`${pendingRequests.length} en attente`} />
        <div className="membership-request-summary">
          <article>
            <span>À valider</span>
            <strong>{pendingRequests.length}</strong>
          </article>
          <article>
            <span>Acceptées</span>
            <strong>{approvedRequests.length}</strong>
          </article>
          <article>
            <span>Refusées</span>
            <strong>{refusedRequests.length}</strong>
          </article>
        </div>
        <div className="membership-request-intro">
          <UserCheck size={22} />
          <span>
            <strong>Les joueurs sans lien d'invitation ne sont pas activés automatiquement.</strong>
            <small>Ils arrivent ici en demande, puis un rôle autorisé peut accepter ou refuser l'accès.</small>
          </span>
        </div>
        {memberModerationError ? (
          <p className="membership-moderation-error">
            <AlertTriangle size={16} />
            {memberModerationError}
          </p>
        ) : null}
        <div className="membership-invite-tools">
          <span>
            <strong>Lien d'invitation actif</strong>
            <small>Renouveler ce lien désactive immédiatement l'ancien.</small>
          </span>
          <input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} aria-label="Lien d'invitation actif" />
          <button type="button" onClick={copyInviteLink} disabled={!inviteUrl}>
            {inviteCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {inviteCopied ? "Copié" : "Copier"}
          </button>
          <button type="button" onClick={onRotateInviteLink} disabled={!canApprove || rotatingInviteLink}>
            <RefreshCw size={16} />
            {rotatingInviteLink ? "Renouvellement..." : "Renouveler"}
          </button>
        </div>
        <div className="membership-request-list">
          {requests.length ? (
            requests.map((request) => {
              const isPending = request.status === "pending";
              const canBlockRequest = request.status !== "approved";
              const statusLabel = {
                approved: "Acceptée",
                pending: "En attente",
                refused: "Refusée",
              }[request.status] || request.status;

              return (
                <article className={`membership-request-card is-${request.status}`} key={request.id}>
                  <header>
                    <span className="membership-request-avatar">{request.nickname.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{request.nickname}</strong>
                      <small>{[request.guildName, request.game, request.realm].filter(Boolean).join(" · ")}</small>
                    </span>
                    <em className={`status-chip ${request.status}`}>{statusLabel}</em>
                  </header>
                  <p>{request.message}</p>
                  <footer>
                    <span>
                      <Clock3 size={15} />
                      {formatMembershipRequestDate(request.requestedAt)}
                    </span>
                    {request.decidedAt ? (
                      <span>
                        <CheckCircle2 size={15} />
                        {statusLabel} par {request.decidedBy || "Admin"}
                      </span>
                    ) : null}
                    <span className="membership-request-actions">
                      <button
                        type="button"
                        onClick={() => onApproveMembershipRequest?.(request.id)}
                        disabled={!isPending || !canApprove}
                        title={!isPending ? "Demande déjà traitée" : approvalGuard.title}
                      >
                        <CheckCircle2 size={16} />
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => onRefuseMembershipRequest?.(request.id)}
                        disabled={!isPending || !canApprove}
                        title={!isPending ? "Demande déjà traitée" : approvalGuard.title}
                      >
                        <X size={16} />
                        Refuser
                      </button>
                      <button
                        type="button"
                        onClick={() => onBlockMembershipRequest?.(request.id)}
                        disabled={!canBlockRequest || !canBlock || moderatingMemberId === request.id}
                        title={!canBlockRequest ? "Demande déjà acceptée" : memberGuard.title}
                      >
                        <Ban size={16} />
                        {moderatingMemberId === request.id ? "Blocage..." : "Bloquer"}
                      </button>
                    </span>
                  </footer>
                </article>
              );
            })
          ) : (
            <p className="empty-state">Aucune demande pour cette guilde. Les demandes hors invitation apparaîtront ici.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function formatMembershipRequestDate(value) {
  if (!value) return "Date inconnue";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function MembersView({
  currentUser,
  guilds: availableGuilds,
  memberBlocks = [],
  memberModerationError = "",
  members,
  moderatingMemberId = "",
  onBanGuildMember,
  onUnblockGuildMember,
  roleEdits,
  selectedGuild,
  setRoleEdits,
}) {
  const memberGuard = getGuardProps(currentUser, "manage_members");
  const roleGuard = getGuardProps(currentUser, "manage_roles");
  const canManageMembers = can(currentUser, "manage_members");
  const selectedGuildSlug = slugify(selectedGuild?.name || "");
  const selectedGuildId = selectedGuild?.id || "";
  const activeBlocks = memberBlocks.filter(
    (block) =>
      block.active !== false &&
      (!selectedGuildId || !block.guildId || block.guildId === selectedGuildId) &&
      (!selectedGuildSlug || !block.guildSlug || block.guildSlug === selectedGuildSlug),
  );

  return (
    <div className="page-grid two-columns">
      <section className="panel wide-panel">
        <PanelHeader icon={Users} title="Membres, roles et objectifs" meta={`${members.length} actifs`} />
        {memberModerationError ? (
          <p className="membership-moderation-error">
            <AlertTriangle size={16} />
            {memberModerationError}
          </p>
        ) : null}
        <div className="member-role-list">
          {members.map((member) => {
            const isCurrentMember = member.userId === currentUser.id || member.id === currentUser.id;
            const isBusy = moderatingMemberId === member.id;

            return (
              <div className="member-role-row" key={member.id}>
                <Avatar name={member.name} />
                <span>
                  <strong>{member.name}</strong>
                  <small>{[member.power, member.status].filter(Boolean).join(" · ")}</small>
                </span>
                <select
                  value={roleEdits[member.id]}
                  onChange={(event) => {
                    if (can(currentUser, "manage_roles")) {
                      setRoleEdits((current) => ({ ...current, [member.id]: event.target.value }));
                    }
                  }}
                  {...roleGuard}
                >
                  {permissionRoles.map((role) => (
                    <option key={role.code}>{role.role}</option>
                  ))}
                </select>
                <input defaultValue={member.objective || "Presence events"} {...memberGuard} />
                <span className="member-role-actions">
                  <button
                    className="member-ban-action"
                    type="button"
                    onClick={() => onBanGuildMember?.(member.id)}
                    disabled={!canManageMembers || isCurrentMember || isBusy}
                    title={isCurrentMember ? "Impossible de te bannir toi-même" : memberGuard.title}
                  >
                    <Ban size={16} />
                    {isBusy ? "Ban..." : "Bannir + bloquer"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel member-block-panel">
        <PanelHeader icon={Ban} title="Joueurs bloqués" meta={`${activeBlocks.length} actifs`} />
        <div className="member-block-list">
          {activeBlocks.length ? (
            activeBlocks.map((block) => (
              <article className="member-block-card" key={block.id}>
                <header>
                  <span className="membership-request-avatar">{block.nickname.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{block.nickname}</strong>
                    <small>{formatMembershipRequestDate(block.blockedAt)}</small>
                  </span>
                  <em className="status-chip banned">Bloqué</em>
                </header>
                <p>{block.reason}</p>
                <footer>
                  <small>Par {block.blockedByName || "Admin"}</small>
                  <button
                    type="button"
                    onClick={() => onUnblockGuildMember?.(block.id)}
                    disabled={!canManageMembers || moderatingMemberId === block.id}
                    title={memberGuard.title}
                  >
                    <Lock size={15} />
                    {moderatingMemberId === block.id ? "Déblocage..." : "Débloquer"}
                  </button>
                </footer>
              </article>
            ))
          ) : (
            <p className="empty-state">Aucun joueur bloqué pour cette guilde.</p>
          )}
        </div>
      </section>
      <PermissionsMatrix currentUser={currentUser} />
      <MergePanel currentUser={currentUser} guilds={availableGuilds} selectedGuild={selectedGuild} />
    </div>
  );
}

export function SettingsView({ currentUser, selectedGuild, guilds: availableGuilds, onGuildChange }) {
  return (
    <div className="page-grid two-columns">
      <section className="panel">
        <PanelHeader icon={Globe2} title="Gestion multi-guildes / multi-mondes" meta={selectedGuild?.realm || selectedGuild?.server || "Contexte actif"} />
        <div className="settings-list">
          {availableGuilds.map((guild) => (
            <div className={`settings-row ${getGuildKey(guild) === getGuildKey(selectedGuild) ? "is-active" : ""}`} key={getGuildKey(guild)}>
              <Shield size={18} />
              <span>
                <strong>{guild.name}</strong>
                <small>
                  {[guild.game, guild.realm || guild.server, guild.language].filter(Boolean).join(" · ")}
                </small>
              </span>
              <button
                type="button"
                onClick={() => onGuildChange?.(guild)}
                disabled={getGuildKey(guild) === getGuildKey(selectedGuild)}
              >
                {getGuildKey(guild) === getGuildKey(selectedGuild) ? "Active" : "Activer"}
              </button>
            </div>
          ))}
        </div>
      </section>
      <MergePanel currentUser={currentUser} guilds={availableGuilds} selectedGuild={selectedGuild} />
      <PermissionsMatrix currentUser={currentUser} />
    </div>
  );
}

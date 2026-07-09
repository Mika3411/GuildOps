import { apiRequest, buildUrl } from "./apiClient.js";

export const dataDomains = [
  "auth",
  "guilds",
  "publicSite",
  "events",
  "sos",
  "chat",
  "forum",
  "bank",
  "diplomacy",
];

export const guildOpsEndpoints = {
  auth: {
    me: "/me",
    login: "/auth/login",
    logout: "/auth/logout",
    register: "/auth/register",
    resendVerification: "/auth/resend-verification",
    refreshSession: "/auth/refresh-session",
    verifyEmail: "/auth/verify-email",
    context: "/me/context",
    password: "/me/password",
  },
  guilds: {
    list: "/guilds",
    detail: (guildId) => `/guilds/${encodeURIComponent(guildId)}`,
    modules: (guildId) => `/guilds/${encodeURIComponent(guildId)}/modules`,
    members: (guildId) => `/guilds/${encodeURIComponent(guildId)}/members`,
    memberBan: (guildId, memberId) =>
      `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(memberId)}/ban`,
    memberBlocks: (guildId) => `/guilds/${encodeURIComponent(guildId)}/member-blocks`,
    memberBlock: (guildId, blockId) =>
      `/guilds/${encodeURIComponent(guildId)}/member-blocks/${encodeURIComponent(blockId)}`,
    rotateInviteLink: (guildId) => `/guilds/${encodeURIComponent(guildId)}/invite-link/rotate`,
    membershipRequests: (guildId) => `/guilds/${encodeURIComponent(guildId)}/membership-requests`,
    membershipRequest: (guildId, requestId) =>
      `/guilds/${encodeURIComponent(guildId)}/membership-requests/${encodeURIComponent(requestId)}`,
    mergeRequests: (guildId) => `/guilds/${encodeURIComponent(guildId)}/merge-requests`,
    mergeRequest: (guildId, mergeRequestId) =>
      `/guilds/${encodeURIComponent(guildId)}/merge-requests/${encodeURIComponent(mergeRequestId)}`,
    mergeRequestRescan: (guildId, mergeRequestId) =>
      `/guilds/${encodeURIComponent(guildId)}/merge-requests/${encodeURIComponent(mergeRequestId)}/rescan`,
    mergeDuplicates: (guildId, mergeRequestId) =>
      `/guilds/${encodeURIComponent(guildId)}/merge-requests/${encodeURIComponent(mergeRequestId)}/duplicates`,
    mergeDuplicate: (guildId, mergeRequestId, duplicateId) =>
      `/guilds/${encodeURIComponent(guildId)}/merge-requests/${encodeURIComponent(mergeRequestId)}/duplicates/${encodeURIComponent(duplicateId)}`,
  },
  publicSite: {
    directory: "/directory/guilds",
    show: (slug) => `/public/guilds/${encodeURIComponent(slug)}`,
    join: (slug) => `/public/guilds/${encodeURIComponent(slug)}/join`,
    membershipRequests: (slug) => `/public/guilds/${encodeURIComponent(slug)}/membership-requests`,
    bank: (slug) => `/public/guilds/${encodeURIComponent(slug)}/bank`,
    publish: (guildId) => `/guilds/${encodeURIComponent(guildId)}/site/publish`,
  },
  events: {
    list: (guildId) => `/guilds/${encodeURIComponent(guildId)}/events`,
    create: (guildId) => `/guilds/${encodeURIComponent(guildId)}/events`,
    detail: (guildId, eventId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}`,
    update: (guildId, eventId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}`,
    remove: (guildId, eventId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}`,
    quickSummary: (guildId) => `/guilds/${encodeURIComponent(guildId)}/events/summary/quick`,
    nextSummary: (guildId) => `/guilds/${encodeURIComponent(guildId)}/events/summary/next`,
    attendanceRate: (guildId) => `/guilds/${encodeURIComponent(guildId)}/events/summary/attendance-rate`,
    expectedMembers: (guildId) => `/guilds/${encodeURIComponent(guildId)}/events/summary/expected-members`,
    attendance: (guildId, eventId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}/attendance`,
    attendanceMe: (guildId, eventId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}/attendance/me`,
    attendanceMember: (guildId, eventId, memberId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}/attendance/${encodeURIComponent(memberId)}`,
    assignments: (guildId, eventId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}/assignments`,
    assignment: (guildId, eventId, assignmentId) =>
      `/guilds/${encodeURIComponent(guildId)}/events/${encodeURIComponent(eventId)}/assignments/${encodeURIComponent(assignmentId)}`,
  },
  objectives: {
    list: (guildId) => `/guilds/${encodeURIComponent(guildId)}/objectives`,
    create: (guildId) => `/guilds/${encodeURIComponent(guildId)}/objectives`,
    detail: (guildId, objectiveId) =>
      `/guilds/${encodeURIComponent(guildId)}/objectives/${encodeURIComponent(objectiveId)}`,
    update: (guildId, objectiveId) =>
      `/guilds/${encodeURIComponent(guildId)}/objectives/${encodeURIComponent(objectiveId)}`,
    remove: (guildId, objectiveId) =>
      `/guilds/${encodeURIComponent(guildId)}/objectives/${encodeURIComponent(objectiveId)}`,
    weeklySummary: (guildId) => `/guilds/${encodeURIComponent(guildId)}/objectives/summary/weekly`,
  },
  sos: {
    list: (guildId) => `/guilds/${encodeURIComponent(guildId)}/alerts/attack`,
    create: (guildId) => `/guilds/${encodeURIComponent(guildId)}/alerts/attack`,
    stream: (guildId) => `/guilds/${encodeURIComponent(guildId)}/alerts/attack/stream`,
    acknowledgement: (guildId, alertId) =>
      `/guilds/${encodeURIComponent(guildId)}/alerts/attack/${encodeURIComponent(alertId)}/acknowledgement`,
    broadcast: (guildId, alertId) =>
      `/guilds/${encodeURIComponent(guildId)}/alerts/attack/${encodeURIComponent(alertId)}/broadcast`,
  },
  chat: {
    conversations: (guildId) => `/guilds/${encodeURIComponent(guildId)}/conversations`,
    invitations: (guildId) => `/guilds/${encodeURIComponent(guildId)}/message-invitations`,
    recipients: (guildId) => `/guilds/${encodeURIComponent(guildId)}/message-recipients`,
    guildMessages: (guildId) => `/guilds/${encodeURIComponent(guildId)}/messages`,
    guildMessagesRead: (guildId) => `/guilds/${encodeURIComponent(guildId)}/messages/read`,
    guildMessageRead: (guildId, messageId) =>
      `/guilds/${encodeURIComponent(guildId)}/messages/${encodeURIComponent(messageId)}/read`,
    guildMessagesUnreadCount: (guildId) => `/guilds/${encodeURIComponent(guildId)}/messages/unread-count`,
    guildMessagesStream: (guildId) => `/guilds/${encodeURIComponent(guildId)}/messages/stream`,
    messages: (conversationId) => `/conversations/${encodeURIComponent(conversationId)}/messages`,
    publicMessages: (slug) => `/public/guilds/${encodeURIComponent(slug)}/chat`,
    publicSend: (slug) => `/public/guilds/${encodeURIComponent(slug)}/chat/messages`,
    publicStream: (slug) => `/public/guilds/${encodeURIComponent(slug)}/chat/stream`,
    publicModerationMessages: (guildId) => `/guilds/${encodeURIComponent(guildId)}/public-chat/messages`,
    publicModerate: (guildId, messageId) =>
      `/guilds/${encodeURIComponent(guildId)}/public-chat/messages/${encodeURIComponent(messageId)}/moderation`,
  },
  forum: {
    snapshot: (guildId) => `/guilds/${encodeURIComponent(guildId)}/forum`,
    categories: (guildId) => `/guilds/${encodeURIComponent(guildId)}/forum/categories`,
    category: (guildId, categoryId) =>
      `/guilds/${encodeURIComponent(guildId)}/forum/categories/${encodeURIComponent(categoryId)}`,
    categoryPermissions: (guildId, categoryId) =>
      `/guilds/${encodeURIComponent(guildId)}/forum/categories/${encodeURIComponent(categoryId)}/permissions`,
    threads: (guildId) => `/guilds/${encodeURIComponent(guildId)}/forum/threads`,
    thread: (guildId, threadId) => `/guilds/${encodeURIComponent(guildId)}/forum/threads/${encodeURIComponent(threadId)}`,
    posts: (guildId, threadId) =>
      `/guilds/${encodeURIComponent(guildId)}/forum/threads/${encodeURIComponent(threadId)}/posts`,
    post: (guildId, threadId, postId) =>
      `/guilds/${encodeURIComponent(guildId)}/forum/threads/${encodeURIComponent(threadId)}/posts/${encodeURIComponent(postId)}`,
  },
  bank: {
    snapshot: (guildId) => `/guilds/${encodeURIComponent(guildId)}/bank`,
    movements: (guildId) => `/guilds/${encodeURIComponent(guildId)}/bank/movements`,
    requests: (guildId) => `/guilds/${encodeURIComponent(guildId)}/bank/requests`,
    requestStatus: (guildId, requestId) =>
      `/guilds/${encodeURIComponent(guildId)}/bank/requests/${encodeURIComponent(requestId)}/status`,
    approveRequest: (guildId, requestId) =>
      `/guilds/${encodeURIComponent(guildId)}/bank/requests/${encodeURIComponent(requestId)}/approve`,
    command: (guildId) => `/guilds/${encodeURIComponent(guildId)}/bank/commands`,
    history: (guildId) => `/guilds/${encodeURIComponent(guildId)}/bank/history`,
  },
  diplomacy: {
    snapshot: (guildId) => `/guilds/${encodeURIComponent(guildId)}/diplomacy`,
    relations: (guildId) => `/guilds/${encodeURIComponent(guildId)}/diplomacy/relations`,
    relation: (guildId, relationId) =>
      `/guilds/${encodeURIComponent(guildId)}/diplomacy/relations/${encodeURIComponent(relationId)}`,
    nap: (guildId) => `/guilds/${encodeURIComponent(guildId)}/diplomacy/nap`,
    napAgreement: (guildId, agreementId) =>
      `/guilds/${encodeURIComponent(guildId)}/diplomacy/nap/${encodeURIComponent(agreementId)}`,
    coordinates: (guildId) => `/guilds/${encodeURIComponent(guildId)}/coordinates`,
    coordinate: (guildId, coordinateId) =>
      `/guilds/${encodeURIComponent(guildId)}/coordinates/${encodeURIComponent(coordinateId)}`,
  },
  mvp: {
    bootstrap: "/mvp/bootstrap",
  },
};

export const guildOpsApi = {
  getMvpBootstrap({ signal } = {}) {
    return apiRequest(guildOpsEndpoints.mvp.bootstrap, { signal });
  },
  getMe({ signal } = {}) {
    return apiRequest(guildOpsEndpoints.auth.me, { signal });
  },
  login(body) {
    return apiRequest(guildOpsEndpoints.auth.login, { body });
  },
  logout() {
    return apiRequest(guildOpsEndpoints.auth.logout, { method: "POST" });
  },
  register(body) {
    return apiRequest(guildOpsEndpoints.auth.register, { body });
  },
  resendVerification(body) {
    return apiRequest(guildOpsEndpoints.auth.resendVerification, { body });
  },
  refreshSession() {
    return apiRequest(guildOpsEndpoints.auth.refreshSession, { method: "POST" });
  },
  verifyEmail(body) {
    return apiRequest(guildOpsEndpoints.auth.verifyEmail, { body });
  },
  updateActiveContext(body) {
    return apiRequest(guildOpsEndpoints.auth.context, { body, method: "PATCH" });
  },
  updateMe(body) {
    return apiRequest(guildOpsEndpoints.auth.me, { body, method: "PATCH" });
  },
  changePassword(body) {
    return apiRequest(guildOpsEndpoints.auth.password, { body, method: "PATCH" });
  },
  listGuilds({ signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.list, { signal });
  },
  createGuild(body) {
    return apiRequest(guildOpsEndpoints.guilds.list, { body });
  },
  listGuildModules(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.modules(guildId), { signal });
  },
  updateGuildModules(guildId, enabledModules) {
    const body = Array.isArray(enabledModules) ? { enabledModules } : enabledModules;
    return apiRequest(guildOpsEndpoints.guilds.modules(guildId), { body, method: "PUT" });
  },
  listGuildMembers(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.members(guildId), { signal });
  },
  addGuildMember(guildId, body) {
    return apiRequest(guildOpsEndpoints.guilds.members(guildId), { body });
  },
  banGuildMember(guildId, memberId, body = {}) {
    return apiRequest(guildOpsEndpoints.guilds.memberBan(guildId, memberId), { body, method: "POST" });
  },
  listMemberBlocks(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.memberBlocks(guildId), { signal });
  },
  blockGuildMember(guildId, body) {
    return apiRequest(guildOpsEndpoints.guilds.memberBlocks(guildId), { body, method: "POST" });
  },
  unblockGuildMember(guildId, blockId, body = {}) {
    return apiRequest(guildOpsEndpoints.guilds.memberBlock(guildId, blockId), { body, method: "DELETE" });
  },
  rotateGuildInviteLink(guildId) {
    return apiRequest(guildOpsEndpoints.guilds.rotateInviteLink(guildId), { method: "POST" });
  },
  listMembershipRequests(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.membershipRequests(guildId), { signal });
  },
  decideMembershipRequest(guildId, requestId, decision) {
    return apiRequest(guildOpsEndpoints.guilds.membershipRequest(guildId, requestId), {
      body: { decision },
      method: "PATCH",
    });
  },
  listMergeRequests(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.mergeRequests(guildId), { signal });
  },
  createMergeRequest(guildId, body) {
    return apiRequest(guildOpsEndpoints.guilds.mergeRequests(guildId), { body });
  },
  getMergeRequest(guildId, mergeRequestId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.mergeRequest(guildId, mergeRequestId), { signal });
  },
  rescanMergeRequest(guildId, mergeRequestId) {
    return apiRequest(guildOpsEndpoints.guilds.mergeRequestRescan(guildId, mergeRequestId), { method: "POST" });
  },
  listMergeDuplicates(guildId, mergeRequestId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.guilds.mergeDuplicates(guildId, mergeRequestId), { signal });
  },
  decideMergeDuplicate(guildId, mergeRequestId, duplicateId, decision) {
    return apiRequest(guildOpsEndpoints.guilds.mergeDuplicate(guildId, mergeRequestId, duplicateId), {
      body: { decision },
      method: "PATCH",
    });
  },
  getPublicGuild(slug, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.publicSite.show(slug), { signal });
  },
  joinPublicGuild(slug, body) {
    return apiRequest(guildOpsEndpoints.publicSite.join(slug), { body, method: "POST" });
  },
  createMembershipRequest(slug, body) {
    return apiRequest(guildOpsEndpoints.publicSite.membershipRequests(slug), { body, method: "POST" });
  },
  listPublicGuildDirectory(query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.publicSite.directory, { query, signal });
  },
  getPublicBank(slug, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.publicSite.bank(slug), { signal });
  },
  publishGuildSite(guildId, body) {
    return apiRequest(guildOpsEndpoints.publicSite.publish(guildId), { body });
  },
  listEvents(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.list(guildId), { query, signal });
  },
  createEvent(guildId, body) {
    return apiRequest(guildOpsEndpoints.events.create(guildId), { body });
  },
  getEvent(guildId, eventId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.detail(guildId, eventId), { signal });
  },
  updateEvent(guildId, eventId, body) {
    return apiRequest(guildOpsEndpoints.events.update(guildId, eventId), {
      body,
      method: "PATCH",
    });
  },
  deleteEvent(guildId, eventId) {
    return apiRequest(guildOpsEndpoints.events.remove(guildId, eventId), { method: "DELETE" });
  },
  getEventQuickSummary(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.quickSummary(guildId), { signal });
  },
  getNextEventSummary(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.nextSummary(guildId), { signal });
  },
  getAttendanceRate(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.attendanceRate(guildId), { query, signal });
  },
  getExpectedMembers(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.expectedMembers(guildId), { query, signal });
  },
  listAttendance(guildId, eventId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.attendance(guildId, eventId), { signal });
  },
  updateMyAttendance(guildId, eventId, body) {
    return apiRequest(guildOpsEndpoints.events.attendanceMe(guildId, eventId), {
      body,
      method: "PUT",
    });
  },
  updateMemberAttendance(guildId, eventId, memberId, body) {
    return apiRequest(guildOpsEndpoints.events.attendanceMember(guildId, eventId, memberId), {
      body,
      method: "PUT",
    });
  },
  deleteMemberAttendance(guildId, eventId, memberId) {
    return apiRequest(guildOpsEndpoints.events.attendanceMember(guildId, eventId, memberId), {
      method: "DELETE",
    });
  },
  listAssignments(guildId, eventId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.events.assignments(guildId, eventId), { signal });
  },
  createAssignment(guildId, eventId, body) {
    return apiRequest(guildOpsEndpoints.events.assignments(guildId, eventId), { body });
  },
  updateAssignment(guildId, eventId, assignmentId, body) {
    return apiRequest(guildOpsEndpoints.events.assignment(guildId, eventId, assignmentId), {
      body,
      method: "PATCH",
    });
  },
  deleteAssignment(guildId, eventId, assignmentId) {
    return apiRequest(guildOpsEndpoints.events.assignment(guildId, eventId, assignmentId), {
      method: "DELETE",
    });
  },
  listObjectives(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.objectives.list(guildId), { query, signal });
  },
  createObjective(guildId, body) {
    return apiRequest(guildOpsEndpoints.objectives.create(guildId), { body });
  },
  getObjective(guildId, objectiveId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.objectives.detail(guildId, objectiveId), { signal });
  },
  updateObjective(guildId, objectiveId, body) {
    return apiRequest(guildOpsEndpoints.objectives.update(guildId, objectiveId), {
      body,
      method: "PATCH",
    });
  },
  deleteObjective(guildId, objectiveId) {
    return apiRequest(guildOpsEndpoints.objectives.remove(guildId, objectiveId), { method: "DELETE" });
  },
  getWeeklyObjectivesSummary(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.objectives.weeklySummary(guildId), { signal });
  },
  listAttackAlerts(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.sos.list(guildId), { query, signal });
  },
  createAttackAlert(guildId, body) {
    return apiRequest(guildOpsEndpoints.sos.create(guildId), { body });
  },
  acknowledgeAttackAlert(guildId, alertId, body) {
    return apiRequest(guildOpsEndpoints.sos.acknowledgement(guildId, alertId), {
      body,
      method: "PUT",
    });
  },
  broadcastAttackAlert(guildId, alertId) {
    return apiRequest(guildOpsEndpoints.sos.broadcast(guildId, alertId), {
      method: "POST",
    });
  },
  openAttackAlertStream(guildId) {
    return new EventSource(buildUrl(guildOpsEndpoints.sos.stream(guildId)), {
      withCredentials: true,
    });
  },
  listPublicChat(slug, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.chat.publicMessages(slug), { query, signal });
  },
  openPublicChatStream(slug) {
    return new EventSource(buildUrl(guildOpsEndpoints.chat.publicStream(slug)), {
      withCredentials: true,
    });
  },
  listConversations(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.chat.conversations(guildId), { signal });
  },
  listMessageRecipients(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.chat.recipients(guildId), { signal });
  },
  sendMessageInvitation(guildId, body) {
    return apiRequest(guildOpsEndpoints.chat.invitations(guildId), { body });
  },
  listGuildMessages(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.chat.guildMessages(guildId), { query, signal });
  },
  sendGuildMessage(guildId, body) {
    return apiRequest(guildOpsEndpoints.chat.guildMessages(guildId), { body });
  },
  markGuildMessageRead(guildId, messageId) {
    return apiRequest(guildOpsEndpoints.chat.guildMessageRead(guildId, messageId), { method: "PATCH" });
  },
  markGuildConversationRead(guildId, body) {
    return apiRequest(guildOpsEndpoints.chat.guildMessagesRead(guildId), { body });
  },
  getUnreadMessageCount(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.chat.guildMessagesUnreadCount(guildId), { signal });
  },
  openGuildMessageStream(guildId) {
    return new EventSource(buildUrl(guildOpsEndpoints.chat.guildMessagesStream(guildId)), {
      withCredentials: true,
    });
  },
  sendPublicChat(slug, body) {
    return apiRequest(guildOpsEndpoints.chat.publicSend(slug), { body });
  },
  listPublicChatModeration(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.chat.publicModerationMessages(guildId), { query, signal });
  },
  moderatePublicChatMessage(guildId, messageId, body) {
    return apiRequest(guildOpsEndpoints.chat.publicModerate(guildId, messageId), {
      body,
      method: "PATCH",
    });
  },
  getForum(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.forum.snapshot(guildId), { signal });
  },
  saveForumCategory(guildId, category) {
    const categoryId = category?.id;
    return apiRequest(
      categoryId ? guildOpsEndpoints.forum.category(guildId, categoryId) : guildOpsEndpoints.forum.categories(guildId),
      {
        body: category,
        method: categoryId ? "PATCH" : "POST",
      },
    );
  },
  deleteForumCategory(guildId, categoryId) {
    return apiRequest(guildOpsEndpoints.forum.category(guildId, categoryId), { method: "DELETE" });
  },
  updateForumCategoryPermissions(guildId, categoryId, permissions) {
    return apiRequest(guildOpsEndpoints.forum.categoryPermissions(guildId, categoryId), {
      body: { permissions },
      method: "PUT",
    });
  },
  listForumThreads(guildId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.forum.threads(guildId), { query, signal });
  },
  createForumThread(guildId, body) {
    return apiRequest(guildOpsEndpoints.forum.threads(guildId), { body });
  },
  getForumThread(guildId, threadId, query, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.forum.thread(guildId, threadId), { query, signal });
  },
  updateForumThread(guildId, threadId, body) {
    return apiRequest(guildOpsEndpoints.forum.thread(guildId, threadId), {
      body,
      method: "PATCH",
    });
  },
  createForumPost(guildId, threadId, body) {
    return apiRequest(guildOpsEndpoints.forum.posts(guildId, threadId), { body });
  },
  updateForumPost(guildId, threadId, postId, body) {
    return apiRequest(guildOpsEndpoints.forum.post(guildId, threadId, postId), {
      body,
      method: "PATCH",
    });
  },
  deleteForumPost(guildId, threadId, postId, body = {}) {
    return apiRequest(guildOpsEndpoints.forum.post(guildId, threadId, postId), {
      body,
      method: "DELETE",
    });
  },
  getBank(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.bank.snapshot(guildId), { signal });
  },
  createBankRequest(guildId, body) {
    return apiRequest(guildOpsEndpoints.bank.requests(guildId), { body });
  },
  createBankMovement(guildId, body) {
    return apiRequest(guildOpsEndpoints.bank.movements(guildId), { body });
  },
  updateBankRequestStatus(guildId, requestId, status) {
    return apiRequest(guildOpsEndpoints.bank.requestStatus(guildId, requestId), {
      body: { status },
      method: "PATCH",
    });
  },
  approveBankRequest(guildId, requestId) {
    return apiRequest(guildOpsEndpoints.bank.approveRequest(guildId, requestId), {
      method: "PATCH",
    });
  },
  runBankCommand(guildId, body) {
    return apiRequest(guildOpsEndpoints.bank.command(guildId), { body });
  },
  listBankHistory(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.bank.history(guildId), { signal });
  },
  listDiplomacyRelations(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.diplomacy.relations(guildId), { signal });
  },
  getDiplomacySnapshot(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.diplomacy.snapshot(guildId), { signal });
  },
  saveDiplomacyRelation(guildId, relation) {
    const relationId = relation?.id;
    return apiRequest(
      relationId ? guildOpsEndpoints.diplomacy.relation(guildId, relationId) : guildOpsEndpoints.diplomacy.relations(guildId),
      {
        body: relation,
        method: relationId ? "PATCH" : "POST",
      },
    );
  },
  saveNapAgreement(guildId, agreement) {
    const agreementId = agreement?.id;
    return apiRequest(
      agreementId ? guildOpsEndpoints.diplomacy.napAgreement(guildId, agreementId) : guildOpsEndpoints.diplomacy.nap(guildId),
      {
        body: agreement,
        method: agreementId ? "PATCH" : "POST",
      },
    );
  },
  listCoordinates(guildId, { signal } = {}) {
    return apiRequest(guildOpsEndpoints.diplomacy.coordinates(guildId), { signal });
  },
  saveCoordinate(guildId, coordinate) {
    const coordinateId = coordinate?.id;
    return apiRequest(
      coordinateId ? guildOpsEndpoints.diplomacy.coordinate(guildId, coordinateId) : guildOpsEndpoints.diplomacy.coordinates(guildId),
      {
        body: coordinate,
        method: coordinateId ? "PATCH" : "POST",
      },
    );
  },
};

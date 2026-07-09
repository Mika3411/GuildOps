import assert from "node:assert/strict";
import {
  buildBankCommandResponse,
  buildLocalAttendanceRate,
  buildLocalConversations,
  buildLocalForumCategories,
  buildLocalForumCounters,
  buildLocalForumPosts,
  buildLocalForumThreads,
  buildLocalOutgoingMessage,
  buildLocalThreadMessages,
  buildPublicDiplomacySnapshot,
  buildSosSummary,
  buildTimelineEvents,
  buildWarSummary,
  countLocalUnread,
  formatMovementAmount,
  formatRequestAmount,
  formatResourceAmount,
  getDefaultConversation,
  getConversationParticipantIds,
  getConversationParticipantsTitle,
  getEnabledSiteSections,
  getPublicRouteSegment,
  getVisibleSiteSections,
  isGroupConversation,
  messageMatchesConversation,
  mergeSosAcknowledgement,
  normalizeApiConversation,
  normalizeApiPrivateMessage,
  normalizeBankRequestStatus,
  normalizeDiplomacyCoordinate,
  normalizeDiplomacyRelation,
  normalizeForumCategory,
  normalizeForumPost,
  normalizeForumThread,
  normalizeLocalMessageRecipients,
  normalizeNapAgreement,
  normalizeSosAcknowledgement,
  normalizeSosAlert,
  toApiAttendanceStatus,
  upsertConversationFromMessage,
} from "../src/lib/guildOpsTransforms.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("messages: local conversations, unread counts, matching and upsert keep current semantics", () => {
  const messages = [
    { id: "m1", channel: "R4 Team", from: "NordicLeader", text: "Plan pret", unread: 2, createdAt: "2026-07-01T10:00:00.000Z" },
    { id: "m2", channel: "Officiers", from: "FrostWarden", text: "Go", unread: 0, createdAt: "2026-07-01T10:05:00.000Z" },
  ];

  const conversations = buildLocalConversations(messages);
  assert.deepEqual(conversations.map((conversation) => conversation.id), ["internal:r4-team", "internal:officiers"]);
  assert.equal(conversations[0].preview, "Plan pret");
  assert.equal(countLocalUnread(messages), 2);

  const threadMessages = buildLocalThreadMessages(messages, conversations[0]);
  assert.equal(threadMessages.length, 1);
  assert.equal(threadMessages[0].id, "local-thread-m1");
  assert.equal(threadMessages[0].translationStatus, "original");

  const privateConversation = normalizeApiConversation({
    type: "private",
    participantUserId: "user-2",
    name: "FrostWarden",
    unread_count: 3,
  });
  const privateMessage = normalizeApiPrivateMessage({
    id: "pm-1",
    author: "FrostWarden",
    original: { text: "Need help", language: "en" },
    translated: { text: "Besoin d'aide", language: "fr", status: "cached" },
    conversationType: "private",
    sender_user_id: "user-2",
    recipient_user_id: "user-1",
  });

  assert.equal(privateConversation.id, "private:user-2");
  assert.equal(privateConversation.unreadCount, 3);
  assert.equal(privateMessage.text, "Need help");
  assert.equal(privateMessage.translated, "Besoin d'aide");
  assert.equal(messageMatchesConversation(privateMessage, privateConversation), true);

  const upserted = upsertConversationFromMessage([getDefaultConversation()], privateMessage, getDefaultConversation());
  assert.equal(upserted[0].id, "private:user-2");
  assert.equal(upserted[0].unreadCount, 1);

  const recipients = normalizeLocalMessageRecipients(
    [
      { id: "user-1", name: "NordicLeader", status: "online" },
      { id: "user-2", email: "FrostWarden@GuildOps.app", name: "FrostWarden", role: "Officier", status: "online" },
      { id: "user-3", name: "ShieldMaiden", status: "banned" },
    ],
    { id: "user-1" },
  );

  assert.deepEqual(recipients.map((recipient) => recipient.id), ["user-2"]);
  assert.equal(recipients[0].nickname, "FrostWarden");
  assert.equal(recipients[0].email, "frostwarden@guildops.app");

  const groupConversation = normalizeApiConversation({
    type: "group",
    participants: [
      { id: "user-2", nickname: "FrostWarden" },
      { id: "user-3", nickname: "ShieldMaiden" },
    ],
  });
  const groupMessage = buildLocalOutgoingMessage("Go rally", groupConversation, { id: "user-1", displayName: "NordicLeader" }, "FR");

  assert.equal(isGroupConversation(groupConversation), true);
  assert.deepEqual(getConversationParticipantIds(groupConversation), ["user-2", "user-3"]);
  assert.equal(getConversationParticipantsTitle(groupConversation.participants), "FrostWarden, ShieldMaiden");
  assert.equal(groupMessage.conversationType, "group");
  assert.deepEqual(groupMessage.participantIds, ["user-2", "user-3"]);
  assert.equal(messageMatchesConversation(groupMessage, groupConversation), true);
});

test("site sections: public visibility is independent from private modules", () => {
  const sections = {
    roster: true,
    wars: true,
    bank: true,
    diplomacy: false,
    forum: true,
    publicChat: true,
  };

  const visibleKeys = getVisibleSiteSections(sections).map((section) => section.key);

  assert.deepEqual(visibleKeys, ["roster", "wars", "bank", "forum", "publicChat"]);
  assert.deepEqual(getEnabledSiteSections(sections).map((section) => section.key), visibleKeys);
});

test("public routes: slug and segment helpers support guild module URLs", () => {
  assert.equal(getPublicRouteSegment("/g/aegis-nord"), "");
  assert.equal(getPublicRouteSegment("/g/aegis-nord/equipe"), "equipe");
  assert.equal(getPublicRouteSegment("/g/aegis-nord/diplomatie"), "diplomatie");
  assert.equal(getPublicRouteSegment("/g/aegis-nord/wars/today"), "wars-today");
});

test("forum: category, thread and post normalization preserve API/local fallbacks", () => {
  const category = normalizeForumCategory({
    name: "Strategie War",
    sort_order: "4",
    thread_count: "2",
    post_count: "8",
    permissions: { can_read: true, can_post: false, can_moderate: true },
  });
  assert.equal(category.id, "strategie-war");
  assert.equal(category.sortOrder, 4);
  assert.equal(category.threadCount, 2);
  assert.deepEqual(category.permissions, { canRead: true, canPost: false, canModerate: true });

  const thread = normalizeForumThread({
    id: "thread-1",
    category_id: "strategy",
    category_name: "Strategie",
    author_name: "FrostWarden",
    title: "Forteresse",
    locked_at: "2026-07-01T12:00:00.000Z",
    pinned_at: "2026-07-01T11:00:00.000Z",
    reply_count: "3",
  });
  assert.equal(thread.locked, true);
  assert.equal(thread.pinned, true);
  assert.equal(thread.replyCount, 3);
  assert.equal(thread.permissions.canReply, false);

  const deletedPost = normalizeForumPost({
    id: "post-1",
    thread_id: "thread-1",
    author_name: "ShieldMaiden",
    body: "Archive",
    deleted_at: "2026-07-01T12:05:00.000Z",
    edited_at: "2026-07-01T12:04:00.000Z",
  });
  assert.equal(deletedPost.deleted, true);
  assert.equal(deletedPost.edited, true);
  assert.equal(deletedPost.threadId, "thread-1");

  const localThreads = buildLocalForumThreads([{ id: "local-1", title: "Plan Nord", replies: 2 }]);
  assert.equal(localThreads[0].categoryId, "strategy");
  assert.equal(buildLocalForumPosts(localThreads[0], "Premier message", "NordicLeader")[0].authorName, "NordicLeader");
  assert.equal(buildLocalForumCategories(localThreads).length, 3);
  assert.equal(buildLocalForumCounters(localThreads).posts, 3);
});

test("diplomacy: relation, NAP and coordinate normalization keep labels and aliases", () => {
  const relation = normalizeDiplomacyRelation({
    tag: "nfd",
    name: "Northern Fury",
    relation_type: "ally",
    stance: "Renforts mutuels",
    created_by_name: "ShieldMaiden",
    updated_at: "2026-07-01T08:00:00.000Z",
  });
  assert.equal(relation.tag, "NFD");
  assert.equal(relation.type, "Allie");
  assert.equal(relation.relationType, "ally");
  assert.equal(relation.mood, "Amical");
  assert.equal(relation.updatedByName, "Inconnu");

  const expiredNap = normalizeNapAgreement({
    title: "NAP frontiere",
    relation_id: "rel-1",
    relation_name: "Wild Legacy",
    relation_tag: "WLD",
    status: "active",
    ends_at: "2000-01-01T00:00:00.000Z",
  });
  assert.equal(expiredNap.status, "expired");
  assert.equal(expiredNap.relationTag, "WLD");

  const coordinate = normalizeDiplomacyCoordinate({
    label: "Frontiere NAP",
    relation_name: "Wild Legacy",
    value: "X:602 Y:585",
    type: "Diplomatie",
  });
  assert.equal(coordinate.x, 602);
  assert.equal(coordinate.y, 585);
  assert.equal(coordinate.category, "Diplomatie");
});

test("diplomacy: public snapshot exposes only public diplomacy data", () => {
  const snapshot = buildPublicDiplomacySnapshot({
    relations: [
      {
        id: "rel-ally",
        tag: "nfd",
        name: "Northern Fury",
        relationType: "ally",
        stance: "Renforts mutuels",
        notes: "private ally notes",
        createdByName: "InternalOfficer",
      },
      {
        id: "rel-enemy-private",
        tag: "brs",
        name: "Berserkers",
        relationType: "enemy",
        stance: "Hostile prive",
        notes: "private hostile notes",
      },
      {
        id: "rel-enemy-public",
        tag: "sov",
        name: "Sovereign",
        relationType: "enemy",
        stance: "Hostile public",
        public: true,
        notes: "private public-hostile notes",
        createdByName: "Diplomat",
      },
      {
        id: "rel-nap-private",
        tag: "arc",
        name: "Arcadia",
        relationType: "nap",
        visibility: "internal",
      },
    ],
    napAgreements: [
      {
        id: "nap-linked",
        relation_id: "rel-ally",
        relation_tag: "NFD",
        title: "NAP Nord",
        terms: "private nap terms",
      },
      {
        id: "nap-public-summary",
        relation_id: "rel-enemy-public",
        relation_tag: "SOV",
        title: "Truce public",
        public: true,
        terms: "private truce terms",
        publicSummary: "Fenetre publique",
      },
      {
        id: "nap-draft",
        relation_id: "rel-ally",
        relation_tag: "NFD",
        title: "Draft secret",
        status: "draft",
        terms: "draft terms",
      },
    ],
    coordinates: [
      {
        id: "coord-public",
        label: "Frontiere publique",
        relationName: "Northern Fury",
        x: 602,
        y: 585,
        visibility: "public",
        notes: "private coord notes",
        createdByName: "Scout",
      },
      {
        id: "coord-officers",
        label: "Ruche Aegis",
        x: 417,
        y: 388,
        visibility: "officers",
        notes: "officer coord notes",
      },
    ],
  });

  assert.deepEqual(
    snapshot.relations.map((relation) => relation.id),
    ["rel-ally", "rel-enemy-public"],
  );
  assert.equal(snapshot.relations.some((relation) => relation.id === "rel-enemy-private"), false);
  assert.equal(Object.hasOwn(snapshot.relations[0], "notes"), false);
  assert.equal(Object.hasOwn(snapshot.relations[1], "createdByName"), false);

  assert.deepEqual(
    snapshot.napAgreements.map((agreement) => agreement.id),
    ["nap-linked", "nap-public-summary"],
  );
  assert.equal(snapshot.napAgreements[0].summary, "");
  assert.equal(snapshot.napAgreements[1].summary, "Fenetre publique");
  assert.equal(Object.hasOwn(snapshot.napAgreements[0], "terms"), false);

  assert.deepEqual(
    snapshot.coordinates.map((coordinate) => coordinate.id),
    ["coord-public"],
  );
  assert.equal(snapshot.coordinates[0].visibility, "public");
  assert.equal(Object.hasOwn(snapshot.coordinates[0], "notes"), false);
  assert.equal(Object.hasOwn(snapshot.coordinates[0], "createdByName"), false);
  assert.ok(snapshot.privacy.internal.includes("exclus"));
});

test("events: attendance summary and timeline are stable for local data", () => {
  const members = [
    { id: "m1", allianceWar: "Confirme" },
    { id: "m2", allianceWar: "Peut-etre" },
    { id: "m3", allianceWar: "Absent" },
    { id: "m4", allianceWar: "" },
  ];
  const attendance = buildLocalAttendanceRate(members);
  assert.deepEqual(attendance, {
    activeMembers: 4,
    confirmed: 1,
    maybe: 1,
    absent: 1,
    pending: 1,
    expected: 2,
    rate: 0.25,
  });

  const events = [
    { id: "e1", title: "War", startsAt: "2026-07-01T18:00:00.000Z" },
    { id: "e2", label: "Bear Hunt", time: "20:00 UTC", color: "green" },
    { id: "e3", title: "Forteresse" },
    { id: "e4", title: "Rallye" },
    { id: "e5", title: "Scout" },
    { id: "e6", title: "Ignored" },
  ];
  const summary = buildWarSummary({ events, members });
  assert.equal(summary.nextEvent.id, "e1");
  assert.equal(summary.expectedMembers.length, 2);
  assert.equal(summary.weeklyObjectives.completionRate, 0);

  const timeline = buildTimelineEvents(events);
  assert.equal(timeline.length, 5);
  assert.equal(timeline[0].id, "e1");
  assert.equal(timeline[1].label, "Bear Hunt");
  assert.equal(timeline[1].time, "20:00 UTC");
  assert.equal(toApiAttendanceStatus("Absent"), "absent");
  assert.equal(toApiAttendanceStatus("Peut-etre"), "maybe");
});

test("sos: acknowledgement normalization, merge replacement and summaries stay compatible", () => {
  const alert = normalizeSosAlert({
    id: "alert-1",
    title: "Rallye: X500 Y600",
    type: "Rallye",
    created_by_name: "NordicLeader",
    acknowledgements: [
      { member_id: "m1", member_name: "FrostWarden", response: "seen" },
      { member_id: "m2", member_name: "ShieldMaiden", response: "absent" },
    ],
  });
  assert.equal(alert.targetLabel, "X500 Y600");
  assert.equal(alert.acknowledgementSummary.total, 2);
  assert.equal(alert.acknowledgementSummary.cannotJoin, 1);

  const acknowledgement = normalizeSosAcknowledgement({ memberId: "m1", memberName: "FrostWarden", response: "en route" });
  assert.equal(acknowledgement.response, "joining");
  assert.equal(acknowledgement.responseLabel, "En route");

  const merged = mergeSosAcknowledgement([alert], {
    alertId: "alert-1",
    acknowledgement,
  });
  assert.equal(merged[0].acknowledgements.length, 2);
  assert.equal(merged[0].myAcknowledgement.response, "joining");
  assert.deepEqual(buildSosSummary(merged[0].acknowledgements), {
    seen: 0,
    joining: 1,
    cannotJoin: 1,
    resolved: 0,
    total: 2,
  });
});

test("bank: amount formatting, status aliases and command summaries match current UI contract", () => {
  assert.equal(formatResourceAmount({ amount: 12400, unit: "M" }), `${Number(12400).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}M`);
  assert.equal(formatResourceAmount({ amount: 32450 }), Number(32450).toLocaleString("fr-FR"));
  assert.equal(formatRequestAmount({ amount: 50, unit: "M" }), "50M");
  assert.equal(formatMovementAmount({ type: "in", amount: 2.4, unit: "M" }), "+2,4M");
  assert.equal(formatMovementAmount({ type: "out", amount: 75, unit: "M" }), "-75M");
  assert.equal(formatMovementAmount({ type: "command" }), "!banque");

  assert.equal(normalizeBankRequestStatus({ status: "rejected" }), "refused");
  assert.equal(normalizeBankRequestStatus({ state: "Approuvee" }), "approved");
  assert.equal(normalizeBankRequestStatus({ state: "Livree" }), "fulfilled");
  assert.equal(normalizeBankRequestStatus({}), "pending");

  const response = buildBankCommandResponse({
    command: "!banque",
    guild: { name: "Aegis Nord" },
    requests: [{ status: "pending" }, { state: "Approuvee" }],
    stock: [{ name: "Viande", amount: 12.4, unit: "M" }],
  });
  assert.equal(response, "Banque Aegis Nord: Viande 12,4M. Demandes en attente: 1. Commande: !banque.");
});

let passed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`\n${passed}/${tests.length} GuildOps transform checks passed.`);
}

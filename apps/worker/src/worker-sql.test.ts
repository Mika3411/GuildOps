import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

process.env.DATABASE_URL ??= "postgres://localhost/guildops_test";
process.env.NODE_ENV = "test";

const {
  runEventReminderSweepWithClient,
  runPresenceFollowupSweepWithClient
} = await import("./event-tasks.js");
const { cleanupSessionsWithClient, expireNapAgreementsWithClient } = await import("./maintenance-tasks.js");

type WorkerSqlClient = Parameters<typeof runEventReminderSweepWithClient>[0];

test("event reminder sweep creates due event alerts", async () => {
  const db = await createWorkerDb();

  try {
    await db.exec(`
      INSERT INTO guild_members (id, guild_id, user_id, nickname, status)
      VALUES ('member-1', 'guild-1', 'user-1', 'Astra', 'active');

      INSERT INTO events (
        id,
        guild_id,
        server_id,
        title,
        event_type,
        starts_at,
        location_label,
        location_x,
        location_y,
        created_at,
        cancelled_at
      )
      VALUES (
        'event-1',
        'guild-1',
        'server-1',
        'Dragon rally',
        'war',
        now() + interval '50 minutes',
        'Fort nord',
        120,
        340,
        now() - interval '2 hours',
        NULL
      );
    `);

    const result = await runEventReminderSweepWithClient(workerClient(db));
    const alerts = await db.query<{ alert_type: string; severity: string; title: string; window: string }>(
      "SELECT alert_type, severity, title, metadata ->> 'window' AS window FROM alerts"
    );
    const notifications = await db.query<{ user_id: string; type: string; title: string; window: string }>(
      "SELECT user_id, type, title, data ->> 'window' AS window FROM notifications"
    );
    const audits = await db.query<{ action: string; target_table: string; target_id: string }>(
      "SELECT action, target_table, target_id FROM audit_logs"
    );

    assert.deepEqual(result, { remindersCreated: 1 });
    assert.equal(alerts.rows[0]?.alert_type, "event");
    assert.equal(alerts.rows[0]?.severity, "high");
    assert.equal(alerts.rows[0]?.title, "Rappel évènement 1h: Dragon rally");
    assert.equal(alerts.rows[0]?.window, "1h");
    assert.deepEqual(notifications.rows[0], {
      user_id: "user-1",
      type: "event_reminder",
      title: "Rappel évènement 1h: Dragon rally",
      window: "1h"
    });
    assert.deepEqual(audits.rows[0], {
      action: "worker.event.reminder",
      target_table: "events",
      target_id: "event-1"
    });
  } finally {
    await db.close();
  }
});

test("presence followup sweep creates private messages for pending members", async () => {
  const db = await createWorkerDb();

  try {
    await db.exec(`
      INSERT INTO guilds (id, organization_id)
      VALUES ('guild-1', 'org-1');

      INSERT INTO guild_members (id, guild_id, user_id, nickname, status)
      VALUES ('member-1', 'guild-1', 'user-1', 'Astra', 'active');

      INSERT INTO events (
        id,
        guild_id,
        server_id,
        title,
        event_type,
        starts_at,
        location_label,
        location_x,
        location_y,
        cancelled_at
      )
      VALUES (
        'event-1',
        'guild-1',
        'server-1',
        'Fort defense',
        'defense',
        now() + interval '25 minutes',
        'Fort sud',
        10,
        20,
        NULL
      );
    `);

    const result = await runPresenceFollowupSweepWithClient(workerClient(db));
    const messages = await db.query<{ organization_id: string; guild_id: string; recipient_user_id: string; window: string }>(
      "SELECT organization_id, guild_id, recipient_user_id, metadata ->> 'window' AS window FROM private_messages"
    );
    const audits = await db.query<{ action: string; actor_member_id: string; target_id: string; message_id: string }>(
      "SELECT action, actor_member_id, target_id, metadata ->> 'messageId' AS message_id FROM audit_logs"
    );

    assert.deepEqual(result, { followupsCreated: 1 });
    assert.deepEqual(messages.rows[0], {
      organization_id: "org-1",
      guild_id: "guild-1",
      recipient_user_id: "user-1",
      window: "30m"
    });
    assert.equal(audits.rows[0]?.action, "worker.presence.followup");
    assert.equal(audits.rows[0]?.actor_member_id, "member-1");
    assert.equal(audits.rows[0]?.target_id, "event-1");
    assert.ok(audits.rows[0]?.message_id);
  } finally {
    await db.close();
  }
});

test("NAP maintenance expires stale agreements and records alerts", async () => {
  const db = await createWorkerDb();

  try {
    await db.exec(`
      INSERT INTO diplomacy_entries (id, guild_id, name)
      VALUES ('entry-1', 'guild-1', 'North Pact');

      INSERT INTO nap_agreements (
        id,
        guild_id,
        diplomacy_entry_id,
        title,
        terms,
        ends_at,
        status
      )
      VALUES (
        'nap-1',
        'guild-1',
        'entry-1',
        'No-hit week',
        'No hits until reset',
        now() - interval '1 hour',
        'active'
      );
    `);

    const result = await expireNapAgreementsWithClient(workerClient(db));
    const agreements = await db.query<{ status: string }>("SELECT status FROM nap_agreements WHERE id = 'nap-1'");
    const alerts = await db.query<{ alert_type: string; severity: string; relation_name: string }>(
      "SELECT alert_type, severity, metadata ->> 'relationName' AS relation_name FROM alerts"
    );
    const audits = await db.query<{ action: string; target_table: string; target_id: string }>(
      "SELECT action, target_table, target_id FROM audit_logs"
    );

    assert.deepEqual(result, { expired: 1 });
    assert.equal(agreements.rows[0]?.status, "expired");
    assert.deepEqual(alerts.rows[0], {
      alert_type: "system",
      severity: "medium",
      relation_name: "North Pact"
    });
    assert.deepEqual(audits.rows[0], {
      action: "worker.nap.expired",
      target_table: "nap_agreements",
      target_id: "nap-1"
    });
  } finally {
    await db.close();
  }
});

test("session cleanup revokes expired sessions and deletes old sessions", async () => {
  const db = await createWorkerDb();

  try {
    await db.exec(`
      INSERT INTO user_sessions (id, expires_at, revoked_at)
      VALUES
        ('recent-expired', now() - interval '1 day', NULL),
        ('old-expired', now() - interval '60 days', NULL),
        ('active', now() + interval '1 day', NULL);
    `);

    const result = await cleanupSessionsWithClient(workerClient(db));
    const sessions = await db.query<{ id: string; revoked: boolean }>(
      "SELECT id, revoked_at IS NOT NULL AS revoked FROM user_sessions ORDER BY id"
    );

    assert.deepEqual(result, { revoked: 2, deleted: 1 });
    assert.deepEqual(sessions.rows, [
      { id: "active", revoked: false },
      { id: "recent-expired", revoked: true }
    ]);
  } finally {
    await db.close();
  }
});

async function createWorkerDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE guilds (
      id text PRIMARY KEY,
      organization_id text NOT NULL
    );

    CREATE TABLE guild_members (
      id text PRIMARY KEY,
      guild_id text NOT NULL,
      user_id text,
      nickname text NOT NULL,
      status text NOT NULL DEFAULT 'active'
    );

    CREATE TABLE events (
      id text PRIMARY KEY,
      guild_id text NOT NULL,
      server_id text,
      title text NOT NULL,
      event_type text NOT NULL,
      starts_at timestamptz NOT NULL,
      location_label text,
      location_x int,
      location_y int,
      reminder_offsets_minutes int[] NOT NULL DEFAULT ARRAY[1440, 60],
      created_at timestamptz NOT NULL DEFAULT now(),
      cancelled_at timestamptz
    );

    CREATE TABLE event_attendance (
      event_id text NOT NULL,
      guild_member_id text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      PRIMARY KEY (event_id, guild_member_id)
    );

    CREATE TABLE alerts (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      guild_id text NOT NULL,
      server_id text,
      created_by_member_id text,
      alert_type text NOT NULL,
      severity text NOT NULL DEFAULT 'high',
      title text NOT NULL,
      message text NOT NULL,
      target_label text,
      target_x int,
      target_y int,
      metadata jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'active',
      expires_at timestamptz,
      resolved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE private_messages (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organization_id text NOT NULL,
      guild_id text,
      sender_user_id text,
      recipient_user_id text,
      body text NOT NULL,
      source_language varchar(12) NOT NULL DEFAULT 'auto',
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE notifications (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      guild_id text NOT NULL,
      user_id text NOT NULL,
      actor_user_id text,
      type text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}',
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_logs (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      guild_id text,
      actor_member_id text,
      action text NOT NULL,
      target_table text,
      target_id text,
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE diplomacy_entries (
      id text PRIMARY KEY,
      guild_id text NOT NULL,
      name text NOT NULL
    );

    CREATE TABLE nap_agreements (
      id text PRIMARY KEY,
      guild_id text NOT NULL,
      diplomacy_entry_id text,
      title text NOT NULL,
      terms text NOT NULL,
      ends_at timestamptz,
      status text NOT NULL DEFAULT 'active'
    );

    CREATE TABLE user_sessions (
      id text PRIMARY KEY,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );
  `);
  return db;
}

function workerClient(db: PGlite): WorkerSqlClient {
  return db as unknown as WorkerSqlClient;
}

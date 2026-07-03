import type { Response } from "express";

type AlertClient = {
  id: string;
  guildId: string;
  userId: string;
  response: Response;
  heartbeat: NodeJS.Timeout;
};

const clientsByGuild = new Map<string, Map<string, AlertClient>>();

export function addGuildAlertClient(guildId: string, userId: string, response: Response): void {
  const clientId = `${userId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const guildClients = clientsByGuild.get(guildId) ?? new Map<string, AlertClient>();

  clientsByGuild.set(guildId, guildClients);
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();

  const client: AlertClient = {
    id: clientId,
    guildId,
    userId,
    response,
    heartbeat: setInterval(() => {
      writeSse(response, "guildops.ping", { at: new Date().toISOString() });
    }, 25_000)
  };

  guildClients.set(clientId, client);
  writeSse(response, "guildops.ready", {
    guildId,
    userId,
    connectedAt: new Date().toISOString()
  });

  response.on("close", () => removeClient(client));
  response.on("error", () => removeClient(client));
}

export function publishGuildAlertEvent(guildId: string, event: string, payload: unknown): void {
  const guildClients = clientsByGuild.get(guildId);

  if (!guildClients?.size) return;

  for (const client of guildClients.values()) {
    try {
      writeSse(client.response, event, payload);
    } catch {
      removeClient(client);
    }
  }
}

function removeClient(client: AlertClient): void {
  clearInterval(client.heartbeat);
  clientsByGuild.get(client.guildId)?.delete(client.id);

  if (clientsByGuild.get(client.guildId)?.size === 0) {
    clientsByGuild.delete(client.guildId);
  }
}

function writeSse(response: Response, event: string, payload: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

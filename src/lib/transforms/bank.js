export function getBankResourceCode(resource = {}) {
  return resource?.code || resource?.resourceCode || "";
}

export function getBankResourceName(resource = {}) {
  return resource?.name || resource?.resourceName || resource?.resourceCode || resource?.code || "";
}

export function normalizeBankRequestStatus(request = {}) {
  if (request.status) return request.status === "rejected" ? "refused" : request.status;
  if (request.state === "Approuve" || request.state === "Approuvee") return "approved";
  if (request.state === "Livree") return "fulfilled";
  if (request.state === "Refusee") return "refused";
  return "pending";
}

export function formatResourceAmount(resource = {}) {
  const amount = Number(resource.amount);
  const formattedAmount = Number.isFinite(amount)
    ? amount >= 1000 && !resource.unit
      ? amount.toLocaleString("fr-FR")
      : amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    : resource.amount || "0";
  return `${formattedAmount}${resource.unit || ""}`;
}

export function formatRequestAmount(request = {}) {
  const amount = Number(request.amount);
  const formattedAmount = Number.isFinite(amount)
    ? amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    : request.amount || "0";
  return `${formattedAmount}${request.unit || ""}`;
}

export function formatMovementAmount(entry = {}) {
  const movementType = entry.type || entry.movementType;
  if (movementType === "command") return "!banque";
  const prefix = movementType === "in" ? "+" : "-";
  const amount = Number(entry.amount);
  const formattedAmount = Number.isFinite(amount)
    ? amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    : entry.amount || "0";
  return `${prefix}${formattedAmount}${entry.unit || ""}`;
}

export function buildBankCommandResponse({ command = "!banque", guild, requests = [], stock = [] }) {
  const pendingRequests = requests.filter((request) => normalizeBankRequestStatus(request) === "pending").length;
  const stockSummary = stock.length
    ? stock.map((resource) => `${getBankResourceName(resource)} ${formatResourceAmount(resource)}`).join(", ")
    : "aucun stock";
  const guildName = guild?.name || "guilde";
  return `Banque ${guildName}: ${stockSummary}. Demandes en attente: ${pendingRequests}. Commande: ${command}.`;
}

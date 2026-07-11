import {
  useEffect,
  useState
} from "react";
import {
  bankRequestStatusLabels
} from "../config/guildOpsConfig.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  can
} from "../lib/rbac.js";
import {
  getApiGuildId,
  getBankResourceCode,
  getBankResourceName
} from "../lib/guildOpsTransforms.js";

function formatBankUpdatedAt() {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function normalizeNewBankResourceCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeBankResourceDraft(resource = {}) {
  const resourceName = String(resource.resourceName || resource.name || "").trim();
  const resourceCode = String(resource.resourceCode || resource.code || "").trim() || normalizeNewBankResourceCode(resourceName);
  const amount = Number(resource.amount);
  const unit = String(resource.unit || "").trim();

  return {
    resourceCode,
    resourceName: resourceName || resourceCode,
    amount: Number.isFinite(amount) ? amount : 0,
    unit,
  };
}

function mergeBankResource(stock, resource) {
  const resourceCode = getBankResourceCode(resource);
  const exists = stock.some((item) => getBankResourceCode(item) === resourceCode);
  const nextStock = exists
    ? stock.map((item) => (getBankResourceCode(item) === resourceCode ? { ...item, ...resource } : item))
    : [...stock, resource];

  return nextStock.sort((left, right) => getBankResourceName(left).localeCompare(getBankResourceName(right), "fr"));
}

export function useBankController({ apiEnabled, currentUser, selectedGuild, guildOpsData, moduleEnabled = true }) {
  const [bankRequests, setBankRequests] = useState(() => (moduleEnabled ? guildOpsData.bankRequests : []));
  const [bankStock, setBankStock] = useState(() => (moduleEnabled ? guildOpsData.bankResources : []));
  const [bankMovementsLog, setBankMovementsLog] = useState(() => (moduleEnabled ? guildOpsData.bankMovements : []));
  const [bankCommand, setBankCommand] = useState("!banque");
  const [bankError, setBankError] = useState("");

  useEffect(() => {
    setBankRequests(moduleEnabled ? guildOpsData.bankRequests : []);
    setBankStock(moduleEnabled ? guildOpsData.bankResources : []);
    setBankMovementsLog(moduleEnabled ? guildOpsData.bankMovements : []);
    setBankError("");
  }, [guildOpsData, moduleEnabled]);

  function approveRequest(id) {
    updateBankRequestStatus(id, "approved");
  }

  function createBankRequest(request) {
    if (!moduleEnabled) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setBankError("API requise pour créer une demande banque.");
      return;
    }

    const resource = bankStock.find((item) => getBankResourceCode(item) === request.resourceCode) || bankStock[0];
    const normalizedRequest = {
      id: `bank-req-${Date.now()}`,
      member: currentUser.displayName,
      resourceCode: getBankResourceCode(resource) || request.resourceCode,
      resource: getBankResourceName(resource) || request.resource,
      amount: Number(request.amount) || 0,
      unit: resource?.unit || request.unit || "",
      reason: request.reason || "Demande membre",
      status: "pending",
      state: bankRequestStatusLabels.pending,
      createdAt: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    };

    if (!normalizedRequest.resourceCode || normalizedRequest.amount <= 0) return;
    setBankError("");

    void guildOpsApi
      .createBankRequest(guildId, {
        resourceCode: normalizedRequest.resourceCode,
        amount: normalizedRequest.amount,
        reason: normalizedRequest.reason,
      })
      .then((payload) => {
        const savedRequest = payload?.request || (
          payload?.id
            ? {
                ...normalizedRequest,
                id: payload.id,
                status: payload.status || normalizedRequest.status,
              }
            : normalizedRequest
        );
        setBankRequests((current) => [
          {
            ...normalizedRequest,
            ...savedRequest,
            state: bankRequestStatusLabels[savedRequest.status] || savedRequest.state || normalizedRequest.state,
          },
          ...current,
        ]);
      })
      .catch((error) => {
        setBankError(error?.message || "Création de demande banque impossible.");
      });
  }

  function updateBankRequestStatus(id, status) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_bank")) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setBankError("API requise pour modifier une demande banque.");
      return;
    }

    const request = bankRequests.find((item) => item.id === id);
    if (!request) return;
    const previousRequests = bankRequests;
    const previousStock = bankStock;
    const previousMovements = bankMovementsLog;

    setBankError("");

    setBankRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              state: bankRequestStatusLabels[status] || status,
              decidedBy: currentUser.displayName,
            }
          : item,
      ),
    );

    if (status === "fulfilled") {
      setBankStock((current) =>
        current.map((resource) =>
          getBankResourceCode(resource) === request.resourceCode
            ? {
                ...resource,
                amount: Math.max(0, Number(resource.amount) - Number(request.amount || 0)),
                updatedAt: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              }
            : resource,
        ),
      );

      setBankMovementsLog((current) => [
        {
          id: `mov-${Date.now()}`,
          time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          type: "out",
          resourceCode: request.resourceCode,
          resource: request.resource,
          amount: request.amount,
          unit: request.unit,
          actor: currentUser.displayName,
          note: `Livraison ${request.member}`,
        },
        ...current,
      ]);
    }

    void guildOpsApi
      .updateBankRequestStatus(guildId, id, status)
      .then((payload) => {
        if (!payload?.request) return;
        setBankRequests((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...payload.request,
                  state: bankRequestStatusLabels[payload.request.status] || payload.request.status,
                }
              : item,
          ),
        );
      })
      .catch((error) => {
        setBankRequests(previousRequests);
        setBankStock(previousStock);
        setBankMovementsLog(previousMovements);
        setBankError(error?.message || "Mise a jour de la demande banque impossible.");
      });
  }

  function addBankMovement(movement) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_bank")) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setBankError("API requise pour enregistrer un mouvement banque.");
      return;
    }

    const resource = bankStock.find((item) => getBankResourceCode(item) === movement.resourceCode);
    const amount = Number(movement.amount) || 0;
    if (!resource || amount <= 0) return;
    const resourceCode = getBankResourceCode(resource);
    const previousStock = bankStock;
    const previousMovements = bankMovementsLog;

    setBankStock((current) =>
      current.map((item) =>
        getBankResourceCode(item) === resourceCode
          ? {
              ...item,
              amount:
                movement.type === "in"
                  ? Number(item.amount) + amount
                  : Math.max(0, Number(item.amount) - amount),
              updatedAt: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
            }
          : item,
      ),
    );

    setBankMovementsLog((current) => [
      {
        id: `mov-${Date.now()}`,
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        type: movement.type,
        resourceCode,
        resource: getBankResourceName(resource),
        amount,
        unit: resource.unit,
        actor: currentUser.displayName,
        note: movement.note || (movement.type === "in" ? "Depot banque" : "Sortie banque"),
      },
      ...current,
    ]);

    void guildOpsApi
      .createBankMovement(guildId, {
        type: movement.type,
        resourceCode,
        amount,
        note: movement.note || (movement.type === "in" ? "Depot banque" : "Sortie banque"),
      })
      .catch((error) => {
        setBankStock(previousStock);
        setBankMovementsLog(previousMovements);
        setBankError(error?.message || "Mouvement banque non enregistré.");
      });
  }

  function saveBankResource(resourceDraft) {
    if (!moduleEnabled) return;
    if (!can(currentUser, "manage_bank")) {
      setBankError("Permission banque requise pour modifier les ressources.");
      return;
    }

    const guildId = getApiGuildId(selectedGuild);
    if (!apiEnabled || !guildId) {
      setBankError("API requise pour modifier une ressource banque.");
      return;
    }

    const resource = normalizeBankResourceDraft(resourceDraft);
    if (!resource.resourceCode || !resource.resourceName || resource.amount < 0) {
      setBankError("Renseigne une ressource valide avec un montant positif ou nul.");
      return;
    }

    const previousStock = bankStock;
    const optimisticResource = {
      ...resource,
      updatedAt: formatBankUpdatedAt(),
    };

    setBankError("");
    setBankStock((current) => mergeBankResource(current, optimisticResource));

    void guildOpsApi
      .saveBankResource(guildId, resource)
      .then((payload) => {
        const savedResource = payload?.resource || optimisticResource;
        setBankStock((current) => mergeBankResource(current, savedResource));
      })
      .catch((error) => {
        setBankStock(previousStock);
        setBankError(error?.message || "Modification de la ressource banque impossible.");
      });
  }

  function recordBankCommand(createdAt) {
    if (!moduleEnabled) return;
    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) return;

    void guildOpsApi
      .runBankCommand(guildId, { command: bankCommand, context: { source: "public-chat" } })
      .then(() => {
        setBankMovementsLog((current) => [
          {
            id: `mov-${createdAt}`,
            time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
            type: "command",
            resourceCode: "summary",
            resource: "Commande",
            amount: 0,
            unit: "",
            actor: currentUser.displayName,
            note: `${bankCommand} executee dans le chat`,
          },
          ...current,
        ]);
      })
      .catch(() => {});
  }

  return {
    addBankMovement,
    approveRequest,
    bankCommand,
    bankError,
    bankMovementsLog,
    bankRequests,
    bankStock,
    createBankRequest,
    recordBankCommand,
    saveBankResource,
    setBankCommand,
    updateBankRequestStatus,
  };
}

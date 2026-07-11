const API_CONNECTION_PATTERNS = [
  /connexion a l'api impossible/i,
  /api trop lente/i,
  /failed to fetch/i,
  /networkerror/i,
  /err_failed/i,
];

export function getAuthErrorDetails(error) {
  return error?.payload?.error?.details || {};
}

export function isAuthApiConnectionError(error) {
  const message = typeof error === "string" ? error : String(error?.message || error || "");
  const errorName = String(error?.payload?.error?.name || "");

  return error?.status === 0 || API_CONNECTION_PATTERNS.some((pattern) => pattern.test(message) || pattern.test(errorName));
}

export function formatAuthError(error, { action = "auth" } = {}) {
  if (!error) return "";

  const details = getAuthErrorDetails(error);
  const message = typeof error === "string" ? error : String(error?.message || "");

  if (details.reason === "EMAIL_ALREADY_EXISTS") {
    return "Un compte existe déjà avec cet email. Connecte-toi, ou renvoie le lien si l'email n'est pas encore validé.";
  }

  if (isAuthApiConnectionError(error)) {
    if (action === "register") {
      return "Inscription impossible pour le moment : le serveur GuildOps ne répond pas. Le formulaire est conservé, réessaie dans quelques secondes.";
    }

    if (action === "login") {
      return "Connexion impossible pour le moment : le serveur GuildOps ne répond pas. Réessaie dans quelques secondes.";
    }

    return "Le serveur GuildOps ne répond pas pour le moment. Réessaie dans quelques secondes.";
  }

  if (/resource with these unique values already exists/i.test(message)) {
    return "Cette information existe déjà. Vérifie l'email ou connecte-toi avec ton compte existant.";
  }

  if (/invalid email or password/i.test(message)) {
    return "Email ou mot de passe incorrect.";
  }

  if (/password/i.test(message) && /10|too small|min/i.test(message)) {
    return "Le mot de passe doit contenir au moins 10 caractères.";
  }

  return message || "Authentification impossible.";
}

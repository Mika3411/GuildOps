import { hasPermission, isKnownPermission } from "../security/rbac.js";

export function can(permission, options = {}) {
  if (!isKnownPermission(permission)) {
    throw new Error(`Unknown GuildOps permission: ${permission}`);
  }

  return (req, res, next) => {
    const subject = options.getSubject?.(req) || req.auth || req.user || req.membership;

    if (!subject) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authentication is required.",
      });
    }

    if (hasPermission(subject, permission)) {
      return next();
    }

    return res.status(403).json({
      error: "forbidden",
      message: `Permission '${permission}' is required.`,
      permission,
    });
  };
}

export default can;

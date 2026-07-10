import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ className = "", inputClassName = "", disabled = false, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Masquer le mot de passe" : "Afficher le mot de passe";
  const wrapperClassName = ["password-input", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClassName}>
      <input
        {...inputProps}
        className={inputClassName || undefined}
        disabled={disabled}
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={label}
        aria-pressed={visible}
        className="password-input-toggle"
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        title={label}
        type="button"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

const passwordCost = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(applyPepper(password), passwordCost);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(applyPepper(password), passwordHash);
}

function applyPepper(password: string): string {
  return `${password}${env.PASSWORD_PEPPER ?? ""}`;
}

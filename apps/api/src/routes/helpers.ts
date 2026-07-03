import { randomBytes } from "node:crypto";
import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");
export const languageSchema = z
  .string()
  .trim()
  .min(2)
  .max(12)
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "Use a BCP-47 language tag like fr or en-US");
export const dateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Use an ISO-8601 datetime"
});

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return slug || `guildops-${randomBytes(3).toString("hex")}`;
}

export function randomSlugSuffix(): string {
  return randomBytes(3).toString("hex");
}

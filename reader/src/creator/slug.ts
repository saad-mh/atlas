// Matches the `slug` pattern in schemas/manifest.schema.yaml:
// ^[a-z0-9]+(-[a-z0-9]+)*$
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents split out by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

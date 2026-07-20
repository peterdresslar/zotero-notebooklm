export function isChromeCompanionVersionCompatible(
  compatibleVersions,
  installedVersion,
) {
  // The published v0.2.0 Zotero plugin predates compatibility metadata. Its
  // endpoint contract remains compatible with newer companions, so allow that
  // one-way upgrade path. Newer backends must send an explicit list.
  if (compatibleVersions === undefined) return true;

  return (
    Array.isArray(compatibleVersions) &&
    compatibleVersions.length > 0 &&
    compatibleVersions.every((candidate) => typeof candidate === "string") &&
    compatibleVersions.includes(installedVersion)
  );
}

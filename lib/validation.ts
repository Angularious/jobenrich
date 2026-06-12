/**
 * Accepts any LinkedIn jobs URL the browser might show or the share button
 * produces, and returns the canonical /jobs/view/{id} URL.
 * Returns null if no job ID can be extracted.
 */
export function canonicalizeLinkedInJobUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "linkedin.com") return null;

    // Browser URL: /jobs/collections/...?currentJobId=4398396153
    const currentJobId = u.searchParams.get("currentJobId");
    if (currentJobId && /^\d+$/.test(currentJobId)) {
      return `https://www.linkedin.com/jobs/view/${currentJobId}`;
    }

    // Share / canonical URL: /jobs/view/4398396153
    const viewMatch = u.pathname.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) {
      return `https://www.linkedin.com/jobs/view/${viewMatch[1]}`;
    }

    return null;
  } catch {
    return null;
  }
}

export function isValidLinkedInProfileUrl(url: string): boolean {
  return /^https:\/\/(www\.)?linkedin\.com\/in\//.test(url);
}

export function isValidSchool(school: string): boolean {
  const t = school.trim();
  return t.length > 0 && t.length <= 100;
}

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

/** True if the URL is on linkedin.com (so the LinkedIn extractor should run). */
export function isLinkedInHost(raw: string): boolean {
  try {
    return new URL(raw.trim()).hostname.replace(/^www\./, "") === "linkedin.com";
  } catch {
    return false;
  }
}

/** A plausible http(s) job/careers URL — the only client-side gate now that
 *  any source is accepted (real extraction happens server-side via resolveJob). */
export function isValidJobUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

export function isValidLinkedInProfileUrl(url: string): boolean {
  return /^https:\/\/(www\.)?linkedin\.com\/in\//.test(url);
}

export function isValidSchool(school: string): boolean {
  const t = school.trim();
  return t.length > 0 && t.length <= 100;
}

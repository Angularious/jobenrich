// linkedin.com or any subdomain of it (www., m., ca., de., …) — LinkedIn
// serves job URLs on locale/mobile subdomains too.
function isLinkedInHostname(host: string): boolean {
  const h = host.replace(/^www\./, "");
  return h === "linkedin.com" || h.endsWith(".linkedin.com");
}

/**
 * Accepts any LinkedIn jobs URL the browser might show or the share button
 * produces (including locale/mobile subdomains), and returns the canonical
 * /jobs/view/{id} URL. Returns null if no job ID can be extracted.
 */
export function canonicalizeLinkedInJobUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!isLinkedInHostname(u.hostname)) return null;

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

/** True if the URL is on linkedin.com or a subdomain (so the LinkedIn extractor
 *  should run rather than scraping the auth-walled page). */
export function isLinkedInHost(raw: string): boolean {
  try {
    return isLinkedInHostname(new URL(raw.trim()).hostname);
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

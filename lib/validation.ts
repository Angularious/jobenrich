export function isValidLinkedInJobUrl(url: string): boolean {
  return (
    /^https:\/\/(www\.)?linkedin\.com\/jobs\/view\/\d+/.test(url) ||
    /^https:\/\/(www\.)?linkedin\.com\/jobs\//.test(url)
  );
}

export function isValidLinkedInProfileUrl(url: string): boolean {
  return /^https:\/\/(www\.)?linkedin\.com\/in\//.test(url);
}

export function isValidSchool(school: string): boolean {
  const t = school.trim();
  return t.length > 0 && t.length <= 100;
}

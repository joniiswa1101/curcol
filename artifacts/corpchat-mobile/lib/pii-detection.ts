const PII_PATTERNS: { type: string; label: string; pattern: RegExp }[] = [
  { type: "nik", label: "NIK/KTP", pattern: /\b\d{16}\b/ },
  { type: "email", label: "Email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { type: "phone", label: "No. Telepon", pattern: /(?:\+62|62|0)8[1-9]\d{7,10}/ },
  { type: "credit_card", label: "Kartu Kredit", pattern: /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})\b/ },
  { type: "npwp", label: "NPWP", pattern: /\b\d{2}[.]\d{3}[.]\d{3}[.]\d[-]\d{3}[.]\d{3}\b/ },
  { type: "bpjs", label: "BPJS", pattern: /\b0{4}\d{9}\b/ },
];

export function detectPII(text: string): { hasPII: boolean; types: string[] } {
  const found: string[] = [];
  for (const p of PII_PATTERNS) {
    if (p.pattern.test(text)) found.push(p.label);
  }
  return { hasPII: found.length > 0, types: found };
}

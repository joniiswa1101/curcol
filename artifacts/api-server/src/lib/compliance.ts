export interface PIIMatch {
  type: string;
  value: string;
  redacted: string;
  startIndex: number;
  endIndex: number;
}

export interface PIIDetectionResult {
  hasPII: boolean;
  piiTypes: string[];
  matches: PIIMatch[];
  severity: "low" | "medium" | "high" | "critical";
  isRisky: boolean;
  riskyKeywords: string[];
}

const PII_PATTERNS: { type: string; pattern: RegExp; severity: "low" | "medium" | "high" | "critical" }[] = [
  {
    type: "nik",
    pattern: /\b(\d{16})\b/g,
    severity: "critical",
  },
  {
    type: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    severity: "medium",
  },
  {
    type: "phone_id",
    pattern: /\b(?:\+?62|0)[\s-]?(?:8\d{1,2})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
    severity: "high",
  },
  {
    type: "credit_card",
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    severity: "critical",
  },
  {
    type: "npwp",
    pattern: /\b\d{2}\.?\d{3}\.?\d{3}\.?\d[-.]?\d{3}\.?\d{3}\b/g,
    severity: "high",
  },
  {
    type: "bank_account",
    pattern: /\b(?:rek(?:ening)?|a\/c|account)\s*(?:no\.?|nomor|:)?\s*(\d[\d\s.-]{6,20}\d)\b/gi,
    severity: "high",
  },
  {
    type: "passport",
    pattern: /\b[A-Z]{1,2}\s?\d{6,7}\b/g,
    severity: "high",
  },
  {
    type: "bpjs",
    pattern: /\b(?:bpjs|jkn)\s*(?:no\.?|:)?\s*(\d{13})\b/gi,
    severity: "high",
  },
  {
    type: "ktp",
    pattern: /\b(?:ktp|nik)\s*(?:no\.?|nomor|:)?\s*(\d{16})\b/gi,
    severity: "critical",
  },
  {
    type: "ip_address",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    severity: "low",
  },
];

const RISKY_KEYWORDS = [
  "password", "kata sandi", "pin atm", "otp", "kode verifikasi",
  "rahasia", "confidential", "restricted", "internal only",
  "gaji", "salary", "kompensasi", "bonus karyawan",
  "nomor rekening", "transfer ke", "kirim uang",
  "resign", "phk", "pemutusan", "pemecatan",
  "data pribadi", "personal data", "informasi sensitif",
];

function redactValue(value: string, type: string): string {
  if (type === "email") {
    const [local, domain] = value.split("@");
    return local.charAt(0) + "***@" + domain;
  }
  if (value.length <= 4) return "****";
  const visibleEnd = Math.min(4, Math.floor(value.length * 0.25));
  return "*".repeat(value.length - visibleEnd) + value.slice(-visibleEnd);
}

export function detectPII(content: string): PIIDetectionResult {
  if (!content || content.trim().length === 0) {
    return { hasPII: false, piiTypes: [], matches: [], severity: "low", isRisky: false, riskyKeywords: [] };
  }

  const matches: PIIMatch[] = [];
  const piiTypesSet = new Set<string>();
  let maxSeverity: "low" | "medium" | "high" | "critical" = "low";
  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };

  for (const { type, pattern, severity } of PII_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const value = match[1] || match[0];

      if (type === "ip_address") {
        const parts = value.split(".");
        if (parts.some(p => parseInt(p) > 255)) continue;
        if (value === "0.0.0.0" || value === "127.0.0.1" || value === "255.255.255.255") continue;
      }

      if (type === "nik" && !/^\d{16}$/.test(value)) continue;
      if (type === "passport" && /^\d+$/.test(value)) continue;

      matches.push({
        type,
        value,
        redacted: redactValue(value, type),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
      piiTypesSet.add(type);

      if (severityOrder[severity] > severityOrder[maxSeverity]) {
        maxSeverity = severity;
      }
    }
  }

  const contentLower = content.toLowerCase();
  const foundRiskyKeywords = RISKY_KEYWORDS.filter(kw => contentLower.includes(kw.toLowerCase()));

  if (foundRiskyKeywords.length > 0 && severityOrder[maxSeverity] < severityOrder["medium"]) {
    maxSeverity = "medium";
  }

  return {
    hasPII: matches.length > 0,
    piiTypes: Array.from(piiTypesSet),
    matches,
    severity: maxSeverity,
    isRisky: foundRiskyKeywords.length > 0,
    riskyKeywords: foundRiskyKeywords,
  };
}

export function redactContent(content: string): string {
  if (!content) return content;

  let redacted = content;
  const result = detectPII(content);

  const sortedMatches = [...result.matches].sort((a, b) => b.startIndex - a.startIndex);

  for (const match of sortedMatches) {
    redacted = redacted.slice(0, match.startIndex) + match.redacted + redacted.slice(match.endIndex);
  }

  return redacted;
}

export function getPIITypeLabel(type: string): string {
  const labels: Record<string, string> = {
    nik: "NIK / No. KTP",
    email: "Alamat Email",
    phone_id: "Nomor Telepon",
    credit_card: "Kartu Kredit",
    npwp: "NPWP",
    bank_account: "Rekening Bank",
    passport: "Paspor",
    bpjs: "BPJS/JKN",
    ktp: "KTP",
    ip_address: "Alamat IP",
  };
  return labels[type] || type;
}

export function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    low: "Rendah",
    medium: "Sedang",
    high: "Tinggi",
    critical: "Kritis",
  };
  return labels[severity] || severity;
}

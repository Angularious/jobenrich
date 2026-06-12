"use client";

interface SearchFormProps {
  jobUrl: string;
  school: string;
  loading: boolean;
  error: string | null;
  onJobUrlChange: (v: string) => void;
  onSchoolChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function HairlineInput({
  type,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
}: {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div
      className="border-b border-hairline"
      style={{ transition: "border-color 200ms ease" }}
      onFocusCapture={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "#1A1A1A")
      }
      onBlurCapture={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "#E8E4DD")
      }
    >
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full py-3 bg-transparent text-ink text-sm placeholder:text-dim outline-none"
      />
    </div>
  );
}

export function SearchForm({
  jobUrl,
  school,
  loading,
  error,
  onJobUrlChange,
  onSchoolChange,
  onSubmit,
}: SearchFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <HairlineInput
        type="url"
        value={jobUrl}
        onChange={onJobUrlChange}
        placeholder="LinkedIn job URL"
        required
      />
      <HairlineInput
        type="text"
        value={school}
        onChange={onSchoolChange}
        placeholder="School name"
        required
        maxLength={100}
      />

      {error && <p className="text-crimson text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-8 py-3 bg-ink text-surface text-xs uppercase tracking-[0.15em] disabled:opacity-50 hover:opacity-80"
      >
        {loading ? "Searching…" : "Find"}
      </button>
    </form>
  );
}

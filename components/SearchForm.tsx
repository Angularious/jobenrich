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

function MarketInput({
  value,
  onChange,
  placeholder,
  required,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="border-2 border-market-black bg-white focus-within:bg-market-yellow/30">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full px-4 py-3 bg-transparent font-bold text-sm text-ink outline-none placeholder:text-dim placeholder:font-normal"
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
    <form onSubmit={onSubmit}>
      <div className="border-4 border-market-black bg-market-yellow p-6">
        <p className="font-black text-xs uppercase tracking-widest text-market-red mb-4">
          ■ SEARCH / 搜索 ■
        </p>

        <div className="space-y-3 mb-5">
          <MarketInput
            value={jobUrl}
            onChange={onJobUrlChange}
            placeholder="LinkedIn job URL (any format)"
            required
          />
          <MarketInput
            value={school}
            onChange={onSchoolChange}
            placeholder="Your school"
            required
            maxLength={100}
          />
        </div>

        {error && (
          <div className="bg-market-dark-red text-white font-bold text-xs px-3 py-2 mb-4">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-market-red text-white font-black text-base uppercase tracking-widest px-10 py-4 border-2 border-market-black hover:bg-market-dark-red disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
          style={
            !loading
              ? { animation: "marketJump 2.2s ease-in-out infinite" }
              : undefined
          }
        >
          {loading ? "★ SEARCHING... ★" : "★ FIND! 搜索 ★"}
        </button>
      </div>
    </form>
  );
}

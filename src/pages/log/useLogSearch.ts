import { useCallback, useState } from "react";
import { buildMatcher, type LineMatcher } from "./highlight";

export function useLogSearch(lines: string[]) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [activeMatcher, setActiveMatcher] = useState<LineMatcher | null>(null);
  const [matchLineIndices, setMatchLineIndices] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const runSearch = useCallback((): string | null => {
    const res = buildMatcher({ query, caseSensitive, wholeWord, useRegex });
    if (!res.ok) {
      setActiveMatcher(null);
      setMatchLineIndices([]);
      setCurrentIndex(-1);
      return res.reason === "invalid" ? "正则表达式无效" : null;
    }
    const idx: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (res.matcher(lines[i]).length > 0) idx.push(i);
    }
    setActiveMatcher(res.matcher);
    setMatchLineIndices(idx);
    setCurrentIndex(idx.length > 0 ? 0 : -1);
    return null;
  }, [query, caseSensitive, wholeWord, useRegex, lines]);

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      if (matchLineIndices.length === 0) return -1;
      return (i + 1) % matchLineIndices.length;
    });
  }, [matchLineIndices.length]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => {
      if (matchLineIndices.length === 0) return -1;
      return (i - 1 + matchLineIndices.length) % matchLineIndices.length;
    });
  }, [matchLineIndices.length]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setActiveMatcher(null);
    setMatchLineIndices([]);
    setCurrentIndex(-1);
  }, []);

  const reset = useCallback(() => {
    setActiveMatcher(null);
    setMatchLineIndices([]);
    setCurrentIndex(-1);
  }, []);

  const currentLine =
    currentIndex >= 0 && currentIndex < matchLineIndices.length
      ? matchLineIndices[currentIndex]
      : null;

  return {
    query,
    setQuery,
    caseSensitive,
    toggleCase: () => setCaseSensitive((v) => !v),
    wholeWord,
    toggleWholeWord: () => setWholeWord((v) => !v),
    useRegex,
    toggleRegex: () => setUseRegex((v) => !v),
    showSearch,
    openSearch: () => setShowSearch(true),
    closeSearch,
    runSearch,
    next,
    prev,
    matchLineIndices,
    currentIndex,
    currentLine,
    activeMatcher,
    reset,
  };
}

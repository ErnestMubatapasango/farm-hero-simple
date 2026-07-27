import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CURRENCIES = {
  USD: { symbol: "$", name: "US Dollar", rate: 1 },
  GHS: { symbol: "GHS", name: "Ghana Cedi", rate: 15.6 },
  NGN: { symbol: "₦", name: "Nigerian Naira", rate: 1490 },
  KES: { symbol: "KSh", name: "Kenyan Shilling", rate: 153 },
  ZAR: { symbol: "R", name: "South African Rand", rate: 18.2 },
  EUR: { symbol: "€", name: "Euro", rate: 0.91 },
  GBP: { symbol: "£", name: "British Pound", rate: 0.77 },
  XOF: { symbol: "CFA", name: "West African CFA", rate: 597 },
  TZS: { symbol: "TSh", name: "Tanzanian Shilling", rate: 2580 },
  UGX: { symbol: "USh", name: "Ugandan Shilling", rate: 3700 },
} as const;

type CurrencyCode = keyof typeof CURRENCIES;

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void | Promise<void>;
  convert: (amount: number | string) => number;
  format: (amount: number | string) => string;
  currencies: typeof CURRENCIES;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
  convert: (amount) => Number(amount),
  format: (amount) => `$ ${Number(amount).toLocaleString()}`,
  currencies: CURRENCIES,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("preferred_currency")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const pref = data?.preferred_currency as CurrencyCode | undefined;
        if (pref && pref in CURRENCIES) setCurrencyState(pref);
      });
  }, [userId]);

  const setCurrency = async (code: CurrencyCode) => {
    setCurrencyState(code);
    if (userId) {
      await supabase
        .from("profiles")
        .update({ preferred_currency: code })
        .eq("user_id", userId);
    }
  };

  const convert = (amount: number | string) => {
    const rate = CURRENCIES[currency]?.rate ?? 1;
    return Number(amount) * rate;
  };

  const format = (amount: number | string) => {
    const converted = convert(amount);
    const sym = CURRENCIES[currency]?.symbol ?? currency;
    return `${sym} ${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, convert, format, currencies: CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

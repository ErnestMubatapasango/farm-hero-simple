import type { Dispatch, SetStateAction } from "react";

export const errCls = (errors: Record<string, boolean>, key: string) =>
  errors[key] ? "border-destructive ring-1 ring-destructive/30 focus-visible:ring-destructive" : "";

/**
 * Returns a change handler that updates `formData[section][name]` from a form event.
 */
export function makeSectionHandler<S extends string>(
  setFormData: Dispatch<SetStateAction<any>>,
  section: S,
) {
  return (eOrName: any, maybeValue?: any) => {
    let name: string;
    let value: any;
    if (typeof eOrName === "string") {
      name = eOrName;
      value = maybeValue;
    } else {
      const tgt = eOrName.currentTarget ?? eOrName.target;
      name = tgt.name;
      value = tgt.value;
    }
    setFormData((prev: any) => ({
      ...prev,
      [section]: { ...prev[section], [name]: value },
    }));
  };
}

export function getYearRange() {
  const currentYear = new Date().getFullYear();
  return { currentYear, previousYear: currentYear - 1 };
}

export const zimbabweProvinces = [
  { province: "Select Province...", capital: "" },
  { province: "Bulawayo", capital: "Bulawayo" },
  { province: "Harare", capital: "Harare" },
  { province: "Manicaland", capital: "Mutare" },
  { province: "Mashonaland Central", capital: "Bindura" },
  { province: "Mashonaland East", capital: "Marondera" },
  { province: "Mashonaland West", capital: "Chinhoyi" },
  { province: "Masvingo", capital: "Masvingo" },
  { province: "Matabeleland North", capital: "Lupane" },
  { province: "Matabeleland South", capital: "Gwanda" },
  { province: "Midlands", capital: "Gweru" },
];

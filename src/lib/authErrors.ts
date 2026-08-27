// Helpers for mapping Supabase auth errors to user-facing copy.

type MaybeAuthError =
  | {
      message?: string;
      code?: string;
      status?: number;
    }
  | null
  | undefined;

/** True when Supabase rejected a password update because it matches the current one. */
export function isSamePasswordError(error: MaybeAuthError): boolean {
  if (!error) return false;
  const code = (error as { code?: string; error_code?: string }).code
    ?? (error as { error_code?: string }).error_code;
  if (code === "same_password") return true;
  return (
    error.status === 422 &&
    /should be different from the old password/i.test(error.message ?? "")
  );
}

/** Friendlier copy for the common password-update failures. */
export function passwordErrorMessage(error: MaybeAuthError): string {
  const message = error?.message ?? "Could not update your password.";
  if (/at least 6 characters|password should be at least/i.test(message)) {
    return "Your password must be at least 6 characters.";
  }
  if (/weak|easy to guess|pwned|compromised/i.test(message)) {
    return "That password is too easy to guess. Please choose a stronger one.";
  }
  return message;
}

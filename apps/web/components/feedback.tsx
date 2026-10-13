export function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <p className={error ? "form-error" : "form-ok"} role={error ? "alert" : "status"}>
      {error ?? notice}
    </p>
  );
}

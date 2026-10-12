export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-small text-critical-ink">
      {message}
    </p>
  );
}

// Honest marker that a page is showing static sample data (see src/lib/demo-data.ts).
// Remove once the page reads from the database.
export function DemoDataNotice() {
  return (
    <p className="text-meta mt-12 text-center text-faint">
      Showing sample data for preview. Live project data arrives in a later phase.
    </p>
  );
}

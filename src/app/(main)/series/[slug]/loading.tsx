export default function SeriesLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10" aria-busy="true">
      <p className="text-muted-foreground" role="status">Loading series…</p>
    </main>
  );
}

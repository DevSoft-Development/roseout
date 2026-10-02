Deno.serve(() => new Response(
  JSON.stringify({
    ok: false,
    error: "region_storage_migration_controller_retired",
  }),
  {
    status: 410,
    headers: { "content-type": "application/json" },
  },
));

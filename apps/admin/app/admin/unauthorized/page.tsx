export default function AdminUnauthorizedPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ maxWidth: 520 }}>
        <p style={{ margin: 0, opacity: 0.65 }}>TheOutHaven Administration</p>
        <h1>Access not authorized</h1>
        <p>Your account is signed in, but it does not have an active Admin role.</p>
        <a href="/admin/login">Return to Admin sign in</a>
      </section>
    </main>
  );
}

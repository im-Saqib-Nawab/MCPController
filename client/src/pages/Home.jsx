import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';

const features = [
  {
    title: 'Three roles',
    body: 'Patients book available days. Doctors accept one patient per day and can suggest another date. Admins manage the full system.'
  },
  {
    title: 'Safe booking',
    body: 'Multiple patients can request the same day. The database only allows one confirmed appointment per doctor per day.'
  },
  {
    title: 'OAuth 2.1 + PKCE',
    body: 'ChatGPT connects through authorization code flow with PKCE S256. Each tool checks role, ownership, and granted scopes.'
  },
  {
    title: 'Single deployment',
    body: 'Frontend, API, OAuth discovery, and MCP are served from one origin on Vercel or locally.'
  }
];

export default function Home({ user }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Doctor appointments + MCP</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Book doctors. Manage requests. Connect ChatGPT.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          A simple clinic system with weekly availability, appointment requests, and role-aware MCP tools.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={user ? '/dashboard' : '/login'}>
            <Button type="button">{user ? 'Open dashboard' : 'Log in'}</Button>
          </Link>
          {!user ? (
            <Link to="/register">
              <Button type="button" variant="secondary">
                Create account
              </Button>
            </Link>
          ) : (
            <Link to="/doctors">
              <Button type="button" variant="secondary">
                Browse doctors
              </Button>
            </Link>
          )}
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <article key={feature.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{feature.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';

const features = [
  {
    title: 'Admin & user accounts',
    body: 'Administrators manage the system and user permissions. Regular users can log in, register, and connect ChatGPT within their granted limits.'
  },
  {
    title: 'OAuth 2.1 + PKCE',
    body: 'ChatGPT connects through authorization code flow with PKCE S256, dynamic client registration, and token refresh for persistent access.'
  },
  {
    title: 'Permission-aware MCP',
    body: 'Every doctor tool checks the scopes granted during OAuth consent. Revoking access from the dashboard immediately invalidates tokens.'
  },
  {
    title: 'Single deployment',
    body: 'Frontend, API, OAuth discovery, and MCP endpoint are served from one Vercel application at the same origin.'
  }
];

export default function Home({ user }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Doctor Management MCP</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          MCPController
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          Connect ChatGPT to your doctor management MCP server through OAuth. Users approve exactly which
          permissions ChatGPT receives, and every MCP operation enforces those scopes.
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
          ) : null}
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

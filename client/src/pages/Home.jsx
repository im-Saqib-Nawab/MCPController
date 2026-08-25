import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';

const features = [
  {
    title: 'Single Admin',
    body: 'Only one Admin can sign in. Credentials come from environment variables and sessions use an HTTP-only cookie.'
  },
  {
    title: 'Permissions',
    body: 'During consent the Admin grants doctor:read, doctor:write, and doctor:delete. The MCP server enforces those scopes on every tool call.'
  },
  {
    title: 'MCP Tools',
    body: 'ChatGPT calls list_doctors, get_doctor, add_doctor, update_doctor, and delete_doctor over Streamable HTTP at /mcp.'
  },
  {
    title: 'Secure Connections',
    body: 'OAuth 2.1 with PKCE issues access tokens bound to this MCP resource. Redirect URIs must be pre-registered.'
  }
];

export default function Home({ user }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Doctor Management MCP</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
        MCPController
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        ChatGPT connects through OAuth, the single Admin approves permissions, and the MCP server exposes doctor tools backed by MongoDB.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={user ? '/dashboard' : '/login'}>
          <Button>Connect MCP</Button>
        </Link>
        <Link to="/dashboard">
          <Button variant="secondary">Open dashboard</Button>
        </Link>
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <section key={feature.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{feature.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}

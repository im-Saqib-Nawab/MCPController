import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';

const features = [
  {
    title: 'Authentication',
    body: 'Users sign in with email and password. Passwords are hashed with bcrypt and sessions use an HTTP-only cookie.'
  },
  {
    title: 'Permissions',
    body: 'During consent you choose read, write, and delete. The MCP server enforces those scopes on every tool call.'
  },
  {
    title: 'MCP Tools',
    body: 'ChatGPT calls tools such as get_profile and create_data over Streamable HTTP at /mcp.'
  },
  {
    title: 'Secure Connections',
    body: 'OAuth 2.1 with PKCE issues access tokens bound to this MCP resource. Redirect URIs must be pre-registered.'
  }
];

export default function Home({ user }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">MCP + OAuth practice app</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
        MCPController
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Connect your AI applications to your MCP tools securely.
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

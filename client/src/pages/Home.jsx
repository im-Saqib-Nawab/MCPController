import { Link } from 'react-router-dom';

import Button from '../components/Button.jsx';

const features = [
  {
    title: 'Single Admin',
    body: 'Only the administrator can sign in. Administrator credentials stay on the server and are never exposed to the React application.'
  },
  {
    title: 'OAuth Permissions',
    body: 'The administrator approves doctor:read, doctor:write, and doctor:delete permissions before ChatGPT receives an access token.'
  },
  {
    title: 'MCP Tools',
    body: 'ChatGPT can use the Doctor Management MCP server to list, read, add, update, and delete doctors according to the permissions granted.'
  },
  {
    title: 'Secure OAuth',
    body: 'The connection uses OAuth 2.1 authorization code flow with PKCE. Redirect URIs and the MCP resource are validated by the authorization server.'
  }
];

export default function Home({ user }) {
  const dashboardPath = '/dashboard';
  const loginPath = '/login';

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Doctor Management MCP
        </p>

        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          MCPController
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          Connect ChatGPT to your Doctor Management MCP server
          through OAuth. The administrator controls which doctor
          management permissions the MCP client receives.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to={
              user
                ? dashboardPath
                : loginPath
            }
          >
            <Button type="button">
              {user
                ? 'Open Dashboard'
                : 'Admin Login'}
            </Button>
          </Link>

          <Link to={dashboardPath}>
            <Button
              type="button"
              variant="secondary"
            >
              Open Dashboard
            </Button>
          </Link>
        </div>
      </section>

      <section
        aria-label="MCPController features"
        className="mt-16 grid gap-4 sm:grid-cols-2"
      >
        {features.map(
          (feature) => (
            <article
              key={feature.title}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <h2 className="text-base font-semibold text-slate-900">
                {feature.title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {feature.body}
              </p>
            </article>
          )
        )}
      </section>

      <section className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          How the connection works
        </h2>

        <ol className="mt-3 space-y-2 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-800">
              1.
            </span>{' '}
            ChatGPT starts an OAuth authorization request.
          </li>

          <li>
            <span className="font-medium text-slate-800">
              2.
            </span>{' '}
            MCPController asks the administrator to log in.
          </li>

          <li>
            <span className="font-medium text-slate-800">
              3.
            </span>{' '}
            The administrator selects the permissions ChatGPT may
            use.
          </li>

          <li>
            <span className="font-medium text-slate-800">
              4.
            </span>{' '}
            MCPController redirects back to ChatGPT with the
            authorization code.
          </li>

          <li>
            <span className="font-medium text-slate-800">
              5.
            </span>{' '}
            ChatGPT exchanges the code using PKCE and receives
            an access token.
          </li>

          <li>
            <span className="font-medium text-slate-800">
              6.
            </span>{' '}
            ChatGPT uses the token when calling the MCP endpoint.
          </li>
        </ol>
      </section>
    </main>
  );
}
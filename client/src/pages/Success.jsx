import { Link } from 'react-router-dom';

export default function Success() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Authorization complete
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The authorization code was sent to the registered redirect URI. If
          you used the local success page as the redirect, you can close this
          tab and return to your MCP client.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block text-sm font-medium text-slate-900 underline"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
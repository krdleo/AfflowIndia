import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { isAffiliateAuthed } from "../lib/jwt.server";
import tailwindStyles from "../tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isAuthenticated = await isAffiliateAuthed(request);

  return { isAuthenticated };
};

export default function PortalLayout() {
  const { isAuthenticated } = useLoaderData<typeof loader>();

  return (
    <div className="portal-layout min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="font-bold text-xl text-indigo-600">Affiliate Portal</div>
          <nav className="flex items-center gap-4 text-sm font-medium">
            {isAuthenticated ? (
              <>
                <a href="/portal/dashboard" className="text-gray-600 hover:text-indigo-600">Dashboard</a>
                <a href="/portal/payouts" className="text-gray-600 hover:text-indigo-600">Payouts</a>
                <a href="/portal/profile" className="text-gray-600 hover:text-indigo-600">Profile</a>
                <form action="/portal/logout" method="post" className="inline">
                  <button type="submit" className="text-gray-600 hover:text-red-600">Logout</button>
                </form>
              </>
            ) : (
              <>
                <a href="/portal/login" className="text-gray-600 hover:text-indigo-600">Login</a>
                <a href="/portal/signup" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">Sign Up</a>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          Powered by AfflowIndia
        </div>
      </footer>
    </div>
  );
}

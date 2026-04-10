import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { Form, useActionData, useNavigation, useSearchParams } from "react-router";
import db from "../db.server";
import { createAffiliateSession, isAffiliateAuthed } from "../lib/jwt.server";
import bcrypt from "bcryptjs";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (await isAffiliateAuthed(request)) {
    return redirect("/portal/dashboard");
  }
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/portal/dashboard";

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const affiliate = await db.affiliate.findFirst({
    where: { email: email.toLowerCase().trim() },
    include: { shop: true },
  });

  if (!affiliate) {
    return { error: "Invalid email or password" };
  }

  const isValidPassword = await bcrypt.compare(password, affiliate.passwordHash);

  if (!isValidPassword) {
    return { error: "Invalid email or password" };
  }

  if (affiliate.status === "PENDING") {
    return { error: "Your account is pending approval." };
  }

  if (affiliate.status === "SUSPENDED") {
    return { error: "Your account has been suspended." };
  }

  await db.affiliate.update({
    where: { id: affiliate.id },
    data: { lastLogin: new Date() },
  });

  const headers = await createAffiliateSession(affiliate.id, affiliate.shop.shopDomain);

  return redirect(redirectTo, { headers });
};

export default function PortalLogin() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-xl shadow-md border border-gray-100">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
        <p className="text-gray-500 mt-2">Log in to your affiliate dashboard</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Form method="post" className="space-y-6">
        <input type="hidden" name="redirectTo" value={searchParams.get("redirectTo") ?? "/portal/dashboard"} />
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <a href="/portal/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-500 font-medium">
              Forgot password?
            </a>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
        >
          {isSubmitting ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            "Sign In"
          )}
        </button>
      </Form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          Don't have an affiliate account?{" "}
          <a href="/portal/signup" className="text-indigo-600 hover:text-indigo-500 font-medium tracking-tight">
            Apply now
          </a>
        </p>
      </div>
    </div>
  );
}

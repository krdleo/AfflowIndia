import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import db from "../db.server";
import bcrypt from "bcryptjs";
import { isAffiliateAuthed } from "../lib/jwt.server";
import { affiliateSignupSchema } from "../lib/validation.server";
import { generateToken, generateUrlSafeCode } from "../lib/encryption.server";
import { sendVerificationEmail } from "../lib/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (await isAffiliateAuthed(request)) {
    return redirect("/portal/dashboard");
  }
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);
  
  const result = affiliateSignupSchema.safeParse(rawData);
  if (!result.success) {
    return { error: "Please fill out all required fields correctly." };
  }
  
  const data = result.data;
  const shop = await db.shop.findUnique({ where: { shopDomain: data.shopDomain } });
  if (!shop || !shop.isActive) {
    return { error: "Invalid store domain provided." };
  }

  const existing = await db.affiliate.findFirst({
    where: { shopId: shop.id, email: data.email },
  });
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const portalConfig = (shop.portalCustomization as Record<string, unknown>) || {};
  if (portalConfig.signupsEnabled === false) {
    return { error: "Signups are currently disabled for this program." };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const verificationToken = generateToken();
  const referralCode = generateUrlSafeCode(8);
  const affiliateCode = data.code || data.name.replace(/\s+/g, "").toUpperCase().slice(0, 10) + Math.floor(Math.random() * 100);

  const requireApproval = portalConfig.requireApproval !== false;

  const affiliate = await db.affiliate.create({
    data: {
      shopId: shop.id,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      upiId: data.upiId || null,
      code: affiliateCode.toUpperCase(),
      referralCode,
      passwordHash,
      commissionRate: Number(shop.defaultCommissionRate),
      status: requireApproval ? "PENDING" : "ACTIVE",
      verificationToken,
      verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });

  try {
    const verificationUrl = `${process.env.SHOPIFY_APP_URL}/portal/verify-email?token=${verificationToken}`;
    await sendVerificationEmail(data.email, data.name, verificationUrl, data.shopDomain);
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }

  return { 
    success: true, 
    message: requireApproval 
      ? "Signup successful! Please verify your email and wait for approval." 
      : "Signup successful! Please verify your email to get started." 
  };
};

export default function PortalSignup() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const error = actionData && "error" in actionData ? actionData.error : null;
  const success = actionData && "success" in actionData ? actionData.message : null;

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-xl shadow-md border border-gray-100 text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Received</h2>
        <p className="text-gray-600 mb-6">{success}</p>
        <a href="/portal/login" className="text-indigo-600 hover:text-indigo-500 font-medium tracking-tight">
          Return to login
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-12 mb-12 bg-white p-8 rounded-xl shadow-md border border-gray-100">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Become an Affiliate</h1>
        <p className="text-gray-500 mt-2">Sign up to earn commission on your referrals</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Form method="post" className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="shopDomain">
            Store Domain
          </label>
          <input
            id="shopDomain"
            name="shopDomain"
            type="text"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            placeholder="example.myshopify.com"
          />
          <p className="text-xs text-gray-500 mt-1">The store you want to promote</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>
        </div>

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
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="code">
            Preferred Discount Code (Optional)
          </label>
          <input
            id="code"
            name="code"
            type="text"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors uppercase"
            placeholder="e.g. PRIYA10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="upiId">
            UPI ID for Payouts (Optional)
          </label>
          <input
            id="upiId"
            name="upiId"
            type="text"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            placeholder="you@upi"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center mt-4"
        >
          {isSubmitting ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            "Apply Now"
          )}
        </button>
      </Form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          Already have an account?{" "}
          <a href="/portal/login" className="text-indigo-600 hover:text-indigo-500 font-medium tracking-tight">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

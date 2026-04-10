import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import db from "../db.server";
import { requireAffiliateAuth } from "../lib/jwt.server";
import { encryptAffiliatePII, decryptAffiliatePII } from "../lib/pii.server";
import { affiliateProfileUpdateSchema } from "../lib/validation.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await requireAffiliateAuth(request);
  
  const affiliate = await db.affiliate.findUnique({
    where: { id: session.affiliateId },
  });

  if (!affiliate) {
    throw new Response("Affiliate not found", { status: 404 });
  }

  const pii = decryptAffiliatePII(affiliate);

  return {
    id: affiliate.id,
    name: affiliate.name,
    email: affiliate.email,
    phone: affiliate.phone || "",
    upiId: affiliate.upiId || "",
    panLast4: pii.panLast4 || "",
    pan: pii.pan || "",
    gstin: pii.gstin || "",
    legalName: pii.legalName || "",
    city: affiliate.city || "",
    state: affiliate.state || "",
    pincode: affiliate.pincode || "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const session = await requireAffiliateAuth(request);
  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);
  
  const result = affiliateProfileUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: "Please fill out all fields correctly.", details: result.error.flatten() };
  }

  const d = result.data;
  const updateData: Record<string, any> = {};

  if (d.name) updateData.name = d.name;
  updateData.phone = d.phone || null;
  updateData.upiId = d.upiId || null;
  updateData.city = d.city || null;
  updateData.state = d.state || null;
  updateData.pincode = d.pincode || null;

  // Encrypt PII
  const piiData = encryptAffiliatePII({
    pan: d.pan || null,
    gstin: d.gstin || null,
    legalName: d.legalName || null,
    address: null,
  });

  Object.assign(updateData, piiData);

  await db.affiliate.update({
    where: { id: session.affiliateId },
    data: updateData,
  });

  return { success: true, message: "Profile updated successfully." };
};

export default function PortalProfile() {
  const profile = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const error = actionData && "error" in actionData ? actionData.error : null;
  const success = actionData && "success" in actionData ? actionData.message : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
          <p className="text-gray-500 mt-1">Update your personal details and payout methods.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <Form method="post" className="p-6 md:p-8 space-y-8">
          
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900 border-b border-gray-100 pb-2">Basic Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">Full Name</label>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  defaultValue={profile.name} 
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">Email Address <span className="text-gray-400 font-normal text-xs">(Cannot be changed)</span></label>
                <input 
                  type="text" 
                  id="email" 
                  value={profile.email} 
                  disabled
                  className="w-full px-4 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-md outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">Phone Number</label>
                <input 
                  type="tel" 
                  id="phone" 
                  name="phone" 
                  defaultValue={profile.phone} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-4">
            <h2 className="text-lg font-medium text-gray-900 border-b border-gray-100 pb-2">Payout Method</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="upiId">UPI ID</label>
                <input 
                  type="text" 
                  id="upiId" 
                  name="upiId" 
                  defaultValue={profile.upiId} 
                  placeholder="e.g. name@okhdfc"
                  className="w-full md:w-1/2 px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                />
                <p className="text-xs text-gray-500 mt-1">This UPI ID will be used for your automatic payouts.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-4">
            <h2 className="text-lg font-medium text-gray-900 border-b border-gray-100 pb-2">Compliance & Tax Data (Optional)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="legalName">Legal Entity Name</label>
                <input 
                  type="text" 
                  id="legalName" 
                  name="legalName" 
                  defaultValue={profile.legalName} 
                  className="w-full md:w-1/2 px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="pan">PAN Number</label>
                <input 
                  type="text" 
                  id="pan" 
                  name="pan" 
                  defaultValue={profile.pan} 
                  placeholder={profile.panLast4 ? `•••• ••${profile.panLast4}` : ""}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="gstin">GSTIN (if registered)</label>
                <input 
                  type="text" 
                  id="gstin" 
                  name="gstin" 
                  defaultValue={profile.gstin} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="city">City</label>
                <input 
                  type="text" 
                  id="city" 
                  name="city" 
                  defaultValue={profile.city} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="state">State</label>
                  <input 
                    type="text" 
                    id="state" 
                    name="state" 
                    defaultValue={profile.state} 
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="pincode">Pincode</label>
                  <input 
                    type="text" 
                    id="pincode" 
                    name="pincode" 
                    defaultValue={profile.pincode} 
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <svg className="inline mr-1 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Your PAN and GSTIN are encrypted at rest using AES-256-GCM.
            </p>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 text-white font-medium py-2 px-6 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
            >
              {isSubmitting ? (
                <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              Save Changes
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

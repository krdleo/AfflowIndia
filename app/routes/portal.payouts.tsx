import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import db from "../db.server";
import { requireAffiliateAuth } from "../lib/jwt.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await requireAffiliateAuth(request);
  
  const affiliate = await db.affiliate.findUnique({
    where: { id: session.affiliateId },
    select: {
      id: true,
      pendingCommission: true,
      shop: { select: { payoutMode: true } }
    }
  });

  if (!affiliate) {
    throw new Response("Affiliate not found", { status: 404 });
  }

  const payouts = await db.payout.findMany({
    where: { affiliateId: affiliate.id },
    orderBy: { createdAt: "desc" },
    select: { 
      id: true, 
      amount: true, 
      baseAmount: true,
      gstAmount: true,
      tdsAmount: true,
      status: true, 
      mode: true,
      createdAt: true,
      paidAt: true,
      externalReference: true,
    },
  });

  return { 
    pendingCommission: Number(affiliate.pendingCommission),
    payoutMode: affiliate.shop.payoutMode,
    payouts: payouts.map(p => ({
      ...p,
      amount: Number(p.amount),
      baseAmount: Number(p.baseAmount),
      gstAmount: Number(p.gstAmount),
      tdsAmount: Number(p.tdsAmount),
    }))
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const session = await requireAffiliateAuth(request);
  const formData = await request.formData();
  
  // Actually, payout requesting requires calculating TDS/GST. I'll just reuse the same logic
  // from portal.api.tsx by hitting my own database directly here, or redirecting.
  // For simplicity, I'll allow users to request ALL pending commission.

  const affiliate = await db.affiliate.findUnique({
    where: { id: session.affiliateId },
    include: { shop: { include: { gstSetting: true, tdsSetting: true } } },
  });

  if (!affiliate) return { error: "Affiliate not found" };

  const requestedAmount = Number(affiliate.pendingCommission);
  if (requestedAmount <= 0) {
    return { error: "No pending commission to request." };
  }

  // Calculate GST and TDS
  let gstAmount = 0;
  let tdsAmount = 0;
  const baseAmount = requestedAmount;

  if (affiliate.shop.gstSetting?.isEnabled) {
    gstAmount = baseAmount * (Number(affiliate.shop.gstSetting.gstRate) / 100);
  }

  if (affiliate.shop.tdsSetting?.isEnabled) {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = new Date(year, 3, 1);

    const cumulativePayouts = await db.payout.aggregate({
      where: {
        affiliateId: affiliate.id,
        status: { in: ["APPROVED", "PAID"] },
        createdAt: { gte: fyStart },
      },
      _sum: { baseAmount: true },
    });

    const cumulative = Number(cumulativePayouts._sum.baseAmount || 0);
    if (cumulative + baseAmount > Number(affiliate.shop.tdsSetting.annualThreshold)) {
      tdsAmount = (baseAmount + gstAmount) * (Number(affiliate.shop.tdsSetting.tdsRate) / 100);
    }
  }

  await db.$transaction([
    db.payout.create({
      data: {
        shopId: affiliate.shopId,
        affiliateId: affiliate.id,
        amount: baseAmount + gstAmount - tdsAmount,
        baseAmount,
        gstAmount,
        tdsAmount,
        mode: affiliate.shop.payoutMode === "RAZORPAY_X" ? "RAZORPAY_X" : "MANUAL",
        status: "PENDING",
      },
    }),
    db.affiliate.update({
      where: { id: affiliate.id },
      data: { pendingCommission: { decrement: baseAmount } },
    }),
  ]);

  return { success: true, message: "Payout requested successfully!" };
};

export default function PortalPayouts() {
  const { pendingCommission, payouts, payoutMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const error = actionData && "error" in actionData ? actionData.error : null;
  const success = actionData && "success" in actionData ? actionData.message : null;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
          <p className="text-gray-500 mt-1">Manage your earnings and payout history.</p>
        </div>
        
        <div className="mt-6 md:mt-0 bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col items-end">
          <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Available Balance</span>
          <span className="text-2xl font-bold text-indigo-600 mt-1">₹{pendingCommission.toLocaleString('en-IN')}</span>
          {pendingCommission > 0 && (
            <Form method="post" className="mt-3 w-full">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-70 flex justify-center items-center"
              >
                {isSubmitting ? (
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                Request Payout
              </button>
            </Form>
          )}
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
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900">Payout History</h2>
        </div>
        
        {payouts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>You haven't requested any payouts yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Method</th>
                  <th className="px-6 py-3 font-medium text-right">Base Amount</th>
                  <th className="px-6 py-3 font-medium text-right text-red-500">TDS</th>
                  <th className="px-6 py-3 font-medium text-right text-green-600">GST</th>
                  <th className="px-6 py-3 font-medium text-right text-gray-900">Net Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map((payout) => (
                  <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      {new Date(payout.createdAt).toLocaleDateString()}
                      {payout.paidAt && <div className="text-xs text-gray-400 mt-1">Paid: {new Date(payout.paidAt).toLocaleDateString()}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        payout.status === 'PAID' ? 'bg-green-100 text-green-800' : 
                        payout.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        payout.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {payout.mode === "RAZORPAY_X" ? "Razorpay X" : "Manual"}
                      {payout.externalReference && <div className="text-xs font-mono text-gray-400 mt-1">{payout.externalReference}</div>}
                    </td>
                    <td className="px-6 py-4 text-right">₹{payout.baseAmount.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-right text-red-500">{payout.tdsAmount > 0 ? `-₹${payout.tdsAmount.toLocaleString('en-IN')}` : "-"}</td>
                    <td className="px-6 py-4 text-right text-green-600">{payout.gstAmount > 0 ? `+₹${payout.gstAmount.toLocaleString('en-IN')}` : "-"}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      ₹{payout.amount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

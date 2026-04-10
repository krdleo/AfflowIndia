import { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import db from "../db.server";
import { requireAffiliateAuth } from "../lib/jwt.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await requireAffiliateAuth(request);
  
  const affiliate = await db.affiliate.findUnique({
    where: { id: session.affiliateId },
    select: {
      id: true,
      name: true,
      code: true,
      referralCode: true,
      totalClicks: true,
      totalSales: true,
      pendingCommission: true,
      commissionRate: true,
      discountPercent: true,
      status: true,
      shop: { select: { shopDomain: true } },
    },
  });

  if (!affiliate) {
    throw new Response("Affiliate not found", { status: 404 });
  }

  const recentReferrals = await db.referral.findMany({
    where: { affiliateId: affiliate.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, orderId: true, orderAmount: true, commissionAmount: true, createdAt: true },
  });

  const referralLink = `https://${affiliate.shop.shopDomain}/a/ref/${affiliate.referralCode}`;
  const encodedMessage = encodeURIComponent(`Check out this store! Use my code ${affiliate.code} for ${Number(affiliate.discountPercent)}% off: ${referralLink}`);
  const whatsappLink = `https://wa.me/?text=${encodedMessage}`;

  return { 
    affiliate: {
      ...affiliate,
      totalSales: Number(affiliate.totalSales),
      pendingCommission: Number(affiliate.pendingCommission),
      commissionRate: Number(affiliate.commissionRate),
      discountPercent: Number(affiliate.discountPercent),
    }, 
    recentReferrals: recentReferrals.map((r) => ({
      ...r, orderAmount: Number(r.orderAmount), commissionAmount: Number(r.commissionAmount),
    })),
    referralLink, 
    whatsappLink 
  };
};

export default function PortalDashboard() {
  const { affiliate, recentReferrals, referralLink, whatsappLink } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {affiliate.name.split(' ')[0]}!</h1>
          <p className="text-gray-500 mt-1">Here's your affiliate performance overview.</p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-col items-end">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            affiliate.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
            affiliate.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
          }`}>
            {affiliate.status}
          </span>
          <p className="text-sm text-gray-500 mt-1">Commission Rate: {affiliate.commissionRate}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Sales</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">₹{affiliate.totalSales.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Pending Commission</h3>
          <p className="mt-2 text-3xl font-bold text-indigo-600">₹{affiliate.pendingCommission.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Clicks</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{affiliate.totalClicks}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Your Referral Link</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <input 
            type="text" 
            readOnly 
            value={referralLink} 
            className="flex-grow px-4 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-600 focus:outline-none"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button 
            onClick={() => {
              navigator.clipboard.writeText(referralLink);
              alert("Link copied to clipboard!");
            }}
            className="bg-gray-100 border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors font-medium whitespace-nowrap"
          >
            Copy Link
          </button>
          <a 
            href={whatsappLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors font-medium whitespace-nowrap flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            Share
          </a>
        </div>
        <p className="text-sm text-gray-500 mt-3">Or tell customers to use your discount code at checkout: <strong className="text-gray-900 bg-gray-100 px-2 py-1 rounded">{affiliate.code}</strong></p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Recent Referrals</h2>
          <a href="/portal/payouts" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium tracking-tight">View All</a>
        </div>
        
        {recentReferrals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No referrals yet. Share your link to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Order ID</th>
                  <th className="px-6 py-3 font-medium text-right">Order Amount</th>
                  <th className="px-6 py-3 font-medium text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentReferrals.map((referral) => (
                  <tr key={referral.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">{new Date(referral.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-mono text-gray-600">{referral.orderId.substring(0, 8)}...</td>
                    <td className="px-6 py-4 text-right">₹{referral.orderAmount.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-right font-medium text-green-600">+₹{referral.commissionAmount.toLocaleString('en-IN')}</td>
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

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface SalesChartProps {
  chartData: { date: string; sales: number }[];
}

export default function SalesChart({ chartData }: SalesChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1E3E5" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6D7175', fontSize: 12 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6D7175', fontSize: 12 }} dx={-10} tickFormatter={(val) => `₹${val}`} />
        <Tooltip 
          formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, "Sales"]}
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
        />
        <Line type="monotone" dataKey="sales" stroke="#008060" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4, fill: '#008060', strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

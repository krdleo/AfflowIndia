import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Afflow" },
  {
    name: "description",
    content:
      "Afflow privacy policy. Contact hello@afflow.in for privacy-related queries.",
  },
];

export default function PrivacyPolicy() {
  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        color: "#1a1a1a",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "32px", fontWeight: 600, margin: "0 0 24px 0" }}>
        Privacy Policy
      </h1>
      <p style={{ fontSize: "16px", color: "#4a4a4a", margin: "0 0 16px 0" }}>
        This Privacy Policy is being updated. Please check back soon or contact
        us at{" "}
        <a
          href="mailto:hello@afflow.in"
          style={{ color: "#4f46e5", textDecoration: "underline" }}
        >
          hello@afflow.in
        </a>{" "}
        for any privacy-related queries.
      </p>
    </main>
  );
}

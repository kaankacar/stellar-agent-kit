"use client";
import { useChat } from "ai/react";

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: "1.25rem" }}>
        Stellar Agent — Vercel AI Chat
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        Ask the agent to check balances, swap on Soroswap, look up Soroban Domains, fetch Stellar Expert
        records, etc. Actions execute against the server-side wallet configured in <code>.env</code>.
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "1rem",
          minHeight: 400,
          marginBottom: "1rem",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "#999" }}>
            Try: <em>"What's the agent's balance?"</em> or <em>"Resolve overcat.xlm"</em>.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ marginBottom: "1rem" }}>
              <strong>{m.role === "user" ? "You" : "Agent"}:</strong>{" "}
              <span style={{ whiteSpace: "pre-wrap" }}>
                {m.parts
                  ?.map((p) => (p.type === "text" ? p.text : `[tool:${p.type}]`))
                  .join("") ?? m.content}
              </span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask the agent..."
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "0.5rem 1rem",
            background: "#000",
            color: "#fff",
            borderRadius: 6,
            border: "none",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "…" : "Send"}
        </button>
      </form>
    </main>
  );
}

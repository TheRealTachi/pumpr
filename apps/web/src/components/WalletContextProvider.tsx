// Wallet adapter removed — pumpr uses send-to-stake, no wallet connection
// needed. This is a no-op passthrough for compatibility with layout.tsx.
export function WalletContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

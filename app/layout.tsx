import './globals.css'

export const metadata = {
  title: 'Prediction Markets Dashboard',
  description: 'Crypto prediction markets analytics dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
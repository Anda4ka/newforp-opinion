export const metadata = {
  title: 'Prediction Markets Backend',
  description: 'Analytical backend for prediction markets using Opinion OpenAPI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
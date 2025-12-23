export default function Home() {
  return (
    <main>
      <h1>Prediction Markets Backend</h1>
      <p>Analytical API for prediction markets data</p>
      <div>
        <h2>Available Endpoints:</h2>
        <ul>
          <li><code>GET /api/markets/movers?timeframe=1h|24h</code></li>
          <li><code>GET /api/markets/arbitrage</code></li>
          <li><code>GET /api/markets/ending-soon?hours=number</code></li>
          <li><code>GET /api/charts/price-history?yesTokenId=&noTokenId=&interval=1h|1d</code></li>
        </ul>
      </div>
    </main>
  )
}
const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const CORS_PROXY = 'https://corsproxy.io/?';

// Location mapping to Kalshi event tickers
const KALSHI_EVENT_MAPPING = {
    'KDEN': 'KXHIGHDEN',  // Denver
    'KLAX': 'KXHIGHLAX',   // Los Angeles
    'KNYC': 'KXHIGHNY',  // New York City
    'KMDW': 'KXHIGHCHI',  // Chicago
    'KIAH': 'KXHOUHIGH',
    'KAUS': 'KXHIGHAUS',
    'KMIA': 'KXHIGHMIA',
    'KHOU': 'KXHOUHIGH',
};

async function fetchKalshiMarkets(locationCode) {
    const seriesTicker = KALSHI_EVENT_MAPPING[locationCode];

    if (!seriesTicker) {
        console.log(`No Kalshi event mapping for ${locationCode}`);
        return null;
    }

    try {
        // Format today's date as it appears in event_ticker (e.g., "26JAN28" for Jan 28, 2026)
        const today = new Date();
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const year = String(today.getFullYear()).slice(-2); // Get last 2 digits of year
        const month = monthNames[today.getMonth()];
        const day = String(today.getDate()).padStart(2, '0');
        const todayDate = `${year}${month}${day}`; // e.g., "26JAN28"

        // Build the event_ticker for today (e.g., "KXHIGHAUS-26JAN28")
        const eventTicker = `${seriesTicker}-${todayDate}`;

        console.log(`Fetching Kalshi markets for event: ${eventTicker}`);

        // Fetch markets for today's specific event using CORS proxy
        const apiUrl = `${KALSHI_BASE_URL}/markets?event_ticker=${eventTicker}&status=open`;
        const response = await fetch(`${CORS_PROXY}${encodeURIComponent(apiUrl)}`);
        const data = await response.json();

        if (!data.markets || data.markets.length === 0) {
            console.log(`No markets found for ${eventTicker}`);
            return [];
        }

        console.log(`Found ${data.markets.length} markets for today`);

        // Sort by floor_strike in descending order (highest temperature first)
        data.markets.sort((a, b) => (b.floor_strike || 0) - (a.floor_strike || 0));

        return data.markets;

    } catch (error) {
        console.error(`Error fetching Kalshi data for ${locationCode}:`, error);
        return null;
    }
}

function renderKalshiSection(markets, locationName) {
    if (!markets || markets.length === 0) {
        return `
            <div class="kalshi-section">
                <div class="kalshi-header">
                    <div class="kalshi-title">Prediction Markets</div>
                    <div class="kalshi-logo">KALSHI</div>
                </div>
                <div class="no-markets">No active markets available for ${locationName}</div>
            </div>
        `;
    }

    const mainMarket = markets[0];

    return `
        <div class="kalshi-section">
            <div class="kalshi-header">
                <div class="kalshi-title">${locationName} Temperature Markets</div>
                <div class="kalshi-logo">KALSHI</div>
            </div>

            <table class="orderbook-table">
                <thead>
                    <tr>
                        <th>Contract</th>
                        <th>Yes</th>
                        <th>No</th>
                    </tr>
                </thead>
                <tbody>
                    ${markets.map(market => {
                        const yesAsk = market.yes_ask || 0;
                        const noAsk = market.no_ask || 0;

                        // Use yes_sub_title which shows format like "83° or above"
                        // Convert to simpler format like ">82°" by extracting the number
                        let temp = market.yes_sub_title || 'N/A';
                        const tempMatch = temp.match(/(\d+)°/);
                        if (tempMatch) {
                            temp = `>${tempMatch[1]}°`;
                        }

                        // Display "-" for extreme prices (0¢, 1¢, or 100¢)
                        const yesDisplay = (yesAsk === 0 || yesAsk === 1 || yesAsk === 100) ? '-' : `${yesAsk}¢`;
                        const noDisplay = (noAsk === 0 || noAsk === 1 || noAsk === 100) ? '-' : `${noAsk}¢`;

                        return `
                            <tr>
                                <td class="contract-range">${temp}</td>
                                <td class="price-cell price-yes">${yesDisplay}</td>
                                <td class="price-cell price-no">${noDisplay}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <div class="market-stats">
                <div class="market-stat-item">
                    <div class="market-stat-label">Total Volume</div>
                    <div class="market-stat-value">${(mainMarket.volume || 0).toLocaleString()}</div>
                </div>
                <div class="market-stat-item">
                    <div class="market-stat-label">Open Interest</div>
                    <div class="market-stat-value">${(mainMarket.open_interest || 0).toLocaleString()}</div>
                </div>
                <div class="market-stat-item">
                    <div class="market-stat-label">Close Time</div>
                    <div class="market-stat-value">${mainMarket.close_time ? new Date(mainMarket.close_time).toLocaleString() : 'N/A'}</div>
                </div>
                <div class="market-stat-item">
                    <div class="market-stat-label">Market Ticker</div>
                    <div class="market-stat-value" style="font-size: 0.9em;">${mainMarket.ticker}</div>
                </div>
            </div>
        </div>
    `;
}

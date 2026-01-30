const LOCATIONS = [
    { code: 'KLAX', name: 'Los Angeles', lat: 33.9425, lon: -118.4081, timezone: 'America/Los_Angeles' },
    { code: 'KNYC', name: 'New York Central Park', lat: 40.7789, lon: -73.9692, stationId: 'KNYC', timezone: 'America/New_York' },
    { code: 'KSFO', name: 'San Francisco', lat: 37.6213, lon: -122.3790, timezone: 'America/Los_Angeles' },
    { code: 'KMIA', name: 'Miami', lat: 25.7959, lon: -80.2870, timezone: 'America/New_York' },
    { code: 'KDEN', name: 'Denver', lat: 39.8561, lon: -104.6737, timezone: 'America/Denver' },
    { code: 'KHOU', name: 'Houston Hobby', lat: 29.6454, lon: -95.2789, timezone: 'America/Chicago' },
    { code: 'KSEA', name: 'Seattle', lat: 47.4502, lon: -122.3088, timezone: 'America/Los_Angeles' },
    { code: 'KAUS', name: 'Austin', lat: 30.1945, lon: -97.6699, timezone: 'America/Chicago' },
    { code: 'KDFW', name: 'Dallas Fort Worth', lat: 32.8968, lon: -97.0380, timezone: 'America/Chicago' },
    { code: 'KMDW', name: 'Chicago Midway', lat: 41.7868, lon: -87.7522, timezone: 'America/Chicago' }
];

let selectedLocation = 'KAUS'; // Default to Austin

function initLocationButtons() {
    const container = document.getElementById('location-buttons');
    container.innerHTML = LOCATIONS.map(loc => `
                <button
                    onclick="selectLocation('${loc.code}')"
                    id="btn-${loc.code}"
                    class="${selectedLocation === loc.code ? 'active' : ''}">
                    ${loc.code.replace('K', '')}
                </button>
            `).join('');
}

function selectLocation(code) {
    // Deactivate all buttons
    LOCATIONS.forEach(loc => {
        document.getElementById(`btn-${loc.code}`).classList.remove('active');
    });

    // Activate selected button
    document.getElementById(`btn-${code}`).classList.add('active');
    selectedLocation = code;

    loadAllLocations();
}

async function fetchWeatherAPI(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'WeatherDashboard (weather-app)',
            'Accept': 'application/geo+json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

function getMidnights() {
    const now = new Date();
    const lastMidnight = new Date(now);
    lastMidnight.setHours(0, 0, 0, 0);

    const nextMidnight = new Date(lastMidnight);
    nextMidnight.setDate(nextMidnight.getDate() + 1);

    return { lastMidnight, nextMidnight, now };
}

function getMidnightsForTimezone(timezone) {
    const now = new Date();

    // Get the current time in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;

    // Create a date string for midnight in that timezone
    // We need to find what UTC time corresponds to midnight in the target timezone
    const dateString = `${year}-${month}-${day}`;

    // Try different hours to find midnight in target timezone
    let lastMidnight = null;
    for (let utcHour = 0; utcHour < 24; utcHour++) {
        const testDate = new Date(`${dateString}T${String(utcHour).padStart(2, '0')}:00:00Z`);
        const testParts = formatter.formatToParts(testDate);
        const testHour = testParts.find(p => p.type === 'hour').value;
        const testDay = testParts.find(p => p.type === 'day').value;

        if (testHour === '00' && testDay === day) {
            lastMidnight = testDate;
            break;
        }
    }

    // Fallback if something goes wrong
    if (!lastMidnight) {
        lastMidnight = new Date(now);
        lastMidnight.setHours(0, 0, 0, 0);
    }

    const nextMidnight = new Date(lastMidnight.getTime() + 24 * 60 * 60 * 1000);

    console.log(`Timezone ${timezone}:`);
    console.log(`  Last midnight: ${lastMidnight.toISOString()} = ${formatter.format(lastMidnight)}`);
    console.log(`  Next midnight: ${nextMidnight.toISOString()} = ${formatter.format(nextMidnight)}`);
    console.log(`  Now: ${now.toISOString()} = ${formatter.format(now)}`);

    return {
        lastMidnight,
        nextMidnight,
        now
    };
}

function celsiusToFahrenheit(celsius) {
    return (celsius * 9 / 5 + 32).toFixed(1);
}

async function loadLocationWeather(location) {
    try {
        console.log(`\n=== Loading weather for ${location.code} ===`);

        // Calculate midnight for this location first
        const { lastMidnight, nextMidnight, now } = getMidnightsForTimezone(location.timezone);

        // Get observations from midnight to now with time parameters
        console.log(`Fetching observations from ${lastMidnight.toISOString()} to now...`);
        const observationsData = await fetchWeatherAPI(
            `https://api.weather.gov/stations/${location.code}/observations?start=${lastMidnight.toISOString()}&end=${now.toISOString()}`
        );
        console.log(`  Got ${observationsData.features.length} observations`);

        // Get forecast via grid point
        console.log(`Fetching grid point data...`);
        const pointData = await fetchWeatherAPI(
            `https://api.weather.gov/points/${location.lat},${location.lon}`
        );

        const hourlyForecastUrl = pointData.properties.forecastHourly;
        const gridDataUrl = pointData.properties.forecastGridData;
        console.log(`Fetching hourly forecast from: ${hourlyForecastUrl}`);
        console.log(`Fetching grid data from: ${gridDataUrl}`);

        // Fetch both hourly forecast and grid data, plus Kalshi markets
        const [forecastData, gridData, kalshiMarkets] = await Promise.all([
            fetchWeatherAPI(hourlyForecastUrl),
            fetchWeatherAPI(gridDataUrl),
            fetchKalshiMarkets(location.code)
        ]);

        console.log(`  Got ${forecastData.properties.periods.length} forecast periods`);

        if (forecastData.properties.periods.length > 0) {
            console.log(`  First forecast: ${forecastData.properties.periods[0].startTime}`);
            console.log(`  Last forecast: ${forecastData.properties.periods[forecastData.properties.periods.length - 1].startTime}`);
        }

        // Extract temperature data from grid data
        const gridTemperatures = gridData.properties.temperature;
        console.log(`  Got grid temperature data with ${gridTemperatures.values.length} values`);
        if (gridTemperatures.values.length > 0) {
            console.log(`  First grid temp: ${gridTemperatures.values[0].validTime}`);
            console.log(`  Last grid temp: ${gridTemperatures.values[gridTemperatures.values.length - 1].validTime}`);
        }

        const weatherData = processWeatherData(location, observationsData.features, forecastData.properties.periods, gridTemperatures.values);
        weatherData.kalshiMarkets = kalshiMarkets;
        return weatherData;
    } catch (error) {
        console.error(`Error loading ${location.code}:`, error);
        return null;
    }
}

function processWeatherData(location, observations, forecast, gridTemperatures = []) {
    const { lastMidnight, nextMidnight, now } = getMidnightsForTimezone(location.timezone);
    const allData = [];

    console.log(`Processing ${location.code} (${location.timezone})`);
    console.log(`  Time range: ${lastMidnight.toISOString()} to ${nextMidnight.toISOString()}`);
    console.log(`  Current time: ${now.toISOString()}`);

    // Process past observations (from last midnight to now)
    observations.forEach(obs => {
        const obsTime = new Date(obs.properties.timestamp);
        if (obsTime >= lastMidnight && obsTime < nextMidnight) {
            const temp = obs.properties.temperature.value;
            if (temp !== null) {
                // Detect high-confidence data (hourly METAR with rawMessage)
                const hasRawMessage = obs.properties.rawMessage && obs.properties.rawMessage.length > 0;
                const isHighConfidence = hasRawMessage;

                allData.push({
                    time: obsTime,
                    temp: parseFloat(celsiusToFahrenheit(temp)),
                    isPast: obsTime <= now,
                    isCurrent: false,
                    isHighConfidence: isHighConfidence
                });
            }
        }
    });

    console.log(`  Found ${allData.length} observations`);
    const highConfidenceObs = allData.filter(d => d.isHighConfidence);
    console.log(`  High-confidence observations: ${highConfidenceObs.length}`);
    if (allData.length > 0) {
        // Sort to check actual time range
        const sortedObs = [...allData].sort((a, b) => a.time - b.time);
        console.log(`  Earliest observation: ${sortedObs[0].time.toISOString()}`);
        console.log(`  Latest observation: ${sortedObs[sortedObs.length - 1].time.toISOString()}`);
    }

    // Add gridded temperature data (this often goes back further than hourly forecast)
    console.log(`  Processing ${gridTemperatures.length} grid temperature values`);
    let gridDataAdded = 0;
    const gridInRange = [];
    gridTemperatures.forEach(gridTemp => {
        // Parse ISO 8601 duration format: "2026-01-25T19:00:00+00:00/PT1H"
        const timeParts = gridTemp.validTime.split('/');
        const startTime = new Date(timeParts[0]);

        if (startTime >= lastMidnight && startTime < nextMidnight) {
            gridInRange.push(startTime);
            // Check if we already have data near this time
            const hasSimilarTime = allData.some(item =>
                Math.abs(item.time - startTime) < 30 * 60 * 1000 // within 30 minutes
            );

            if (!hasSimilarTime && gridTemp.value !== null) {
                allData.push({
                    time: startTime,
                    temp: parseFloat(celsiusToFahrenheit(gridTemp.value)),
                    isPast: startTime <= now,
                    isCurrent: false
                });
                gridDataAdded++;
            }
        }
    });
    console.log(`  Grid temps in range: ${gridInRange.length}, added ${gridDataAdded} new points`);
    if (gridInRange.length > 0) {
        gridInRange.sort((a, b) => a - b);
        console.log(`  First grid in range: ${gridInRange[0].toISOString()}`);
        console.log(`  Last grid in range: ${gridInRange[gridInRange.length - 1].toISOString()}`);
    }

    // Add hourly forecast data
    console.log(`  Processing ${forecast.length} forecast periods`);
    forecast.forEach(period => {
        const periodStart = new Date(period.startTime);

        if (periodStart >= lastMidnight && periodStart < nextMidnight) {
            // Check if we already have data near this time
            const hasSimilarTime = allData.some(item =>
                Math.abs(item.time - periodStart) < 30 * 60 * 1000 // within 30 minutes
            );

            if (!hasSimilarTime) {
                allData.push({
                    time: periodStart,
                    temp: period.temperature,
                    isPast: periodStart <= now,
                    isCurrent: false
                });
            }
        }
    });

    console.log(`  Total data points: ${allData.length}`);

    // Sort by time
    allData.sort((a, b) => a.time - b.time);

    // Mark current time (closest to now)
    let currentIndex = -1;
    if (allData.length > 0) {
        let closestIndex = 0;
        let minDiff = Math.abs(allData[0].time - now);

        allData.forEach((item, index) => {
            const diff = Math.abs(item.time - now);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = index;
            }
        });

        allData[closestIndex].isCurrent = true;
        currentIndex = closestIndex;
    }

    // Calculate temperature trend
    let trend = 'stable';
    if (currentIndex > 0 && currentIndex < allData.length - 1) {
        const currentTemp = allData[currentIndex].temp;
        const prevTemp = allData[currentIndex - 1].temp;
        const nextTemp = allData[currentIndex + 1].temp;

        // Compare with previous and next temps
        const avgChange = ((currentTemp - prevTemp) + (nextTemp - currentTemp)) / 2;

        if (avgChange > 1) {
            trend = 'increasing';
        } else if (avgChange < -1) {
            trend = 'decreasing';
        }
    } else if (currentIndex === 0 && allData.length > 1) {
        // Only future data available
        if (allData[1].temp > allData[0].temp) {
            trend = 'increasing';
        } else if (allData[1].temp < allData[0].temp) {
            trend = 'decreasing';
        }
    } else if (currentIndex > 0) {
        // Compare with just previous
        if (allData[currentIndex].temp > allData[currentIndex - 1].temp) {
            trend = 'increasing';
        } else if (allData[currentIndex].temp < allData[currentIndex - 1].temp) {
            trend = 'decreasing';
        }
    }

    // Calculate stats with timestamps
    const temps = allData.map(d => d.temp);
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const maxItem = allData.find(d => d.temp === maxTemp);
    const minItem = allData.find(d => d.temp === minTemp);
    const current = allData.find(d => d.isCurrent)?.temp || temps[temps.length - 1];

    // Calculate observed max (only from past observations)
    const pastData = allData.filter(d => d.isPast);
    const observedMaxTemp = pastData.length > 0 ? Math.max(...pastData.map(d => d.temp)) : null;
    const observedMaxItem = observedMaxTemp !== null ? pastData.find(d => d.temp === observedMaxTemp) : null;

    // Mark the max and min temperature items
    if (maxItem) {
        maxItem.isMax = true;
    }
    if (minItem) {
        minItem.isMin = true;
    }
    if (observedMaxItem) {
        observedMaxItem.isObservedMax = true;
    }

    return {
        location,
        data: allData,
        stats: {
            max: maxTemp,
            min: minTemp,
            current,
            trend,
            maxTime: maxItem?.time,
            minTime: minItem?.time,
            observedMax: observedMaxTemp,
            observedMaxTime: observedMaxItem?.time
        }
    };
}

function renderAirportCard(weatherData) {
    if (!weatherData) return '';

    const { location, data, stats, kalshiMarkets } = weatherData;

    // Trend indicator
    let trendIcon = '→';
    let trendText = 'Stable';
    let trendColor = '#667eea';

    if (stats.trend === 'increasing') {
        trendIcon = '↗';
        trendText = 'Rising';
        trendColor = '#ff4444';
    } else if (stats.trend === 'decreasing') {
        trendIcon = '↘';
        trendText = 'Falling';
        trendColor = '#4444ff';
    }

    // Format times for max and min
    const now = new Date();
    const maxTimeStr = stats.maxTime ? stats.maxTime.toLocaleTimeString('en-US', {
        timeZone: location.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) : '';
    const maxIsPast = stats.maxTime && stats.maxTime <= now;

    const minTimeStr = stats.minTime ? stats.minTime.toLocaleTimeString('en-US', {
        timeZone: location.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) : '';
    const minIsPast = stats.minTime && stats.minTime <= now;

    const observedMaxTimeStr = stats.observedMaxTime ? stats.observedMaxTime.toLocaleTimeString('en-US', {
        timeZone: location.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) : '';
    const hasObservedMax = stats.observedMax !== null;

    return `
                <div class="airport-card">
                    <div class="airport-header">
                        <div class="airport-name">${location.name}</div>
                        <div class="airport-code">${location.code.replace('K', '')}</div>
                    </div>

                    <div class="stats-bar">
                        ${hasObservedMax ? `
                        <div class="stat" onclick="document.getElementById('temp-observed-max')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">OBSERVED MAX</div>
                            <div class="stat-value" style="color: #f59e0b;">${stats.observedMax.toFixed(1)}°F</div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${observedMaxTimeStr} (past)
                            </div>
                        </div>
                        ` : ''}
                        <div class="stat" onclick="document.getElementById('temp-max')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">24hr MAX</div>
                            <div class="stat-value max">${stats.max.toFixed(1)}°F</div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${maxTimeStr} ${maxIsPast ? '(past)' : '(forecast)'}
                            </div>
                        </div>
                        <div class="stat" onclick="document.getElementById('temp-current')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">CURRENT <span style="font-size: 0.8em; color: ${trendColor};">${trendIcon} ${trendText}</span></div>
                            <div class="stat-value current">${stats.current.toFixed(1)}°F</div>
                        </div>
                        <div class="stat" onclick="document.getElementById('temp-min')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">24hr MIN</div>
                            <div class="stat-value min">${stats.min.toFixed(1)}°F</div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${minTimeStr} ${minIsPast ? '(past)' : '(forecast)'}
                            </div>
                        </div>
                    </div>

                    ${renderKalshiSection(kalshiMarkets, location.name)}

                    <div class="timeline">
                        ${data.map(item => {
        const timeStr = item.time.toLocaleTimeString('en-US', {
            timeZone: location.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        let badge = '';
        let itemClass = 'temp-item';
        let itemId = '';
        let extraBadge = '';

        if (item.isCurrent) {
            badge = '<span class="label-badge current">NOW</span>';
            itemClass += ' current';
            itemId = 'temp-current';
        } else if (item.isPast) {
            badge = '<span class="label-badge past">PAST</span>';
            itemClass += ' past';
        } else {
            badge = '<span class="label-badge">FORECAST</span>';
            itemClass += ' future';
        }

        // Add high confidence indicator after time (will be added below)
        let confidenceBadge = '';
        if (item.isHighConfidence) {
            confidenceBadge = '<span class="label-badge" style="background: #10b981; font-size: 0.7em;">(high confidence)</span>';
        }

        // Add OBSERVED MAX indicator if this is the observed max temp (check first for priority)
        if (item.isObservedMax) {
            extraBadge += '<span class="label-badge" style="background: #f59e0b;">OBSERVED MAX</span>';
            itemId = 'temp-observed-max';
        }

        // Add MAX indicator if this is the max temp
        if (item.isMax) {
            extraBadge += ' <span class="label-badge" style="background: #ff4444;">MAX</span>';
            if (!itemId) itemId = 'temp-max';
        }

        // Add MIN indicator if this is the min temp
        if (item.isMin) {
            extraBadge += ' <span class="label-badge" style="background: #4444ff;">MIN</span>';
            if (!itemId) itemId = 'temp-min';
        }

        const idAttr = itemId ? `id="${itemId}"` : '';

        return `
                                <div class="${itemClass}" ${idAttr}>
                                    <div class="time-label">
                                        ${badge}
                                        ${timeStr}
                                        ${confidenceBadge}
                                        ${extraBadge}
                                    </div>
                                    <div class="temp-value">${item.temp.toFixed(1)}°F</div>
                                </div>
                            `;
    }).join('')}
                    </div>

                    <div class="stats-bar">
                        ${hasObservedMax ? `
                        <div class="stat" onclick="document.getElementById('temp-observed-max')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">OBSERVED MAX</div>
                            <div class="stat-value" style="color: #f59e0b;">${stats.observedMax.toFixed(1)}°F</div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${observedMaxTimeStr} (past)
                            </div>
                        </div>
                        ` : ''}
                        <div class="stat" onclick="document.getElementById('temp-max')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">24hr MAX</div>
                            <div class="stat-value max">${stats.max.toFixed(1)}°F</div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${maxTimeStr} ${maxIsPast ? '(past)' : '(forecast)'}
                            </div>
                        </div>
                        <div class="stat" onclick="document.getElementById('temp-current')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">CURRENT <span style="font-size: 0.8em; color: ${trendColor};">${trendIcon} ${trendText}</span></div>
                            <div class="stat-value current">${stats.current.toFixed(1)}°F</div>
                        </div>
                        <div class="stat" onclick="document.getElementById('temp-min')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="cursor: pointer;">
                            <div class="stat-label">24hr MIN</div>
                            <div class="stat-value min">${stats.min.toFixed(1)}°F</div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${minTimeStr} ${minIsPast ? '(past)' : '(forecast)'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
}

async function loadAllLocations() {
    const grid = document.getElementById('airport-grid');
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    loading.style.display = 'block';
    errorDiv.style.display = 'none';
    grid.innerHTML = '';

    try {
        const locationToLoad = LOCATIONS.find(loc => loc.code === selectedLocation);

        if (!locationToLoad) {
            throw new Error('Location not found');
        }

        const result = await loadLocationWeather(locationToLoad);

        if (result) {
            grid.innerHTML = renderAirportCard(result);
        } else {
            throw new Error('Failed to load weather data');
        }

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';
        console.error('Error:', error);
    } finally {
        loading.style.display = 'none';
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    initLocationButtons();
    loadAllLocations();
});
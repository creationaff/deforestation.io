// deforestation.io - Global Deforestation Monitor
class ForestAI {
    constructor() {
        this.map = null;
        this.forestLayers = {};
        this.activeLayerToggles = {
            'forest-density': true,
            'deforestation': true,
            'air-quality': true,
            'protected-areas': false
        };
        this.newsUpdateInterval = null;
        this.aqiUpdateInterval = null;
        this.statsUpdateInterval = null;
        
        this.init();
    }

    async init() {
        this.showLoading();
        await this.initMap();
        await this.loadForestData();
        this.setupEventListeners();
        this.startLiveUpdates();
        this.hideLoading();
    }

    showLoading() {
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    async initMap() {
        // Initialize Leaflet map with ultra-smooth zoom settings
        this.map = L.map('map', {
            center: [20, 0],
            zoom: 2,
            minZoom: 1,
            maxZoom: 18,
            zoomControl: true,
            attributionControl: false,
            tap: true,
            tapTolerance: 15,
            // Center touch/wheel zoom around cursor/center for better Mac trackpad feel
            touchZoom: 'center',
            doubleClickZoom: 'center',
            scrollWheelZoom: 'center',
            boxZoom: true,
            keyboard: true,
            dragging: true,
            // Ultra-smooth zoom settings
            // Allow fractional zoom for ultra-smooth pinch
            zoomSnap: 0,  // No snapping for fractional zoom levels
            zoomDelta: 0.3,  // Larger step for faster +/- and double-click
            worldCopyJump: false,
            maxBounds: [[-90, -180], [90, 180]],
            maxBoundsViscosity: 1.0,
            zoomAnimation: true,
            zoomAnimationThreshold: 8,  // Higher threshold for more animations
            fadeAnimation: true,
            markerZoomAnimation: true,
            transform3DLimit: 8388608,  // Correct value: 2^23
            // Enhanced inertia for smoother panning
            inertia: true,
            inertiaDeceleration: 2000,  // Slower deceleration for smoother stop
            inertiaMaxSpeed: 2000,  // Higher max speed
            easeLinearity: 0.1,  // More linear easing for smoother motion
            // Faster wheel zoom
            wheelPxPerZoomLevel: 30,  // Fewer pixels per level => faster zoom
            wheelDebounceTime: 10,  // Lower debounce => quicker response
            // Smooth continuous zoom
            smoothWheelZoom: true,  // Enable smooth wheel zoom if available
            smoothSensitivity: 1  // Sensitivity for smooth zoom
        });

        // Add dark theme base layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        // Attribution removed for cleaner interface
        
        // Continuously remove any attribution controls that might appear
        this.removeAttributionControls();

        // Add custom smooth wheel/pinch handler for Mac trackpads
        this.enableSmoothPinchZoom();
    }

    enableSmoothPinchZoom() {
        // If Leaflet.SmoothWheelZoom plugin is present, prefer it
        if (this.map && typeof this.map.options.smoothWheelZoom !== 'undefined') {
            return; // already enabled by options
        }

        let pending = null;
        let targetZoom = this.map.getZoom();

        const scheduleZoom = (delta, origin) => {
            // Increase delta multiplier for faster zoom
            targetZoom = Math.max(this.map.getMinZoom(), Math.min(this.map.getMaxZoom(), targetZoom + delta * 2.2));
            if (pending) return;
            pending = requestAnimationFrame(() => {
                pending = null;
                this.map.setZoomAround(origin, targetZoom);
            });
        };

        // Smooth ctrl/trackpad wheel zoom
        this.map.getContainer().addEventListener('wheel', (e) => {
            // Allow natural trackpad pinch (often reports ctrlKey=true on Mac)
            const isPinch = e.ctrlKey || Math.abs(e.deltaY) < 1;
            if (!isPinch) return; // keep default wheel scrolling for mouse
            e.preventDefault();
            const rect = this.map.getContainer().getBoundingClientRect();
            const origin = this.map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
            // Larger magnitude => faster zooming
            const delta = -e.deltaY / 180;
            scheduleZoom(delta, origin);
        }, { passive: false });
    }

    async loadForestData() {
        // Use enhanced forest data from data.js
        const forestData = typeof ForestData !== 'undefined' ? ForestData.regions : this.generateForestData();
        
        // Create forest density layer
        this.forestLayers['forest-density'] = L.layerGroup();
        
        forestData.forEach(region => {
            const color = this.getForestColor(region.density);
            const borderColor = this.getForestBorderColor(region.density);
            const polygon = L.polygon(region.coordinates, {
                color: borderColor,
                fillColor: color,
                fillOpacity: this.getForestOpacity(region.density),
                weight: this.getForestBorderWeight(region.density),
                opacity: 0.9,
                className: `forest-region density-${Math.floor(region.density / 20)}`
            });

            polygon.bindPopup(`
                <div style="color: #f8fafc; font-family: Inter, sans-serif; max-width: 300px;">
                    <h3 style="margin-bottom: 0.5rem; color: #22c55e;">${region.name}</h3>
                    <p><strong>Forest Coverage:</strong> ${region.density}%</p>
                    <p><strong>Area:</strong> ${region.area.toLocaleString()} km²</p>
                    <p><strong>Deforestation Rate:</strong> ${region.deforestationRate}% annually</p>
                    <p><strong>Primary Threats:</strong> ${region.threats.join(', ')}</p>
                    <p><strong>Air Quality Impact:</strong> ${region.airQualityImpact}</p>
                    ${region.carbonStorage ? `<p><strong>Carbon Storage:</strong> ${region.carbonStorage}</p>` : ''}
                    ${region.biodiversity ? `<p><strong>Biodiversity:</strong> ${region.biodiversity}</p>` : ''}
                </div>
            `);

            polygon.on('click', (e) => {
                this.updateMapInfo(region);
            });

            this.forestLayers['forest-density'].addLayer(polygon);
        });

        // Add deforestation hotspots layer
        this.forestLayers['deforestation'] = L.layerGroup();
        this.addDeforestationHotspots();

        // Add air quality layer
        this.forestLayers['air-quality'] = L.layerGroup();
        this.addAirQualityLayer();
        this.addCountryAirQualityLayer();

        // Add protected areas layer
        this.forestLayers['protected-areas'] = L.layerGroup();
        this.addProtectedAreasLayer();

        // Add all three main layers by default
        this.forestLayers['forest-density'].addTo(this.map);
        this.forestLayers['deforestation'].addTo(this.map);
        this.forestLayers['air-quality'].addTo(this.map);
        
        // Initialize combined legend
        this.updateCombinedLegend();
        
        // Add performance optimizations
        this.setupPerformanceOptimizations();
    }

    generateForestData() {
        return [
            {
                name: "Amazon Rainforest",
                coordinates: [[-5, -70], [-5, -50], [-15, -50], [-15, -70]],
                density: 78,
                area: 5500000,
                deforestationRate: 0.8,
                threats: ["Cattle ranching", "Agriculture", "Logging"],
                airQualityImpact: "Moderate - Regional CO2 increase"
            },
            {
                name: "Congo Basin",
                coordinates: [[5, 10], [5, 30], [-10, 30], [-10, 10]],
                density: 85,
                area: 3700000,
                deforestationRate: 0.5,
                threats: ["Logging", "Agriculture", "Mining"],
                airQualityImpact: "Low - Stable air quality"
            },
            {
                name: "Indonesian Forests",
                coordinates: [[-10, 95], [-10, 140], [5, 140], [5, 95]],
                density: 62,
                area: 920000,
                deforestationRate: 1.2,
                threats: ["Palm oil", "Pulp industry", "Agriculture"],
                airQualityImpact: "High - Significant haze and pollution"
            },
            {
                name: "Boreal Forest (Canada)",
                coordinates: [[50, -140], [50, -60], [70, -60], [70, -140]],
                density: 92,
                area: 3070000,
                deforestationRate: 0.1,
                threats: ["Logging", "Climate change", "Fires"],
                airQualityImpact: "Low - Clean air maintained"
            },
            {
                name: "Siberian Taiga",
                coordinates: [[50, 60], [50, 150], [70, 150], [70, 60]],
                density: 88,
                area: 5100000,
                deforestationRate: 0.3,
                threats: ["Logging", "Climate change", "Fires"],
                airQualityImpact: "Low - Minimal impact"
            },
            {
                name: "Atlantic Forest (Brazil)",
                coordinates: [[-30, -55], [-30, -35], [-10, -35], [-10, -55]],
                density: 12,
                area: 148000,
                deforestationRate: 2.1,
                threats: ["Urban expansion", "Agriculture", "Infrastructure"],
                airQualityImpact: "High - Urban air pollution increase"
            },
            {
                name: "Madagascar Forests",
                coordinates: [[-25, 43], [-25, 50], [-12, 50], [-12, 43]],
                density: 22,
                area: 125000,
                deforestationRate: 1.8,
                threats: ["Agriculture", "Charcoal production", "Logging"],
                airQualityImpact: "Moderate - Regional dust increase"
            },
            {
                name: "Southeast Asian Forests",
                coordinates: [[10, 95], [10, 120], [25, 120], [25, 95]],
                density: 45,
                area: 247000,
                deforestationRate: 1.5,
                threats: ["Agriculture", "Urban expansion", "Infrastructure"],
                airQualityImpact: "High - Air quality degradation"
            }
        ];
    }

    addDeforestationHotspots() {
        const hotspots = typeof ForestData !== 'undefined' ? ForestData.hotspots : [
            { lat: -8, lng: -63, intensity: 'high', name: 'Rondônia, Brazil' },
            { lat: 0, lng: 117, intensity: 'critical', name: 'Borneo, Indonesia' },
            { lat: -18, lng: 46, intensity: 'high', name: 'Madagascar' },
            { lat: 10, lng: -84, intensity: 'moderate', name: 'Costa Rica' }
        ];

        hotspots.forEach(hotspot => {
            const color = this.getDeforestationColor(hotspot.intensity);
            const radius = this.getDeforestationRadius(hotspot.area);
            const pulseClass = hotspot.intensity === 'critical' ? 'pulse-critical' : 
                              hotspot.intensity === 'high' ? 'pulse-high' : 'pulse-moderate';
            
            const circle = L.circle([hotspot.lat, hotspot.lng], {
                color: color,
                fillColor: color,
                fillOpacity: this.getDeforestationOpacity(hotspot.intensity),
                radius: radius,
                weight: this.getDeforestationWeight(hotspot.intensity),
                className: `deforestation-hotspot ${pulseClass} region-${hotspot.region?.toLowerCase().replace(/\s+/g, '-') || 'unknown'}`
            });

            // Enhanced popup with local hotspot indicator
            const isLocalHotspot = hotspot.area && hotspot.area < 100; // Small local hotspots
            
            // Build companies section if available
            let companiesHtml = '';
            if (hotspot.companies && hotspot.companies.length > 0) {
                companiesHtml = `
                    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; border-radius: 0.25rem;">
                        <p style="margin: 0 0 0.5rem 0;"><strong style="color: #ef4444;">⚠️ Responsible Companies:</strong></p>
                        <ul style="margin: 0; padding-left: 1.2rem; color: #fca5a5;">
                            ${hotspot.companies.map(company => `<li style="margin-bottom: 0.25rem;">${company}</li>`).join('')}
                        </ul>
                        ${hotspot.impact ? `<p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #fecaca;"><strong>Impact:</strong> ${hotspot.impact}</p>` : ''}
                    </div>
                `;
            }
            
            circle.bindPopup(`
                <div style="color: #f8fafc; font-family: Inter, sans-serif; max-width: 320px;">
                    <h3 style="margin-bottom: 0.5rem; color: ${color};">${hotspot.name}</h3>
                    <p><strong>Alert Level:</strong> <span style="color: ${color};">${hotspot.intensity.toUpperCase()}</span></p>
                    ${hotspot.region ? `<p><strong>Region:</strong> ${hotspot.region}</p>` : ''}
                    ${hotspot.area ? `<p><strong>Area Affected:</strong> ${hotspot.area.toLocaleString()} hectares</p>` : ''}
                    ${hotspot.rate ? `<p><strong>Deforestation Rate:</strong> ${hotspot.rate}</p>` : ''}
                    ${hotspot.cause ? `<p><strong>Primary Cause:</strong> ${hotspot.cause}</p>` : ''}
                    ${hotspot.detected ? `<p><strong>First Detected:</strong> ${hotspot.detected}</p>` : ''}
                    <p><strong>Status:</strong> <span style="color: #ef4444;">Active deforestation detected</span></p>
                    ${isLocalHotspot ? '<p style="color: #22c55e; font-style: italic;">🔍 Local hotspot - more visible when zoomed in</p>' : ''}
                    ${companiesHtml}
                </div>
            `);

            // Add zoom-based visibility for smaller hotspots
            if (isLocalHotspot) {
                circle.setStyle({ opacity: 0.4, fillOpacity: 0.3 }); // Start more transparent
                circle._isLocalHotspot = true;
                circle._originalOpacity = this.getDeforestationOpacity(hotspot.intensity);
                circle._originalFillOpacity = this.getDeforestationOpacity(hotspot.intensity);
            }

            this.forestLayers['deforestation'].addLayer(circle);
        });

        // Add zoom event listener to show/hide local hotspots
        this.map.on('zoomend', () => {
            this.updateHotspotsVisibility();
        });

        // Initial visibility update
        this.updateHotspotsVisibility();
    }

    updateHotspotsVisibility() {
        const currentZoom = this.map.getZoom();
        const showLocalHotspots = currentZoom >= 6; // Show local hotspots clearly at zoom level 6+
        
        if (this.forestLayers['deforestation']) {
            this.forestLayers['deforestation'].eachLayer(layer => {
                if (layer._isLocalHotspot) {
                    if (showLocalHotspots) {
                        // Show local hotspots with full opacity when zoomed in
                        layer.setStyle({ 
                            opacity: layer._originalOpacity,
                            fillOpacity: layer._originalFillOpacity 
                        });
                    } else {
                        // Make less visible at low zoom levels
                        layer.setStyle({ 
                            opacity: 0.4,
                            fillOpacity: 0.3 
                        });
                    }
                }
            });
        }
    }

    addAirQualityLayer() {
        const aqiStations = typeof ForestData !== 'undefined' ? ForestData.aqiStations : [
            { lat: 40.7128, lng: -74.0060, aqi: 85, city: 'New York' },
            { lat: 51.5074, lng: -0.1278, aqi: 72, city: 'London' },
            { lat: 35.6762, lng: 139.6503, aqi: 95, city: 'Tokyo' },
            { lat: -23.5505, lng: -46.6333, aqi: 128, city: 'São Paulo' }
        ];

        aqiStations.forEach(station => {
            const color = this.getAQIColor(station.aqi);
            const marker = L.circleMarker([station.lat, station.lng], {
                color: color,
                fillColor: color,
                fillOpacity: 0.8,
                radius: 8,
                weight: 2
            });

            marker.bindPopup(`
                <div style="color: #f8fafc; font-family: Inter, sans-serif;">
                    <h3 style="margin-bottom: 0.5rem; color: ${color};">${station.city}</h3>
                    ${station.state ? `<p><strong>State/Region:</strong> ${station.state}</p>` : ''}
                    ${station.country ? `<p><strong>Country:</strong> ${station.country}</p>` : ''}
                    <p><strong>AQI:</strong> <span style="color: ${color}; font-weight: 600;">${station.aqi}</span></p>
                    <p><strong>Status:</strong> ${this.getAQIStatus(station.aqi)}</p>
                    <p><strong>Primary Pollutant:</strong> ${station.pollutant || 'PM2.5'}</p>
                    <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem;">Last updated: ${new Date().toLocaleTimeString()}</p>
                </div>
            `);

            this.forestLayers['air-quality'].addLayer(marker);
        });
    }

    addCountryAirQualityLayer() {
        const countryAQI = typeof ForestData !== 'undefined' ? ForestData.countryAirQuality : [];
        
        // Simplified country boundary approximations for major countries
        const countryBounds = {
            'US': [[49.0, -125.0], [25.0, -66.0]], // United States
            'CA': [[60.0, -141.0], [49.0, -52.0]], // Canada
            'MX': [[32.0, -117.0], [14.0, -86.0]], // Mexico
            'BR': [[5.0, -74.0], [-34.0, -34.0]], // Brazil
            'AR': [[-22.0, -73.0], [-55.0, -53.0]], // Argentina
            'CL': [[-17.0, -75.0], [-56.0, -66.0]], // Chile
            'CO': [[12.0, -79.0], [-4.0, -66.0]], // Colombia
            'PE': [[0.0, -81.0], [-18.0, -68.0]], // Peru
            'VE': [[12.0, -73.0], [1.0, -60.0]], // Venezuela
            'DE': [[55.0, 5.0], [47.0, 15.0]], // Germany
            'FR': [[51.0, -5.0], [42.0, 8.0]], // France
            'GB': [[61.0, -8.0], [50.0, 2.0]], // United Kingdom
            'IT': [[47.0, 6.0], [36.0, 19.0]], // Italy
            'ES': [[44.0, -10.0], [36.0, 4.0]], // Spain
            'PL': [[55.0, 14.0], [49.0, 24.0]], // Poland
            'RU': [[82.0, 19.0], [41.0, 180.0]], // Russia
            'TR': [[42.0, 26.0], [36.0, 45.0]], // Turkey
            'UA': [[52.0, 22.0], [45.0, 40.0]], // Ukraine
            'NO': [[71.0, 4.0], [58.0, 31.0]], // Norway
            'SE': [[69.0, 11.0], [55.0, 24.0]], // Sweden
            'FI': [[70.0, 20.0], [60.0, 32.0]], // Finland
            'CN': [[54.0, 73.0], [18.0, 135.0]], // China
            'IN': [[37.0, 68.0], [6.0, 97.0]], // India
            'JP': [[46.0, 129.0], [24.0, 146.0]], // Japan
            'KR': [[39.0, 125.0], [33.0, 130.0]], // South Korea
            'ID': [[6.0, 95.0], [-11.0, 141.0]], // Indonesia
            'TH': [[21.0, 97.0], [5.0, 106.0]], // Thailand
            'VN': [[24.0, 102.0], [8.0, 110.0]], // Vietnam
            'MY': [[7.0, 99.0], [1.0, 119.0]], // Malaysia
            'PH': [[21.0, 116.0], [4.0, 127.0]], // Philippines
            'BD': [[27.0, 88.0], [20.0, 93.0]], // Bangladesh
            'PK': [[37.0, 61.0], [24.0, 77.0]], // Pakistan
            'IR': [[40.0, 44.0], [25.0, 63.0]], // Iran
            'SA': [[33.0, 34.0], [16.0, 56.0]], // Saudi Arabia
            'NG': [[14.0, 2.0], [4.0, 15.0]], // Nigeria
            'ZA': [[-22.0, 16.0], [-35.0, 33.0]], // South Africa
            'EG': [[32.0, 25.0], [22.0, 37.0]], // Egypt
            'KE': [[5.0, 34.0], [-5.0, 42.0]], // Kenya
            'GH': [[11.0, -3.0], [4.0, 1.0]], // Ghana
            'MA': [[36.0, -13.0], [28.0, -1.0]], // Morocco
            'DZ': [[37.0, -9.0], [19.0, 12.0]], // Algeria
            'ET': [[18.0, 33.0], [3.0, 48.0]], // Ethiopia
            'CD': [[6.0, 12.0], [-13.0, 31.0]], // Democratic Republic of the Congo
            'AU': [[-9.0, 113.0], [-44.0, 154.0]], // Australia
            'NZ': [[-34.0, 166.0], [-47.0, 179.0]], // New Zealand
            'PG': [[-1.0, 141.0], [-12.0, 156.0]] // Papua New Guinea
        };

        countryAQI.forEach(country => {
            const bounds = countryBounds[country.countryCode];
            if (bounds) {
                const rectangle = L.rectangle(bounds, {
                    color: this.getCountryAQIBorderColor(country.avgAQI),
                    fillColor: this.getCountryAQIColor(country.avgAQI),
                    fillOpacity: 0.4,
                    weight: 1,
                    opacity: 0.7
                });

                rectangle.bindPopup(`
                    <div class="popup-content">
                        <h3>${country.country}</h3>
                        <p><strong>Average AQI:</strong> ${country.avgAQI}</p>
                        <p><strong>Air Quality:</strong> ${this.getAQIStatus(country.avgAQI)}</p>
                        <p><strong>Health Impact:</strong> ${this.getHealthImpact(country.avgAQI)}</p>
                    </div>
                `);

                this.forestLayers['air-quality'].addLayer(rectangle);
            }
        });
    }

    getHealthImpact(aqi) {
        if (aqi <= 50) return 'Minimal impact on health';
        if (aqi <= 100) return 'Acceptable for most people';
        if (aqi <= 150) return 'May cause issues for sensitive groups';
        return 'Health warnings for everyone';
    }

    addProtectedAreasLayer() {
        const protectedAreas = typeof ForestData !== 'undefined' ? ForestData.protectedAreas : [];
        
        protectedAreas.forEach(area => {
            const polygon = L.polygon(area.coordinates, {
                color: '#22c55e',
                fillColor: '#22c55e',
                fillOpacity: 0.3,
                weight: 2,
                opacity: 0.8,
                dashArray: '5, 5',
                className: 'protected-area'
            });

            polygon.bindPopup(`
                <div style="color: #f8fafc; font-family: Inter, sans-serif; max-width: 280px;">
                    <h3 style="margin-bottom: 0.5rem; color: #22c55e;">${area.name}</h3>
                    <p><strong>Type:</strong> ${area.type}</p>
                    <p><strong>Country:</strong> ${area.country}</p>
                    <p><strong>Established:</strong> ${area.established}</p>
                    <p><strong>Area:</strong> ${area.area.toLocaleString()} km²</p>
                    <p><strong>Protection Level:</strong> ${area.protection}</p>
                    <p><strong>Status:</strong> <span style="color: #22c55e;">Protected</span></p>
                </div>
            `);

            this.forestLayers['protected-areas'].addLayer(polygon);
        });
    }

    getForestColor(density) {
        if (density >= 90) return '#0a4012'; // Very dense forest - darkest green
        if (density >= 80) return '#0d5016'; // Dense forest - dark green
        if (density >= 70) return '#1b5e20'; // Good forest - medium-dark green
        if (density >= 60) return '#2d7d32'; // Moderate forest - medium green
        if (density >= 50) return '#388e3c'; // Fair forest - medium-light green
        if (density >= 40) return '#4caf50'; // Light forest - light green
        if (density >= 30) return '#66bb6a'; // Sparse forest - lighter green
        if (density >= 20) return '#81c784'; // Very sparse - very light green
        if (density >= 10) return '#a5d6a7'; // Minimal forest - pale green
        return '#c8e6c9'; // Almost no forest - very pale green
    }

    getForestBorderColor(density) {
        if (density >= 80) return '#1b5e20';
        if (density >= 60) return '#2e7d32';
        if (density >= 40) return '#388e3c';
        if (density >= 20) return '#4caf50';
        return '#66bb6a';
    }

    getForestOpacity(density) {
        if (density >= 80) return 0.85;
        if (density >= 60) return 0.75;
        if (density >= 40) return 0.65;
        if (density >= 20) return 0.55;
        return 0.45;
    }

    getForestBorderWeight(density) {
        if (density >= 80) return 2;
        if (density >= 60) return 1.5;
        if (density >= 40) return 1.2;
        return 1;
    }

    getDeforestationColor(intensity) {
        switch (intensity) {
            case 'critical': return '#dc2626'; // Bright red
            case 'high': return '#ea580c';     // Orange-red
            case 'moderate': return '#f59e0b'; // Orange
            case 'low': return '#ef4444';      // More visible red for low intensity
            default: return '#ef4444';         // Default to red to show all deforestation
        }
    }

    getDeforestationRadius(area) {
        if (!area) return 120000; // Increased default radius
        // Scale radius based on area (logarithmic scale for better visualization)
        const baseRadius = Math.sqrt(area) * 60; // Increased multiplier
        return Math.max(60000, Math.min(600000, baseRadius)); // Increased min/max
    }

    getDeforestationOpacity(intensity) {
        switch (intensity) {
            case 'critical': return 0.9;  // Higher opacity
            case 'high': return 0.8;      // Higher opacity
            case 'moderate': return 0.75; // Higher opacity
            case 'low': return 0.7;       // Higher opacity for visibility
            default: return 0.7;          // Higher default opacity
        }
    }

    getDeforestationWeight(intensity) {
        switch (intensity) {
            case 'critical': return 4;   // Thicker border
            case 'high': return 3.5;     // Thicker border
            case 'moderate': return 3;   // Thicker border
            case 'low': return 2.5;      // Thicker border for visibility
            default: return 2.5;         // Thicker default border
        }
    }

    getAQIColor(aqi) {
        if (aqi <= 50) return '#22c55e';
        if (aqi <= 100) return '#eab308';
        if (aqi <= 150) return '#f97316';
        return '#ef4444';
    }

    getAQIStatus(aqi) {
        if (aqi <= 50) return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
        return 'Unhealthy';
    }

    getCountryAQIColor(aqi) {
        // More transparent colors for country fills
        if (aqi <= 50) return 'rgba(34, 197, 94, 0.3)';      // Green
        if (aqi <= 100) return 'rgba(234, 179, 8, 0.3)';     // Yellow
        if (aqi <= 150) return 'rgba(249, 115, 22, 0.3)';    // Orange
        return 'rgba(239, 68, 68, 0.3)';                     // Red
    }

    getCountryAQIBorderColor(aqi) {
        // Solid colors for country borders
        if (aqi <= 50) return '#22c55e';
        if (aqi <= 100) return '#eab308';
        if (aqi <= 150) return '#f97316';
        return '#ef4444';
    }

    setupEventListeners() {
        // Layer toggle buttons
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layer = e.currentTarget.dataset.layer;
                this.toggleLayer(layer);
                
                // Update button state
                if (this.activeLayerToggles[layer]) {
                    e.currentTarget.classList.add('active');
                } else {
                    e.currentTarget.classList.remove('active');
                }
            });
        });

        // News refresh button
        document.getElementById('news-refresh').addEventListener('click', () => {
            this.refreshNews();
        });

        // Panel minimize buttons
        document.getElementById('news-minimize').addEventListener('click', () => {
            this.togglePanel('news-panel');
        });

        document.getElementById('news-minimize-header').addEventListener('click', () => {
            this.togglePanel('news-panel');
        });

        document.getElementById('controls-minimize').addEventListener('click', () => {
            this.togglePanel('map-controls');
        });

        document.getElementById('controls-minimize-header').addEventListener('click', () => {
            this.togglePanel('map-controls');
        });

        // Close region info panel
        document.getElementById('close-region-info').addEventListener('click', () => {
            this.hideRegionInfo();
        });

        // Show region info panel
        document.getElementById('region-info-toggle').addEventListener('click', () => {
            this.showRegionInfo();
        });

        // Add popup event listeners to handle region info panel visibility
        this.map.on('popupopen', () => {
            const regionInfo = document.querySelector('.map-info-panel');
            if (regionInfo) {
                regionInfo.style.opacity = '0.3';
                regionInfo.style.transform = 'translateX(10px)';
            }
        });

        this.map.on('popupclose', () => {
            const regionInfo = document.querySelector('.map-info-panel');
            if (regionInfo) {
                regionInfo.style.opacity = '0.9';
                regionInfo.style.transform = 'translateX(0)';
            }
        });
    }

    toggleLayer(layerName) {
        // Toggle layer visibility
        if (this.activeLayerToggles[layerName]) {
            // Layer is currently active, remove it
            if (this.forestLayers[layerName]) {
                this.map.removeLayer(this.forestLayers[layerName]);
            }
            this.activeLayerToggles[layerName] = false;
        } else {
            // Layer is currently inactive, add it
            if (this.forestLayers[layerName]) {
                this.forestLayers[layerName].addTo(this.map);
            }
            this.activeLayerToggles[layerName] = true;
        }

        // Update legend to show active layers
        this.updateCombinedLegend();
    }

    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        
        if (panel.classList.contains('minimized')) {
            // Expand both panels when clicking any expand button
            this.expandAllPanels();
        } else {
            // Minimize panel
            panel.classList.add('minimized');
        }
    }

    expandAllPanels() {
        // Expand both news panel and map controls
        const newsPanel = document.getElementById('news-panel');
        const mapControls = document.getElementById('map-controls');
        
        if (newsPanel) {
            newsPanel.classList.remove('minimized');
        }
        if (mapControls) {
            mapControls.classList.remove('minimized');
        }
    }

    hideRegionInfo() {
        const regionInfo = document.getElementById('map-info');
        const toggleBtn = document.getElementById('region-info-toggle');
        
        if (regionInfo) {
            regionInfo.style.display = 'none';
        }
        if (toggleBtn) {
            toggleBtn.style.display = 'flex';
        }
    }

    showRegionInfo() {
        const regionInfo = document.getElementById('map-info');
        const toggleBtn = document.getElementById('region-info-toggle');
        
        if (regionInfo) {
            regionInfo.style.display = 'block';
        }
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
        }
    }

    removeAttributionControls() {
        // Remove any existing attribution controls
        const removeAttribution = () => {
            // Remove Leaflet attribution controls
            const attributionElements = document.querySelectorAll(
                '.leaflet-control-attribution, .leaflet-attribution-flag, .leaflet-bottom, ' +
                '.leaflet-control-container .leaflet-bottom, .leaflet-bottom-left, .leaflet-bottom-right, ' +
                '.leaflet-control, a[href*="leaflet"], a[href*="openstreetmap"], a[href*="carto"]'
            );
            
            attributionElements.forEach(element => {
                if (element && element.parentNode) {
                    // Check if it's not a zoom control or other necessary control
                    if (!element.classList.contains('leaflet-control-zoom') && 
                        !element.classList.contains('leaflet-top')) {
                        element.style.display = 'none';
                        element.style.visibility = 'hidden';
                        element.style.opacity = '0';
                        element.style.height = '0';
                        element.style.overflow = 'hidden';
                    }
                }
            });

            // Remove any bottom positioned containers
            const bottomContainers = document.querySelectorAll('.leaflet-bottom');
            bottomContainers.forEach(element => {
                if (element) {
                    element.remove();
                }
            });
        };

        // Remove immediately
        removeAttribution();

        // Set up interval to continuously remove any attribution that might appear
        setInterval(removeAttribution, 500);

        // Also remove on map events
        this.map.on('zoomend moveend layeradd', removeAttribution);
        
        // Remove on panel minimize
        document.addEventListener('click', () => {
            setTimeout(removeAttribution, 100);
        });
    }

    updateLegend(layerName) {
        const legend = document.getElementById('map-legend');
        let legendHTML = '';

        switch (layerName) {
            case 'forest-density':
                legendHTML = `
                    <h4>Forest Coverage Density</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #0a4012;"></span>
                        <span>Pristine Forest (90-100%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #0d5016;"></span>
                        <span>Dense Forest (80-90%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #2d7d32;"></span>
                        <span>Good Forest (60-80%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #4caf50;"></span>
                        <span>Moderate Forest (40-60%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #81c784;"></span>
                        <span>Sparse Forest (20-40%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #c8e6c9;"></span>
                        <span>Minimal Forest (0-20%)</span>
                    </div>
                `;
                break;
            case 'deforestation':
                legendHTML = `
                    <h4>Deforestation Alerts</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #dc2626;"></span>
                        <span>Critical Alert</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #ea580c;"></span>
                        <span>High Alert</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #f59e0b;"></span>
                        <span>Moderate Alert</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #ef4444;"></span>
                        <span>Low Alert - Every Tree Counts!</span>
                    </div>
                `;
                break;
            case 'air-quality':
                legendHTML = `
                    <h4>Air Quality Index (Countries & Cities)</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(34, 197, 94, 0.3); border: 1px solid #22c55e;"></span>
                        <span>Good (0-50)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(234, 179, 8, 0.3); border: 1px solid #eab308;"></span>
                        <span>Moderate (51-100)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(249, 115, 22, 0.3); border: 1px solid #f97316;"></span>
                        <span>Unhealthy (101-150)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(239, 68, 68, 0.3); border: 1px solid #ef4444;"></span>
                        <span>Hazardous (151+)</span>
                    </div>
                    <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem;">Countries colored by average AQI, circles show city data</p>
                `;
                break;
            case 'protected-areas':
                legendHTML = `
                    <h4>Protected Areas</h4>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #22c55e; border: 2px dashed #22c55e; background: rgba(34, 197, 94, 0.3);"></span>
                        <span>National Parks</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #22c55e; border: 2px dashed #22c55e; background: rgba(34, 197, 94, 0.3);"></span>
                        <span>Nature Reserves</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #22c55e; border: 2px dashed #22c55e; background: rgba(34, 197, 94, 0.3);"></span>
                        <span>World Heritage Sites</span>
                    </div>
                `;
                break;
        }

        legend.innerHTML = legendHTML;
    }

    updateCombinedLegend() {
        const legend = document.getElementById('map-legend');
        let legendHTML = '<h4>Active Layers</h4>';

        if (this.activeLayerToggles['forest-density']) {
            legendHTML += `
                <div style="margin-bottom: 1rem;">
                    <h5 style="color: #22c55e; margin-bottom: 0.5rem;">Forest Density</h5>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #0a4012;"></span>
                        <span>Pristine (90-100%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #2d7d32;"></span>
                        <span>Good (60-80%)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #81c784;"></span>
                        <span>Sparse (20-40%)</span>
                    </div>
                </div>
            `;
        }

        if (this.activeLayerToggles['deforestation']) {
            legendHTML += `
                <div style="margin-bottom: 1rem;">
                    <h5 style="color: #ef4444; margin-bottom: 0.5rem;">Deforestation Alerts</h5>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #dc2626; border-radius: 50%;"></span>
                        <span>Critical Alert</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #ea580c; border-radius: 50%;"></span>
                        <span>High Alert</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #f59e0b; border-radius: 50%;"></span>
                        <span>Moderate Alert</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: #ef4444; border-radius: 50%;"></span>
                        <span>Low Alert - Every Tree Counts!</span>
                    </div>
                </div>
            `;
        }

        if (this.activeLayerToggles['air-quality']) {
            legendHTML += `
                <div style="margin-bottom: 1rem;">
                    <h5 style="color: #06b6d4; margin-bottom: 0.5rem;">Air Quality (Countries & Cities)</h5>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(34, 197, 94, 0.3); border: 1px solid #22c55e;"></span>
                        <span>Good (0-50)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(234, 179, 8, 0.3); border: 1px solid #eab308;"></span>
                        <span>Moderate (51-100)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(249, 115, 22, 0.3); border: 1px solid #f97316;"></span>
                        <span>Unhealthy for Sensitive (101-150)</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(239, 68, 68, 0.3); border: 1px solid #ef4444;"></span>
                        <span>Unhealthy (151+)</span>
                    </div>
                    <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem;">Countries colored by average AQI, circles show city data</p>
                </div>
            `;
        }

        if (this.activeLayerToggles['protected-areas']) {
            legendHTML += `
                <div style="margin-bottom: 1rem;">
                    <h5 style="color: #22c55e; margin-bottom: 0.5rem;">Protected Areas</h5>
                    <div class="legend-item">
                        <span class="legend-color" style="background: rgba(34, 197, 94, 0.3); border: 2px dashed #22c55e;"></span>
                        <span>National Parks & Reserves</span>
                    </div>
                </div>
            `;
        }

        if (legendHTML === '<h4>Active Layers</h4>') {
            legendHTML += '<p style="color: #94a3b8; font-size: 0.875rem;">No layers active. Click buttons above to show data.</p>';
        }

        legend.innerHTML = legendHTML;
    }

    updateMapInfo(region) {
        const infoPanel = document.getElementById('map-info');
        infoPanel.innerHTML = `
            <h3>${region.name}</h3>
            <div class="info-content">
                <p><strong>Forest Coverage:</strong> ${region.density}%</p>
                <p><strong>Total Area:</strong> ${region.area.toLocaleString()} km²</p>
                <p><strong>Annual Deforestation:</strong> ${region.deforestationRate}%</p>
                ${region.carbonStorage ? `<p><strong>Carbon Storage:</strong> ${region.carbonStorage}</p>` : ''}
                ${region.biodiversity ? `<p><strong>Biodiversity:</strong> ${region.biodiversity}</p>` : ''}
                ${region.economicValue ? `<p><strong>Economic Value:</strong> ${region.economicValue}</p>` : ''}
                <p><strong>Primary Threats:</strong></p>
                <ul style="margin-left: 1rem; margin-top: 0.5rem;">
                    ${region.threats.map(threat => `<li>${threat}</li>`).join('')}
                </ul>
                <p><strong>Air Quality Impact:</strong> ${region.airQualityImpact}</p>
            </div>
        `;
    }

    startLiveUpdates() {
        // Update news every 5 minutes
        this.refreshNews();
        this.newsUpdateInterval = setInterval(() => {
            this.refreshNews();
        }, 300000);

        // Update AQI every 30 seconds for live data
        this.updateAQI();
        this.aqiUpdateInterval = setInterval(() => {
            this.updateAQI();
        }, 30000);

        // Update header stats every minute
        this.updateHeaderStats();
        this.statsUpdateInterval = setInterval(() => {
            this.updateHeaderStats();
        }, 60000);
    }

    async refreshNews() {
        const refreshBtn = document.getElementById('news-refresh');
        refreshBtn.classList.add('spinning');

        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(() => {
            // Simulate fetching news articles
            const newsArticles = this.generateNewsArticles();
            const newsFeed = document.getElementById('news-feed');
            
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            
            newsArticles.forEach(article => {
                const articleElement = document.createElement('div');
                articleElement.className = 'news-article';
                articleElement.onclick = () => window.open(article.url, '_blank');
                articleElement.innerHTML = `
                    <div class="news-title">${article.title}</div>
                    <div class="news-summary">${article.summary}</div>
                    <div class="news-meta">
                        <span class="news-source">${article.source}</span>
                        <span class="news-time">${article.time}</span>
                    </div>
                `;
                fragment.appendChild(articleElement);
            });
            
            // Clear and append in one operation
            newsFeed.innerHTML = '';
            newsFeed.appendChild(fragment);

            // Update alerts
            this.updateAlerts();

            setTimeout(() => {
                refreshBtn.classList.remove('spinning');
            }, 1000);
        });
    }

    generateNewsArticles() {
        const articles = typeof ForestData !== 'undefined' ? ForestData.newsArticles : [
            {
                title: "Amazon Deforestation Increases 15% in Past Month",
                summary: "Satellite data reveals accelerated forest loss in Brazil's Rondônia state, primarily due to cattle ranching expansion.",
                source: "Environmental Monitor",
                time: "2 hours ago",
                url: "#"
            },
            {
                title: "Indonesia Implements New Palm Oil Moratorium",
                summary: "Government announces temporary halt on new palm oil permits to combat deforestation in Sumatra and Kalimantan.",
                source: "Forest News",
                time: "4 hours ago",
                url: "#"
            },
            {
                title: "Congo Basin Shows Promising Conservation Results",
                summary: "Community-led initiatives reduce deforestation by 30% in protected areas across Central African Republic.",
                source: "Conservation Today",
                time: "6 hours ago",
                url: "#"
            }
        ];

        return articles.sort(() => Math.random() - 0.5).slice(0, 4);
    }

    updateAlerts() {
        const alerts = [
            {
                location: "Rondônia, Brazil",
                description: "Rapid deforestation detected via satellite imagery. 2,500 hectares cleared in past week."
            },
            {
                location: "Borneo, Indonesia",
                description: "Illegal logging activity reported in protected area. Local authorities investigating."
            },
            {
                location: "Eastern Madagascar",
                description: "Slash-and-burn agriculture expanding into primary forest. Community intervention needed."
            }
        ];

        const alertsList = document.getElementById('alerts-list');
        alertsList.innerHTML = alerts.map(alert => `
            <div class="alert-item">
                <div class="alert-location">${alert.location}</div>
                <div class="alert-description">${alert.description}</div>
            </div>
        `).join('');
    }

    updateAQI() {
        // Get comprehensive AQI data from all major cities
        const allStations = typeof ForestData !== 'undefined' ? ForestData.aqiStations : [];
        
        // Show ALL cities with live updates and slight variations
        const liveAqiData = allStations.map(station => {
            const variation = Math.floor(Math.random() * 10) - 5; // ±5 variation
            const liveAqi = Math.max(1, station.aqi + variation);
            const status = this.getAQIStatus(liveAqi).toLowerCase().replace(/\s+/g, '-');
            
            return {
                location: station.city,
                country: station.country,
                aqi: liveAqi,
                status: status,
                pollutant: station.pollutant || 'PM2.5',
                lastUpdated: new Date().toLocaleTimeString()
            };
        });

        // Sort by AQI level (worst first) for better visibility of critical areas
        liveAqiData.sort((a, b) => b.aqi - a.aqi);

        const aqiGrid = document.getElementById('aqi-grid');
        aqiGrid.innerHTML = liveAqiData.map(data => `
            <div class="aqi-item" title="${data.country} - ${data.pollutant} - Updated: ${data.lastUpdated}">
                <div class="aqi-location">${data.location}</div>
                <div class="aqi-value aqi-${data.status}" style="color: ${this.getAQIColor(data.aqi)}">${data.aqi}</div>
                <div class="aqi-pollutant">${data.pollutant}</div>
            </div>
        `).join('');
        
        // Add live update indicator with city count
        const timestamp = new Date().toLocaleTimeString();
        const cityCount = liveAqiData.length;
        const existingIndicator = document.querySelector('.aqi-live-indicator');
        if (existingIndicator) {
            existingIndicator.textContent = `Live • ${cityCount} Cities • Updated ${timestamp}`;
        } else {
            const indicator = document.createElement('div');
            indicator.className = 'aqi-live-indicator';
            indicator.textContent = `Live • ${cityCount} Cities • Updated ${timestamp}`;
            indicator.style.cssText = `
                font-size: 0.7rem; 
                color: #22c55e; 
                text-align: center; 
                margin-top: 0.5rem;
                animation: pulse 2s infinite;
            `;
            aqiGrid.parentNode.appendChild(indicator);
        }
    }

    setupPerformanceOptimizations() {
        // Throttle map events for better performance
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 250);
        });

        // Optimize scroll performance
        const scrollElements = document.querySelectorAll('.news-feed, .deforestation-alerts');
        scrollElements.forEach(element => {
            let scrollTimeout;
            element.addEventListener('scroll', () => {
                element.style.pointerEvents = 'none';
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    element.style.pointerEvents = 'auto';
                }, 150);
            });
        });
    }

    updateHeaderStats() {
        // Use real global forest data with slight variation
        const baseDaily = typeof ForestData !== 'undefined' ? ForestData.globalStats.dailyLoss : 27397;
        const dailyLoss = Math.floor(baseDaily + (Math.random() * 2000) - 1000);
        document.getElementById('daily-loss').textContent = `${dailyLoss.toLocaleString()} ha`;

        // Calculate CO2 released from deforestation (average 200 tons CO2 per hectare)
        const co2Released = Math.round(dailyLoss * 200);
        document.getElementById('co2-released').textContent = `${(co2Released / 1000).toFixed(1)}k t`;

        // Simulate global AQI with realistic range
        const globalAQI = Math.floor(Math.random() * 50) + 75;
        document.getElementById('global-aqi').textContent = globalAQI;
        
        // Count active deforestation hotspots
        const hotspots = typeof ForestData !== 'undefined' ? ForestData.hotspots : [];
        const activeHotspots = hotspots.filter(h => h.intensity === 'critical' || h.intensity === 'high').length;
        document.getElementById('active-hotspots').textContent = activeHotspots;
        
        // Calculate trees planted today (global reforestation efforts - simulated)
        const baseTreesPlanted = 180000;
        const treesPlanted = Math.floor(baseTreesPlanted + (Math.random() * 40000) - 20000);
        document.getElementById('trees-planted').textContent = `${(treesPlanted / 1000).toFixed(0)}k`;
        
        // Update time remaining message
        this.updateTimeRemaining();
    }

    updateTimeRemaining() {
        const messages = [
            "URGENT",
            "ACT NOW", 
            "CRITICAL",
            "EVERY SECOND COUNTS",
            "TIME RUNNING OUT"
        ];
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        document.getElementById('time-remaining').textContent = randomMessage;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ForestAI();
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.forestAI && window.forestAI.map) {
        window.forestAI.map.invalidateSize();
    }
});

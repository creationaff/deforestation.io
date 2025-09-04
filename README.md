# deforestation.io - Global Deforestation Monitor

A real-time interactive platform for monitoring global deforestation, forest coverage, and air quality impacts.

## Features

🌍 **Interactive Global Map**
- Real-time forest coverage visualization with density gradients
- Deforestation hotspot alerts
- Air quality monitoring stations
- Multiple layer views (Forest Density, Deforestation Alerts, Air Quality)

📰 **Live News Panel**
- Real-time deforestation news updates
- Regional alerts and notifications
- Air quality monitoring for major cities
- Active deforestation alerts

🎨 **Modern UI/UX**
- Dark theme optimized for data visualization
- Responsive design for all devices
- Smooth animations and transitions
- Professional dashboard layout

## Quick Start

### Option 1: Python Server
```bash
cd deforestation
python -m http.server 8000
```

### Option 2: Node.js Server
```bash
cd deforestation
npm install
npm run serve
```

Then open your browser to `http://localhost:8000`

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Mapping**: Leaflet.js with custom layers
- **Styling**: Custom CSS with modern design principles
- **Data**: Simulated real-time data (ready for API integration)

## Map Layers

### Forest Density
- **Dense Forest (80-100%)**: Dark green regions with high forest coverage
- **Moderate Forest (60-80%)**: Medium green areas
- **Light Forest (40-60%)**: Light green zones
- **Sparse Forest (20-40%)**: Very light green areas
- **Minimal Forest (0-20%)**: Nearly transparent regions

### Deforestation Alerts
- **Critical**: Immediate action required (red)
- **High**: Significant deforestation detected (orange)
- **Moderate**: Monitoring recommended (yellow)

### Air Quality
- **Good (0-50)**: Green indicators
- **Moderate (51-100)**: Yellow indicators
- **Unhealthy (101-150)**: Orange indicators
- **Hazardous (151+)**: Red indicators

## Data Sources

The platform is designed to integrate with:
- NASA MODIS satellite data
- Global Forest Watch APIs
- World Air Quality Index APIs
- Environmental news RSS feeds
- Government forest monitoring systems

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT License - see LICENSE file for details

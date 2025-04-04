// Mapbox access token - you would need to replace this with your own
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiamVldHJhdXQiLCJhIjoiY204ZXczYWJsMDZsazJqc2Q5ZDd2amQ3NCJ9.4Mr2Ns6kLIoO5Y8c9-fvNw';

// Initialize map
let map;
let userMarker;
let directionsGeojson = {
    type: 'FeatureCollection',
    features: []
};
let markers = [];
let currentMode = 'driving';
let savedLocations = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    setupEventListeners();
    loadSavedLocations();
});

function initializeMap() {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.5, 40], // Default to New York area
        zoom: 9
    });

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    // Add directions source and layer once the map loads
    map.on('load', () => {
        map.addSource('directions', {
            type: 'geojson',
            data: directionsGeojson
        });

        map.addLayer({
            id: 'directions-line',
            type: 'line',
            source: 'directions',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#4285F4',
                'line-width': 5,
                'line-opacity': 0.8
            }
        });

        // Add directions point layer for waypoints
        map.addLayer({
            id: 'directions-points',
            type: 'circle',
            source: 'directions',
            filter: ['in', '$type', 'Point'],
            paint: {
                'circle-radius': 6,
                'circle-color': '#4285F4'
            }
        });
        
        // Add a context menu on right-click to save location
        map.on('contextmenu', (e) => {
            const coordinates = [e.lngLat.lng, e.lngLat.lat];
            
            // Create a popup to confirm saving location
            const popup = new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(`
                    <h4>Save this location?</h4>
                    <input type="text" id="location-name-input" placeholder="Enter a name">
                    <button id="save-location-btn">Save</button>
                `)
                .addTo(map);
                
            // Add event listener to save button
            setTimeout(() => {
                document.getElementById('save-location-btn').addEventListener('click', () => {
                    const name = document.getElementById('location-name-input').value || 'Unnamed Location';
                    saveLocation(name, coordinates);
                    popup.remove();
                });
            }, 100);
        });
    });
}

function setupEventListeners() {
    // My location button
    document.getElementById('my-location-btn').addEventListener('click', getUserLocation);
    
    // Toggle satellite view
    document.getElementById('toggle-satellite').addEventListener('click', toggleSatelliteView);
    
    // Toggle traffic view
    document.getElementById('toggle-traffic').addEventListener('click', toggleTrafficView);
    
    // Search places
    document.getElementById('search-button').addEventListener('click', searchPlace);
    document.getElementById('search-input').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') searchPlace();
    });
    
    // Get directions
    document.getElementById('get-directions-btn').addEventListener('click', getDirections);
    
    // Transportation mode selection
    document.querySelectorAll('.transport-options button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.transport-options button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Set the current mode based on the button id
            switch(e.target.id) {
                case 'drive-option':
                    currentMode = 'driving';
                    break;
                case 'walk-option':
                    currentMode = 'walking';
                    break;
                case 'bike-option':
                    currentMode = 'cycling';
                    break;
                case 'transit-option':
                    currentMode = 'driving-traffic'; // Mapbox doesn't directly support transit, using driving-traffic as substitute
                    break;
            }
        });
    });
    
    // Places category selection
    document.querySelectorAll('.places-categories button').forEach(button => {
        button.addEventListener('click', (e) => {
            const category = e.target.getAttribute('data-category');
            findNearbyPlaces(category);
        });
    });
}

// Get user's current location
function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { longitude, latitude } = position.coords;
            
            // If we already have a user marker, update its position
            if (userMarker) {
                userMarker.setLngLat([longitude, latitude]);
            } else {// Create a new marker for user location
                userMarker = new mapboxgl.Marker({
                    color: "#4285F4",
                    draggable: false
                })
                .setLngLat([longitude, latitude])
                .addTo(map);
            }
            
            // Center map on user location
            map.flyTo({
                center: [longitude, latitude],
                zoom: 14
            });
            
            // Update the start location input with reverse geocoded address
            reverseGeocode([longitude, latitude], (placeName) => {
                document.getElementById('start-location').value = placeName;
            });
        }, error => {
            console.error('Error getting location:', error);
            alert('Unable to retrieve your location. Please ensure location services are enabled.');
        });
    } else {
        alert('Geolocation is not supported by your browser.');
    }
}

// Toggle satellite view
function toggleSatelliteView() {
    const currentStyle = map.getStyle().name;
    if (currentStyle.includes('Satellite') || currentStyle.includes('satellite')) {
        map.setStyle('mapbox://styles/mapbox/streets-v11');
    } else {
        map.setStyle('mapbox://styles/mapbox/satellite-streets-v11');
    }
}

// Toggle traffic view
function toggleTrafficView() {
    const trafficLayerId = 'traffic-layer';
    
    if (map.getLayer(trafficLayerId)) {
        map.removeLayer(trafficLayerId);
    } else {
        map.addLayer({
            'id': trafficLayerId,
            'type': 'line',
            'source': {
                'type': 'vector',
                'url': 'mapbox://mapbox.mapbox-traffic-v1'
            },
            'source-layer': 'traffic',
            'paint': {
                'line-width': 2,
                'line-color': [
                    'match',
                    ['get', 'congestion'],
                    'low', '#4CAF50',     // Green for low traffic
                    'moderate', '#FFD600', // Yellow for moderate
                    'heavy', '#FF9800',    // Orange for heavy
                    'severe', '#F44336',   // Red for severe
                    '#4CAF50'              // Default to green
                ]
            }
        });
    }
}

// Search for a place
function searchPlace() {
    const query = document.getElementById('search-input').value;
    if (!query) return;
    
    // Mapbox Geocoding API
    const geocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=1`;
    
    fetch(geocodingUrl)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                const place = data.features[0];
                const coordinates = place.center;
                
                // Clear existing markers
                clearMarkers();
                
                // Add marker for the place
                const marker = new mapboxgl.Marker()
                    .setLngLat(coordinates)
                    .addTo(map);
                
                markers.push(marker);
                
                // Create popup with place name and option to save
                const popup = new mapboxgl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(`
                        <h3>${place.place_name}</h3>
                        <button id="popup-save-btn" style="margin-top: 10px; padding: 5px 10px; background-color: #4285F4; color: white; border: none; cursor: pointer;">
                            Save Location
                        </button>
                    `)
                    .addTo(map);
                
                // Add event listener to save button (using setTimeout to ensure the DOM is ready)
                setTimeout(() => {
                    document.getElementById('popup-save-btn').addEventListener('click', () => {
                        saveLocation(place.text || place.place_name, coordinates, place.place_name);
                        popup.remove();
                    });
                }, 100);
                
                // Fly to the location
                map.flyTo({
                    center: coordinates,
                    zoom: 14
                });
            } else {
                alert('No results found');
            }
        })
        .catch(error => {
            console.error('Error searching for place:', error);
            alert('Error searching for place. Please try again.');
        });
}

// Get directions between two places
function getDirections() {
    const startLocation = document.getElementById('start-location').value;
    const endLocation = document.getElementById('end-location').value;
    
    if (!startLocation || !endLocation) {
        alert('Please enter both starting point and destination');
        return;
    }
    
    // First, geocode both locations
    Promise.all([
        geocodePlace(startLocation),
        geocodePlace(endLocation)
    ])
    .then(([startCoords, endCoords]) => {
        if (!startCoords || !endCoords) {
            alert('Could not find one or both locations. Please try again with more specific names.');
            return;
        }
        
        // Get directions using Mapbox Directions API
        const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/${currentMode}/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
        
        fetch(directionsUrl)
            .then(response => response.json())
            .then(data => {
                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    const routeGeometry = route.geometry;
                    
                    // Update the directions source data
                    directionsGeojson = {
                        type: 'FeatureCollection',
                        features: [
                            {
                                type: 'Feature',
                                properties: {},
                                geometry: routeGeometry
                            },
                            {
                                type: 'Feature',
                                properties: { point_type: 'start' },
                                geometry: {
                                    type: 'Point',
                                    coordinates: startCoords
                                }
                            },
                            {
                                type: 'Feature',
                                properties: { point_type: 'end' },
                                geometry: {
                                    type: 'Point',
                                    coordinates: endCoords
                                }
                            }
                        ]
                    };
                    
                    // Update the map source
                    map.getSource('directions').setData(directionsGeojson);
                    
                    // Show route details
                    displayRouteDetails(route);
                    
                    // Fit map to show the entire route
                    const bounds = new mapboxgl.LngLatBounds();
                    routeGeometry.coordinates.forEach(coord => {
                        bounds.extend(coord);
                    });
                    
                    map.fitBounds(bounds, {
                        padding: 50
                    });
                } else {
                    alert('No route found between these locations');
                }
            })
            .catch(error => {
                console.error('Error getting directions:', error);
                alert('Error getting directions. Please try again.');
            });
    });
}

// Display route details in the sidebar
function displayRouteDetails(route) {
    const routeDetailsElement = document.getElementById('route-details');
    const routeDistance = document.getElementById('route-distance');
    const routeDuration = document.getElementById('route-duration');
    const routeSteps = document.getElementById('route-steps');
    
    // Convert distance from meters to miles or kilometers
    const distance = (route.distance / 1609.34).toFixed(1); // Convert to miles
    const duration = Math.floor(route.duration / 60); // Convert seconds to minutes
    
    routeDistance.textContent = `Distance: ${distance} miles`;
    routeDuration.textContent = `Estimated time: ${duration} minutes`;
    
    // Display steps
    routeSteps.innerHTML = '';
    
    if (route.legs && route.legs.length > 0) {
        route.legs[0].steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'step';
            
            // Clean up the instruction text (remove HTML)
            const instruction = step.maneuver.instruction.replace(/<\/?[^>]+(>|$)/g, "");
            
            stepElement.innerHTML = `
                <p><strong>${index + 1}.</strong> ${instruction}</p>
                <p class="step-distance">${(step.distance / 1609.34).toFixed(2)} miles</p>
            `;
            
            routeSteps.appendChild(stepElement);
        });
    }
    
    // Show the route details section
    routeDetailsElement.classList.remove('hidden');
}

// Find nearby places of interest
function findNearbyPlaces(category) {
    // Get current map center
    const center = map.getCenter();
    
    // Mapbox places API endpoint
    const placesUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${category}.json?proximity=${center.lng},${center.lat}&limit=10&access_token=${mapboxgl.accessToken}`;
    
    fetch(placesUrl)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                // Clear existing markers
                clearMarkers();
                
                // Display results in sidebar
                const placesResults = document.getElementById('places-results');
                placesResults.innerHTML = '';
                
                data.features.forEach(place => {
                    // Add marker
                    const marker = new mapboxgl.Marker()
                        .setLngLat(place.center)
                        .addTo(map);
                    
                    markers.push(marker);
                    
                    // Add to sidebar
                    const placeItem = document.createElement('div');
                    placeItem.className = 'place-item';
                    placeItem.innerHTML = `
                        <h4>${place.text}</h4>
                        <p>${place.place_name}</p>
                        <button class="save-place-btn" style="background-color: #4285F4; color: white; border: none; padding: 5px 8px; margin-top: 5px; cursor: pointer;">
                            Save Location
                        </button>
                    `;
                    
                    // When clicking on a place, set it as destination
                    placeItem.addEventListener('click', (e) => {
                        // Don't trigger if clicking the save button
                        if (e.target.classList.contains('save-place-btn')) {
                            saveLocation(place.text, place.center, place.place_name);
                            return;
                        }
                        
                        document.getElementById('end-location').value = place.place_name;
                        
                        // If start location is empty and we have user's location, use that
                        if (!document.getElementById('start-location').value && userMarker) {
                            const userLngLat = userMarker.getLngLat();
                            reverseGeocode([userLngLat.lng, userLngLat.lat], (placeName) => {
                                document.getElementById('start-location').value = placeName;
                                // Auto-get directions
                                getDirections();
                            });
                        }
                    });
                    
                    placesResults.appendChild(placeItem);
                });
                
                // Fit map to show all markers
                const bounds = new mapboxgl.LngLatBounds();
                data.features.forEach(place => {
                    bounds.extend(place.center);
                });
                
                map.fitBounds(bounds, {
                    padding: 50
                });
            } else {
                alert(`No ${category} found nearby`);
            }
        })
        .catch(error => {
            console.error('Error finding nearby places:', error);
            alert('Error finding nearby places. Please try again.');
        });
}

// Save a location
function saveLocation(name, coordinates, address = '') {
    // If no address provided, get it using reverse geocoding
    if (!address) {
        reverseGeocode(coordinates, (placeName) => {
            addSavedLocation(name, coordinates, placeName);
        });
    } else {
        addSavedLocation(name, coordinates, address);
    }
}

// Add a location to saved locations
function addSavedLocation(name, coordinates, address) {
    const locationId = Date.now().toString(); // Simple unique ID
    
    const newLocation = {
        id: locationId,
        name: name,
        coordinates: coordinates,
        address: address
    };
    
    // Add to our saved locations array
    savedLocations.push(newLocation);
    
    // Save to local storage
    localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
    
    // Update the UI
    updateSavedLocationsList();
    
    // Show confirmation
    alert(`Location "${name}" has been saved!`);
}

// Update the saved locations list in the UI
function updateSavedLocationsList() {
    const savedLocationsList = document.getElementById('saved-locations-list');
    
    if (savedLocations.length === 0) {
        savedLocationsList.innerHTML = '<p>No saved locations yet.</p>';
        return;
    }
    
    savedLocationsList.innerHTML = '';
    
    savedLocations.forEach(location => {
        const locationItem = document.createElement('div');
        locationItem.className = 'saved-location-item';
        locationItem.innerHTML = `
            <h4>${location.name}</h4>
            <p>${location.address}</p>
            <div class="location-actions">
                <button class="view-location-btn" data-id="${location.id}">View</button>
                <button class="directions-to-btn" data-id="${location.id}">Directions</button>
                <button class="delete-location-btn" data-id="${location.id}">Delete</button>
            </div>
        `;
        
        savedLocationsList.appendChild(locationItem);
    });
    
    // Add event listeners to the buttons
    document.querySelectorAll('.view-location-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const locationId = e.target.getAttribute('data-id');
            viewSavedLocation(locationId);
        });
    });
    
    document.querySelectorAll('.directions-to-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const locationId = e.target.getAttribute('data-id');
            getDirectionsToSavedLocation(locationId);
        });
    });
    
    document.querySelectorAll('.delete-location-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const locationId = e.target.getAttribute('data-id');
            deleteSavedLocation(locationId);
        });
    });
}

// View a saved location on the map
function viewSavedLocation(locationId) {
    const location = savedLocations.find(loc => loc.id === locationId);
    if (!location) return;
    
    // Clear existing markers
    clearMarkers();
    
    // Add marker for the location
    const marker = new mapboxgl.Marker()
        .setLngLat(location.coordinates)
        .addTo(map);
    
    markers.push(marker);
    
    // Create popup with location details
    new mapboxgl.Popup()
        .setLngLat(location.coordinates)
        .setHTML(`<h3>${location.name}</h3><p>${location.address}</p>`)
        .addTo(map);
    
    // Fly to the location
    map.flyTo({
        center: location.coordinates,
        zoom: 14
    });
}

// Get directions to a saved location
function getDirectionsToSavedLocation(locationId) {
    const location = savedLocations.find(loc => loc.id === locationId);
    if (!location) return;
    
    // Set as destination
    document.getElementById('end-location').value = location.address;
    
    // If start location is empty and we have user's location, use that
    if (!document.getElementById('start-location').value && userMarker) {
        const userLngLat = userMarker.getLngLat();
        reverseGeocode([userLngLat.lng, userLngLat.lat], (placeName) => {
            document.getElementById('start-location').value = placeName;
            // Get directions
            getDirections();
        });
    } else if (!document.getElementById('start-location').value) {
        // If no start location, prompt user to set their location
        alert('Please set a starting point or use the "My Location" button');
    } else {
        // Get directions
        getDirections();
    }
}

// Delete a saved location
function deleteSavedLocation(locationId) {
    if (confirm('Are you sure you want to delete this saved location?')) {
        // Remove from array
        savedLocations = savedLocations.filter(location => location.id !== locationId);
        
        // Update local storage
        localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
        
        // Update UI
        updateSavedLocationsList();
    }
}

// Load saved locations from local storage
function loadSavedLocations() {
    const storedLocations = localStorage.getItem('savedLocations');
    if (storedLocations) {
        savedLocations = JSON.parse(storedLocations);
        updateSavedLocationsList();
    }
}

// Helper function to geocode a place name to coordinates
function geocodePlace(place) {
    return new Promise((resolve, reject) => {
        const geocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place)}.json?access_token=${mapboxgl.accessToken}&limit=1`;
        
        fetch(geocodingUrl)
            .then(response => response.json())
            .then(data => {
                if (data.features && data.features.length > 0) {
                    resolve(data.features[0].center);
                } else {
                    resolve(null);
                }
            })
            .catch(error => {
                console.error('Geocoding error:', error);
                reject(error);
            });
    });
}

// Helper function to reverse geocode coordinates to a place name
function reverseGeocode(coordinates, callback) {
    const reverseGeocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?access_token=${mapboxgl.accessToken}&limit=1`;
    
    fetch(reverseGeocodingUrl)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                callback(data.features[0].place_name);
            } else {
                callback('Unknown location');
            }
        })
        .catch(error => {
            console.error('Reverse geocoding error:', error);
            callback('Unknown location');
        });
}

// Clear all markers from the map
function clearMarkers() {
    markers.forEach(marker => marker.remove());
    markers = [];
}
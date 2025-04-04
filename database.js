// Your Firebase configuration from the Firebase console
const firebaseConfig = {
    apiKey: "AIzaSyDG8Ye7UNDmEdUPj0maphJnhYOb7iGMKt8",
    authDomain: "winmaps-bee4c.firebaseapp.com",
    projectId: "winmaps-bee4c",
    storageBucket: "winmaps-bee4c.firebasestorage.app",
    messagingSenderId: "174063831893",
    appId: "1:174063831893:web:caa78c6e98859d69acbddc",
    measurementId: "G-4WFLD1RVF4"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  // Initialize Firestore
  const db = firebase.firestore();
  
  // Database functions
  function saveLocation(name, coordinates, description = "") {
    return db.collection("saved_locations").add({
      name: name,
      longitude: coordinates[0],
      latitude: coordinates[1],
      description: description,
      createdAt: new Date()
    })
    .then((docRef) => {
      console.log("Location saved with ID: ", docRef.id);
      return docRef.id;
    })
    .catch((error) => {
      console.error("Error saving location: ", error);
      alert("Failed to save location. Please try again.");
    });
  }
  
  function loadSavedLocations(callback) {
    db.collection("saved_locations").orderBy("createdAt", "desc").get()
      .then((querySnapshot) => {
        const locations = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          locations.push({
            id: doc.id,
            name: data.name,
            longitude: data.longitude,
            latitude: data.latitude,
            description: data.description || ""
          });
        });
        callback(locations);
      })
      .catch((error) => {
        console.error("Error loading saved locations: ", error);
        callback([]);
      });
  }
  
  function deleteSavedLocation(locationId) {
    return db.collection("saved_locations").doc(locationId).delete()
      .then(() => {
        console.log("Location successfully deleted");
        return true;
      })
      .catch((error) => {
        console.error("Error removing location: ", error);
        return false;
      });
  }
  
  function saveRouteHistory(startLocation, endLocation, route, mode) {
    return db.collection("route_history").add({
      startLocation: startLocation,
      endLocation: endLocation,
      distance: route.distance,
      duration: route.duration,
      mode: mode,
      timestamp: new Date()
    });
  }
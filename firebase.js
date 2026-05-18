const firebaseConfig = {
    apiKey:            "AIzaSyAVdO1GFhzdUGS5x931dtnDcPF5HWVWdhM",
    authDomain:        "audicom-pedidos.firebaseapp.com",
    projectId:         "audicom-pedidos",
    storageBucket:     "audicom-pedidos.firebasestorage.app",
    messagingSenderId: "900476764881",
    appId:             "1:900476764881:web:16a7238133821ee038fbf0"
};

// Inicializa o Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

